/**
 * Reflection types — staged work retrospectives derived from Observation + Loop.
 * Rebuildable; every field must be traceable via source*Ids / evidenceRefs.
 */

import type { CognitionEvidenceRef, CognitionEventSource } from '../types.ts'

export type CognitionReflectionType = 'task' | 'daily'

export interface CognitionReflection {
  id: string
  type: CognitionReflectionType
  workspaceId?: string
  projectId?: string
  sessionId?: string
  title: string
  summary: string
  completed: string[]
  changes: string[]
  unresolved: string[]
  blockers: string[]
  nextActions: string[]
  sourceObservationIds: string[]
  sourceLoopIds: string[]
  sourceEventIds?: string[]
  sourceKinds?: Array<CognitionEventSource | 'unknown'>
  evidenceRefs: CognitionEvidenceRef[]
  createdAt: number
  schemaVersion: number
  /** Calendar day key for daily reflections (YYYY-MM-DD, local). */
  dayKey?: string
}

export interface CognitionReflectionQuery {
  type?: CognitionReflectionType
  sessionId?: string
  projectId?: string
  dayKey?: string
  afterCreatedAt?: number
  limit?: number
  offset?: number
  /** When true, return only the latest reflection per (type, sessionId|dayKey). */
  latestOnly?: boolean
}
