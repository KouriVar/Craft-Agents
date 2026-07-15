import {
  RPC_CHANNELS,
  type CallMcpWidgetToolRequest,
  type CallMcpWidgetToolResult,
  type ReadMcpWidgetResourceRequest,
  type ReadMcpWidgetResourceResult,
} from '@craft-agent/shared/protocol'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { decideWidgetToolPermission } from './widget-permissions'

const MCP_APP_MIME_TYPES = new Set([
  'text/html;profile=mcp-app',
  'text/html; profile=mcp-app',
  'text/html',
])

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.widgets.READ_MCP_RESOURCE,
  RPC_CHANNELS.widgets.CALL_MCP_TOOL,
] as const

async function sessionBelongsToRequest(deps: HandlerDeps, ctx: { workspaceId?: string | null }, sessionId: string): Promise<boolean> {
  const session = await deps.sessionManager.getSession(sessionId)
  return Boolean(session && (!ctx.workspaceId || session.workspaceId === ctx.workspaceId))
}

export function registerWidgetHandlers(server: RpcServer, deps: HandlerDeps): void {
  server.handle(RPC_CHANNELS.widgets.READ_MCP_RESOURCE, async (
    ctx,
    request: ReadMcpWidgetResourceRequest,
  ): Promise<ReadMcpWidgetResourceResult> => {
    if (!request || typeof request.sessionId !== 'string' || typeof request.serverSlug !== 'string' || typeof request.uri !== 'string') {
      return { ok: false, error: 'Invalid MCP widget resource request.', code: 'invalid-request' }
    }
    if (!await sessionBelongsToRequest(deps, ctx, request.sessionId)) {
      return { ok: false, error: 'Widget session was not found.', code: 'session-not-found' }
    }

    try {
      await deps.sessionManager.prepareMcpWidgetRuntime(request.sessionId)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error), code: 'not-connected' }
    }

    try {
      const result = await deps.sessionManager.readMcpWidgetResource(request.sessionId, request.serverSlug, request.uri)
      const content = result.contents.find(item => item.uri === request.uri) ?? result.contents[0]
      const mimeType = content?.mimeType?.toLowerCase() ?? ''
      if (!content || typeof content.text !== 'string' || !MCP_APP_MIME_TYPES.has(mimeType)) {
        return { ok: false, error: 'MCP resource is not an HTML app resource.', code: 'invalid-resource' }
      }
      if (Buffer.byteLength(content.text, 'utf8') > 4 * 1024 * 1024) {
        return { ok: false, error: 'MCP app resource is larger than 4 MB.', code: 'invalid-resource' }
      }
      return {
        ok: true,
        html: content.text,
        mimeType: content.mimeType ?? 'text/html;profile=mcp-app',
        resourceMeta: content._meta ?? result._meta,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        error: message,
        code: /not connected|not available/i.test(message) ? 'not-connected' : 'not-found',
      }
    }
  })

  server.handle(RPC_CHANNELS.widgets.CALL_MCP_TOOL, async (
    ctx,
    request: CallMcpWidgetToolRequest,
  ): Promise<CallMcpWidgetToolResult> => {
    if (!request || typeof request.sessionId !== 'string' || typeof request.serverSlug !== 'string' || typeof request.toolName !== 'string') {
      return { ok: false, error: 'Invalid MCP widget tool request.', code: 'invalid-request' }
    }
    if (!await sessionBelongsToRequest(deps, ctx, request.sessionId)) {
      return { ok: false, error: 'Widget session was not found.', code: 'session-not-found' }
    }

    try {
      await deps.sessionManager.prepareMcpWidgetRuntime(request.sessionId)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error), code: 'not-connected' }
    }

    const proxyName = request.toolName.startsWith('mcp__')
      ? request.toolName
      : `mcp__${request.serverSlug}__${request.toolName}`
    if (!proxyName.startsWith(`mcp__${request.serverSlug}__`)) {
      return { ok: false, error: 'Widgets may only call tools from their own MCP server.', code: 'invalid-request' }
    }
    const definition = deps.sessionManager.getMcpWidgetToolDefinition(request.sessionId, proxyName)
    if (!definition) return { ok: false, error: `MCP tool is not connected: ${request.toolName}`, code: 'not-connected' }

    const permissionMode = deps.sessionManager.getSessionPermissionModeState(request.sessionId)?.permissionMode ?? 'ask'
    const permission = decideWidgetToolPermission({
      definition,
      permissionMode,
      approved: request.approved,
      pluginPolicy: deps.sessionManager.getMcpWidgetPluginPolicy(request.sessionId, request.serverSlug, request.toolName),
    })
    if (permission.action === 'deny') {
      return {
        ok: false,
        error: `Widget tool ${request.toolName} is blocked by the current session or plugin policy.`,
        code: 'permission-denied',
      }
    }
    if (permission.action === 'ask') {
      return {
        ok: false,
        error: `Widget requests permission to call ${request.toolName}.`,
        code: 'permission-required',
        requiresApproval: true,
        destructive: permission.destructive,
      }
    }

    try {
      const result = await deps.sessionManager.callMcpWidgetTool(request.sessionId, proxyName, request.arguments ?? {})
      return result.isError
        ? { ok: false, error: result.content || 'MCP tool failed.', code: 'tool-failed' }
        : { ok: true, result }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error), code: 'tool-failed' }
    }
  })
}
