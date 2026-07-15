import { describe, expect, test } from 'bun:test'
import {
  buildWidgetDocument,
  clampWidgetHeight,
  CODEX_VISUALIZATION_RUNTIME,
  HOST_STYLES,
  WIDGET_CSP,
  WIDGET_IFRAME_SANDBOX,
  type WidgetThemeSnapshot,
} from './inline-host'

const theme: WidgetThemeSnapshot = {
  mode: 'dark',
  tokens: {
    background: 'rgb(20, 20, 22)',
    foreground: 'rgb(240, 240, 242)',
    accent: 'rgb(130, 75, 185)',
    'font-size-base': '15px',
  },
}

describe('inline visualization host contract', () => {
  test('keeps the iframe sandbox isolated', () => {
    expect(WIDGET_IFRAME_SANDBOX.split(/\s+/)).toEqual(['allow-scripts'])
    expect(WIDGET_IFRAME_SANDBOX).not.toContain('allow-same-origin')
    expect(WIDGET_IFRAME_SANDBOX).not.toContain('allow-top-navigation')
    expect(WIDGET_IFRAME_SANDBOX).not.toContain('allow-popups')
  })

  test('matches the visualize CDN allowlist while blocking data APIs and frames', () => {
    for (const host of ['cdnjs.cloudflare.com', 'esm.sh', 'cdn.jsdelivr.net', 'unpkg.com']) {
      expect(WIDGET_CSP).toContain(host)
    }
    expect(WIDGET_CSP).toContain("connect-src 'none'")
    expect(WIDGET_CSP).toContain("frame-src 'none'")
    expect(WIDGET_CSP).toContain("object-src 'none'")
  })

  test('wraps a fragment with the Codex visual runtime and the Craft host bridge', () => {
    const documentHtml = buildWidgetDocument('<div id="demo"><i data-lucide="chart-no-axes-combined"></i></div>', theme)
    expect(documentHtml).toStartWith('<!doctype html>')
    expect(documentHtml).toContain('data-theme="dark"')
    expect(documentHtml).toContain('--background: light-dark(rgb(255 255 255), rgb(24 24 24))')
    expect(documentHtml).not.toContain('--background:rgb(20, 20, 22)')
    expect(documentHtml).toContain('codex-visualization-tooltip')
    expect(documentHtml).toContain('createIcons')
    expect(documentHtml).toContain('sendFollowUpMessage')
    expect(documentHtml).toContain('ResizeObserver')
    expect(documentHtml).toContain('<div id="demo">')
  })

  test('injects the host into a complete document without nesting another document', () => {
    const documentHtml = buildWidgetDocument('<html><head><title>Demo</title></head><body><main>Hi</main></body></html>', theme)
    expect(documentHtml.match(/<html/g)).toHaveLength(1)
    expect(documentHtml).toContain('<head><meta http-equiv="Content-Security-Policy"')
    expect(documentHtml).toContain('<main>Hi</main>')
    expect(documentHtml).toContain('</script></body>')
  })

  test('provides every utility named by the visualize skill contract', () => {
    for (const className of [
      '.card', '.viz-row', '.viz-grid', '.viz-controls', '.viz-stat', '.viz-stat-value',
      '.viz-tile', '.viz-badge', '.btn', '.btn-primary', '.btn-ghost', '.btn-block',
      '.form-label', '.form-control', '.form-control-color', '.form-select', '.form-range',
      '.form-check', '.form-check-input', '.form-check-label', '.form-switch', '.tooltip',
      '.text-small', '.text-muted', '.text-destructive', '.sr-only',
    ]) {
      expect(HOST_STYLES).toContain(className)
    }
  })

  test('uses the bundled Codex visualization assets without replacing their content styles', () => {
    expect(HOST_STYLES).toContain('Agent-facing contract; keep in sync with SKILL.md.')
    expect(HOST_STYLES).toContain('--radius: 12.5px')
    expect(CODEX_VISUALIZATION_RUNTIME).toContain('window.FloatingUIDOM')
    expect(CODEX_VISUALIZATION_RUNTIME).not.toContain('__INLINE_VISUALIZATION_FRAGMENT__')
  })

  test('fits short and tall content without the old 1200px cutoff', () => {
    expect(clampWidgetHeight(12)).toBe(48)
    expect(clampWidgetHeight(4_000)).toBe(4_000)
    expect(clampWidgetHeight(50_000)).toBe(20_000)
    expect(clampWidgetHeight('400')).toBeNull()
  })
})
