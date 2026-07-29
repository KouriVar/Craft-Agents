import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.connectors.LIST,
  RPC_CHANNELS.connectors.GET,
  RPC_CHANNELS.connectors.CREATE,
  RPC_CHANNELS.connectors.UPDATE,
  RPC_CHANNELS.connectors.DELETE,
] as const

/** UI-facing Connector RPC; Source storage and credentials remain the compatibility backend. */
export function registerConnectorsHandlers(server: RpcServer, _deps: HandlerDeps): void {
  const root = (workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    return workspace.rootPath
  }
  server.handle(RPC_CHANNELS.connectors.LIST, async (_ctx, workspaceId: string) => (await import('@craft-agent/shared/connectors')).listConnectors(root(workspaceId)))
  server.handle(RPC_CHANNELS.connectors.GET, async (_ctx, workspaceId: string, slug: string) => (await import('@craft-agent/shared/connectors')).getConnector(root(workspaceId), slug))
  server.handle(RPC_CHANNELS.connectors.CREATE, async (_ctx, workspaceId: string, input) => (await import('@craft-agent/shared/connectors')).createConnector(root(workspaceId), input))
  server.handle(RPC_CHANNELS.connectors.UPDATE, async (_ctx, workspaceId: string, slug: string, patch) => (await import('@craft-agent/shared/connectors')).updateConnector(root(workspaceId), slug, patch))
  server.handle(RPC_CHANNELS.connectors.DELETE, async (_ctx, workspaceId: string, slug: string) => (await import('@craft-agent/shared/connectors')).deleteConnector(root(workspaceId), slug))
}
