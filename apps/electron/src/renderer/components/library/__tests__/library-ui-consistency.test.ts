import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../../..')
const LIB = join(REPO_ROOT, 'apps/electron/src/renderer/components/library')

function read(name: string): string {
  return readFileSync(join(LIB, name), 'utf8')
}

describe('Library UI consistency (pre-release minimal fix)', () => {
  it('document export uses StyledDropdownMenu instead of a hand-rolled floating panel', () => {
    const source = read('LibraryDocumentPage.tsx')
    expect(source).toContain('StyledDropdownMenuContent')
    expect(source).toContain('StyledDropdownMenuItem')
    expect(source).toContain('DropdownMenuTrigger')
    expect(source).not.toContain('setExportOpen')
    expect(source).not.toContain('window.confirm')
  })

  it('document and list delete use LibraryDeleteConfirmDialog with destructive confirm', () => {
    const dialog = read('LibraryDeleteConfirmDialog.tsx')
    expect(dialog).toContain('variant="destructive"')
    expect(dialog).toContain('variant="outline"')
    expect(dialog).toContain('library.deleteConfirm')
    expect(dialog).toContain('documentTitle')

    const doc = read('LibraryDocumentPage.tsx')
    expect(doc).toContain('LibraryDeleteConfirmDialog')
    expect(doc).not.toContain('window.confirm')

    const list = read('LibraryListPanel.tsx')
    expect(list).toContain('LibraryDeleteConfirmDialog')
    expect(list).not.toContain('window.confirm')
  })

  it('list row menu uses CA context menu with destructive delete item', () => {
    const list = read('LibraryListPanel.tsx')
    expect(list).toContain('StyledContextMenuContent')
    expect(list).toContain('StyledContextMenuItem')
    expect(list).toContain('variant="destructive"')
    expect(list).not.toContain('absolute right-1 top-8')
  })

  it('consent dialog footer uses standard Button variants', () => {
    const source = read('LibraryGenerateConsentDialog.tsx')
    const footer = source.slice(source.lastIndexOf('<DialogFooter'))
    expect(source).toContain("from '@/components/ui/button'")
    expect(footer).toContain('variant="outline"')
    expect(footer).toContain("<Button")
    expect(footer).toContain("t('library.consentCancel')")
    expect(footer).toContain("t('library.consentAllowOnce')")
    expect(footer).not.toContain('<button')
  })
})
