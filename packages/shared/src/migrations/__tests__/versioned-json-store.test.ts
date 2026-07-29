import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readVersionedStore, VersionedStoreError } from '../versioned-json-store.ts'

interface Store { schemaVersion: 2; values: string[] }
const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

const read = (filePath: string) => readVersionedStore<Store>({
  filePath,
  displayName: '测试存储',
  currentVersion: 2,
  empty: () => ({ schemaVersion: 2, values: [] }),
  validate: (value): value is Store => {
    const store = value as Partial<Store>
    return store.schemaVersion === 2 && Array.isArray(store.values)
  },
  migrate: (value, from) => from === 1
    ? { schemaVersion: 2, values: [...((value as { values?: string[] }).values ?? [])] }
    : null,
})

describe('versioned JSON store migration safety', () => {
  it('backs up and migrates an older version exactly once', () => {
    const root = mkdtempSync(join(tmpdir(), 'versioned-store-')); roots.push(root)
    const file = join(root, 'store.json')
    writeFileSync(file, '{"schemaVersion":1,"values":["kept"]}')
    expect(read(file)).toEqual({ schemaVersion: 2, values: ['kept'] })
    const backup = `${file}.pre-v020-schema-v1.bak`
    expect(existsSync(backup)).toBe(true)
    expect(JSON.parse(readFileSync(backup, 'utf8')).schemaVersion).toBe(1)
    expect(read(file)).toEqual({ schemaVersion: 2, values: ['kept'] })
  })

  it('preserves corrupt and future-version data instead of returning an empty store', () => {
    const root = mkdtempSync(join(tmpdir(), 'versioned-store-')); roots.push(root)
    const file = join(root, 'store.json')
    writeFileSync(file, '{broken')
    expect(() => read(file)).toThrow(VersionedStoreError)
    expect(readFileSync(file, 'utf8')).toBe('{broken')
    writeFileSync(file, '{"schemaVersion":99,"values":["future"]}')
    expect(() => read(file)).toThrow('数据版本 99 不受当前应用支持')
    expect(readFileSync(file, 'utf8')).toContain('future')
  })
})
