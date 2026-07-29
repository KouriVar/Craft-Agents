import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { migrateLibraryToKnowledge } from '../v020-knowledge.ts'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
describe('v0.20 Library -> Knowledge migration', () => {
  it('moves the complete legacy tree without overwriting its versions or source metadata', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-migrate-')); roots.push(root)
    mkdirSync(join(root, 'library', 'versions', 'doc_one'), { recursive: true })
    writeFileSync(join(root, 'library', 'documents.json'), '{"sourceSession":"s1"}')
    writeFileSync(join(root, 'library', 'versions', 'doc_one', 'v1.md'), '# preserved')
    expect(migrateLibraryToKnowledge(root)).toBe('migrated')
    expect(existsSync(join(root, 'library'))).toBe(false)
    expect(existsSync(join(root, 'knowledge', 'versions', 'doc_one', 'v1.md'))).toBe(true)
    expect(migrateLibraryToKnowledge(root)).toBe('already_migrated')
  })
  it('merges a safe dual-tree state and keeps a recoverable legacy backup', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-conflict-')); roots.push(root)
    mkdirSync(join(root, 'library', 'documents'), { recursive: true }); mkdirSync(join(root, 'knowledge', 'documents'), { recursive: true })
    writeFileSync(join(root, 'library', 'documents', 'old.md'), 'legacy')
    writeFileSync(join(root, 'knowledge', 'documents', 'new.md'), 'current')
    expect(migrateLibraryToKnowledge(root)).toBe('merged')
    expect(existsSync(join(root, 'knowledge', 'documents', 'old.md'))).toBe(true)
    expect(existsSync(join(root, 'library.v020-premerge-backup', 'documents', 'old.md'))).toBe(true)
    expect(migrateLibraryToKnowledge(root)).toBe('merged')
  })
  it('refuses a dual-tree state with different content at the same path', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-conflict-')); roots.push(root)
    mkdirSync(join(root, 'library', 'documents'), { recursive: true }); mkdirSync(join(root, 'knowledge', 'documents'), { recursive: true })
    writeFileSync(join(root, 'library', 'documents', 'same.md'), 'legacy')
    writeFileSync(join(root, 'knowledge', 'documents', 'same.md'), 'current')
    expect(migrateLibraryToKnowledge(root)).toBe('conflict')
  })
})
