import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../..')
const TOKEN_FILE = join(REPO_ROOT, 'packages/ui/src/styles/control-tokens.css')
const APP_CSS = join(REPO_ROOT, 'apps/electron/src/renderer/index.css')
const UI_CSS = join(REPO_ROOT, 'packages/ui/src/styles/index.css')

const EXPECTED_PIXEL_TOKENS: Record<string, number> = {
  'control-height-compact': 28,
  'control-height-sm': 32,
  'control-height-md': 36,
  'control-height-lg': 40,
  'control-height-touch': 44,
  'radius-menu-item': 4,
  'radius-control': 6,
  'radius-surface': 8,
  'radius-touch': 10,
  'radius-card': 12,
  'radius-modal': 16,
  'floating-safe-inset': 12,
  'window-safe-inset': 16,
  'layout-gap-stacked': 10,
  'font-size-control': 13,
  'line-height-control': 20,
}

const CORE_COMPONENTS = [
  ['apps/electron/src/renderer/components/ui/button.tsx', ['rounded-control', 'h-control-md', 'size-control-md']],
  ['apps/electron/src/renderer/components/ui/input.tsx', ['rounded-control', 'h-control-md']],
  ['apps/electron/src/renderer/components/ui/select.tsx', ['rounded-control', 'h-control-md']],
  ['apps/electron/src/renderer/components/ui/textarea.tsx', ['rounded-control']],
  ['packages/ui/src/components/tooltip.tsx', ['rounded-surface']],
  ['packages/ui/src/components/ui/SimpleDropdown.tsx', ['rounded-menu-item', 'rounded-surface', 'text-control']],
] as const

describe('shared control and responsive token contract', () => {
  it('defines the established geometry scale from one shared stylesheet', () => {
    const source = readFileSync(TOKEN_FILE, 'utf8')
    const parsed = Object.fromEntries(
      [...source.matchAll(/--ca-([a-z-]+):\s*(\d+)px;/g)].map(match => [match[1], Number(match[2])]),
    )

    expect(parsed).toEqual(EXPECTED_PIXEL_TOKENS)
    expect(source).toContain('--spacing-control-md: var(--ca-control-height-md);')
    expect(source).toContain('--radius-control: var(--ca-radius-control);')
    expect(source).toContain('--text-control: var(--ca-font-size-control);')
    expect(readFileSync(APP_CSS, 'utf8')).toContain('@import "../../../../packages/ui/src/styles/control-tokens.css";')
    expect(readFileSync(UI_CSS, 'utf8')).toContain('@import "./control-tokens.css";')
  })

  it('keeps narrow surfaces and touch targets on semantic safety tokens', () => {
    const source = readFileSync(APP_CSS, 'utf8')

    expect(source).toContain('max-width: calc(100cqw - (2 * var(--ca-floating-safe-inset)));')
    expect(source).toContain('max-width: calc(100% - (2 * var(--ca-window-safe-inset)));')
    expect(source).toContain('gap: var(--ca-layout-gap-stacked);')
    expect(source).toContain('min-height: var(--ca-control-height-touch);')
  })

  it('uses semantic geometry classes in the high-reuse primitives', () => {
    for (const [relativePath, expectedClasses] of CORE_COMPONENTS) {
      const source = readFileSync(join(REPO_ROOT, relativePath), 'utf8')
      for (const expectedClass of expectedClasses) expect(source).toContain(expectedClass)
    }
  })
})
