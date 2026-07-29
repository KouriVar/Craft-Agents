import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const APP_SHELL_DIR = resolve(import.meta.dir, '..')

function read(name: string): string {
  return readFileSync(join(APP_SHELL_DIR, name), 'utf8')
}

describe('desktop panel edge insets', () => {
  it('keeps the workspace side and bottom edges on the shared inset token', () => {
    const source = read('AppShell.tsx')

    for (const side of ['Right', 'Bottom', 'Left']) {
      expect(source).toContain(`padding${side}: isAutoCompact ? 0 : PANEL_EDGE_INSET`)
    }
    expect(source).toContain('(PANEL_EDGE_INSET * 2)')
  })

  it('includes the same edge inset below expanded and collapsed desktop top bars', () => {
    const source = read('TopBar.tsx')

    expect(source).toContain('`calc(var(--topbar-height) + ${PANEL_EDGE_INSET}px)`')
    expect(source).toContain('topBarCollapsed ? `${PANEL_EDGE_INSET}px` : expandedInset')
    expect(source).toContain('`translateY(calc(-100% + ${PANEL_EDGE_INSET}px))`')
  })

  it('does not add a second left inset when side panels are collapsed', () => {
    const source = read('PanelStackContainer.tsx')

    expect(source).not.toContain('paddingLeft: !hasSidebar ? PANEL_EDGE_INSET : 0')
    expect(source).not.toContain('PANEL_EDGE_INSET,')
  })
})
