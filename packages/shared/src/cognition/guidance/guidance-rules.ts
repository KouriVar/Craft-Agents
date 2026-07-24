/**
 * Deterministic Guidance builders from active Loops (+ optional Reflection context).
 * Never creates tasks; never revives resolved/dismissed/userManaged loops.
 */

import { randomUUID } from 'crypto'
import { truncateText } from '../events/event-sanitizer.ts'
import { mergeProvenance } from '../../privacy/provenance.ts'
import { COGNITION_SCHEMA_VERSION } from '../types.ts'
import type { CognitionLoop } from '../loops/types.ts'
import type { CognitionReflection } from '../reflections/types.ts'
import type { CognitionGuidance, CognitionGuidanceType } from './types.ts'
import { rankGuidance } from './guidance-ranker.ts'

function isEligibleLoop(loop: CognitionLoop): boolean {
  if (loop.userManaged) return false
  if (loop.status === 'resolved' || loop.status === 'dismissed') return false
  return true
}

function guidanceTypeForLoop(loop: CognitionLoop): CognitionGuidanceType {
  if (loop.status === 'blocked') return 'resolve_blocker'
  if (loop.status === 'waiting') return 'follow_up'
  if (loop.status === 'stale') return 'review'
  const title = loop.title
  if (/恢复|中断/.test(title) || (loop.nextAction && /恢复|打开会话/.test(loop.nextAction))) {
    return 'resume'
  }
  return 'continue'
}

function buildReason(loop: CognitionLoop, reflection?: CognitionReflection | null): string {
  const bits: string[] = []
  if (loop.status === 'blocked') {
    bits.push(`存在未解决阻塞：${loop.blocker || loop.title}`)
  } else if (loop.status === 'stale') {
    bits.push(`事项长时间未继续：${loop.title}`)
  } else if (guidanceTypeForLoop(loop) === 'resume') {
    bits.push(`会话曾中断，仍有未闭环事项：${loop.title}`)
  } else {
    bits.push(`仍有未完成 Loop：${loop.title}`)
  }
  if (reflection?.summary) {
    bits.push(`反思摘要：${truncateText(reflection.summary, 160)}`)
  }
  return truncateText(bits.join('。'), 480)
}

function buildAction(loop: CognitionLoop, type: CognitionGuidanceType): string {
  if (type === 'resolve_blocker') {
    return truncateText(loop.nextAction || `排查并解决：${loop.blocker || loop.title}`, 240)
  }
  if (type === 'resume') {
    return truncateText(loop.nextAction || '打开会话并继续上次工作', 240)
  }
  if (type === 'review') {
    return truncateText(loop.nextAction || `回顾并决定是否继续：${loop.title}`, 240)
  }
  if (type === 'follow_up') {
    return truncateText(loop.waitingFor ? `跟进等待项：${loop.waitingFor}` : loop.nextAction || loop.title, 240)
  }
  return truncateText(loop.nextAction || loop.title, 240)
}

function buildTitle(loop: CognitionLoop, type: CognitionGuidanceType): string {
  if (type === 'resolve_blocker') {
    return truncateText(`处理阻塞：${loop.blocker || loop.title}`, 160)
  }
  if (type === 'resume') {
    return truncateText(`恢复：${loop.title.replace(/^恢复[:：]?/, '')}`, 160)
  }
  if (type === 'review') {
    return truncateText(`回顾：${loop.title}`, 160)
  }
  if (type === 'follow_up') {
    return truncateText(`跟进：${loop.title}`, 160)
  }
  return truncateText(`继续：${loop.title}`, 160)
}

export interface BuildGuidanceInput {
  loops: CognitionLoop[]
  /** Optional latest reflections to attach as context (matched by sessionId). */
  reflections?: CognitionReflection[]
  workspaceId?: string
  /** Dismissed targetLoopIds that must not be recreated. */
  dismissedLoopIds?: Set<string> | string[]
  now?: number
}

export function buildGuidanceFromLoops(input: BuildGuidanceInput): CognitionGuidance[] {
  const now = input.now ?? Date.now()
  const dismissed = new Set(
    input.dismissedLoopIds instanceof Set
      ? input.dismissedLoopIds
      : (input.dismissedLoopIds ?? []),
  )
  const reflectionsBySession = new Map<string, CognitionReflection>()
  for (const r of input.reflections ?? []) {
    if (r.type === 'task' && r.sessionId) reflectionsBySession.set(r.sessionId, r)
  }

  const drafts: CognitionGuidance[] = []
  for (const loop of input.loops) {
    if (!isEligibleLoop(loop)) continue
    if (dismissed.has(loop.id)) continue

    const type = guidanceTypeForLoop(loop)
    const reflection = loop.sessionId ? reflectionsBySession.get(loop.sessionId) : undefined
    const prov = mergeProvenance([
      { sourceEventIds: loop.sourceEventIds, sourceKinds: loop.sourceKinds },
      reflection
        ? { sourceEventIds: reflection.sourceEventIds, sourceKinds: reflection.sourceKinds }
        : null,
    ])
    drafts.push({
      id: `guid_${randomUUID().slice(0, 12)}`,
      type,
      title: buildTitle(loop, type),
      reason: buildReason(loop, reflection),
      action: buildAction(loop, type),
      importance: loop.status === 'stale'
        ? Math.min(loop.importance, 0.35)
        : Math.max(loop.importance, type === 'resolve_blocker' ? 0.85 : loop.importance),
      confidence: loop.confidence,
      targetLoopId: loop.id,
      targetSessionId: loop.sessionId,
      sourceReflectionId: reflection?.id,
      sourceObservationIds: [...loop.observationIds],
      sourceLoopIds: [loop.id],
      sourceEventIds: prov.sourceEventIds,
      sourceKinds: prov.sourceKinds,
      workspaceId: input.workspaceId ?? loop.workspaceId,
      projectId: loop.projectId,
      createdAt: now,
      schemaVersion: COGNITION_SCHEMA_VERSION,
    })
  }

  return rankGuidance(drafts, { now })
}
