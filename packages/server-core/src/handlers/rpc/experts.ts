import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.experts.LIST,
  RPC_CHANNELS.experts.GET,
  RPC_CHANNELS.experts.CREATE,
  RPC_CHANNELS.experts.UPDATE,
  RPC_CHANNELS.experts.DUPLICATE,
  RPC_CHANNELS.experts.DELETE,
  RPC_CHANNELS.experts.GET_CAPABILITY_ASSIGNMENT,
  RPC_CHANNELS.experts.SET_CAPABILITY_ASSIGNMENT,
  RPC_CHANNELS.experts.RESOLVE_CAPABILITIES,
] as const

export function registerExpertsHandlers(server: RpcServer, _deps: HandlerDeps): void {
  const workspace = (id: string) => { const value = getWorkspaceByNameOrId(id); if (!value) throw new Error(`Workspace not found: ${id}`); return value }
  server.handle(RPC_CHANNELS.experts.LIST, async (_ctx, id: string) => (await import('@craft-agent/shared/experts')).listExperts(workspace(id).rootPath))
  server.handle(RPC_CHANNELS.experts.GET, async (_ctx, id: string, expertId: string) => (await import('@craft-agent/shared/experts')).getExpert(workspace(id).rootPath, expertId))
  server.handle(RPC_CHANNELS.experts.CREATE, async (_ctx, id: string, input) => (await import('@craft-agent/shared/experts')).createExpert(workspace(id).rootPath, input))
  server.handle(RPC_CHANNELS.experts.UPDATE, async (_ctx, id: string, expertId: string, patch) => (await import('@craft-agent/shared/experts')).updateExpert(workspace(id).rootPath, expertId, patch))
  server.handle(RPC_CHANNELS.experts.DUPLICATE, async (_ctx, id: string, expertId: string, name?: string) => (await import('@craft-agent/shared/experts')).duplicateExpert(workspace(id).rootPath, expertId, name))
  server.handle(RPC_CHANNELS.experts.DELETE, async (_ctx, id: string, expertId: string) => (await import('@craft-agent/shared/experts')).deleteExpert(workspace(id).rootPath, expertId))
  server.handle(RPC_CHANNELS.experts.GET_CAPABILITY_ASSIGNMENT, async (_ctx, id: string, scope, scopeId?: string) => (await import('@craft-agent/shared/experts')).getCapabilityAssignment(workspace(id).rootPath, scope, scopeId))
  server.handle(RPC_CHANNELS.experts.SET_CAPABILITY_ASSIGNMENT, async (_ctx, id: string, assignment) => (await import('@craft-agent/shared/experts')).setCapabilityAssignment(workspace(id).rootPath, assignment))
  server.handle(RPC_CHANNELS.experts.RESOLVE_CAPABILITIES, async (_ctx, id: string, projectId?: string, expertId?: string) => (await import('@craft-agent/shared/experts')).resolveCapabilityAssignment(workspace(id).rootPath, projectId, expertId))
}
