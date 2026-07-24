/**
 * Cognition provenance helpers — sourceEventIds / sourceKinds propagation.
 */

import type { CognitionEventSource } from '../cognition/types.ts'

export type CognitionSourceKind = CognitionEventSource | 'unknown'

export interface CognitionProvenanceFields {
  sourceEventIds: string[]
  sourceKinds: CognitionSourceKind[]
}

export function uniqueStrings(values: Iterable<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of values) {
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

export function uniqueSourceKinds(values: Iterable<string>): CognitionSourceKind[] {
  const out: CognitionSourceKind[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const v = (raw || 'unknown') as CognitionSourceKind
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out.length ? out : ['unknown']
}

export function provenanceFromEvent(event: {
  id: string
  source: CognitionEventSource
}): CognitionProvenanceFields {
  return {
    sourceEventIds: [event.id],
    sourceKinds: [event.source],
  }
}

export function mergeProvenance(
  parts: Array<Partial<CognitionProvenanceFields> | null | undefined>,
): CognitionProvenanceFields {
  const eventIds: string[] = []
  const kinds: string[] = []
  for (const part of parts) {
    if (!part) continue
    if (part.sourceEventIds) eventIds.push(...part.sourceEventIds)
    if (part.sourceKinds) kinds.push(...part.sourceKinds)
  }
  const sourceEventIds = uniqueStrings(eventIds)
  const sourceKinds = kinds.length ? uniqueSourceKinds(kinds) : (['unknown'] as CognitionSourceKind[])
  return { sourceEventIds, sourceKinds }
}

export function normalizeProvenanceFields(
  raw: Partial<CognitionProvenanceFields> | null | undefined,
): CognitionProvenanceFields {
  if (!raw) {
    return { sourceEventIds: [], sourceKinds: ['unknown'] }
  }
  return {
    sourceEventIds: uniqueStrings(raw.sourceEventIds ?? []),
    sourceKinds: uniqueSourceKinds(raw.sourceKinds?.length ? raw.sourceKinds : ['unknown']),
  }
}
