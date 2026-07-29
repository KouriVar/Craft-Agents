import { describe, expect, it } from 'bun:test'
import { buildCompoundRoute, buildRouteFromNavigationState, parseCompoundRoute, parseRouteToNavigationState } from '../route-parser'

describe('plugin routes', () => {
  it('redirects the obsolete plugin navigator to the capability center', () => {
    expect(parseCompoundRoute('plugins')).toEqual({ navigator: 'skills', details: null })
  })

  it('does not revive the obsolete plugin detail product surface', () => {
    const route = buildRouteFromNavigationState({
      navigator: 'plugins',
      details: { type: 'plugin', pluginName: '@scope/my plugin' },
    })

    expect(route).toBe('plugins/plugin/%40scope%2Fmy%20plugin')
    expect(parseRouteToNavigationState(route)).toEqual({ navigator: 'skills', details: null })
  })

  it('builds a plugin detail compound route', () => {
    expect(buildCompoundRoute({
      navigator: 'plugins',
      details: { type: 'plugin', id: 'cowart' },
    })).toBe('plugins/plugin/cowart')
  })
})
