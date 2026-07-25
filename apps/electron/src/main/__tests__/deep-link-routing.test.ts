import { describe, expect, it } from 'bun:test'
import {
  handleDeepLink,
  isSensitiveDeepLinkAction,
  deepLinkNeedsConfirmation,
  describeSensitiveDeepLinkAction,
  type DeepLinkTarget,
} from '../deep-link'
import { RPC_CHANNELS } from '../../shared/types'
import type { EventSink } from '@craft-agent/server-core/transport'
import type { WindowManager } from '../window-manager'

function createMockWindow(webContentsId: number) {
  return {
    isMinimized: () => false,
    restore: () => {},
    focus: () => {},
    isDestroyed: () => false,
    webContents: {
      id: webContentsId,
      isLoading: () => false,
      isDestroyed: () => false,
      once: () => {},
    },
  }
}

describe('handleDeepLink routing', () => {
  it('prefers resolved target client over preferred caller client', async () => {
    const targetWindow = createMockWindow(22)

    const windowManager = {
      focusOrCreateWindow: () => targetWindow,
      getFocusedWindow: () => targetWindow,
      getLastActiveWindow: () => targetWindow,
      getWorkspaceForWindow: (webContentsId: number) => webContentsId === 22 ? 'ws-target' : 'ws-other',
    } as unknown as WindowManager

    const sent: Array<{ channel: string; target: unknown; args: unknown[] }> = []
    const sink: EventSink = (channel, target, ...args) => {
      sent.push({ channel, target, args })
    }

    await handleDeepLink(
      'craftagents://workspace/ws-target/allSessions',
      windowManager,
      sink,
      (wcId) => wcId === 22 ? 'client-target' : undefined,
      'client-caller',
    )

    expect(sent.length).toBe(1)
    expect(sent[0]?.channel).toBe(RPC_CHANNELS.deeplink.NAVIGATE)
    expect(sent[0]?.target).toEqual({ to: 'client', clientId: 'client-target' })
  })

  it('uses preferred client only when no resolver is provided', async () => {
    const targetWindow = createMockWindow(31)

    const windowManager = {
      focusOrCreateWindow: () => targetWindow,
      getFocusedWindow: () => targetWindow,
      getLastActiveWindow: () => targetWindow,
      getWorkspaceForWindow: () => 'ws-target',
    } as unknown as WindowManager

    const sent: Array<{ channel: string; target: unknown; args: unknown[] }> = []
    const sink: EventSink = (channel, target, ...args) => {
      sent.push({ channel, target, args })
    }

    await handleDeepLink(
      'craftagents://workspace/ws-target/allSessions',
      windowManager,
      sink,
      undefined,
      'client-caller',
    )

    expect(sent.length).toBe(1)
    expect(sent[0]?.target).toEqual({ to: 'client', clientId: 'client-caller' })
  })

  it('falls back to workspace routing when resolver exists but target client is unresolved', async () => {
    const targetWindow = createMockWindow(44)

    const windowManager = {
      focusOrCreateWindow: () => targetWindow,
      getFocusedWindow: () => targetWindow,
      getLastActiveWindow: () => targetWindow,
      getWorkspaceForWindow: () => 'ws-target',
    } as unknown as WindowManager

    const sent: Array<{ channel: string; target: unknown; args: unknown[] }> = []
    const sink: EventSink = (channel, target, ...args) => {
      sent.push({ channel, target, args })
    }

    await handleDeepLink(
      'craftagents://workspace/ws-target/allSessions',
      windowManager,
      sink,
      () => undefined,
      'client-caller',
    )

    expect(sent.length).toBe(1)
    expect(sent[0]?.target).toEqual({ to: 'workspace', workspaceId: 'ws-target' })
  })
})

describe('sensitive deep link classification', () => {
  const t = (action: string, actionParams?: Record<string, string>): DeepLinkTarget => ({
    action,
    actionParams,
  })

  it('flags delete-session, delete-source, set-mode as sensitive', () => {
    expect(isSensitiveDeepLinkAction(t('delete-session'))).toBe(true)
    expect(isSensitiveDeepLinkAction(t('delete-source'))).toBe(true)
    expect(isSensitiveDeepLinkAction(t('set-mode', { mode: 'bypassPermissions' }))).toBe(true)
  })

  it('flags new-session / new-chat only when auto-send is requested', () => {
    expect(isSensitiveDeepLinkAction(t('new-session', { send: 'true', input: 'hi' }))).toBe(true)
    expect(isSensitiveDeepLinkAction(t('new-chat', { send: 'true' }))).toBe(true)
    expect(isSensitiveDeepLinkAction(t('new-session', { input: 'hi' }))).toBe(false)
    expect(isSensitiveDeepLinkAction(t('new-chat'))).toBe(false)
  })

  it('does not flag navigation-only or benign actions', () => {
    expect(isSensitiveDeepLinkAction({ view: 'allSessions' })).toBe(false)
    expect(isSensitiveDeepLinkAction(t('flag-session'))).toBe(false)
  })

  it('only requires confirmation for untrusted sensitive actions', () => {
    expect(deepLinkNeedsConfirmation(t('delete-session'), 'untrusted')).toBe(true)
    expect(deepLinkNeedsConfirmation(t('delete-session'), 'trusted')).toBe(false)
    expect(deepLinkNeedsConfirmation({ view: 'allSessions' }, 'untrusted')).toBe(false)
  })
})

describe('handleDeepLink confirmation gating', () => {
  function makeWindowManager() {
    const targetWindow = createMockWindow(55)
    return {
      focusOrCreateWindow: () => targetWindow,
      getFocusedWindow: () => targetWindow,
      getLastActiveWindow: () => targetWindow,
      getWorkspaceForWindow: () => 'ws-target',
    } as unknown as WindowManager
  }

  function makeSink() {
    const sent: Array<{ channel: string; target: unknown; args: unknown[] }> = []
    const sink: EventSink = (channel, target, ...args) => {
      sent.push({ channel, target, args })
    }
    return { sent, sink }
  }

  it('dispatches trusted sensitive actions without confirmation', async () => {
    const wm = makeWindowManager()
    const { sent, sink } = makeSink()
    let confirmCalls = 0

    const result = await handleDeepLink(
      'craftagents://workspace/ws-target/action/delete-session/abc',
      wm,
      sink,
      () => 'client-target',
      undefined,
      { source: 'trusted', confirm: async () => { confirmCalls++; return true } },
    )

    expect(confirmCalls).toBe(0)
    expect(result.success).toBe(true)
    expect(sent.length).toBe(1)
    expect(sent[0]?.channel).toBe(RPC_CHANNELS.deeplink.NAVIGATE)
  })

  it('dispatches untrusted sensitive actions only after user approves', async () => {
    const wm = makeWindowManager()
    const { sent, sink } = makeSink()

    const result = await handleDeepLink(
      'craftagents://workspace/ws-target/action/delete-session/abc',
      wm,
      sink,
      () => 'client-target',
      undefined,
      { source: 'untrusted', confirm: async () => true },
    )

    expect(result.success).toBe(true)
    expect(sent.length).toBe(1)
  })

  it('blocks untrusted sensitive actions when user cancels', async () => {
    const wm = makeWindowManager()
    const { sent, sink } = makeSink()

    const result = await handleDeepLink(
      'craftagents://workspace/ws-target/action/delete-session/abc',
      wm,
      sink,
      () => 'client-target',
      undefined,
      { source: 'untrusted', confirm: async () => false },
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('declined')
    expect(sent.length).toBe(0)
  })

  it('does not gate untrusted navigation-only deep links', async () => {
    const wm = makeWindowManager()
    const { sent, sink } = makeSink()
    let confirmCalls = 0

    const result = await handleDeepLink(
      'craftagents://workspace/ws-target/allSessions',
      wm,
      sink,
      () => 'client-target',
      undefined,
      { source: 'untrusted', confirm: async () => { confirmCalls++; return true } },
    )

    expect(confirmCalls).toBe(0)
    expect(result.success).toBe(true)
    expect(sent.length).toBe(1)
  })

  it('rejects a concurrent sensitive confirm while one is already in flight', async () => {
    const wm = makeWindowManager()
    const { sent, sink } = makeSink()
    let resolveFirst!: (value: boolean) => void
    const firstConfirm = new Promise<boolean>((resolve) => { resolveFirst = resolve })
    let secondConfirmCalls = 0

    const p1 = handleDeepLink(
      'craftagents://workspace/ws-target/action/delete-session/abc',
      wm,
      sink,
      () => 'client-target',
      undefined,
      { source: 'untrusted', confirm: () => firstConfirm },
    )
    // Yield so the first confirm is awaited and the in-flight guard is set.
    await Bun.sleep(0)

    const result2 = await handleDeepLink(
      'craftagents://workspace/ws-target/action/delete-session/def',
      wm,
      sink,
      () => 'client-target',
      undefined,
      { source: 'untrusted', confirm: async () => { secondConfirmCalls++; return true } },
    )

    // Concurrent request is rejected without invoking its confirm callback.
    expect(result2.success).toBe(false)
    expect(result2.error).toContain('declined')
    expect(secondConfirmCalls).toBe(0)
    expect(sent.length).toBe(0)

    // Resolving the first confirm lets the original action proceed.
    resolveFirst(true)
    const result1 = await p1
    expect(result1.success).toBe(true)
    expect(sent.length).toBe(1)
  })
})

describe('describeSensitiveDeepLinkAction mode whitelist', () => {
  it('maps known permission modes to canonical labels', () => {
    expect(describeSensitiveDeepLinkAction({ action: 'set-mode', actionParams: { mode: 'execute' } })).toContain('Execute')
    expect(describeSensitiveDeepLinkAction({ action: 'set-mode', actionParams: { mode: 'safe' } })).toContain('Explore')
    expect(describeSensitiveDeepLinkAction({ action: 'set-mode', actionParams: { mode: 'ask' } })).toContain('Ask to Edit')
    expect(describeSensitiveDeepLinkAction({ action: 'set-mode', actionParams: { mode: 'allow-all' } })).toContain('Execute')
  })

  it('never echoes an unknown (attacker-controlled) mode value', () => {
    const desc = describeSensitiveDeepLinkAction({ action: 'set-mode', actionParams: { mode: 'Evil; rm -rf /' } })
    expect(desc).toContain('未知')
    expect(desc).not.toContain('Evil')
    expect(desc).not.toContain('rm -rf')
  })

  it('shows unknown when mode is missing', () => {
    expect(describeSensitiveDeepLinkAction({ action: 'set-mode' })).toContain('未知')
  })
})
