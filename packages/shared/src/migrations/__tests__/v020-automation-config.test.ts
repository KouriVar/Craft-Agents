import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateAutomationConfigSchema } from '../v020-automation-config.ts'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

describe('v0.20 automation config migration', () => {
  it('backs up and marks an unversioned config without changing matchers', () => {
    const root = mkdtempSync(join(tmpdir(), 'automation-config-')); roots.push(root)
    const file = join(root, 'automations.json')
    writeFileSync(file, '{"automations":{"SchedulerTick":[{"id":"one","actions":[]}]}}')
    expect(migrateAutomationConfigSchema(file)).toBe('migrated')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ schemaVersion: 1, automations: { SchedulerTick: [{ id: 'one' }] } })
    expect(existsSync(`${file}.pre-v020-schema-v0.bak`)).toBe(true)
    expect(migrateAutomationConfigSchema(file)).toBe('current')
  })

  it('preserves corrupt and future versions', () => {
    const root = mkdtempSync(join(tmpdir(), 'automation-config-')); roots.push(root)
    const file = join(root, 'automations.json')
    writeFileSync(file, '{broken')
    expect(() => migrateAutomationConfigSchema(file)).toThrow('已损坏')
    expect(readFileSync(file, 'utf8')).toBe('{broken')
    writeFileSync(file, '{"schemaVersion":9,"automations":{}}')
    expect(() => migrateAutomationConfigSchema(file)).toThrow('版本 9')
  })
})
