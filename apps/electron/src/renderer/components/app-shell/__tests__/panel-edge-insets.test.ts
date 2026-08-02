import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const APP_SHELL_DIR = resolve(import.meta.dir, '..')
const RENDERER_DIR = resolve(APP_SHELL_DIR, '../..')

function read(name: string): string {
  return readFileSync(join(APP_SHELL_DIR, name), 'utf8')
}

describe('desktop panel edge insets', () => {
  it('keeps the desktop content panels on equal outer edge insets', () => {
    const source = read('AppShell.tsx')

    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      expect(source).toContain(`padding${side}: isAutoCompact ? 0 : PANEL_EDGE_INSET`)
    }
    expect(source).toContain('(PANEL_EDGE_INSET * 2)')
  })

  it('removes the global desktop top-bar inset while preserving compact mode', () => {
    const source = read('TopBar.tsx')
    const styles = readFileSync(join(RENDERER_DIR, 'index.css'), 'utf8')

    expect(source).toContain("isCompact && !topBarCollapsed ? 'var(--topbar-height)' : '0px'")
    expect(source).toContain('`translateY(calc(-100% + ${PANEL_EDGE_INSET}px))`')
    expect(source).toContain('width: isCompact ? undefined : desktopSidebarWidth')
    expect(styles).toContain('--topbar-height: 54px')
    expect(styles).toContain('--app-topbar-inset: var(--topbar-height)')
  })

  it('keeps sidebar content below its unchanged desktop window controls', () => {
    const source = read('AppShell.tsx')

    expect(source).toContain('`calc(var(--topbar-height) - ${PANEL_EDGE_INSET}px)`')
  })

  it('does not add a second left inset when side panels are collapsed', () => {
    const source = read('PanelStackContainer.tsx')

    expect(source).not.toContain('paddingLeft: !hasSidebar ? PANEL_EDGE_INSET : 0')
    expect(source).not.toContain('PANEL_EDGE_INSET,')
  })

  it('keeps the primary rail flush with the adjacent workspace surface', () => {
    const stack = read('PanelStackContainer.tsx')
    const shell = read('AppShell.tsx')

    expect(stack).toContain('marginRight: -PANEL_GAP')
    expect(shell).toContain('? 0 : sidebarWidth')
    expect(shell).not.toContain('? 0 : sidebarWidth + PANEL_GAP')
  })
})
