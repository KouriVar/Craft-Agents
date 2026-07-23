/**
 * Evidence fingerprint — stable identity for Observation/Loop across rebuilds.
 * Prefer this over ephemeral observation ids when re-linking Loops.
 */

import { createHash } from 'crypto'

export function normalizeEvidenceTopic(topic: string): string {
  return topic
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export function buildEvidenceFingerprint(parts: {
  sessionId?: string
  eventIds?: string[]
  subject?: string
  topic?: string
  category?: string
}): string {
  const raw = [
    parts.sessionId ?? '',
    [...(parts.eventIds ?? [])].sort().join(','),
    parts.subject ?? '',
    normalizeEvidenceTopic(parts.topic ?? ''),
    parts.category ?? '',
  ].join('|')
  return createHash('sha1').update(raw).digest('hex').slice(0, 16)
}
