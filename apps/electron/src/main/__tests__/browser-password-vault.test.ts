import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let root = ''
const promptTouchID = mock(async () => {})

mock.module('electron', () => ({
  app: {
    getPath: () => root,
    isPackaged: false,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
    decryptString: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/, ''),
  },
  systemPreferences: {
    canPromptTouchID: () => false,
    promptTouchID,
  },
}))

const { BrowserPasswordVault } = await import('../browser-password-vault')

describe('BrowserPasswordVault', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'craft-password-vault-'))
    promptTouchID.mockClear()
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('encrypts credentials at rest and only exposes summaries from list', async () => {
    const vault = new BrowserPasswordVault()
    const saved = await vault.save({ origin: 'https://example.com', username: 'person@example.com', password: 'secret-value' })
    expect(saved.username).toBe('person@example.com')
    expect(await vault.list('https://example.com')).toEqual([saved])
    const raw = readFileSync(join(root, 'browser-profile', 'password-vault.bin'), 'utf8')
    expect(raw).not.toContain('secret-value')
    expect((await vault.reveal(saved.id, 'Fill password')).password).toBe('secret-value')
  })

  it('updates an existing origin and username instead of duplicating it', async () => {
    const vault = new BrowserPasswordVault()
    const first = await vault.save({ origin: 'https://example.com', username: 'person', password: 'one' })
    const updated = await vault.save({ origin: 'https://example.com', username: 'person', password: 'two' })
    expect(updated.id).toBe(first.id)
    expect(await vault.list()).toHaveLength(1)
    expect((await vault.reveal(first.id, 'Fill password')).password).toBe('two')
  })
})
