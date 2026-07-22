import { describe, expect, it } from 'bun:test'
import type { SessionMeta } from '@/atoms/sessions'
import { shouldNotifyTaskReminder } from '../task-reminders'

const NOW = new Date(2026, 6, 22, 12, 0, 0).getTime()
const settings = { remindersEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '08:00' }

function session(patch: Partial<SessionMeta> = {}): SessionMeta {
  return { id: 'task', workspaceId: 'ws', taskReminderAt: NOW - 1_000, ...patch }
}

describe('task reminder delivery', () => {
  it('notifies a due task exactly until delivery is persisted', () => {
    expect(shouldNotifyTaskReminder(session(), settings, NOW)).toBe(true)
    expect(shouldNotifyTaskReminder(session({ taskReminderLastNotifiedAt: NOW }), settings, NOW)).toBe(false)
  })

  it('suppresses acknowledged, completed, future, and quiet-hour reminders', () => {
    expect(shouldNotifyTaskReminder(session({ taskReminderAcknowledgedAt: NOW }), settings, NOW)).toBe(false)
    expect(shouldNotifyTaskReminder(session({ kanbanColumn: 'done' }), settings, NOW)).toBe(false)
    expect(shouldNotifyTaskReminder(session({ taskReminderAt: NOW + 1 }), settings, NOW)).toBe(false)
    const quietNow = new Date(2026, 6, 22, 23, 0, 0).getTime()
    expect(shouldNotifyTaskReminder(session({ taskReminderAt: quietNow - 1 }), settings, quietNow)).toBe(false)
  })

  it('allows a changed reminder time to notify again', () => {
    expect(shouldNotifyTaskReminder(session({
      taskReminderAt: NOW - 500,
      taskReminderLastNotifiedAt: NOW - 1_000,
    }), settings, NOW)).toBe(true)
  })
})
