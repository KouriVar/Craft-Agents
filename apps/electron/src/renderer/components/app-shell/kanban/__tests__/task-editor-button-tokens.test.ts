import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../../../..')
const EDITOR = join(REPO_ROOT, 'apps/electron/src/renderer/components/app-shell/kanban/TaskEditor.tsx')
const COLUMN = join(REPO_ROOT, 'apps/electron/src/renderer/components/app-shell/kanban/KanbanColumn.tsx')

describe('Kanban TaskEditor button / token consistency', () => {
  it('removes inline Btn and indigo primary styling in favor of Button', () => {
    const source = readFileSync(EDITOR, 'utf8')
    expect(source).toContain("from '@/components/ui/button'")
    expect(source).toContain('<Button')
    expect(source).not.toContain('function Btn')
    expect(source).not.toContain('bg-indigo-500')
    expect(source).not.toContain('text-indigo-')
    expect(source).not.toContain('hover:text-red-500')
    expect(source).not.toContain('border-red-500')
    expect(source).not.toContain('text-red-500')
    expect(source).toContain('text-destructive')
    expect(source).toContain('border-destructive/30')
  })

  it('keeps save/cancel/run handlers wired through Button click props', () => {
    const source = readFileSync(EDITOR, 'utf8')
    expect(source).toMatch(/<Button[^>]*onClick=\{onClose\}/)
    expect(source).toMatch(/<Button[^>]*onClick=\{\(\) => submit\(false\)\}/)
    expect(source).toMatch(/<Button[^>]*onClick=\{\(\) => submit\(true\)\}/)
    expect(source).toMatch(/<Button[^>]*onClick=\{generatePlan\}/)
  })

  it('uses destructive token for Kanban column delete affordance', () => {
    const source = readFileSync(COLUMN, 'utf8')
    expect(source).toContain('text-destructive')
    expect(source).toContain('hover:bg-destructive/10')
    expect(source).not.toContain('text-red-500')
  })
})
