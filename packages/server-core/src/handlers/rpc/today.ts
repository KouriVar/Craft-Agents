/**
 * Today RPC — snooze state independent of reminders / guidance / loops.
 */

import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { getTodayStateStore } from '../../today/TodayStateStore'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.today.GET_STATE,
  RPC_CHANNELS.today.SNOOZE,
  RPC_CHANNELS.today.CLEAR_SNOOZE,
] as const

function resolveWorkspaceRoot(workspaceId: string): string {
  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
  return workspace.rootPath
}

export function registerTodayHandlers(server: RpcServer, _deps: HandlerDeps): void {
  server.handle(
    RPC_CHANNELS.today.GET_STATE,
    async (_ctx, request: import('@craft-agent/shared/protocol').TodayGetStateRequest) => {
      const store = getTodayStateStore(resolveWorkspaceRoot(request.workspaceId))
      return store.getStateDto()
    },
  )

  server.handle(
    RPC_CHANNELS.today.SNOOZE,
    async (_ctx, request: import('@craft-agent/shared/protocol').TodaySnoozeRequest) => {
      if (!request.targetKey || typeof request.targetKey !== 'string') {
        throw new Error('targetKey is required')
      }
      if (request.until !== null && (typeof request.until !== 'number' || !Number.isFinite(request.until))) {
        throw new Error('until must be a number or null')
      }
      const store = getTodayStateStore(resolveWorkspaceRoot(request.workspaceId))
      return store.snooze(request.targetKey, request.until)
    },
  )

  server.handle(
    RPC_CHANNELS.today.CLEAR_SNOOZE,
    async (_ctx, request: import('@craft-agent/shared/protocol').TodayClearSnoozeRequest) => {
      if (!request.targetKey || typeof request.targetKey !== 'string') {
        throw new Error('targetKey is required')
      }
      const store = getTodayStateStore(resolveWorkspaceRoot(request.workspaceId))
      return store.clearSnooze(request.targetKey)
    },
  )
}
