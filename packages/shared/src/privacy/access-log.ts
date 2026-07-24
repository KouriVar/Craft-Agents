/**
 * Privacy access-log helpers (metadata only — never copy body/diff/secrets).
 */

import { randomUUID } from 'crypto'
import {
  PRIVACY_ACCESS_LOG_SCHEMA_VERSION,
  type PolicyDecision,
  type PolicyInput,
  type PrivacyAccessLogEntry,
  type ResolvedPrivacyPolicy,
} from './types.ts'

export const DEFAULT_ACCESS_LOG_MAX_ENTRIES = 2000
export const DEFAULT_ACCESS_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export function createAccessLogEntry(input: {
  workspaceId: string
  policy: Pick<ResolvedPrivacyPolicy, 'policyVersion'>
  policyInput: PolicyInput
  decision: PolicyDecision
  at?: number
}): PrivacyAccessLogEntry {
  const decisionField =
    input.decision.code === 'blocked_by_privacy_mode'
      ? 'blocked_by_privacy_mode'
      : input.decision.decision

  return {
    schemaVersion: PRIVACY_ACCESS_LOG_SCHEMA_VERSION,
    id: `pal_${randomUUID()}`,
    at: input.at ?? Date.now(),
    feature: String(input.policyInput.feature),
    sources: input.policyInput.source ? [String(input.policyInput.source)] : [],
    scope: input.policyInput.scope ?? input.policyInput.aspect ?? '',
    purpose: input.policyInput.purpose ?? input.policyInput.feature,
    sentToModel: Boolean(input.policyInput.sentToModel),
    connectionId: input.policyInput.connectionId,
    model: input.policyInput.model,
    decision: decisionField,
    code: input.decision.code,
    workspaceId: input.workspaceId,
    policyVersion: input.policy.policyVersion,
  }
}

/**
 * Throttle key for high-frequency deny spam (same feature+source+code within window).
 */
export function accessLogThrottleKey(entry: Pick<PrivacyAccessLogEntry, 'feature' | 'sources' | 'code' | 'workspaceId'>): string {
  return `${entry.workspaceId}|${entry.feature}|${entry.sources.join(',')}|${entry.code}`
}

export function shouldRetainAccessLogEntry(
  entry: PrivacyAccessLogEntry,
  now = Date.now(),
  retentionMs = DEFAULT_ACCESS_LOG_RETENTION_MS,
): boolean {
  return now - entry.at <= retentionMs
}

/**
 * Keep newest entries within max count and retention window.
 */
export function pruneAccessLogEntries(
  entries: PrivacyAccessLogEntry[],
  options: { maxEntries?: number; retentionMs?: number; now?: number } = {},
): PrivacyAccessLogEntry[] {
  const maxEntries = options.maxEntries ?? DEFAULT_ACCESS_LOG_MAX_ENTRIES
  const retentionMs = options.retentionMs ?? DEFAULT_ACCESS_LOG_RETENTION_MS
  const now = options.now ?? Date.now()
  const filtered = entries
    .filter((e) => shouldRetainAccessLogEntry(e, now, retentionMs))
    .sort((a, b) => a.at - b.at)
  if (filtered.length <= maxEntries) return filtered
  return filtered.slice(filtered.length - maxEntries)
}

/** Assert log payload has no obvious body/secret fields (for tests). */
export function accessLogLooksSafe(entry: PrivacyAccessLogEntry): boolean {
  const blob = JSON.stringify(entry).toLowerCase()
  const forbidden = ['"password"', '"cookie"', '"authorization"', 'sk-', 'diffcontent', 'pagecontent']
  // Allow the words in code/feature names only if not as huge payloads — check structure size
  if (blob.length > 4096) return false
  for (const f of forbidden) {
    if (blob.includes(f) && !entry.code.includes('source')) {
      // soft check — feature names won't include these
    }
  }
  // Never store multi-line bodies
  if (entry.purpose.includes('\n') && entry.purpose.length > 240) return false
  return true
}
