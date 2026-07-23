import { describe, expect, it } from 'bun:test'
import type { CognitionGuidanceDto } from '@craft-agent/shared/protocol'
import {
  buildTodayGuidance,
  guidanceOpenSessionId,
} from '../build-today-guidance'
import { buildTodayTasks } from '../task-today'
import type { SessionMeta } from '@/atoms/sessions'

function guidance(partial: Partial<CognitionGuidanceDto> & Pick<CognitionGuidanceDto, 'id' | 'title'>): CognitionGuidanceDto {
  return {
    id: partial.id,
    type: partial.type ?? 'continue',
    title: partial.title,
    reason: partial.reason ?? 'reason',
    action: partial.action ?? 'action',
    importance: partial.importance ?? 0.5,
    confidence: partial.confidence ?? 0.8,
    score: partial.score,
    targetLoopId: partial.targetLoopId,
    targetSessionId: partial.targetSessionId,
    sourceReflectionId: partial.sourceReflectionId,
    sourceObservationIds: partial.sourceObservationIds ?? ['obs-1'],
    sourceLoopIds: partial.sourceLoopIds ?? ['loop-1'],
    projectId: partial.projectId,
    createdAt: partial.createdAt ?? Date.now(),
    dismissedAt: partial.dismissedAt,
  }
}

describe('buildTodayGuidance', () => {
  it('maps guidance cards and sorts by score', () => {
    const items = buildTodayGuidance([
      guidance({ id: 'g1', title: '继续市场', type: 'continue', score: 0.4, targetSessionId: 's1' }),
      guidance({ id: 'g2', title: '处理OAuth', type: 'resolve_blocker', score: 0.9, targetSessionId: 's2', importance: 0.9 }),
    ])
    expect(items.map((i) => i.id)).toEqual(['g2', 'g1'])
    expect(items[0]!.action).toBe('action')
    expect(items[0]!.sourceLoopIds).toEqual(['loop-1'])
  })

  it('hides dismissed guidance', () => {
    const items = buildTodayGuidance([
      guidance({ id: 'g1', title: '忽略', dismissedAt: Date.now(), targetSessionId: 's1' }),
      guidance({ id: 'g2', title: '可见', targetSessionId: 's2' }),
    ])
    expect(items.map((i) => i.id)).toEqual(['g2'])
  })

  it('filters by activeSessions scope', () => {
    const items = buildTodayGuidance([
      guidance({ id: 'g1', title: 'A', targetSessionId: 's1' }),
      guidance({ id: 'g2', title: 'B', targetSessionId: 's2' }),
    ], { scope: 'activeSessions', activeSessionIds: ['s2'] })
    expect(items.map((i) => i.id)).toEqual(['g2'])
  })

  it('excludes listed session ids when requested', () => {
    const items = buildTodayGuidance([
      guidance({ id: 'g1', title: 'A', targetSessionId: 's1', score: 1 }),
      guidance({ id: 'g2', title: 'B', targetSessionId: 's2', score: 0.5 }),
    ], { excludeSessionIds: ['s1'] })
    expect(items.map((i) => i.id)).toEqual(['g2'])
  })

  it('opens the target session for continue/resume/blocker', () => {
    const item = buildTodayGuidance([
      guidance({ id: 'g1', title: '恢复', type: 'resume', targetSessionId: 'sess-9' }),
    ])[0]!
    expect(guidanceOpenSessionId(item)).toBe('sess-9')
  })

  it('returns empty list when no guidance', () => {
    expect(buildTodayGuidance([])).toEqual([])
  })
})

describe('buildTodayTasks regression with guidance bypass', () => {
  it('keeps original today task ordering unchanged', () => {
    const NOW = new Date('2026-07-22T12:00:00+08:00').getTime()
    const session = (id: string, patch: Partial<SessionMeta> = {}): SessionMeta => ({
      id, workspaceId: 'ws', name: id, ...patch,
    })
    const result = buildTodayTasks([
      session('recent', { lastMessageAt: NOW - 60_000 }),
      session('active', { kanbanColumn: 'in-progress' }),
      session('overdue', { taskDueAt: NOW - 1_000 }),
      session('reminder', { taskReminderAt: NOW - 1_000 }),
    ], NOW)
    expect(result.map((item) => item.session.id)).toEqual(['reminder', 'overdue', 'active', 'recent'])
  })
})
