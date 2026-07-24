/**
 * Observation types — stable work facts derived from Events (rule-driven in Phase 3).
 */

import type { CognitionEvidenceRef, CognitionEventSource } from '../types.ts'

export type CognitionObservationCategory =
  | 'progress'
  | 'decision'
  | 'blocker'
  | 'context'
  | 'result'
  | 'change'

export interface CognitionObservation {
  id: string
  workspaceId?: string
  projectId?: string
  sessionId?: string
  title: string
  summary: string
  category: CognitionObservationCategory
  confidence: number
  importance: number
  sourceEventIds: string[]
  /** Provenance kinds from source events (v2). Missing on v0.15 data until backfill. */
  sourceKinds?: Array<CognitionEventSource | 'unknown'>
  evidenceRefs: CognitionEvidenceRef[]
  /**
   * Stable rebuild key (session + events + topic + category).
   * Prefer this over ephemeral ids when re-linking Loops after Observation rebuild.
   */
  evidenceFingerprint?: string
  createdAt: number
  updatedAt: number
  schemaVersion: number
}

export interface CognitionObservationQuery {
  sessionId?: string
  projectId?: string
  categories?: CognitionObservationCategory[]
  afterCreatedAt?: number
  limit?: number
  offset?: number
}
