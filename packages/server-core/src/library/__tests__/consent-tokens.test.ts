import { afterEach, describe, expect, it } from 'bun:test'
import {
  clearLibraryConsentTokensForTests,
  consumeLibraryConsentToken,
  issueLibraryConsentToken,
  peekLibraryConsentTokenForTests,
} from '../consent-tokens'

afterEach(() => {
  clearLibraryConsentTokensForTests()
})

describe('library consent tokens', () => {
  it('issues and consumes once', () => {
    const issued = issueLibraryConsentToken({
      workspaceId: 'ws_1',
      sessionId: 'sess_1',
      messageIds: ['m1', 'm2'],
    })
    expect(issued.token.startsWith('lct_')).toBe(true)
    const ok = consumeLibraryConsentToken({
      token: issued.token,
      workspaceId: 'ws_1',
      sessionId: 'sess_1',
      messageIds: ['m1', 'm2'],
    })
    expect(ok.ok).toBe(true)
    const again = consumeLibraryConsentToken({
      token: issued.token,
      workspaceId: 'ws_1',
      sessionId: 'sess_1',
      messageIds: ['m1', 'm2'],
    })
    expect(again.ok).toBe(false)
    if (!again.ok) expect(['consumed', 'unknown']).toContain(again.code)
  })

  it('rejects workspace/session/range mismatch', () => {
    const issued = issueLibraryConsentToken({
      workspaceId: 'ws_1',
      sessionId: 'sess_1',
      messageIds: ['m1'],
    })
    const mismatch = consumeLibraryConsentToken({
      token: issued.token,
      workspaceId: 'ws_1',
      sessionId: 'sess_1',
      messageIds: ['m2'],
    })
    expect(mismatch.ok).toBe(false)
    expect(peekLibraryConsentTokenForTests(issued.token)?.consumed).toBe(false)
  })

  it('rejects expired tokens', () => {
    const issued = issueLibraryConsentToken({
      workspaceId: 'ws_1',
      sessionId: 'sess_1',
      ttlMs: 1,
    })
    // force expire
    const peek = peekLibraryConsentTokenForTests(issued.token)
    if (peek) peek.expiresAt = Date.now() - 1
    const result = consumeLibraryConsentToken({
      token: issued.token,
      workspaceId: 'ws_1',
      sessionId: 'sess_1',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(['expired', 'unknown']).toContain(result.code)
  })

  it('missing token is not bypassed by boolean semantics', () => {
    const result = consumeLibraryConsentToken({
      token: undefined,
      workspaceId: 'ws_1',
      sessionId: 'sess_1',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('missing')
  })
})
