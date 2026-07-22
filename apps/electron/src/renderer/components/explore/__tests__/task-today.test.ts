import { describe, expect, it } from 'bun:test'
import type { SessionMeta } from '@/atoms/sessions'
import { buildTodayTasks, isReminderDue } from '../task-today'

const NOW = new Date('2026-07-22T12:00:00+08:00').getTime()

function session(id: string, patch: Partial<SessionMeta> = {}): SessionMeta {
  return { id, workspaceId: 'ws', name: id, ...patch }
}

describe('task today ordering', () => {
  it('prioritizes due reminders and overdue work over active and recent sessions', () => {
    const result = buildTodayTasks([
      session('recent', { lastMessageAt: NOW - 60_000 }),
      session('active', { kanbanColumn: 'in-progress' }),
      session('overdue', { taskDueAt: NOW - 1_000 }),
      session('reminder', { taskReminderAt: NOW - 1_000 }),
    ], NOW)
    expect(result.map((item) => item.session.id)).toEqual(['reminder', 'overdue', 'active', 'recent'])
  })

  it('does not repeat an acknowledged reminder', () => {
    const item = session('ack', { taskReminderAt: NOW - 2_000, taskReminderAcknowledgedAt: NOW - 1_000 })
    expect(isReminderDue(item, NOW)).toBe(false)
  })

  it('surfaces automation results created today', () => {
    const result = buildTodayTasks([
      session('automation', { triggeredBy: { automationName: 'Daily brief', timestamp: NOW - 60_000 } }),
    ], NOW)
    expect(result[0]?.reason).toBe('automation')
  })

  it('surfaces tasks due later today and checkpoints with unfinished next steps', () => {
    const result = buildTodayTasks([
      session('resume', {
        taskCheckpoints: [{
          id: 'cp', createdAt: NOW - 1000, source: 'auto', outcome: 'completed',
          summary: 'Core work done', nextSteps: ['Package the app'],
        }],
      }),
      session('due-today', { taskDueAt: NOW + 60 * 60 * 1000 }),
    ], NOW)
    expect(result.map((item) => [item.session.id, item.reason])).toEqual([
      ['due-today', 'dueToday'],
      ['resume', 'resume'],
    ])
  })

  it('does not revive completed work solely because a reminder is due', () => {
    const result = buildTodayTasks([
      session('done', { kanbanColumn: 'done', taskReminderAt: NOW - 1 }),
    ], NOW)
    expect(result).toEqual([])
  })

  it('excludes archived, hidden, child, and completed sessions', () => {
    const result = buildTodayTasks([
      session('archived', { isArchived: true, taskReminderAt: NOW - 1 }),
      session('hidden', { hidden: true, taskReminderAt: NOW - 1 }),
      session('child', { parentSessionId: 'parent', taskReminderAt: NOW - 1 }),
      session('done', { kanbanColumn: 'done', lastMessageAt: NOW }),
    ], NOW)
    expect(result).toEqual([])
  })
})
