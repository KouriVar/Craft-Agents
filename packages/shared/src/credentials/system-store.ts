import type { CredentialId, StoredCredential } from './types.ts'
import { credentialIdToAccount } from './types.ts'

/** Platform bridge implemented by Electron with Keychain/Credential Manager/Secret Service. */
export interface SystemCredentialAdapter {
  isAvailable(): Promise<boolean>
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, value: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
}

export const SYSTEM_CREDENTIAL_SERVICE = 'com.craftagent.credentials'

/** Secret-safe credential reference; config stores this account string, never its value. */
export function systemCredentialAccount(id: CredentialId): string {
  return credentialIdToAccount(id)
}

export class SystemCredentialStore {
  constructor(private readonly adapter: SystemCredentialAdapter, private readonly service = SYSTEM_CREDENTIAL_SERVICE) {}

  async isAvailable(): Promise<boolean> { return this.adapter.isAvailable() }
  async get(id: CredentialId): Promise<StoredCredential | null> {
    const value = await this.adapter.getPassword(this.service, systemCredentialAccount(id))
    if (!value) return null
    try { return JSON.parse(value) as StoredCredential } catch { return null }
  }
  async set(id: CredentialId, credential: StoredCredential): Promise<void> {
    await this.adapter.setPassword(this.service, systemCredentialAccount(id), JSON.stringify(credential))
  }
  async delete(id: CredentialId): Promise<boolean> {
    return this.adapter.deletePassword(this.service, systemCredentialAccount(id))
  }
}
