/**
 * MessagingGatewayRegistry — owns per-workspace MessagingGateway instances.
 *
 * Responsibilities:
 *   - Satisfies IMessagingGatewayRegistry for the RPC handlers in server-core.
 *   - Acts as a single EventSink consumer fanning session events to the right gateway.
 *   - Owns the in-memory pairing code manager (shared across workspaces; codes are workspace-scoped).
 *   - Owns per-workspace MessagingConfig (messaging/config.json).
 *   - Owns platform adapter lifecycle (initialize/swap/destroy) via CredentialManager.
 *
 * The registry is a generic multi-adapter host. It ships first-party WeChat &
 * Lark adapters, but the loop that connects/teardown adapters is keyed on
 * {@link BUILTIN_PLATFORMS} — adding a platform means registering a new adapter,
 * not editing bespoke per-platform branches here.
 *
 * The registry is constructed once, wired into HandlerDeps, then populated with
 * gateways via initializeWorkspace() for every workspace that has messaging enabled.
 */

import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import type { PushTarget } from '@craft-agent/shared/protocol'
import type { CredentialManager } from '@craft-agent/shared/credentials'
import type {
  ISessionManager,
  IMessagingGatewayRegistry,
  MessagingBindingInfo,
  MessagingConfigInfo,
} from '@craft-agent/server-core/handlers'

import { MessagingGateway } from './gateway'
import { ConfigStore } from './config-store'
import { PairingCodeManager } from './pairing'
import { LarkAdapter, parseLarkCredentials, type LarkCredentials } from './adapters/lark/index'
import {
  WeChatAdapter,
  parseWeChatCredentials,
  startWeChatQrLogin,
  type WeChatCredentials,
  type WeChatLoginEvent,
} from './adapters/wechat/index'
import type { SessionEvent } from './renderer'
import type { EventSinkFn } from './event-fanout'
import {
  BUILTIN_PLATFORMS,
  isBuiltinPlatform,
  type BindingAccessMode,
  type BuiltinPlatform,
  type ChannelBinding,
  type MessagingConfig,
  type MessagingLogger,
  type MessagingPlatformRuntimeInfo,
  type PendingSender,
  type PlatformAccessMode,
  type PlatformConfigEntry,
  type PlatformOwner,
  type PlatformType,
} from './types'

/**
 * Platforms whose adapters have been removed from this build. Persisted config
 * / bindings referencing them are treated as unsupported: not initialized, a
 * single warning is logged, and an idempotent migration disables them without
 * touching the still-supported platforms.
 */
const UNSUPPORTED_PLATFORMS: readonly string[] = ['whatsapp', 'telegram']

const consoleLogger: MessagingLogger = {
  info: (message, meta) => console.log('[MessagingRegistry]', message, meta ?? ''),
  warn: (message, meta) => console.warn('[MessagingRegistry]', message, meta ?? ''),
  error: (message, meta) => console.error('[MessagingRegistry]', message, meta ?? ''),
  child(context) {
    return {
      info: (message, meta) => console.log('[MessagingRegistry]', context, message, meta ?? ''),
      warn: (message, meta) => console.warn('[MessagingRegistry]', context, message, meta ?? ''),
      error: (message, meta) => console.error('[MessagingRegistry]', context, message, meta ?? ''),
      child: (next) => consoleLogger.child({ ...context, ...next }),
    }
  },
}

export interface MessagingGatewayRegistryOptions {
  sessionManager: ISessionManager
  credentialManager: CredentialManager
  /** Absolute path to the messaging storage directory for the given workspace. */
  getMessagingDir: (workspaceId: string) => string
  /** Optional legacy messaging dir (pre-relocation) for one-shot migration. */
  getLegacyMessagingDir?: (workspaceId: string) => string | undefined
  /** Broadcasts an RPC push event to UI clients. No-op if undefined. */
  publishEvent?: (channel: string, target: PushTarget, ...args: unknown[]) => void
  /** Optional logger — shared with the gateway and adapters. */
  logger?: MessagingLogger
}

interface WorkspaceState {
  gateway: MessagingGateway
  configStore: ConfigStore
  botUsernames: Partial<Record<PlatformType, string>>
  runtime: Record<BuiltinPlatform, MessagingPlatformRuntimeInfo>
  /** Set once the one-shot unsupported-platform migration has run. */
  migratedUnsupported: boolean
}

export class MessagingGatewayRegistry implements IMessagingGatewayRegistry {
  private readonly workspaces = new Map<string, WorkspaceState>()
  /** In-flight WeChat QR logins awaiting a verify code from the UI, per workspace. */
  private readonly wechatVerifyResolvers = new Map<string, Array<(code: string) => void>>()
  private readonly pairing = new PairingCodeManager()
  private readonly log: MessagingLogger

  constructor(private readonly opts: MessagingGatewayRegistryOptions) {
    this.log = (opts.logger ?? consoleLogger).child({ component: 'registry' })
  }

  // -------------------------------------------------------------------------
  // Public registry lifecycle (called by the app bootstrap)
  // -------------------------------------------------------------------------

  async initializeWorkspace(workspaceId: string): Promise<void> {
    if (this.workspaces.has(workspaceId)) return

    const state = this.bootstrapWorkspace(workspaceId)
    const config = state.configStore.get()
    if (!config.enabled) return

    await state.gateway.start()
    this.log.info('gateway started for workspace', {
      event: 'gateway_started',
      workspaceId,
    })

    for (const platform of BUILTIN_PLATFORMS) {
      if (!isPlatformConfigured(config, platform)) continue
      this.setPlatformRuntime(workspaceId, state, platform, {
        configured: true,
        connected: false,
        state: 'connecting',
        lastError: undefined,
      })
      void this.tryConnect(workspaceId, state, platform).catch((err) => {
        this.log.error('background connect failed', {
          event: 'platform_connect_failed',
          workspaceId,
          platform,
          error: err,
        })
      })
    }
  }

  async removeWorkspace(workspaceId: string): Promise<void> {
    const state = this.workspaces.get(workspaceId)
    if (!state) return
    await state.gateway.stop()
    this.pairing.clearWorkspace(workspaceId)
    this.workspaces.delete(workspaceId)
  }

  async stopAll(): Promise<void> {
    const stops = Array.from(this.workspaces.values()).map((s) => s.gateway.stop().catch(() => {}))
    await Promise.all(stops)
    this.workspaces.clear()
  }

  get size(): number {
    return this.workspaces.size
  }

  // -------------------------------------------------------------------------
  // IMessagingGatewayRegistry — config
  // -------------------------------------------------------------------------

  getConfig(workspaceId: string): MessagingConfigInfo | null {
    const state = this.workspaces.get(workspaceId) ?? this.bootstrapWorkspace(workspaceId)
    const cfg = state.configStore.get()
    return {
      enabled: cfg.enabled,
      platforms: cfg.platforms as MessagingConfigInfo['platforms'],
      runtime: {
        lark: cloneRuntime(state.runtime.lark),
        wechat: cloneRuntime(state.runtime.wechat),
      },
    }
  }

  async updateConfig(
    workspaceId: string,
    partial: Partial<MessagingConfigInfo>,
  ): Promise<void> {
    const state = this.workspaces.get(workspaceId) ?? this.bootstrapWorkspace(workspaceId)
    state.configStore.update({
      enabled: partial.enabled,
      platforms: partial.platforms,
    } as never)

    const cfg = state.configStore.get()
    if (!cfg.enabled) {
      for (const platform of BUILTIN_PLATFORMS) {
        await state.gateway.unregisterAdapter(platform).catch(() => {})
        this.setPlatformRuntime(workspaceId, state, platform, {
          configured: false,
          connected: false,
          state: 'disconnected',
          identity: undefined,
          lastError: undefined,
        })
      }
      return
    }

    for (const platform of BUILTIN_PLATFORMS) {
      const configured = isPlatformConfigured(cfg, platform)
      if (!configured && state.gateway.getAdapter(platform)) {
        await state.gateway.unregisterAdapter(platform).catch(() => {})
      }
      if (!configured) {
        this.setPlatformRuntime(workspaceId, state, platform, {
          configured: false,
          connected: false,
          state: 'disconnected',
          identity: undefined,
          lastError: undefined,
        })
      }
    }
  }

  // -------------------------------------------------------------------------
  // IMessagingGatewayRegistry — bindings
  // -------------------------------------------------------------------------

  getBindings(workspaceId: string): MessagingBindingInfo[] {
    const state = this.workspaces.get(workspaceId)
    if (!state) return []
    return state.gateway.getBindingStore().getAll().map(toBindingInfo)
  }

  unbindSession(workspaceId: string, sessionId: string, platform?: string): void {
    const state = this.workspaces.get(workspaceId)
    if (!state) return
    const removed = state.gateway
      .getBindingStore()
      .unbindSession(sessionId, platform as PlatformType | undefined)
    if (removed > 0) this.emitBindingChanged(workspaceId)
  }

  unbindBinding(workspaceId: string, bindingId: string): boolean {
    const state = this.workspaces.get(workspaceId)
    if (!state) return false
    const removed = state.gateway.getBindingStore().unbindById(bindingId)
    if (removed) this.emitBindingChanged(workspaceId)
    return removed
  }

  // -------------------------------------------------------------------------
  // IMessagingGatewayRegistry — pairing
  // -------------------------------------------------------------------------

  generatePairingCode(
    workspaceId: string,
    sessionId: string,
    platform: string,
  ): { code: string; expiresAt: number; botUsername?: string } {
    if (!isBuiltinPlatform(platform)) {
      throw new Error(`Unknown messaging platform: ${platform}`)
    }
    const state = this.workspaces.get(workspaceId) ?? this.bootstrapWorkspace(workspaceId)
    if (!state.gateway.hasConnectedAdapter(platform)) {
      throw new Error(`${capitalize(platform)} is not connected`)
    }
    const gen = this.pairing.generate(workspaceId, sessionId, platform)
    this.log.info('pairing code generated', {
      event: 'pairing_generated',
      workspaceId,
      sessionId,
      platform,
      expiresAt: gen.expiresAt,
    })
    return {
      code: gen.code,
      expiresAt: gen.expiresAt,
      botUsername: state.botUsernames[platform],
    }
  }

  // -------------------------------------------------------------------------
  // IMessagingGatewayRegistry — platform lifecycle
  // -------------------------------------------------------------------------

  /**
   * Verify a Lark/Feishu App ID + App Secret pair by exchanging them for a
   * tenant access token. The Open Platform returns a structured error code
   * we forward to the user when the credentials are bad — saves a confused
   * round-trip through "Invalid token" guesses.
   */
  async testLarkCredentials(
    creds: LarkCredentials,
  ): Promise<{ success: boolean; botName?: string; error?: string }> {
    if (!creds.appId || !creds.appSecret) {
      return { success: false, error: 'App ID or App Secret is empty' }
    }
    try {
      const url =
        creds.domain === 'feishu'
          ? 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal'
          : 'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: creds.appId, app_secret: creds.appSecret }),
      })
      const body = (await res.json()) as { code?: number; msg?: string; tenant_access_token?: string }
      if (body.code !== 0 || !body.tenant_access_token) {
        return { success: false, error: body.msg ?? 'Invalid credentials' }
      }
      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      }
    }
  }

  async saveLarkCredentials(workspaceId: string, creds: LarkCredentials): Promise<void> {
    if (!creds.appId || !creds.appSecret) throw new Error('App ID or App Secret is empty')
    if (creds.domain !== 'lark' && creds.domain !== 'feishu') {
      throw new Error('Domain must be "lark" or "feishu"')
    }

    const test = await this.testLarkCredentials(creds)
    if (!test.success) throw new Error(test.error ?? 'Invalid Lark credentials')

    await this.opts.credentialManager.set(
      {
        type: 'messaging_bearer',
        workspaceId,
        name: 'lark',
      },
      { value: JSON.stringify(creds) },
    )

    const state = this.workspaces.get(workspaceId) ?? this.bootstrapWorkspace(workspaceId)
    this.patchPlatformConfig(
      workspaceId,
      'lark',
      { enabled: true, domain: creds.domain },
      { ensureMessagingEnabled: true },
    )

    this.setPlatformRuntime(workspaceId, state, 'lark', {
      configured: true,
      connected: false,
      state: 'connecting',
      lastError: undefined,
    })

    await this.tryConnect(workspaceId, state, 'lark')
    await state.gateway.start()
  }

  async disconnectPlatform(workspaceId: string, platform: string): Promise<void> {
    if (!isBuiltinPlatform(platform)) return
    const state = this.workspaces.get(workspaceId)
    if (!state) return

    await state.gateway.unregisterAdapter(platform).catch(() => {})
    state.botUsernames[platform] = undefined
    this.pairing.clearWorkspace(workspaceId)

    // Preserve per-platform fields (owners / accessMode / domain) so
    // reconnecting doesn't surprise the operator with a reset to public.
    // Use `forgetPlatform` for the full wipe.
    const currentConfig = state.configStore.get()
    const currentPlatformConfig = currentConfig.platforms[platform] ?? { enabled: true }
    const nextPlatforms = {
      ...currentConfig.platforms,
      [platform]: { ...currentPlatformConfig, enabled: false },
    }
    const anyPlatformEnabled = Object.values(nextPlatforms).some((entry) => entry?.enabled)
    state.configStore.update({
      enabled: anyPlatformEnabled,
      platforms: nextPlatforms,
    })

    await this.opts.credentialManager
      .delete({ type: 'messaging_bearer', workspaceId, name: platform })
      .catch(() => {})

    this.setPlatformRuntime(workspaceId, state, platform, {
      configured: false,
      connected: false,
      state: 'disconnected',
      identity: undefined,
      lastError: undefined,
    })
  }

  async forgetPlatform(workspaceId: string, platform: string): Promise<void> {
    if (!isBuiltinPlatform(platform)) return
    await this.disconnectPlatform(workspaceId, platform)
  }

  // -------------------------------------------------------------------------
  // EventSink-compatible callback
  // -------------------------------------------------------------------------

  onSessionEvent: EventSinkFn = (channel: string, target: PushTarget, ...args: unknown[]) => {
    if (channel !== RPC_CHANNELS.sessions.EVENT) return

    const event = args[0] as SessionEvent | undefined
    if (!event?.sessionId) return

    const workspaceId =
      'workspaceId' in target ? (target as { workspaceId: string }).workspaceId : undefined
    if (!workspaceId) {
      for (const state of this.workspaces.values()) {
        state.gateway.onSessionEvent(channel, target, ...args)
      }
      return
    }

    const state = this.workspaces.get(workspaceId)
    if (state) state.gateway.onSessionEvent(channel, target, ...args)
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private bootstrapWorkspace(workspaceId: string): WorkspaceState {
    const existing = this.workspaces.get(workspaceId)
    if (existing) return existing

    const storageDir = this.opts.getMessagingDir(workspaceId)
    const legacyStorageDir = this.opts.getLegacyMessagingDir?.(workspaceId)
    const baseLog = this.log.child({ workspaceId })
    const configStore = new ConfigStore(
      storageDir,
      legacyStorageDir,
      baseLog.child({ component: 'config-store' }),
    )
    const cfg = configStore.get()
    const gateway = new MessagingGateway({
      sessionManager: this.opts.sessionManager,
      workspaceId,
      storageDir,
      legacyStorageDir,
      logger: baseLog,
      pairingConsumer: {
        canConsume: (platform, senderId) =>
          this.pairing.canConsume(workspaceId, platform, senderId),
        consume: (platform, code) => {
          const entry = this.pairing.consume(workspaceId, platform, code)
          if (!entry) return null
          if (!entry.sessionId) return null
          return { kind: 'session', workspaceId: entry.workspaceId, sessionId: entry.sessionId }
        },
      },
      // Read live config so accessMode/owner toggles take effect immediately.
      getWorkspaceConfig: () => configStore.get(),
      seedOwnerOnFirstPair: async (platform, candidate) =>
        this.seedFirstOwner(workspaceId, platform, candidate),
      onBindingChanged: () => this.emitBindingChanged(workspaceId),
      onPendingChanged: () => this.emitPendingChanged(workspaceId),
    })

    const state: WorkspaceState = {
      gateway,
      configStore,
      botUsernames: {},
      runtime: {
        lark: createRuntime('lark', isPlatformConfigured(cfg, 'lark')),
        wechat: createRuntime('wechat', isPlatformConfigured(cfg, 'wechat')),
      },
      migratedUnsupported: false,
    }
    this.workspaces.set(workspaceId, state)
    this.migrateUnsupportedWorkspace(workspaceId, state)
    return state
  }

  /**
   * Idempotent one-shot migration: strip config + bindings for platforms whose
   * adapters were removed from this build. Never touches the still-supported
   * platforms. Emits a single warning per workspace when it finds something.
   */
  private migrateUnsupportedWorkspace(workspaceId: string, state: WorkspaceState): void {
    if (state.migratedUnsupported) return
    state.migratedUnsupported = true

    const cfg = state.configStore.get()
    const presentPlatforms = UNSUPPORTED_PLATFORMS.filter(
      (p) => cfg.platforms[p] !== undefined,
    )
    const store = state.gateway.getBindingStore()
    const staleBindings = store
      .getAll()
      .filter((b) => UNSUPPORTED_PLATFORMS.includes(b.platform))

    if (presentPlatforms.length === 0 && staleBindings.length === 0) return

    this.log.warn('ignoring unsupported messaging platform config/bindings', {
      event: 'unsupported_platform_ignored',
      workspaceId,
      platforms: presentPlatforms,
      staleBindingCount: staleBindings.length,
    })

    if (presentPlatforms.length > 0) {
      const merged = { ...cfg.platforms }
      const patch: Partial<Record<string, PlatformConfigEntry | undefined>> = {}
      for (const p of presentPlatforms) {
        delete merged[p]
        patch[p] = undefined
      }
      const anyEnabled = Object.values(merged).some((entry) => entry?.enabled)
      state.configStore.update({
        enabled: anyEnabled,
        platforms: patch as MessagingConfig['platforms'],
      })
    }

    for (const b of staleBindings) store.unbindById(b.id)
  }

  private async tryConnect(
    workspaceId: string,
    state: WorkspaceState,
    platform: BuiltinPlatform,
  ): Promise<void> {
    if (platform === 'lark') return this.tryConnectLark(workspaceId, state)
    return this.tryConnectWeChat(workspaceId, state)
  }

  private async tryConnectLark(workspaceId: string, state: WorkspaceState): Promise<void> {
    const cred = await this.opts.credentialManager
      .get({ type: 'messaging_bearer', workspaceId, name: 'lark' })
      .catch(() => null)

    if (!cred?.value) {
      this.setPlatformRuntime(workspaceId, state, 'lark', {
        configured: true,
        connected: false,
        state: 'error',
        lastError: 'Lark credentials are missing.',
      })
      return
    }

    let creds: LarkCredentials
    try {
      creds = parseLarkCredentials(cred.value)
    } catch (err) {
      this.setPlatformRuntime(workspaceId, state, 'lark', {
        configured: true,
        connected: false,
        state: 'error',
        lastError: err instanceof Error ? err.message : 'Lark credentials are malformed',
      })
      return
    }

    await state.gateway.unregisterAdapter('lark').catch((err) => {
      this.log.warn('unregisterAdapter(lark) failed (non-fatal)', {
        event: 'lark_unregister_failed',
        workspaceId,
        error: err,
      })
    })

    try {
      const adapter = new LarkAdapter()
      await adapter.initialize({
        token: cred.value,
        logger: this.log.child({
          component: 'lark-adapter',
          workspaceId,
          platform: 'lark',
        }),
      })

      try {
        const info = await adapter.getBotInfo()
        state.botUsernames.lark = info?.name
      } catch {
        // non-fatal
      }

      state.gateway.registerAdapter(adapter)
      this.setPlatformRuntime(workspaceId, state, 'lark', {
        configured: true,
        connected: true,
        state: 'connected',
        identity: state.botUsernames.lark ?? creds.domain,
        lastError: undefined,
      })
    } catch (err) {
      this.log.error('failed to connect Lark', {
        event: 'lark_connect_failed',
        workspaceId,
        error: err,
      })
      this.setPlatformRuntime(workspaceId, state, 'lark', {
        configured: true,
        connected: false,
        state: 'error',
        lastError: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  // -------------------------------------------------------------------------
  // WeChat — QR login + iLink long-poll lifecycle
  // -------------------------------------------------------------------------

  async startWeChatConnect(workspaceId: string): Promise<void> {
    const state = this.workspaces.get(workspaceId) ?? this.bootstrapWorkspace(workspaceId)
    this.setPlatformRuntime(workspaceId, state, 'wechat', {
      configured: true,
      connected: false,
      state: 'connecting',
      lastError: undefined,
    })

    const verifyResolvers: Array<(code: string) => void> = []
    // Unblock any prior in-flight login for this workspace so it settles instead
    // of hanging on its verify-code waiter until the long-poll timeout.
    const prior = this.wechatVerifyResolvers.get(workspaceId)
    if (prior) for (const resolve of prior.splice(0)) resolve('')
    this.wechatVerifyResolvers.set(workspaceId, verifyResolvers)

    const result = await startWeChatQrLogin({
      onEvent: (event: WeChatLoginEvent) => {
        this.opts.publishEvent?.(
          RPC_CHANNELS.messaging.WECHAT_UI_EVENT,
          { to: 'workspace', workspaceId },
          { workspaceId, event },
        )
        if (event.type === 'error') {
          this.setPlatformRuntime(workspaceId, state, 'wechat', {
            configured: false,
            connected: false,
            state: 'error',
            lastError: event.message,
          })
        }
      },
      verifyCodeProvider: () =>
        new Promise<string>((resolve) => {
          verifyResolvers.push(resolve)
        }),
    }).finally(() => {
      // Only clear if we're still the active login — a newer connect may have
      // replaced our resolver array.
      if (this.wechatVerifyResolvers.get(workspaceId) === verifyResolvers) {
        this.wechatVerifyResolvers.delete(workspaceId)
      }
    })

    if (!result) return

    // Already bound to this instance — reconnect from the stored credential.
    if (result === 'already-connected') {
      await this.tryConnectWeChat(workspaceId, state)
      await state.gateway.start()
      return
    }

    await this.opts.credentialManager.set(
      { type: 'messaging_bearer', workspaceId, name: 'wechat' },
      { value: JSON.stringify(result) },
    )
    this.patchPlatformConfig(
      workspaceId,
      'wechat',
      { enabled: true },
      { ensureMessagingEnabled: true },
    )
    await this.tryConnectWeChat(workspaceId, state)
    await state.gateway.start()
  }

  /** Submit a verify code from the UI for an in-progress WeChat login. */
  submitWeChatVerifyCode(workspaceId: string, code: string): void {
    const resolvers = this.wechatVerifyResolvers.get(workspaceId)
    const resolve = resolvers?.shift()
    if (resolve) resolve(code)
  }

  private async tryConnectWeChat(workspaceId: string, state: WorkspaceState): Promise<void> {
    const cred = await this.opts.credentialManager
      .get({ type: 'messaging_bearer', workspaceId, name: 'wechat' })
      .catch(() => null)

    if (!cred?.value) {
      this.setPlatformRuntime(workspaceId, state, 'wechat', {
        configured: true,
        connected: false,
        state: 'error',
        lastError: 'WeChat credentials are missing.',
      })
      return
    }

    let creds: WeChatCredentials
    try {
      creds = parseWeChatCredentials(cred.value)
    } catch (err) {
      this.setPlatformRuntime(workspaceId, state, 'wechat', {
        configured: true,
        connected: false,
        state: 'error',
        lastError: err instanceof Error ? err.message : 'WeChat credentials are malformed',
      })
      return
    }

    await state.gateway.unregisterAdapter('wechat').catch(() => {})

    try {
      const adapter = new WeChatAdapter()
      await adapter.initialize({
        token: cred.value,
        logger: this.log.child({
          component: 'wechat-adapter',
          workspaceId,
          platform: 'wechat',
        }),
      })
      state.botUsernames.wechat = adapter.getBotInfo().name
      state.gateway.registerAdapter(adapter)
      this.setPlatformRuntime(workspaceId, state, 'wechat', {
        configured: true,
        connected: true,
        state: 'connected',
        identity: state.botUsernames.wechat ?? creds.userId,
        lastError: undefined,
      })
    } catch (err) {
      this.log.error('failed to connect WeChat', {
        event: 'wechat_connect_failed',
        workspaceId,
        error: err,
      })
      this.setPlatformRuntime(workspaceId, state, 'wechat', {
        configured: true,
        connected: false,
        state: 'error',
        lastError: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  private setPlatformRuntime(
    workspaceId: string,
    state: WorkspaceState,
    platform: BuiltinPlatform,
    patch: Partial<MessagingPlatformRuntimeInfo>,
  ): void {
    const previous = state.runtime[platform] ?? createRuntime(platform, false)
    const next: MessagingPlatformRuntimeInfo = {
      ...previous,
      ...patch,
      platform,
      updatedAt: Date.now(),
    }
    state.runtime[platform] = next
    this.emitPlatformStatus(workspaceId, platform, next)
  }

  private emitBindingChanged(workspaceId: string): void {
    this.opts.publishEvent?.(
      RPC_CHANNELS.messaging.BINDING_CHANGED,
      { to: 'workspace', workspaceId },
      workspaceId,
    )
  }

  private emitPendingChanged(workspaceId: string): void {
    const channel = (
      RPC_CHANNELS.messaging as Record<string, string | undefined>
    ).PENDING_CHANGED
    if (!channel) return
    this.opts.publishEvent?.(
      channel,
      { to: 'workspace', workspaceId },
      workspaceId,
    )
  }

  // -------------------------------------------------------------------------
  // Access control — per-platform workspace owners + per-binding allow lists
  // -------------------------------------------------------------------------

  /**
   * Patch a platform's config preserving any fields the caller doesn't touch.
   * Critical: every access-control config write MUST go through this helper —
   * a direct `configStore.update({ platforms: { [platform]: {...} } })`
   * silently drops `owners` / `accessMode` / `enabled` from the persisted
   * state because `ConfigStore.update` shallow-merges `platforms` but replaces
   * the per-platform value wholesale.
   *
   * `ensureMessagingEnabled` flips the top-level `enabled` flag to true
   * (used by save-credential / connect flows). When false, `enabled` is
   * preserved as-is.
   */
  private patchPlatformConfig(
    workspaceId: string,
    platform: PlatformType,
    patch: Partial<PlatformConfigEntry>,
    options: { ensureMessagingEnabled?: boolean } = {},
  ): MessagingConfig {
    const state = this.workspaces.get(workspaceId) ?? this.bootstrapWorkspace(workspaceId)
    const cfg = state.configStore.get()
    const current = cfg.platforms[platform] ?? { enabled: true }
    return state.configStore.update({
      enabled: options.ensureMessagingEnabled ? true : cfg.enabled,
      platforms: {
        ...cfg.platforms,
        [platform]: { ...current, ...patch },
      },
    })
  }

  /**
   * Append `candidate` to the platform's owners list iff the list is
   * currently empty. Returns the (possibly unchanged) list. Used by the
   * gateway's `/pair` flow to bootstrap the first owner. Generic across
   * every platform — no hardcoded platform check.
   */
  private async seedFirstOwner(
    workspaceId: string,
    platform: PlatformType,
    candidate: PlatformOwner,
  ): Promise<PlatformOwner[]> {
    const state = this.workspaces.get(workspaceId) ?? this.bootstrapWorkspace(workspaceId)
    const cfg = state.configStore.get()
    const currentOwners = cfg.platforms[platform]?.owners ?? []
    if (currentOwners.length > 0) return currentOwners

    const nextOwners: PlatformOwner[] = [candidate]
    // Workspaces that haven't picked an explicit access mode default
    // to `owner-only` once an owner exists. Existing 'open' workspaces
    // are respected (the operator chose to stay public).
    this.patchPlatformConfig(workspaceId, platform, {
      accessMode: cfg.platforms[platform]?.accessMode ?? 'owner-only',
      owners: nextOwners,
    })
    this.log.info('seeded first owner', {
      event: 'first_owner_seeded',
      workspaceId,
      platform,
      ownerId: candidate.userId,
    })
    return nextOwners
  }

  getPlatformOwners(workspaceId: string, platform: string): PlatformOwner[] {
    const state = this.workspaces.get(workspaceId) ?? this.bootstrapWorkspace(workspaceId)
    return state.configStore.get().platforms[platform]?.owners ?? []
  }

  setPlatformOwners(
    workspaceId: string,
    platform: string,
    owners: PlatformOwner[],
  ): PlatformOwner[] {
    const state = this.workspaces.get(workspaceId) ?? this.bootstrapWorkspace(workspaceId)
    this.patchPlatformConfig(workspaceId, platform, { owners: dedupeOwners(owners) })
    this.emitBindingChanged(workspaceId)
    return state.configStore.get().platforms[platform]?.owners ?? []
  }

  getPlatformAccessMode(workspaceId: string, platform: string): PlatformAccessMode {
    const state = this.workspaces.get(workspaceId) ?? this.bootstrapWorkspace(workspaceId)
    return state.configStore.get().platforms[platform]?.accessMode ?? 'open'
  }

  setPlatformAccessMode(
    workspaceId: string,
    platform: string,
    mode: PlatformAccessMode,
  ): void {
    this.patchPlatformConfig(workspaceId, platform, { accessMode: mode })

    // Lock-down semantics: switching the workspace to `owner-only` must
    // also close any binding that's still in `open` mode, otherwise the
    // operator clicks "Lock down", the banner disappears, but legacy
    // bindings remain public — exactly the false-sense-of-security UX
    // the feature is supposed to prevent.
    if (mode === 'owner-only') {
      this.migrateOpenBindingsToInherit(workspaceId, platform)
    }

    this.emitBindingChanged(workspaceId)
  }

  /**
   * Walk all bindings for `platform` and flip any with `accessMode === 'open'`
   * to `inherit` (the safe default). Used when locking down the workspace.
   */
  private migrateOpenBindingsToInherit(workspaceId: string, platform: string): void {
    const state = this.workspaces.get(workspaceId)
    if (!state) return
    const store = state.gateway.getBindingStore()
    for (const b of store.getAll()) {
      if (b.platform !== platform) continue
      if (b.config.accessMode !== 'open') continue
      store.updateBindingConfig(b.id, { accessMode: 'inherit', allowedSenderIds: [] })
    }
  }

  /** Pending senders surface in Settings → Messaging as "Pending requests". */
  getPendingSenders(workspaceId: string, platform?: string): PendingSender[] {
    const state = this.workspaces.get(workspaceId)
    if (!state) return []
    return state.gateway.getPendingStore().list(platform as PlatformType | undefined)
  }

  dismissPendingSender(
    workspaceId: string,
    platform: string,
    userId: string,
  ): boolean {
    const state = this.workspaces.get(workspaceId)
    if (!state) return false
    return state.gateway.getPendingStore().dismiss(platform, userId)
  }

  /**
   * Allow a pending sender. Behaviour depends on why the sender was
   * rejected:
   *
   * - `'not-owner'` (workspace-level reject) → add to platform `owners`.
   * - `'not-on-binding-allowlist'` (binding-level reject) → append to
   *   that binding's `allowedSenderIds`. Workspace owners list is NOT
   *   touched — closing the privilege-escalation footgun where a sender
   *   denied by a single sensitive binding would have been promoted to
   *   workspace owner.
   */
  allowPendingSender(
    workspaceId: string,
    platform: string,
    userId: string,
    entryKey?: { reason?: PendingSender['reason']; bindingId?: string },
  ): { owners: PlatformOwner[]; bindingId?: string } {
    const state = this.workspaces.get(workspaceId) ?? this.bootstrapWorkspace(workspaceId)
    const pending = state.gateway.getPendingStore().list(platform)
    const match = pending.find((p) =>
      p.userId === userId &&
      (entryKey?.reason === undefined ||
        (p.reason ?? 'not-owner') === entryKey.reason) &&
      (entryKey?.bindingId === undefined || p.bindingId === entryKey.bindingId),
    )
    if (!match) {
      throw new Error('Pending sender not found — they may have been dismissed.')
    }

    const reason = match.reason ?? 'not-owner'

    if (reason === 'not-on-binding-allowlist') {
      const bindingId = match.bindingId
      if (!bindingId) {
        throw new Error('Pending entry is binding-scoped but has no bindingId.')
      }
      const store = state.gateway.getBindingStore()
      const binding = store.getAll().find((b) => b.id === bindingId)
      if (!binding) {
        state.gateway.getPendingStore().dismiss(platform, userId, {
          reason: 'not-on-binding-allowlist',
          bindingId,
        })
        throw new Error('Binding no longer exists — pending entry dismissed.')
      }
      const next = Array.from(new Set([...binding.config.allowedSenderIds, userId]))
      store.updateBindingConfig(bindingId, {
        allowedSenderIds: next,
        accessMode: 'allow-list',
      })
      state.gateway.getPendingStore().dismiss(platform, userId, {
        reason: 'not-on-binding-allowlist',
        bindingId,
      })
      this.emitBindingChanged(workspaceId)
      const owners = state.configStore.get().platforms[platform]?.owners ?? []
      return { owners, bindingId }
    }

    // reason === 'not-owner': promote to workspace owner.
    const cfg = state.configStore.get()
    const existing = cfg.platforms[platform]?.owners ?? []
    if (existing.some((o) => o.userId === userId)) {
      state.gateway.getPendingStore().dismiss(platform, userId)
      return { owners: existing }
    }
    const nextOwners: PlatformOwner[] = [
      ...existing,
      {
        userId: match.userId,
        ...(match.displayName ? { displayName: match.displayName } : {}),
        ...(match.username ? { username: match.username } : {}),
        addedAt: Date.now(),
      },
    ]
    this.patchPlatformConfig(workspaceId, platform, {
      owners: nextOwners,
      accessMode: cfg.platforms[platform]?.accessMode ?? 'owner-only',
    })
    state.gateway.getPendingStore().dismiss(platform, userId)
    this.emitBindingChanged(workspaceId)
    return { owners: nextOwners }
  }

  /**
   * Update the access policy on a single binding. Uses the in-place
   * `updateBindingConfig` method so the binding's `id` and `createdAt`
   * survive — anything keyed on bindingId (audit logs, deep links, stale
   * renderer closures) keeps working.
   */
  setBindingAccess(
    workspaceId: string,
    bindingId: string,
    access: { mode: BindingAccessMode; allowedSenderIds?: string[] },
  ): void {
    const state = this.workspaces.get(workspaceId)
    if (!state) throw new Error('Workspace not initialised')
    const store = state.gateway.getBindingStore()
    const next = store.updateBindingConfig(bindingId, {
      accessMode: access.mode,
      allowedSenderIds:
        access.mode === 'allow-list' ? [...(access.allowedSenderIds ?? [])] : [],
    })
    if (!next) throw new Error('Binding not found')
    this.emitBindingChanged(workspaceId)
  }

  private emitPlatformStatus(
    workspaceId: string,
    platform: PlatformType,
    status: MessagingPlatformRuntimeInfo,
  ): void {
    this.opts.publishEvent?.(
      RPC_CHANNELS.messaging.PLATFORM_STATUS,
      { to: 'workspace', workspaceId },
      workspaceId,
      platform,
      cloneRuntime(status),
    )
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toBindingInfo(b: ChannelBinding): MessagingBindingInfo {
  return {
    id: b.id,
    workspaceId: b.workspaceId,
    sessionId: b.sessionId,
    platform: b.platform,
    channelId: b.channelId,
    ...(b.threadId !== undefined ? { threadId: b.threadId } : {}),
    channelName: b.channelName,
    enabled: b.enabled,
    createdAt: b.createdAt,
    accessMode: b.config.accessMode,
    allowedSenderIds: [...b.config.allowedSenderIds],
  }
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1)
}

function isPlatformConfigured(
  config: { enabled: boolean; platforms: Record<string, { enabled: boolean } | undefined> },
  platform: PlatformType,
): boolean {
  return Boolean(config.enabled && config.platforms[platform]?.enabled)
}

function dedupeOwners(owners: PlatformOwner[]): PlatformOwner[] {
  const map = new Map<string, PlatformOwner>()
  for (const o of owners) {
    if (!o?.userId) continue
    map.set(o.userId, { ...o })
  }
  return Array.from(map.values())
}

function createRuntime(platform: PlatformType, configured: boolean): MessagingPlatformRuntimeInfo {
  return {
    platform,
    configured,
    connected: false,
    state: 'disconnected',
    updatedAt: Date.now(),
  }
}

function cloneRuntime(runtime: MessagingPlatformRuntimeInfo): MessagingPlatformRuntimeInfo {
  return { ...runtime }
}
