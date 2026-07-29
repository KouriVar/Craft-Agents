import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createConnector, deleteConnector, getConnector, listConnectors, updateConnector } from '../index.ts'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

describe('Connector compatibility CRUD', () => {
  it('maps existing Source storage into a user-facing connector without copying credentials', async () => {
    const root = mkdtempSync(join(tmpdir(), 'connector-'))
    roots.push(root)
    const created = await createConnector(root, {
      name: 'GitHub', provider: 'github', type: 'api',
      api: { baseUrl: 'https://api.github.com', authType: 'bearer' },
    })
    expect(created.driver).toBe('api')
    expect(listConnectors(root)).toHaveLength(1)
    expect(updateConnector(root, created.sourceSlug, { name: 'GitHub Team', enabled: false })?.name).toBe('GitHub Team')
    expect(getConnector(root, created.sourceSlug)?.enabled).toBe(false)
    expect(deleteConnector(root, created.sourceSlug)).toBe(true)
    expect(listConnectors(root)).toEqual([])
  }, 10_000)
})
