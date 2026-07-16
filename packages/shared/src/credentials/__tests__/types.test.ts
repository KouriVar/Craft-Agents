import { describe, expect, it } from 'bun:test'
import { accountToCredentialId, credentialIdToAccount } from '../types.ts'

describe('OAuth application credential IDs', () => {
  it('round-trips a provider-scoped encrypted credential key', () => {
    const id = { type: 'oauth_app' as const, name: 'google' }
    expect(credentialIdToAccount(id)).toBe('oauth_app::google')
    expect(accountToCredentialId('oauth_app::google')).toEqual(id)
  })
})
