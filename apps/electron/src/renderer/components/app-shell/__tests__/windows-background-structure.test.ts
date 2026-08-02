import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RENDERER_DIR = resolve(import.meta.dir, '../../..')
const appShellSource = readFileSync(
  resolve(RENDERER_DIR, 'components/app-shell/AppShell.tsx'),
  'utf8',
)
const cssSource = readFileSync(resolve(RENDERER_DIR, 'index.css'), 'utf8')
const panelStackSource = readFileSync(
  resolve(RENDERER_DIR, 'components/app-shell/PanelStackContainer.tsx'),
  'utf8',
)
const panelSlotSource = readFileSync(
  resolve(RENDERER_DIR, 'components/app-shell/PanelSlot.tsx'),
  'utf8',
)

describe('Windows background structure', () => {
  it('does not map the Windows background toggle to legacy glass levels', () => {
    expect(appShellSource).toContain(
      'const effectiveShellGlassIntensity = isWindows ? undefined : shellGlassIntensity',
    )
    expect(appShellSource).toContain(
      'const effectivePanelGlassIntensity = isWindows ? undefined : panelGlassIntensity',
    )
  })

  it('paints one shell while leaving the top bar and primary sidebar transparent', () => {
    expect(cssSource).toContain(
      "html[data-platform='windows'] .ca-window-shell {\n" +
      '    --ca-windows-window-radius: 12px;\n' +
      '    --win-shell-background: rgb(var(--ca-shell-glass-tint-rgb));\n' +
      '    --ca-windows-panel-surface: oklch(from var(--foreground-2) l c h / 1);\n' +
      '    background: var(--win-shell-background);',
    )
    expect(cssSource).toContain(
      "html[data-platform='windows'] .ca-window-shell [data-focus-zone='sidebar'] {\n" +
      '    background: transparent !important;',
    )
    expect(cssSource).not.toContain(
      "[data-focus-zone='sidebar'] {\n    background: var(--win-shell-background)",
    )
  })

  it('uses one opaque surface for navigator and content panels', () => {
    expect(cssSource).toContain(
      "html[data-platform='windows'] .ca-window-shell [data-panel-role='navigator'],\n" +
      "  html[data-platform='windows'] .ca-window-shell [data-panel-role='content'],",
    )
    expect(cssSource).toContain(
      'background: var(--ca-windows-panel-surface) !important;\n' +
      '    backdrop-filter: none;\n' +
      '    -webkit-backdrop-filter: none;',
    )
    expect(cssSource).not.toContain(
      "[data-panel-role='navigator'] {\n    background: var(--win-shell-background)",
    )
    expect(panelStackSource.match(/!isWindows && 'panel-glass-surface'/g)).toHaveLength(4)
    expect(panelSlotSource).toContain("!isWindows && 'panel-glass-surface'")
  })
})
