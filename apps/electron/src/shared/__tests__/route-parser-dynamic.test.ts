import { describe, expect, it } from 'bun:test'
import { buildCompoundRoute, parseCompoundRoute, parseRouteToNavigationState } from '../route-parser'

describe('route-parser: dynamic center', () => {
  it('roundtrips the global dynamic route', () => {
    const parsed = parseCompoundRoute('dynamic')!
    expect(parsed).toEqual({ navigator: 'dynamic', details: null })
    expect(buildCompoundRoute(parsed)).toBe('dynamic')
    expect(parseRouteToNavigationState('dynamic')).toEqual({ navigator: 'dynamic', details: null })
  })
})
