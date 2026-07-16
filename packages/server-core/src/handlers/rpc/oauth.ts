import { randomUUID } from 'node:crypto'
import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import { getCredentialManager } from '@craft-agent/shared/credentials'
import { loadSource, loadWorkspaceSources, getSourceCredentialManager } from '@craft-agent/shared/sources'
import { createPendingFlow } from '@craft-agent/shared/auth'
import { pushTyped, type RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.oauth.START,
  RPC_CHANNELS.oauth.COMPLETE,
  RPC_CHANNELS.oauth.CANCEL,
  RPC_CHANNELS.oauth.REVOKE,
  RPC_CHANNELS.oauth.APP_GET,
  RPC_CHANNELS.oauth.APP_SET,
  RPC_CHANNELS.oauth.APP_DELETE,
] as const

/**
 * Complete an OAuth flow: validate state, exchange code for tokens, store credentials.
 *
 * Shared between the `oauth:complete` RPC handler (called by Electron) and the
 * `/api/oauth/callback` HTTP route (called by the relay for WebUI).
 *
 * @param opts.clientId - RPC client ID (for ownership validation). Omit for HTTP callback.
 * @param opts.workspaceId - Workspace ID (for ownership validation). Omit for HTTP callback.
 */
export async function completeOAuthFlow(opts: {
  code: string
  state: string
  flowStore: { getByState(state: string): any; remove(state: string): void }
  credManager: { exchangeAndStore(...args: any[]): Promise<any> }
  sessionManager: { completeAuthRequest(...args: any[]): Promise<void> }
  pushSourcesChanged: (workspaceId: string) => void
  logger: { info(msg: string): void; }
  clientId?: string
  workspaceId?: string | null
}): Promise<{ success: boolean; error?: string; email?: string }> {
  const { code, state, flowStore, credManager, sessionManager, pushSourcesChanged, logger } = opts

  const flow = flowStore.getByState(state)
  if (!flow) throw new Error('Unknown or expired OAuth flow')

  // When called via RPC, enforce ownership. HTTP callbacks skip this (state is sufficient auth).
  if (opts.clientId !== undefined) {
    if (flow.ownerClientId !== opts.clientId) throw new Error('OAuth flow owned by different client')
  }
  if (opts.workspaceId != null) {
    if (flow.workspaceId !== opts.workspaceId) throw new Error('Workspace mismatch')
  }

  const result = await credManager.exchangeAndStore(flow.source, flow.provider, {
    code,
    codeVerifier: flow.codeVerifier,
    tokenEndpoint: flow.tokenEndpoint,
    clientId: flow.clientId,
    clientSecret: flow.clientSecret,
    redirectUri: flow.redirectUri,
    oauthResource: flow.oauthResource,
  })

  flowStore.remove(state)

  // If this was triggered from a session auth card, complete it
  if (flow.sessionId && flow.authRequestId) {
    await sessionManager.completeAuthRequest(flow.sessionId, {
      requestId: flow.authRequestId,
      sourceSlug: flow.sourceSlug,
      success: result.success,
      email: result.email,
      error: result.error,
    })
  }

  // Push source status update to all clients in this workspace
  pushSourcesChanged(flow.workspaceId)

  logger.info(`[OAuth] Flow complete for ${flow.sourceSlug} (success=${result.success})`)
  return result
}

export function registerOAuthHandlers(server: RpcServer, deps: HandlerDeps): void {
  const log = deps.platform.logger
  const flowStore = deps.oauthFlowStore
  const credManager = getSourceCredentialManager()
  const credentialManager = getCredentialManager()

  const assertOAuthAppProvider = (provider: string): 'google' => {
    if (provider !== 'google') throw new Error(`Unsupported OAuth app provider: ${provider}`)
    return provider
  }

  server.handle(RPC_CHANNELS.oauth.APP_GET, async (_ctx, provider: string) => {
    const name = assertOAuthAppProvider(provider)
    const credential = await credentialManager.get({ type: 'oauth_app', name })
    return {
      provider: name,
      configured: Boolean(credential?.clientId && credential.value),
      clientId: credential?.clientId,
      hasClientSecret: Boolean(credential?.value),
    }
  })

  server.handle(RPC_CHANNELS.oauth.APP_SET, async (_ctx, input: {
    provider: string
    clientId: string
    clientSecret?: string
  }) => {
    const name = assertOAuthAppProvider(input.provider)
    const clientId = input.clientId.trim()
    if (!clientId) throw new Error('OAuth client ID is required')
    const existing = await credentialManager.get({ type: 'oauth_app', name })
    const clientSecret = input.clientSecret?.trim() || existing?.value
    if (!clientSecret) throw new Error('OAuth client secret is required')
    await credentialManager.set(
      { type: 'oauth_app', name },
      { value: clientSecret, clientId },
    )
    return { provider: name, configured: true, clientId, hasClientSecret: true }
  })

  server.handle(RPC_CHANNELS.oauth.APP_DELETE, async (_ctx, provider: string) => {
    const name = assertOAuthAppProvider(provider)
    await credentialManager.delete({ type: 'oauth_app', name })
    return { success: true }
  })

  // ── oauth:start ──────────────────────────────────────────────
  server.handle(RPC_CHANNELS.oauth.START, async (ctx, args: {
    sourceSlug: string
    callbackPort?: number
    callbackUrl?: string
    sessionId?: string
    authRequestId?: string
  }) => {
    const { sourceSlug, callbackPort, callbackUrl, sessionId, authRequestId } = args

    if (!ctx.workspaceId) {
      throw new Error('No workspace bound to this client')
    }

    const workspace = getWorkspaceByNameOrId(ctx.workspaceId)
    if (!workspace) {
      throw new Error(`Workspace not found: ${ctx.workspaceId}`)
    }

    let source = loadSource(workspace.rootPath, sourceSlug)
    if (!source) {
      const { findPluginMcpAuthSource } = await import('@craft-agent/shared/plugins')
      source = findPluginMcpAuthSource(workspace.rootPath, sourceSlug)
    }
    if (!source) {
      throw new Error(`Source not found: ${sourceSlug}`)
    }

    let prepared
    try {
      prepared = await credManager.prepareOAuth(source, { callbackPort, callbackUrl })
    } catch (error) {
      const { recordPluginMcpAuthFailure } = await import('@craft-agent/shared/plugins')
      recordPluginMcpAuthFailure(workspace.rootPath, sourceSlug, error)
      throw error
    }

    const flowId = randomUUID()
    flowStore.store(createPendingFlow({
      flowId,
      state: prepared.state,
      codeVerifier: prepared.codeVerifier,
      redirectUri: prepared.redirectUri,
      source,
      clientId: prepared.clientId,
      clientSecret: prepared.clientSecret,
      tokenEndpoint: prepared.tokenEndpoint,
      provider: prepared.provider,
      oauthResource: prepared.oauthResource,
      scopes: prepared.scopes,
      ownerClientId: ctx.clientId,
      workspaceId: ctx.workspaceId,
      sourceSlug,
      sessionId,
      authRequestId,
    }))

    log.info(`[OAuth] Flow started for ${sourceSlug} (flow=${flowId})`)
    return { authUrl: prepared.authUrl, state: prepared.state, flowId }
  })

  // ── oauth:complete ───────────────────────────────────────────
  server.handle(RPC_CHANNELS.oauth.COMPLETE, async (ctx, args: {
    flowId: string
    code: string
    state: string
  }) => {
    const { flowId, code, state } = args

    // Validate flowId match before delegating
    const flow = flowStore.getByState(state)
    if (!flow) throw new Error('Unknown or expired OAuth flow')
    if (flow.flowId !== flowId) throw new Error('Flow ID mismatch')

    return completeOAuthFlow({
      code,
      state,
      flowStore,
      credManager,
      sessionManager: deps.sessionManager,
      pushSourcesChanged: (workspaceId) => {
        const ws = getWorkspaceByNameOrId(workspaceId)
        const sources = ws ? loadWorkspaceSources(ws.rootPath) : []
        pushTyped(server, RPC_CHANNELS.sources.CHANGED, { to: 'workspace', workspaceId }, workspaceId, sources)
      },
      logger: log,
      clientId: ctx.clientId,
      workspaceId: ctx.workspaceId,
    })
  })

  // ── oauth:cancel ─────────────────────────────────────────────
  server.handle(RPC_CHANNELS.oauth.CANCEL, async (ctx, args: {
    flowId: string
    state: string
  }) => {
    const { flowId, state } = args
    const flow = flowStore.getByState(state)
    if (flow && flow.flowId === flowId && flow.ownerClientId === ctx.clientId) {
      flowStore.remove(state)
      log.info(`[OAuth] Flow cancelled for ${flow.sourceSlug}`)
    }
  })

  // ── oauth:revoke ─────────────────────────────────────────────
  server.handle(RPC_CHANNELS.oauth.REVOKE, async (ctx, args: {
    sourceSlug: string
  }) => {
    const { sourceSlug } = args

    if (!ctx.workspaceId) {
      throw new Error('No workspace bound to this client')
    }

    const workspace = getWorkspaceByNameOrId(ctx.workspaceId)
    if (!workspace) {
      throw new Error(`Workspace not found: ${ctx.workspaceId}`)
    }

    let source = loadSource(workspace.rootPath, sourceSlug)
    if (!source) {
      const { findPluginMcpAuthSource } = await import('@craft-agent/shared/plugins')
      source = findPluginMcpAuthSource(workspace.rootPath, sourceSlug)
    }
    if (!source) {
      throw new Error(`Source not found: ${sourceSlug}`)
    }

    await credManager.delete(source)
    credManager.markSourceNeedsReauth(source, 'Signed out by user')

    // Push source status update
    const revokeSources = loadWorkspaceSources(workspace.rootPath)
    pushTyped(server, RPC_CHANNELS.sources.CHANGED, { to: 'workspace', workspaceId: ctx.workspaceId }, ctx.workspaceId, revokeSources)

    log.info(`[OAuth] Revoked credentials for ${sourceSlug}`)
    return { success: true }
  })
}
