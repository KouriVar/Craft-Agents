import { describe, expect, it } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../..')
const TOKEN_FILE = join(REPO_ROOT, 'packages/ui/src/styles/z-index.css')
const APP_CSS = join(REPO_ROOT, 'apps/electron/src/renderer/index.css')
const UI_CSS = join(REPO_ROOT, 'packages/ui/src/styles/index.css')

const EXPECTED_LAYERS: Record<string, number> = {
  base: 0,
  local: 10,
  sticky: 20,
  titlebar: 40,
  panel: 50,
  'dropdown-backdrop': 90,
  dropdown: 100,
  tooltip: 150,
  'modal-backdrop': 190,
  modal: 200,
  notification: 250,
  overlay: 300,
  fullscreen: 350,
  'floating-backdrop': 390,
  'floating-menu': 400,
  'island-overlay': 390,
  island: 400,
  'island-popover': 410,
  splash: 600,
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'playground' || entry.name === 'node_modules' || entry.name === '__tests__') return []
      return collectSourceFiles(path)
    }
    return /\.(?:css|ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

describe('global z-index contract', () => {
  it('defines the documented semantic scale from one shared stylesheet', () => {
    const source = readFileSync(TOKEN_FILE, 'utf8')
    const parsed = Object.fromEntries(
      [...source.matchAll(/--z-([a-z-]+):\s*(\d+);/g)].map(match => [match[1], Number(match[2])]),
    )

    expect(parsed).toEqual(EXPECTED_LAYERS)
    expect(readFileSync(APP_CSS, 'utf8')).toContain('@import "../../../../packages/ui/src/styles/z-index.css";')
    expect(readFileSync(UI_CSS, 'utf8')).toContain('@import "./z-index.css";')
  })

  it('rejects new high arbitrary Tailwind z-index values in production surfaces', () => {
    const roots = [
      join(REPO_ROOT, 'apps/electron/src/renderer'),
      join(REPO_ROOT, 'packages/ui/src/components'),
    ]
    const violations = roots.flatMap(collectSourceFiles).flatMap(file => {
      const source = readFileSync(file, 'utf8')
      return [...source.matchAll(/\bz-\[(\d+)]/g)]
        .filter(match => Number(match[1]) >= 40)
        .map(match => `${file.slice(REPO_ROOT.length + 1)}:${match[0]}`)
    })

    expect(violations).toEqual([])
  })
})
