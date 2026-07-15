import { describe, expect, test } from 'bun:test'
import { WIDGET_CSP, WIDGET_IFRAME_SANDBOX } from './InlineVisualizationBlock'

describe('InlineVisualizationBlock security invariants', () => {
  test('allows scripts without same-origin, popups, or top navigation', () => {
    expect(WIDGET_IFRAME_SANDBOX.split(/\s+/)).toEqual(['allow-scripts'])
    expect(WIDGET_IFRAME_SANDBOX).not.toContain('allow-same-origin')
    expect(WIDGET_IFRAME_SANDBOX).not.toContain('allow-top-navigation')
    expect(WIDGET_IFRAME_SANDBOX).not.toContain('allow-popups')
  })

  test('blocks network APIs and nested frames through CSP', () => {
    expect(WIDGET_CSP).toContain("connect-src 'none'")
    expect(WIDGET_CSP).toContain("frame-src 'none'")
    expect(WIDGET_CSP).toContain("object-src 'none'")
  })
})
