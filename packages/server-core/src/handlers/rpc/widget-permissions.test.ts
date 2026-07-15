import { describe, expect, it } from 'bun:test'
import type { ProxyToolDef } from '@craft-agent/shared/mcp'
import { decideWidgetToolPermission } from './widget-permissions'

function tool(patch: Partial<ProxyToolDef> = {}): ProxyToolDef {
  return {
    name: 'mcp__demo__mutate',
    description: 'Mutate data',
    inputSchema: { type: 'object' },
    ...patch,
  }
}

describe('decideWidgetToolPermission', () => {
  it('allows read-only and app-only tools in every session mode', () => {
    expect(decideWidgetToolPermission({
      definition: tool({ annotations: { readOnlyHint: true } }),
      permissionMode: 'safe',
    })).toEqual({ action: 'allow', reason: 'read-only' })
    expect(decideWidgetToolPermission({
      definition: tool({ _meta: { ui: { visibility: ['app'] } } }),
      permissionMode: 'safe',
    })).toEqual({ action: 'allow', reason: 'app-only' })
  })

  it('denies mutating tools in safe mode even when renderer approval is supplied', () => {
    expect(decideWidgetToolPermission({
      definition: tool(), permissionMode: 'safe', approved: true,
    })).toEqual({ action: 'deny', reason: 'safe-mode' })
  })

  it('asks in ask mode and reports destructive intent', () => {
    expect(decideWidgetToolPermission({
      definition: tool({ annotations: { destructiveHint: true } }), permissionMode: 'ask',
    })).toEqual({ action: 'ask', destructive: true })
    expect(decideWidgetToolPermission({
      definition: tool(), permissionMode: 'ask', approved: true,
    })).toEqual({ action: 'allow', reason: 'approved' })
  })

  it('allows mutating tools in allow-all mode', () => {
    expect(decideWidgetToolPermission({
      definition: tool({ annotations: { destructiveHint: true } }), permissionMode: 'allow-all',
    })).toEqual({ action: 'allow', reason: 'allow-all' })
  })

  it('applies plugin overrides without bypassing safe mode', () => {
    expect(decideWidgetToolPermission({
      definition: tool({ annotations: { readOnlyHint: true } }), permissionMode: 'allow-all', pluginPolicy: 'deny',
    })).toEqual({ action: 'deny', reason: 'plugin-policy' })
    expect(decideWidgetToolPermission({
      definition: tool(), permissionMode: 'allow-all', pluginPolicy: 'ask',
    })).toEqual({ action: 'ask', destructive: false })
    expect(decideWidgetToolPermission({
      definition: tool(), permissionMode: 'ask', pluginPolicy: 'allow',
    })).toEqual({ action: 'allow', reason: 'plugin-policy' })
    expect(decideWidgetToolPermission({
      definition: tool(), permissionMode: 'safe', pluginPolicy: 'allow',
    })).toEqual({ action: 'deny', reason: 'safe-mode' })
  })
})
