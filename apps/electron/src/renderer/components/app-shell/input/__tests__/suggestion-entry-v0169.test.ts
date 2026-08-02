import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const INPUT_DIR = resolve(import.meta.dir, '..')

describe('v0.16.9 input suggestion entry', () => {
  it('FreeFormInput no longer mounts the toolbar ContextActionsBadge', () => {
    const source = readFileSync(join(INPUT_DIR, 'FreeFormInput.tsx'), 'utf8')
    expect(source).not.toContain('ContextActionsBadge')
    expect(source).not.toContain("from './ContextActionsBadge'")
  })

  it('ContextSuggestionBadge anchors the dropdown to the whole badge', () => {
    const source = readFileSync(join(INPUT_DIR, 'ContextSuggestionBadge.tsx'), 'utf8')
    expect(source).toContain('side="top"')
    expect(source).toContain('align="start"')
    expect(source).toContain('sideOffset={4}')
    expect(source).toContain('absolute inset-0')
    expect(source).toContain('<MetadataBadge')
    expect(source).toContain('badgeColor="var(--foreground)"')
    expect(source).toContain('ContextSuggestionMenu')
    expect(source).toContain('bindContextActionHost')
    expect(source).not.toContain('CommandDialog')
  })

  it('keeps ContextActionsMenu / ContextActionsBadge source for framework reuse', () => {
    const badge = readFileSync(join(INPUT_DIR, 'ContextActionsBadge.tsx'), 'utf8')
    const menu = readFileSync(join(INPUT_DIR, 'ContextActionsMenu.tsx'), 'utf8')
    expect(badge).toContain('export function ContextActionsBadge')
    expect(menu).toContain('export function ContextActionsMenu')
  })
})
