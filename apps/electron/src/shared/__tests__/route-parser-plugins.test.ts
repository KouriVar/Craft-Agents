import { describe, expect, it } from 'bun:test'
import { buildCompoundRoute, buildRouteFromNavigationState, parseCompoundRoute, parseRouteToNavigationState } from '../route-parser'

describe('plugin routes', () => {
  it('parses the plugin navigator route', () => {
    expect(parseCompoundRoute('plugins')).toEqual({ navigator: 'plugins', details: null })
  })

  it('round-trips plugin names that need URL encoding', () => {
    const route = buildRouteFromNavigationState({
      navigator: 'plugins',
      details: { type: 'plugin', pluginName: '@scope/my plugin' },
    })

    expect(route).toBe('plugins/plugin/%40scope%2Fmy%20plugin')
    expect(parseRouteToNavigationState(route)).toEqual({
      navigator: 'plugins',
      details: { type: 'plugin', pluginName: '@scope/my plugin' },
    })
  })

  it('builds a plugin detail compound route', () => {
    expect(buildCompoundRoute({
      navigator: 'plugins',
      details: { type: 'plugin', id: 'cowart' },
    })).toBe('plugins/plugin/cowart')
  })
})
