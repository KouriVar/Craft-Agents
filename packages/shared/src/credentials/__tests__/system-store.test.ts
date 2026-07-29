import { describe, expect, it } from 'bun:test'
import { SystemCredentialStore, systemCredentialAccount } from '../system-store.ts'
describe('system credential store contract', () => {
  it('uses stable non-secret account references and round-trips through a platform adapter', async () => {
    const values = new Map<string, string>()
    const adapter = { isAvailable: async () => true, getPassword: async (_s: string, a: string) => values.get(a) ?? null, setPassword: async (_s: string, a: string, v: string) => { values.set(a, v) }, deletePassword: async (_s: string, a: string) => values.delete(a) }
    const id = { type: 'source_bearer' as const, workspaceId: 'ws', sourceId: 'github' }
    const store = new SystemCredentialStore(adapter)
    expect(systemCredentialAccount(id)).toBe('source_bearer::ws::github')
    await store.set(id, { value: 'secret-token' })
    expect((await store.get(id))?.value).toBe('secret-token')
    expect(await store.delete(id)).toBe(true)
    expect(await store.get(id)).toBeNull()
  })
})
