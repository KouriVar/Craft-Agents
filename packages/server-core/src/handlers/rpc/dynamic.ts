import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { getDynamicItem, resolveDynamicAction } from '@craft-agent/shared/dynamic'

export function respondDynamicPermission(input: { workspaceRoot: string; id: string; allowed: boolean; alwaysAllow?: boolean; respond: (sessionId: string, requestId: string, allowed: boolean, alwaysAllow: boolean) => boolean }): boolean {
  // Synchronous stores intentionally make claiming/closing the item atomic on
  // this server process: a repeated click sees the already-resolved item.
  const item = getDynamicItem(input.workspaceRoot, input.id)
  if (!item || item.kind !== 'permission' || !item.requiresAction) throw new Error('Permission request is no longer pending')
  const sessionId = item.source?.sessionId; const requestId = item.source?.requestId
  if (!sessionId || !requestId) throw new Error('Permission request has no executable source')
  if (!input.respond(sessionId, requestId, input.allowed, input.alwaysAllow ?? false)) throw new Error('Permission request expired or was already handled')
  resolveDynamicAction(input.workspaceRoot, input.id)
  return true
}

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.dynamic.LIST, RPC_CHANNELS.dynamic.MARK_READ, RPC_CHANNELS.dynamic.CLEAR,
  RPC_CHANNELS.dynamic.CREATE,
  RPC_CHANNELS.dynamic.RESOLVE, RPC_CHANNELS.dynamic.GET_MUTE_RULES, RPC_CHANNELS.dynamic.SET_MUTE_RULES,
  RPC_CHANNELS.dynamic.RESPOND_PERMISSION,
] as const

export function registerDynamicHandlers(server: RpcServer, deps: HandlerDeps): void {
  const root = (workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')
    return workspace.rootPath
  }
  server.handle(RPC_CHANNELS.dynamic.CREATE, async (_ctx, workspaceId: string, input: Omit<import('@craft-agent/shared/dynamic').DynamicItem, 'id' | 'createdAt'>) => {
    const { createDynamicItem } = await import('@craft-agent/shared/dynamic'); return createDynamicItem(root(workspaceId), input)
  })
  server.handle(RPC_CHANNELS.dynamic.LIST, async (_ctx, workspaceId: string, filter?: 'all' | 'actionable' | 'automation' | 'system') => {
    const { listDynamicItems } = await import('@craft-agent/shared/dynamic'); return listDynamicItems(root(workspaceId), filter)
  })
  server.handle(RPC_CHANNELS.dynamic.MARK_READ, async (_ctx, workspaceId: string, id: string) => {
    const { markDynamicRead } = await import('@craft-agent/shared/dynamic'); return markDynamicRead(root(workspaceId), id)
  })
  server.handle(RPC_CHANNELS.dynamic.CLEAR, async (_ctx, workspaceId: string, id: string) => {
    const { clearDynamicItem } = await import('@craft-agent/shared/dynamic'); return clearDynamicItem(root(workspaceId), id)
  })
  server.handle(RPC_CHANNELS.dynamic.RESOLVE, async (_ctx, workspaceId: string, id: string) => {
    const { resolveDynamicAction } = await import('@craft-agent/shared/dynamic'); return resolveDynamicAction(root(workspaceId), id)
  })
  server.handle(RPC_CHANNELS.dynamic.RESPOND_PERMISSION, async (_ctx, workspaceId: string, id: string, allowed: boolean, alwaysAllow = false) => {
    const workspaceRoot = root(workspaceId)
    const item = getDynamicItem(workspaceRoot, id)
    if (
      item?.kind === 'permission'
      && item.requiresAction
      && item.source?.runId
      && item.source.requestId?.startsWith('workflow-approval:')
    ) {
      const { respondWorkflowApproval } = await import('./workflows')
      const handled = await respondWorkflowApproval({
        workspaceId,
        workspaceRoot,
        runId: item.source.runId,
        requestId: item.source.requestId,
        allowed,
        deps,
      })
      if (handled) resolveDynamicAction(workspaceRoot, id)
      return handled
    }
    return respondDynamicPermission({ workspaceRoot, id, allowed, alwaysAllow, respond: (sessionId, requestId, decision, remember) => deps.sessionManager.respondToPermission(sessionId, requestId, decision, remember) })
  })
  server.handle(RPC_CHANNELS.dynamic.GET_MUTE_RULES, async (_ctx, workspaceId: string) => {
    const { getDynamicMuteRules } = await import('@craft-agent/shared/dynamic'); return getDynamicMuteRules(root(workspaceId))
  })
  server.handle(RPC_CHANNELS.dynamic.SET_MUTE_RULES, async (_ctx, workspaceId: string, rules: import('@craft-agent/shared/dynamic').DynamicMuteRules) => {
    const { setDynamicMuteRules } = await import('@craft-agent/shared/dynamic'); setDynamicMuteRules(root(workspaceId), rules)
  })
}
