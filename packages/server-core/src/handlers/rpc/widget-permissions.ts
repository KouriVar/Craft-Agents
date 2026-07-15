import type { PermissionMode } from '@craft-agent/shared/agent/mode-types'
import type { ProxyToolDef } from '@craft-agent/shared/mcp'

export type WidgetToolPermissionDecision =
  | { action: 'allow'; reason: 'read-only' | 'app-only' | 'allow-all' | 'approved' | 'plugin-policy' }
  | { action: 'ask'; destructive: boolean }
  | { action: 'deny'; reason: 'safe-mode' | 'plugin-policy' }

function appOnlyVisibility(definition: ProxyToolDef): boolean {
  const ui = definition._meta?.ui
  if (!ui || typeof ui !== 'object' || Array.isArray(ui)) return false
  const visibility = (ui as Record<string, unknown>).visibility
  return Array.isArray(visibility)
    && visibility.includes('app')
    && !visibility.includes('model')
}

export function decideWidgetToolPermission(input: {
  definition: ProxyToolDef
  permissionMode: PermissionMode
  approved?: boolean
  pluginPolicy?: import('@craft-agent/shared/plugins').PluginToolPolicyAction
}): WidgetToolPermissionDecision {
  if (input.pluginPolicy === 'deny') {
    return { action: 'deny', reason: 'plugin-policy' }
  }
  if (input.pluginPolicy === 'ask' && input.approved !== true) {
    return { action: 'ask', destructive: input.definition.annotations?.destructiveHint === true }
  }
  if (input.definition.annotations?.readOnlyHint === true) {
    return { action: 'allow', reason: 'read-only' }
  }
  if (appOnlyVisibility(input.definition)) {
    return { action: 'allow', reason: 'app-only' }
  }
  if (input.permissionMode === 'safe') {
    return { action: 'deny', reason: 'safe-mode' }
  }
  if (input.pluginPolicy === 'allow') {
    return { action: 'allow', reason: 'plugin-policy' }
  }
  if (input.permissionMode === 'allow-all') {
    return { action: 'allow', reason: 'allow-all' }
  }
  if (input.approved === true) {
    return { action: 'allow', reason: 'approved' }
  }
  return {
    action: 'ask',
    destructive: input.definition.annotations?.destructiveHint === true,
  }
}
