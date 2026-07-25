/**
 * Cognition adapter — Guidance + Loop, gated by allowCognitionDerived.
 * No Reflection / Observation / LLM in v0.16.6 phase 1.
 */

import { isAllowCognitionDerived } from '@/context-actions/build-action-context'
import type { PrivacyPolicySnapshot } from '@/context-actions/types'
import type {
  FusionCognitionSlice,
  FusionGuidanceSignal,
  FusionLoopSignal,
} from '../types'

export interface CognitionGuidanceSource {
  type: string
  targetSessionId?: string
  score?: number
  confidence?: number
  title?: string
  reason?: string
}

export interface CognitionLoopSource {
  sessionId?: string
  status?: string
  nextAction?: string
  blocker?: string
  waitingFor?: string
}

export function emptyFusionCognitionSlice(allowCognitionDerived = false): FusionCognitionSlice {
  return {
    allowCognitionDerived,
    guidance: [],
    loops: [],
  }
}

export function adaptCognition(input: {
  privacy: PrivacyPolicySnapshot | null | undefined
  guidance?: readonly CognitionGuidanceSource[] | null
  loops?: readonly CognitionLoopSource[] | null
  /** When set, drop guidance targeted at a different session. */
  sessionId?: string
}): FusionCognitionSlice {
  const allowCognitionDerived = isAllowCognitionDerived(input.privacy)
  if (!allowCognitionDerived) {
    return emptyFusionCognitionSlice(false)
  }

  const sessionId = input.sessionId?.trim() || undefined
  const guidance: FusionGuidanceSignal[] = []
  for (const item of input.guidance ?? []) {
    if (sessionId && item.targetSessionId && item.targetSessionId !== sessionId) continue
    guidance.push({
      type: item.type,
      targetSessionId: item.targetSessionId,
      score: item.score,
      confidence: item.confidence,
      title: item.title,
      reason: item.reason,
    })
  }

  const loops: FusionLoopSignal[] = []
  for (const item of input.loops ?? []) {
    if (sessionId && item.sessionId && item.sessionId !== sessionId) continue
    loops.push({
      sessionId: item.sessionId,
      status: item.status,
      nextAction: item.nextAction,
      blocker: item.blocker,
      waitingFor: item.waitingFor,
    })
  }

  return {
    allowCognitionDerived: true,
    guidance,
    loops,
  }
}
