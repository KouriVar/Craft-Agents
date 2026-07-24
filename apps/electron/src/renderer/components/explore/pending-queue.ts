/**
 * PendingQueue — single aggregator for Explore Today「待处理」.
 *
 * Strong signals only. Recent-only / weak Brief / "maybe continue" go to RecentRail.
 * Dedupes by sessionId (else loop:{id} / guidance:{id}).
 */

import type { SessionMeta } from '@/atoms/sessions'
import type { CognitionGuidanceDto, CognitionLoopDto } from '@craft-agent/shared/protocol'
import { isReminderDue } from './task-today'

export type PendingPriority = 'high' | 'medium' | 'low'

export type PendingSource =
  | 'today_rules'
  | 'guidance'
  | 'loop'
  | 'reminder'
  | 'checkpoint'

export type PendingReasonCode =
  | 'overdue'
  | 'failed'
  | 'blocked'
  | 'dueToday'
  | 'reminder'
  | 'waiting'
  | 'checkpoint_next_steps'
  | 'open_loop'
  | 'guidance'
  | 'unfinished_goal'

export interface PendingItem {
  schemaVersion: 1
  id: string
  sessionId?: string
  title: string
  reasonCodes: PendingReasonCode[]
  reasonLabelKey: string
  statusLabelKey: string
  priority?: PendingPriority
  dueAt?: number
  sources: PendingSource[]
  sourceKinds?: string[]
  evidenceRef?: {
    guidanceId?: string
    loopId?: string
  }
  score: number
  /** Latest activity for tie-break only — never boosts pending over stronger reasons. */
  lastActivityAt?: number
}

export interface BuildPendingQueueInput {
  sessions: SessionMeta[]
  guidance?: CognitionGuidanceDto[]
  loops?: CognitionLoopDto[]
  /** When false, skip all cognition-derived guidance/loop candidates (privacy A/B/mode). */
  allowCognitionDerived?: boolean
  /** Active snooze target keys (sessionId / loop:x / guidance:x). */
  snoozedKeys?: Iterable<string>
  now?: number
  limit?: number
}

const WAITING_STATUS_RE = /wait|waiting|blocked|review|等待|阻塞|审核/i
const BLOCKED_STATUS_RE = /block|blocked|阻塞/i

const REASON_SCORE: Record<PendingReasonCode, number> = {
  overdue: 1000,
  failed: 920,
  blocked: 900,
  dueToday: 850,
  reminder: 800,
  waiting: 720,
  checkpoint_next_steps: 650,
  open_loop: 600,
  guidance: 580,
  unfinished_goal: 500,
}

const REASON_LABEL_KEY: Record<PendingReasonCode, string> = {
  overdue: 'today.pending.reason.overdue',
  failed: 'today.pending.reason.failed',
  blocked: 'today.pending.reason.blocked',
  dueToday: 'today.pending.reason.dueToday',
  reminder: 'today.pending.reason.reminder',
  waiting: 'today.pending.reason.waiting',
  checkpoint_next_steps: 'today.pending.reason.checkpointNextSteps',
  open_loop: 'today.pending.reason.openLoop',
  guidance: 'today.pending.reason.guidance',
  unfinished_goal: 'today.pending.reason.unfinishedGoal',
}

const STATUS_LABEL_KEY: Record<PendingReasonCode, string> = {
  overdue: 'today.pending.status.overdue',
  failed: 'today.pending.status.failed',
  blocked: 'today.pending.status.blocked',
  dueToday: 'today.pending.status.dueToday',
  reminder: 'today.pending.status.reminder',
  waiting: 'today.pending.status.waiting',
  checkpoint_next_steps: 'today.pending.status.needsAction',
  open_loop: 'today.pending.status.open',
  guidance: 'today.pending.status.suggested',
  unfinished_goal: 'today.pending.status.inProgress',
}

const PRIORITY_BONUS: Record<PendingPriority, number> = { high: 40, medium: 10, low: 0 }

function primaryReason(codes: PendingReasonCode[]): PendingReasonCode {
  return [...codes].sort((a, b) => REASON_SCORE[b] - REASON_SCORE[a])[0] ?? 'unfinished_goal'
}

function sessionTitle(session: SessionMeta): string {
  return (session.name || session.preview || '').trim() || 'Untitled'
}

function collectSessionReasons(session: SessionMeta, now: number): PendingReasonCode[] {
  const completed = session.kanbanColumn === 'done' || session.sessionStatus === 'done'
  if (completed) return []

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const tomorrowCutoff = startOfTomorrow.getTime()

  const reasons: PendingReasonCode[] = []

  if (session.taskDueAt && session.taskDueAt < now) reasons.push('overdue')
  else if (session.taskDueAt && session.taskDueAt < tomorrowCutoff) reasons.push('dueToday')

  if (isReminderDue(session, now)) reasons.push('reminder')

  if (session.lastMessageRole === 'error') reasons.push('failed')

  const status = session.sessionStatus ?? ''
  if (BLOCKED_STATUS_RE.test(status)) reasons.push('blocked')
  else if (WAITING_STATUS_RE.test(status)) reasons.push('waiting')

  const nextSteps = session.taskCheckpoints?.at(-1)?.nextSteps
  if (nextSteps && nextSteps.length > 0) reasons.push('checkpoint_next_steps')

  if (session.taskGoal && session.taskGoal.trim() && !completed) {
    // Unfinished goal alone is enough only when no stronger signal; still collect for merge.
    if (reasons.length === 0 || reasons.every((r) => r === 'checkpoint_next_steps')) {
      reasons.push('unfinished_goal')
    } else if (!reasons.includes('unfinished_goal') && session.taskGoal.trim()) {
      // Keep goal as secondary evidence when other strong signals exist
      reasons.push('unfinished_goal')
    }
  }

  // Exclude weak-only signals that used to enter Today: recent, unread, active, automation.
  return reasons
}

function mergeItems(a: PendingItem, b: PendingItem): PendingItem {
  const reasonCodes = Array.from(new Set([...a.reasonCodes, ...b.reasonCodes]))
  const primary = primaryReason(reasonCodes)
  const priorityRank = { high: 3, medium: 2, low: 1, undefined: 0 } as const
  const priority =
    (priorityRank[a.priority ?? 'undefined'] >= priorityRank[b.priority ?? 'undefined']
      ? a.priority
      : b.priority) ?? undefined
  const dueAt = [a.dueAt, b.dueAt].filter((v): v is number => typeof v === 'number')
  const earliestDue = dueAt.length ? Math.min(...dueAt) : undefined
  const sources = Array.from(new Set([...a.sources, ...b.sources])) as PendingSource[]
  const sourceKinds = Array.from(new Set([...(a.sourceKinds ?? []), ...(b.sourceKinds ?? [])]))
  const evidenceRef = {
    guidanceId: a.evidenceRef?.guidanceId ?? b.evidenceRef?.guidanceId,
    loopId: a.evidenceRef?.loopId ?? b.evidenceRef?.loopId,
  }
  const score = Math.max(a.score, b.score)
  return {
    schemaVersion: 1,
    id: a.id,
    sessionId: a.sessionId ?? b.sessionId,
    title: a.sessionId ? a.title : (a.title || b.title),
    reasonCodes,
    reasonLabelKey: REASON_LABEL_KEY[primary],
    statusLabelKey: STATUS_LABEL_KEY[primary],
    priority,
    dueAt: earliestDue,
    sources,
    sourceKinds: sourceKinds.length ? sourceKinds : undefined,
    evidenceRef: evidenceRef.guidanceId || evidenceRef.loopId ? evidenceRef : undefined,
    score,
    lastActivityAt: Math.max(a.lastActivityAt ?? 0, b.lastActivityAt ?? 0) || undefined,
  }
}

function scoreItem(codes: PendingReasonCode[], priority?: PendingPriority, dueAt?: number, now = Date.now()): number {
  const primary = primaryReason(codes)
  let score = REASON_SCORE[primary] + PRIORITY_BONUS[priority ?? 'medium']
  if (typeof dueAt === 'number') {
    // Sooner due → slight bump within band; overdue already has highest band.
    const hours = (dueAt - now) / 3_600_000
    if (hours < 0) score += Math.min(30, Math.floor(-hours))
    else score += Math.max(0, 20 - Math.floor(hours))
  }
  return score
}

function isSnoozed(keys: Set<string>, item: PendingItem): boolean {
  if (keys.has(item.id)) return true
  if (item.sessionId && keys.has(item.sessionId)) return true
  if (item.sessionId && keys.has(`session:${item.sessionId}`)) return true
  if (item.evidenceRef?.loopId && keys.has(`loop:${item.evidenceRef.loopId}`)) return true
  if (item.evidenceRef?.guidanceId && keys.has(`guidance:${item.evidenceRef.guidanceId}`)) return true
  return false
}

/**
 * Build the unified pending queue. Pure function — no RPC, no privacy re-implementation.
 * Caller must pass already-filtered guidance/loops (or allowCognitionDerived=false).
 */
export function buildPendingQueue(input: BuildPendingQueueInput): PendingItem[] {
  const now = input.now ?? Date.now()
  const allowCognition = input.allowCognitionDerived !== false
  const snoozed = new Set(input.snoozedKeys ?? [])
  const byKey = new Map<string, PendingItem>()

  const put = (item: PendingItem) => {
    if (isSnoozed(snoozed, item)) return
    const existing = byKey.get(item.id)
    byKey.set(item.id, existing ? mergeItems(existing, item) : item)
  }

  for (const session of input.sessions) {
    if (session.hidden || session.isArchived || session.parentSessionId) continue
    const reasons = collectSessionReasons(session, now)
    if (reasons.length === 0) continue
    // Drop unfinished_goal-only if we somehow only have weak leftovers — already handled.
    // Recent-only never appears here.
    const primary = primaryReason(reasons)
    const priority = session.taskPriority
    put({
      schemaVersion: 1,
      id: session.id,
      sessionId: session.id,
      title: sessionTitle(session),
      reasonCodes: reasons,
      reasonLabelKey: REASON_LABEL_KEY[primary],
      statusLabelKey: STATUS_LABEL_KEY[primary],
      priority,
      dueAt: session.taskDueAt,
      sources: reasons.includes('reminder')
        ? ['today_rules', 'reminder']
        : reasons.includes('checkpoint_next_steps')
          ? ['today_rules', 'checkpoint']
          : ['today_rules'],
      score: scoreItem(reasons, priority, session.taskDueAt, now),
      lastActivityAt: session.lastMessageAt,
    })
  }

  if (allowCognition) {
    for (const loop of input.loops ?? []) {
      if (loop.status === 'resolved' || loop.status === 'dismissed') continue
      if (!['open', 'waiting', 'blocked', 'stale'].includes(loop.status)) continue
      const reasons: PendingReasonCode[] = loop.status === 'blocked'
        ? ['blocked', 'open_loop']
        : loop.status === 'waiting'
          ? ['waiting', 'open_loop']
          : ['open_loop']
      const id = loop.sessionId || `loop:${loop.id}`
      const priority: PendingPriority | undefined =
        loop.importance >= 0.75 ? 'high' : loop.importance >= 0.4 ? 'medium' : 'low'
      put({
        schemaVersion: 1,
        id,
        sessionId: loop.sessionId,
        title: loop.title || loop.summary || 'Open work',
        reasonCodes: reasons,
        reasonLabelKey: REASON_LABEL_KEY[primaryReason(reasons)],
        statusLabelKey: STATUS_LABEL_KEY[primaryReason(reasons)],
        priority,
        sources: ['loop'],
        sourceKinds: (loop as { sourceKinds?: string[] }).sourceKinds,
        evidenceRef: { loopId: loop.id },
        score: scoreItem(reasons, priority, undefined, now) + Math.round((loop.importance ?? 0) * 20),
        lastActivityAt: loop.lastUpdatedAt,
      })
    }

    for (const g of input.guidance ?? []) {
      if (g.dismissedAt) continue
      // Require actionable suggestion signal
      if (!g.action?.trim() && !g.title?.trim()) continue
      const reasons: PendingReasonCode[] = g.type === 'resolve_blocker'
        ? ['blocked', 'guidance']
        : ['guidance']
      const id = g.targetSessionId || `guidance:${g.id}`
      const priority: PendingPriority | undefined =
        g.importance >= 0.75 ? 'high' : g.importance >= 0.4 ? 'medium' : 'low'
      put({
        schemaVersion: 1,
        id,
        sessionId: g.targetSessionId,
        title: g.title || g.action || 'Suggestion',
        reasonCodes: reasons,
        reasonLabelKey: REASON_LABEL_KEY[primaryReason(reasons)],
        statusLabelKey: STATUS_LABEL_KEY[primaryReason(reasons)],
        priority,
        sources: ['guidance'],
        sourceKinds: g.sourceKinds,
        evidenceRef: { guidanceId: g.id, loopId: g.targetLoopId },
        score: scoreItem(reasons, priority, undefined, now) + Math.round((g.score ?? g.importance ?? 0) * 15),
        lastActivityAt: g.createdAt,
      })
    }
  }

  const items = Array.from(byKey.values())
  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const dueA = a.dueAt ?? Number.POSITIVE_INFINITY
    const dueB = b.dueAt ?? Number.POSITIVE_INFINITY
    if (dueA !== dueB) return dueA - dueB
    return (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0)
  })

  const limit = input.limit ?? 40
  return items.slice(0, limit)
}

/** Target key used for snooze persistence. */
export function pendingSnoozeKey(item: PendingItem): string {
  if (item.sessionId) return item.sessionId
  return item.id
}
