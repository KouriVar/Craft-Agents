/**
 * Deterministic Loop rules — derived from Observations + high-value Events.
 */

import { randomUUID } from 'crypto'
import { truncateText } from '../events/event-sanitizer.ts'
import { mergeProvenance } from '../../privacy/provenance.ts'
import { COGNITION_SCHEMA_VERSION, type CognitionEvent, type CognitionEvidenceRef, type CognitionEventSource } from '../types.ts'
import type { CognitionObservation } from '../observations/types.ts'
import type { CognitionLoop, CognitionLoopStatus } from './types.ts'

export interface LoopDraft {
  title: string
  summary: string
  status: CognitionLoopStatus
  nextAction?: string
  blocker?: string
  waitingFor?: string
  importance: number
  confidence: number
  observationIds: string[]
  sourceEventIds?: string[]
  sourceKinds?: Array<CognitionEventSource | 'unknown'>
  evidenceRefs: CognitionEvidenceRef[]
  evidenceFingerprint?: string
  workspaceId?: string
  projectId?: string
  sessionId?: string
}

function draftToLoop(draft: LoopDraft, now = Date.now()): CognitionLoop {
  return {
    id: `loop_${randomUUID().slice(0, 12)}`,
    workspaceId: draft.workspaceId,
    projectId: draft.projectId,
    sessionId: draft.sessionId,
    title: truncateText(draft.title, 160),
    summary: truncateText(draft.summary, 480),
    status: draft.status,
    nextAction: draft.nextAction ? truncateText(draft.nextAction, 240) : undefined,
    blocker: draft.blocker ? truncateText(draft.blocker, 240) : undefined,
    waitingFor: draft.waitingFor ? truncateText(draft.waitingFor, 240) : undefined,
    importance: draft.importance,
    confidence: draft.confidence,
    observationIds: [...draft.observationIds],
    sourceEventIds: draft.sourceEventIds ? [...draft.sourceEventIds] : undefined,
    sourceKinds: draft.sourceKinds ? [...draft.sourceKinds] : undefined,
    evidenceRefs: draft.evidenceRefs.slice(0, 12),
    evidenceFingerprint: draft.evidenceFingerprint,
    firstSeenAt: now,
    lastUpdatedAt: now,
    schemaVersion: COGNITION_SCHEMA_VERSION,
  }
}

function provenanceFromObs(obs: CognitionObservation) {
  return mergeProvenance([{
    sourceEventIds: obs.sourceEventIds,
    sourceKinds: obs.sourceKinds ?? (obs.sourceEventIds.length ? undefined : ['unknown']),
  }])
}

function fromObservation(obs: CognitionObservation): LoopDraft | null {
  const prov = provenanceFromObs(obs)
  if (obs.category === 'blocker') {
    return {
      title: truncateText(`处理${obs.title}`, 160),
      summary: obs.summary,
      status: 'blocked',
      blocker: obs.title,
      nextAction: truncateText(`排查并解决：${obs.title}`, 240),
      importance: Math.max(obs.importance, 0.75),
      confidence: obs.confidence,
      observationIds: [obs.id],
      sourceEventIds: prov.sourceEventIds,
      sourceKinds: prov.sourceKinds,
      evidenceRefs: obs.evidenceRefs,
      evidenceFingerprint: obs.evidenceFingerprint,
      workspaceId: obs.workspaceId,
      projectId: obs.projectId,
      sessionId: obs.sessionId,
    }
  }
  if (obs.category === 'progress') {
    const nextAction = obs.title.replace(/仍需继续$|仍需推进$/, '').trim() || obs.title
    return {
      title: truncateText(nextAction, 160),
      summary: obs.summary,
      status: 'open',
      nextAction: truncateText(nextAction, 240),
      importance: obs.importance,
      confidence: obs.confidence,
      observationIds: [obs.id],
      sourceEventIds: prov.sourceEventIds,
      sourceKinds: prov.sourceKinds,
      evidenceRefs: obs.evidenceRefs,
      evidenceFingerprint: obs.evidenceFingerprint,
      workspaceId: obs.workspaceId,
      projectId: obs.projectId,
      sessionId: obs.sessionId,
    }
  }
  // Single browser context page must NOT become a Loop ("查看网页").
  return null
}

/**
 * Cluster 2+ browser context observations into one research Loop.
 */
function fromBrowserResearchCluster(observations: CognitionObservation[]): LoopDraft[] {
  const browserish = observations.filter(
    (o) =>
      o.category === 'context' &&
      (o.title.includes('研究') || o.title.includes('保存研究') || o.title.includes('浏览器已关联')),
  )
  const bySession = new Map<string, CognitionObservation[]>()
  for (const obs of browserish) {
    const key = obs.sessionId || obs.workspaceId || '_global'
    const list = bySession.get(key) ?? []
    list.push(obs)
    bySession.set(key, list)
  }
  const drafts: LoopDraft[] = []
  for (const [, group] of bySession) {
    if (group.length < 2) continue
    const titles = group.map((o) => o.title.replace(/^正在研究\s*/, '').replace(/^保存研究资料：\s*/, ''))
    const topic = titles[0] || '相关资料'
    const draft: LoopDraft = {
      title: truncateText(`继续完成「${topic}」相关调研`, 160),
      summary: truncateText(
        `最近浏览/保存了多份相关资料：${titles.slice(0, 4).join('；')}`,
        480,
      ),
      status: 'open',
      nextAction: truncateText(`整理并完成「${topic}」相关调研结论`, 240),
      importance: 0.65,
      confidence: 0.7,
      observationIds: group.map((o) => o.id),
      ...mergeProvenance(group.map((o) => ({
        sourceEventIds: o.sourceEventIds,
        sourceKinds: o.sourceKinds,
      }))),
      evidenceRefs: group.flatMap((o) => o.evidenceRefs).slice(0, 12),
      evidenceFingerprint: group[0]?.evidenceFingerprint,
      workspaceId: group[0]?.workspaceId,
      projectId: group[0]?.projectId,
      sessionId: group[0]?.sessionId,
    }
    drafts.push(draft)
  }
  return drafts
}

function fromInterruptedEvent(event: CognitionEvent): LoopDraft | null {
  if (event.type !== 'session.stopped') return null
  if (event.payload.reason !== 'interrupted' && event.payload.reason !== 'cancelled') return null
  const next = event.payload.nextSteps?.[0]
  return {
    title: next ? truncateText(`恢复：${next}`, 160) : '恢复中断任务',
    summary: truncateText(
      next ? `会话中断，建议继续：${next}` : '会话回合被中断，尚未闭环',
      480,
    ),
    status: 'open',
    nextAction: next ? truncateText(next, 240) : '打开会话并继续上次工作',
    importance: 0.7,
    confidence: 0.8,
    observationIds: [],
    sourceEventIds: [event.id],
    sourceKinds: [event.source],
    evidenceRefs: event.evidenceRefs ?? [{ type: 'session', id: event.sessionId, label: 'Session' }],
    workspaceId: event.workspaceId,
    projectId: event.projectId,
    sessionId: event.sessionId,
  }
}

/**
 * Build loop drafts from new observations and the events that produced them.
 * Git signals enter via Observation rules (progress/blocker) — no parallel git drafts.
 * Browser: only clustered research (≥2 context pages), never single "查看网页".
 */
export function buildLoopDrafts(input: {
  observations: CognitionObservation[]
  events: CognitionEvent[]
}): LoopDraft[] {
  const drafts: LoopDraft[] = []
  for (const obs of input.observations) {
    const draft = fromObservation(obs)
    if (draft) drafts.push(draft)
  }
  drafts.push(...fromBrowserResearchCluster(input.observations))
  for (const event of input.events) {
    const draft = fromInterruptedEvent(event)
    if (draft) drafts.push(draft)
  }
  return drafts
}

export function materializeLoopDrafts(drafts: LoopDraft[], now = Date.now()): CognitionLoop[] {
  return drafts.map((d) => draftToLoop(d, now))
}
