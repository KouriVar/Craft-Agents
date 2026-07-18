import { spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'

export interface BrowserPasswordVaultDependencies {
  app: {
    getPath(name: 'userData'): string
    isPackaged: boolean
  }
  safeStorage: {
    isEncryptionAvailable(): boolean
    encryptString(value: string): Buffer
    decryptString(value: Buffer): string
  }
  systemPreferences: {
    canPromptTouchID(): boolean
    promptTouchID(reason: string): Promise<void>
  }
}

function loadElectronDependencies(): BrowserPasswordVaultDependencies {
  // Keep Electron loading behind the constructor so unit tests can inject the
  // three narrow capabilities they need without globally mocking `electron`.
  const electron = require('electron') as BrowserPasswordVaultDependencies
  return {
    app: electron.app,
    safeStorage: electron.safeStorage,
    systemPreferences: electron.systemPreferences,
  }
}

export interface BrowserCredential {
  id: string
  origin: string
  username: string
  password: string
  createdAt: number
  updatedAt: number
}

export type BrowserCredentialSummary = Omit<BrowserCredential, 'password'>

interface KeychainResponse {
  ok: boolean
  credentials?: BrowserCredential[]
  error?: string
}

export class BrowserPasswordVault {
  private readonly app: BrowserPasswordVaultDependencies['app']
  private readonly safeStorage: BrowserPasswordVaultDependencies['safeStorage']
  private readonly systemPreferences: BrowserPasswordVaultDependencies['systemPreferences']
  private readonly localPath: string

  constructor(dependencies: BrowserPasswordVaultDependencies = loadElectronDependencies()) {
    this.app = dependencies.app
    this.safeStorage = dependencies.safeStorage
    this.systemPreferences = dependencies.systemPreferences
    this.localPath = join(this.app.getPath('userData'), 'browser-profile', 'password-vault.bin')
  }

  async list(origin?: string): Promise<BrowserCredentialSummary[]> {
    return (await this.readAll())
      .filter((credential) => !origin || credential.origin === origin)
      .map(({ password: _password, ...summary }) => summary)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async save(input: { origin: string; username: string; password: string }): Promise<BrowserCredentialSummary> {
    const all = await this.readAll()
    const existing = all.find((credential) => credential.origin === input.origin && credential.username === input.username)
    const now = Date.now()
    const credential: BrowserCredential = existing
      ? { ...existing, password: input.password, updatedAt: now }
      : { id: randomUUID(), ...input, createdAt: now, updatedAt: now }
    if (this.keychainHelperPath()) {
      await this.runKeychain({ action: 'save', credential })
    } else {
      const next = existing ? all.map((item) => item.id === existing.id ? credential : item) : [...all, credential]
      await this.writeLocal(next)
    }
    const { password: _password, ...summary } = credential
    return summary
  }

  async remove(id: string): Promise<void> {
    if (this.keychainHelperPath()) {
      await this.runKeychain({ action: 'delete', id })
      return
    }
    await this.writeLocal((await this.readAll()).filter((credential) => credential.id !== id))
  }

  async reveal(id: string, reason: string): Promise<BrowserCredential> {
    if (process.platform === 'darwin' && this.systemPreferences.canPromptTouchID()) {
      await this.systemPreferences.promptTouchID(reason)
    }
    const credential = (await this.readAll()).find((item) => item.id === id)
    if (!credential) throw new Error('Saved password not found.')
    return credential
  }

  getBackend(): 'icloud-keychain' | 'system-encrypted-local' {
    return this.keychainHelperPath() && this.app.isPackaged ? 'icloud-keychain' : 'system-encrypted-local'
  }

  private keychainHelperPath(): string | null {
    if (process.platform !== 'darwin') return null
    const path = this.app.isPackaged
      ? join(process.resourcesPath, 'browser-keychain-helper')
      : join(__dirname, 'browser-keychain-helper')
    return existsSync(path) ? path : null
  }

  private async readAll(): Promise<BrowserCredential[]> {
    if (this.keychainHelperPath()) {
      return (await this.runKeychain({ action: 'list' })).credentials ?? []
    }
    if (!existsSync(this.localPath)) return []
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('The operating-system password vault is unavailable.')
    const encrypted = Buffer.from(readFileSync(this.localPath, 'utf8'), 'base64')
    return JSON.parse(this.safeStorage.decryptString(encrypted)) as BrowserCredential[]
  }

  private async writeLocal(credentials: BrowserCredential[]): Promise<void> {
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('The operating-system password vault is unavailable.')
    mkdirSync(dirname(this.localPath), { recursive: true, mode: 0o700 })
    const encrypted = this.safeStorage.encryptString(JSON.stringify(credentials))
    const temporaryPath = `${this.localPath}.tmp`
    writeFileSync(temporaryPath, encrypted.toString('base64'), { encoding: 'utf8', mode: 0o600 })
    renameSync(temporaryPath, this.localPath)
  }

  private runKeychain(request: Record<string, unknown>): Promise<KeychainResponse> {
    const helper = this.keychainHelperPath()
    if (!helper) throw new Error('The iCloud Keychain helper is unavailable.')
    return new Promise((resolve, reject) => {
      const child = spawn(helper, [], { stdio: ['pipe', 'pipe', 'pipe'] })
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
      child.once('error', reject)
      child.once('close', (code) => {
        if (code !== 0) {
          reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `Keychain helper exited with ${code}.`))
          return
        }
        try {
          const response = JSON.parse(Buffer.concat(stdout).toString('utf8')) as KeychainResponse
          if (!response.ok) throw new Error(response.error || 'Keychain operation failed.')
          resolve(response)
        } catch (error) {
          reject(error)
        }
      })
      child.stdin.end(JSON.stringify(request))
    })
  }
}
