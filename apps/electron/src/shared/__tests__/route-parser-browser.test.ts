import { describe, expect, test } from 'bun:test'
import {
  buildCompoundRoute,
  buildRouteFromNavigationState,
  parseCompoundRoute,
  parseRouteToNavigationState,
} from '../route-parser'
import { getNavigationStateKey, parseNavigationStateKey } from '../types'

describe('browser routes', () => {
  test('parses the browser navigator route', () => {
    expect(parseCompoundRoute('browser')).toEqual({
      navigator: 'browser',
      details: null,
    })
  })

  test('parses a selected browser tab', () => {
    expect(parseCompoundRoute('browser/tab/browser-tab-1')).toEqual({
      navigator: 'browser',
      details: { type: 'browser-tab', id: 'browser-tab-1' },
    })
  })

  test('round-trips parsed browser routes', () => {
    expect(buildCompoundRoute(parseCompoundRoute('browser')!)).toBe('browser')
    expect(buildCompoundRoute(parseCompoundRoute('browser/tab/browser-tab-1')!))
      .toBe('browser/tab/browser-tab-1')
  })

  test('converts browser routes to navigation state', () => {
    expect(parseRouteToNavigationState('browser/tab/browser-tab-1')).toEqual({
      navigator: 'browser',
      details: { type: 'browser-tab', tabId: 'browser-tab-1' },
    })
  })

  test('builds browser routes from navigation state', () => {
    expect(buildRouteFromNavigationState({
      navigator: 'browser',
      details: { type: 'browser-tab', tabId: 'browser-tab-1' },
    })).toBe('browser/tab/browser-tab-1')
  })

  test('round-trips browser navigation state keys', () => {
    const state = {
      navigator: 'browser' as const,
      details: { type: 'browser-tab' as const, tabId: 'browser-tab-1' },
    }
    const key = getNavigationStateKey(state)
    expect(key).toBe('browser/tab/browser-tab-1')
    expect(parseNavigationStateKey(key)).toEqual(state)
  })
})
