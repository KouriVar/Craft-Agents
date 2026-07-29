import type { SessionMeta } from '@/atoms/sessions'
import { isInQuietHours, type TaskReminderSettings } from './task-reminder-settings'

export function shouldNotifyTaskReminder(
  session: SessionMeta,
  settings: Pick<TaskReminderSettings, 'remindersEnabled' | 'quietHoursStart' | 'quietHoursEnd'>,
  now = Date.now(),
): boolean {
  if (!settings.remindersEnabled || session.hidden || session.isArchived || !session.taskReminderAt) return false
  if (session.kanbanColumn === 'done' || session.sessionStatus === 'done') return false
  if (isInQuietHours(settings, new Date(now)) || session.taskReminderAt > now) return false
  if (session.taskReminderAcknowledgedAt && session.taskReminderAcknowledgedAt >= session.taskReminderAt) return false
  if (session.taskReminderLastNotifiedAt && session.taskReminderLastNotifiedAt >= session.taskReminderAt) return false
  return true
}
