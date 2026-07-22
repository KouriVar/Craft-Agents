import type { SessionMeta } from '@/atoms/sessions'

export type TodayReason = 'reminder' | 'overdue' | 'dueToday' | 'failed' | 'waiting' | 'active' | 'automation' | 'unread' | 'resume' | 'recent'

export interface TodayTaskItem {
  session: SessionMeta
  reason: TodayReason
  score: number
}

const WAITING_STATUS_RE = /wait|waiting|blocked|review|等待|阻塞|审核/i

export function isReminderDue(session: SessionMeta, now = Date.now()): boolean {
  return Boolean(
    session.taskReminderAt &&
    session.taskReminderAt <= now &&
    (!session.taskReminderAcknowledgedAt || session.taskReminderAcknowledgedAt < session.taskReminderAt),
  )
}

export function buildTodayTasks(sessions: SessionMeta[], now = Date.now()): TodayTaskItem[] {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const recentCutoff = startOfToday.getTime()
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const tomorrowCutoff = startOfTomorrow.getTime()

  return sessions
    .filter((session) => !session.hidden && !session.isArchived && !session.parentSessionId)
    .map((session): TodayTaskItem | null => {
      const completed = session.kanbanColumn === 'done' || session.sessionStatus === 'done'
      if (!completed && isReminderDue(session, now)) return { session, reason: 'reminder', score: 100 }
      if (!completed && session.taskDueAt && session.taskDueAt < now) {
        return { session, reason: 'overdue', score: 95 }
      }
      if (!completed && session.taskDueAt && session.taskDueAt < tomorrowCutoff) {
        return { session, reason: 'dueToday', score: 92 }
      }
      if (session.lastMessageRole === 'error') return { session, reason: 'failed', score: 90 }
      if (WAITING_STATUS_RE.test(session.sessionStatus ?? '')) return { session, reason: 'waiting', score: 80 }
      if (session.isProcessing || session.kanbanColumn === 'in-progress') return { session, reason: 'active', score: 70 }
      if ((session.triggeredBy?.timestamp ?? 0) >= recentCutoff) {
        return { session, reason: 'automation', score: 65 }
      }
      if (session.hasUnread) return { session, reason: 'unread', score: 60 }
      if (!completed && session.taskCheckpoints?.at(-1)?.nextSteps?.length) {
        return { session, reason: 'resume', score: 50 }
      }
      if (!completed && (session.lastMessageAt ?? 0) >= recentCutoff) {
        return { session, reason: 'recent', score: 40 }
      }
      return null
    })
    .filter((item): item is TodayTaskItem => item !== null)
    .sort((a, b) => {
      const priority = { high: 8, medium: 3, low: 0 }
      const scoreDiff = (b.score + priority[b.session.taskPriority ?? 'medium']) - (a.score + priority[a.session.taskPriority ?? 'medium'])
      return scoreDiff || (b.session.lastMessageAt ?? 0) - (a.session.lastMessageAt ?? 0)
    })
}
