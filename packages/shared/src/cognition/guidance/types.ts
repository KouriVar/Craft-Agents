/**
 * Guidance types — actionable suggestions derived from open Loops (+ optional Reflection).
 * Guidance ≠ Task / Todo. Rebuildable; never mutates tasks or Loop core status.
 */

import type { CognitionEventSource } from '../types.ts'

export type CognitionGuidanceType =
  | 'continue'
  | 'resolve_blocker'
  | 'review'
  | 'follow_up'
  | 'resume'

export interface CognitionGuidance {
  id: string
  type: CognitionGuidanceType
  title: string
  reason: string
  action: string
  importance: number
  confidence: number
  score?: number
  targetLoopId?: string
  targetSessionId?: string
  sourceReflectionId?: string
  sourceObservationIds: string[]
  sourceLoopIds: string[]
  sourceEventIds?: string[]
  sourceKinds?: Array<CognitionEventSource | 'unknown'>
  workspaceId?: string
  projectId?: string
  createdAt: number
  schemaVersion: number
  /**
   * Set when user dismisses via RPC. Refresh must not revive same targetLoopId.
   */
  dismissedAt?: number
  userManaged?: boolean
}

export interface CognitionGuidanceQuery {
  types?: CognitionGuidanceType[]
  sessionId?: string
  projectId?: string
  includeDismissed?: boolean
  limit?: number
  offset?: number
}
