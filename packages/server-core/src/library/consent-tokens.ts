/**
 * One-time consent tokens for library:createFromSession (Phase D.2).
 * Server never trusts client consentGranted boolean.
 */

import { randomBytes, createHash } from 'crypto'

export type LibraryConsentPurpose = 'library_generate'

export interface LibraryConsentTokenClaims {
  token: string
  workspaceId: string
  sessionId: string
  /** Sorted message id fingerprint (empty string = all messages at issue time). */
  messageRangeHash: string
  purpose: LibraryConsentPurpose
  caller: string
  createdAt: number
  expiresAt: number
  consumed: boolean
}

const DEFAULT_TTL_MS = 5 * 60 * 1000
const store = new Map<string, LibraryConsentTokenClaims>()

function pruneExpired(now = Date.now()): void {
  for (const [k, v] of store) {
    if (v.consumed || v.expiresAt <= now) store.delete(k)
  }
}

export function hashMessageRange(messageIds: string[] | undefined): string {
  if (!messageIds || messageIds.length === 0) return 'all'
  const sorted = [...messageIds].sort()
  return createHash('sha256').update(sorted.join('\n')).digest('hex').slice(0, 32)
}

export function issueLibraryConsentToken(input: {
  workspaceId: string
  sessionId: string
  messageIds?: string[]
  caller?: string
  ttlMs?: number
}): LibraryConsentTokenClaims {
  pruneExpired()
  const now = Date.now()
  const token = `lct_${randomBytes(24).toString('base64url')}`
  const record: LibraryConsentTokenClaims = {
    token,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    messageRangeHash: hashMessageRange(input.messageIds),
    purpose: 'library_generate',
    caller: input.caller || 'local',
    createdAt: now,
    expiresAt: now + (input.ttlMs ?? DEFAULT_TTL_MS),
    consumed: false,
  }
  store.set(token, record)
  return record
}

export type ConsumeConsentResult =
  | { ok: true; claims: LibraryConsentTokenClaims }
  | { ok: false; code: 'missing' | 'unknown' | 'expired' | 'consumed' | 'mismatch' }

/**
 * Validate and consume a one-time consent token.
 * Does not accept a boolean bypass.
 */
export function consumeLibraryConsentToken(input: {
  token: string | undefined
  workspaceId: string
  sessionId: string
  messageIds?: string[]
}): ConsumeConsentResult {
  pruneExpired()
  if (!input.token) return { ok: false, code: 'missing' }
  const record = store.get(input.token)
  if (!record) return { ok: false, code: 'unknown' }
  if (record.consumed) return { ok: false, code: 'consumed' }
  if (record.expiresAt <= Date.now()) {
    store.delete(input.token)
    return { ok: false, code: 'expired' }
  }
  const rangeHash = hashMessageRange(input.messageIds)
  if (
    record.workspaceId !== input.workspaceId
    || record.sessionId !== input.sessionId
    || record.messageRangeHash !== rangeHash
    || record.purpose !== 'library_generate'
  ) {
    return { ok: false, code: 'mismatch' }
  }
  record.consumed = true
  store.delete(input.token)
  return { ok: true, claims: record }
}

/** Test helper — clear in-memory store. */
export function clearLibraryConsentTokensForTests(): void {
  store.clear()
}

/** Test helper — peek without consuming. */
export function peekLibraryConsentTokenForTests(token: string): LibraryConsentTokenClaims | undefined {
  return store.get(token)
}
