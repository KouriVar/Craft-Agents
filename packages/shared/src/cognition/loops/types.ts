/**
 * Loop types — open work items that still occupy attention (≠ Task).
 */

import type { CognitionEvidenceRef } from '../types.ts'

export type CognitionLoopStatus =
  | 'open'
  | 'waiting'
  | 'blocked'
  | 'stale'
  | 'resolved'
  | 'dismissed'

export interface CognitionLoop {
  id: string
  workspaceId?: string
  projectId?: string
  sessionId?: string
  title: string
  summary: string
  status: CognitionLoopStatus
  nextAction?: string
  blocker?: string
  waitingFor?: string
  importance: number
  confidence: number
  observationIds: string[]
  evidenceRefs: CognitionEvidenceRef[]
  /** Stable rebuild key shared with source Observations when available. */
  evidenceFingerprint?: string
  firstSeenAt: number
  lastUpdatedAt: number
  resolvedAt?: number
  schemaVersion: number
  /**
   * When true (or status is resolved/dismissed via user RPC), automatic
   * regeneration must not overwrite user-controlled fields/status.
   */
  userManaged?: boolean
}

export interface CognitionLoopQuery {
  sessionId?: string
  projectId?: string
  statuses?: CognitionLoopStatus[]
  includeResolved?: boolean
  limit?: number
  offset?: number
}
