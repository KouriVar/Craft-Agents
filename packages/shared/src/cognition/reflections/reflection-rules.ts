/**
 * Deterministic Reflection builders — no model required.
 * Model (CognitionModelRunner) may only polish title/summary later.
 */

import { randomUUID } from 'crypto'
import { truncateText } from '../events/event-sanitizer.ts'
import { mergeProvenance } from '../../privacy/provenance.ts'
import { COGNITION_SCHEMA_VERSION, type CognitionEvidenceRef } from '../types.ts'
import type { CognitionObservation } from '../observations/types.ts'
import type { CognitionLoop } from '../loops/types.ts'
import type { CognitionReflection } from './types.ts'

const MAX_ITEMS = 8

function uniqTrim(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const t = raw.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(truncateText(t, 240))
    if (out.length >= MAX_ITEMS) break
  }
  return out
}

function mergeEvidence(
  observations: CognitionObservation[],
  loops: CognitionLoop[],
): CognitionEvidenceRef[] {
  const refs: CognitionEvidenceRef[] = []
  const key = (r: CognitionEvidenceRef) => `${r.type}:${r.id ?? ''}:${r.label}`
  const seen = new Set<string>()
  for (const o of observations) {
    for (const r of o.evidenceRefs) {
      const k = key(r)
      if (seen.has(k)) continue
      seen.add(k)
      refs.push(r)
    }
  }
  for (const loop of loops) {
    for (const r of loop.evidenceRefs) {
      const k = key(r)
      if (seen.has(k)) continue
      seen.add(k)
      refs.push(r)
    }
  }
  return refs.slice(0, 12)
}

function isActiveLoop(loop: CognitionLoop): boolean {
  return loop.status !== 'resolved' && loop.status !== 'dismissed'
}

function pickTitle(observations: CognitionObservation[], loops: CognitionLoop[], fallback: string): string {
  const blocked = loops.find((l) => l.status === 'blocked')
  if (blocked) return truncateText(`${blocked.blocker || blocked.title}相关进展`, 160)
  const open = loops.find((l) => l.status === 'open' || l.status === 'waiting' || l.status === 'stale')
  if (open) return truncateText(`${open.title}进展`, 160)
  const result = observations.find((o) => o.category === 'result' || o.category === 'progress')
  if (result) return truncateText(result.title.replace(/仍需继续$|仍需推进$/, '') + '进展', 160)
  return truncateText(fallback, 160)
}

function buildLists(
  observations: CognitionObservation[],
  loops: CognitionLoop[],
): Pick<CognitionReflection, 'completed' | 'changes' | 'unresolved' | 'blockers' | 'nextActions'> {
  const completed = uniqTrim([
    ...observations.filter((o) => o.category === 'result').map((o) => o.title),
    ...loops.filter((l) => l.status === 'resolved').map((l) => l.title),
  ])
  const changes = uniqTrim(
    observations.filter((o) => o.category === 'change' || o.category === 'context').map((o) => o.title),
  )
  const active = loops.filter(isActiveLoop)
  const blockers = uniqTrim([
    ...active.filter((l) => l.status === 'blocked').map((l) => l.blocker || l.title),
    ...observations.filter((o) => o.category === 'blocker').map((o) => o.title),
  ])
  const unresolved = uniqTrim([
    ...active.filter((l) => l.status !== 'blocked').map((l) => l.title),
    ...active.filter((l) => l.status === 'blocked').map((l) => l.title),
  ])
  const nextActions = uniqTrim([
    ...active.map((l) => l.nextAction || l.title),
    ...observations.filter((o) => o.category === 'progress').map((o) => o.title.replace(/仍需继续$|仍需推进$/, '')),
  ])
  return { completed, changes, unresolved, blockers, nextActions }
}

function buildSummary(lists: ReturnType<typeof buildLists>): string {
  const parts: string[] = []
  if (lists.completed.length) parts.push(`已完成：${lists.completed.slice(0, 3).join('；')}`)
  if (lists.blockers.length) parts.push(`阻塞：${lists.blockers.slice(0, 3).join('；')}`)
  if (lists.unresolved.length) parts.push(`未解决：${lists.unresolved.slice(0, 3).join('；')}`)
  if (lists.nextActions.length) parts.push(`下一步：${lists.nextActions.slice(0, 3).join('；')}`)
  return truncateText(parts.join('。') || '暂无足够事实生成反思', 480)
}

export interface BuildTaskReflectionInput {
  workspaceId?: string
  projectId?: string
  sessionId: string
  observations: CognitionObservation[]
  loops: CognitionLoop[]
  now?: number
}

/** Task reflection scoped to a single session subject. */
export function buildTaskReflection(input: BuildTaskReflectionInput): CognitionReflection | null {
  const observations = input.observations.filter((o) => o.sessionId === input.sessionId)
  const loops = input.loops.filter((l) => l.sessionId === input.sessionId)
  if (!observations.length && !loops.length) return null

  const lists = buildLists(observations, loops)
  const now = input.now ?? Date.now()
  const title = pickTitle(observations, loops, '会话工作进展')
  const prov = mergeProvenance([
    ...observations.map((o) => ({ sourceEventIds: o.sourceEventIds, sourceKinds: o.sourceKinds })),
    ...loops.map((l) => ({ sourceEventIds: l.sourceEventIds, sourceKinds: l.sourceKinds })),
  ])

  return {
    id: `refl_${randomUUID().slice(0, 12)}`,
    type: 'task',
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? observations[0]?.projectId ?? loops[0]?.projectId,
    sessionId: input.sessionId,
    title,
    summary: buildSummary(lists),
    ...lists,
    sourceObservationIds: observations.map((o) => o.id),
    sourceLoopIds: loops.map((l) => l.id),
    sourceEventIds: prov.sourceEventIds,
    sourceKinds: prov.sourceKinds,
    evidenceRefs: mergeEvidence(observations, loops),
    createdAt: now,
    schemaVersion: COGNITION_SCHEMA_VERSION,
  }
}

export interface BuildDailyReflectionInput {
  workspaceId?: string
  projectId?: string
  observations: CognitionObservation[]
  loops: CognitionLoop[]
  /** Local day key YYYY-MM-DD; defaults to today. */
  dayKey?: string
  /** Only include items created/updated within this window (ms). Default 36h. */
  windowMs?: number
  now?: number
}

export function dayKeyFromTimestamp(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Daily reflection over recent Observation + Loop facts (on-demand, never background). */
export function buildDailyReflection(input: BuildDailyReflectionInput): CognitionReflection | null {
  const now = input.now ?? Date.now()
  const windowMs = input.windowMs ?? 36 * 60 * 60 * 1000
  const since = now - windowMs
  const dayKey = input.dayKey ?? dayKeyFromTimestamp(now)

  const observations = input.observations.filter((o) => {
    if (input.projectId && o.projectId && o.projectId !== input.projectId) return false
    return o.createdAt >= since
  })
  const loops = input.loops.filter((l) => {
    if (input.projectId && l.projectId && l.projectId !== input.projectId) return false
    return l.lastUpdatedAt >= since || l.firstSeenAt >= since
  })
  if (!observations.length && !loops.length) return null

  const lists = buildLists(observations, loops)
  const title = truncateText(`每日工作复盘（${dayKey}）`, 160)
  const summaryParts: string[] = []
  if (lists.completed.length) summaryParts.push(`昨日进展：${lists.completed.slice(0, 4).join('；')}`)
  const attention = uniqTrim([...lists.blockers, ...lists.unresolved]).slice(0, 4)
  if (attention.length) summaryParts.push(`需要关注：${attention.join('；')}`)
  if (lists.nextActions.length) summaryParts.push(`今日方向：${lists.nextActions[0]}`)

  return {
    id: `refl_${randomUUID().slice(0, 12)}`,
    type: 'daily',
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    title,
    summary: truncateText(summaryParts.join('。') || buildSummary(lists), 480),
    ...lists,
    sourceObservationIds: observations.map((o) => o.id),
    sourceLoopIds: loops.map((l) => l.id),
    ...mergeProvenance([
      ...observations.map((o) => ({ sourceEventIds: o.sourceEventIds, sourceKinds: o.sourceKinds })),
      ...loops.map((l) => ({ sourceEventIds: l.sourceEventIds, sourceKinds: l.sourceKinds })),
    ]),
    evidenceRefs: mergeEvidence(observations, loops),
    createdAt: now,
    schemaVersion: COGNITION_SCHEMA_VERSION,
    dayKey,
  }
}
