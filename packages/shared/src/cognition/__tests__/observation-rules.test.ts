import { describe, expect, it } from 'bun:test'
import {
  buildCheckpointCreatedEvent,
  buildObservationsFromEvent,
  buildSessionStoppedEvent,
  buildTaskDetailsUpdatedEvent,
} from '../index.ts'

describe('observation rules', () => {
  it('builds progress observation from checkpoint nextSteps', () => {
    const event = {
      ...buildCheckpointCreatedEvent({
        sessionId: 's1',
        checkpointId: 'cp1',
        source: 'auto',
        outcome: 'completed',
        nextSteps: ['完成插件市场搜索'],
      }),
      id: 'e1',
      sequence: 1,
    }
    const obs = buildObservationsFromEvent(event)
    expect(obs.some((o) => o.category === 'progress')).toBe(true)
    expect(obs.find((o) => o.category === 'progress')!.title).toContain('插件市场')
    expect(obs[0]!.sourceEventIds).toEqual(['e1'])
    expect(obs[0]!.evidenceRefs.some((r) => r.type === 'checkpoint')).toBe(true)
  })

  it('builds blocker observation from checkpoint blockers', () => {
    const event = {
      ...buildCheckpointCreatedEvent({
        sessionId: 's1',
        checkpointId: 'cp2',
        source: 'auto',
        outcome: 'failed',
        blockers: ['OAuth认证未完成'],
      }),
      id: 'e2',
      sequence: 2,
    }
    const obs = buildObservationsFromEvent(event)
    const blocker = obs.find((o) => o.category === 'blocker')
    expect(blocker).toBeTruthy()
    expect(blocker!.title).toContain('OAuth')
  })

  it('builds blocker observation from session failed', () => {
    const event = {
      ...buildSessionStoppedEvent({
        sessionId: 's1',
        turnId: 't1',
        reason: 'failed',
        blockers: ['OAuth认证失败'],
        errorCode: 'session_error',
      }),
      id: 'e3',
      sequence: 3,
    }
    const obs = buildObservationsFromEvent(event)
    expect(obs.some((o) => o.category === 'blocker')).toBe(true)
  })

  it('builds context observation from interrupted session', () => {
    const event = {
      ...buildSessionStoppedEvent({
        sessionId: 's1',
        turnId: 't2',
        reason: 'interrupted',
      }),
      id: 'e4',
      sequence: 4,
    }
    const obs = buildObservationsFromEvent(event)
    expect(obs.some((o) => o.category === 'context')).toBe(true)
  })

  it('builds change observation from task details', () => {
    const event = {
      ...buildTaskDetailsUpdatedEvent({
        sessionId: 's1',
        updatedFields: ['priority'],
        priority: 'high',
        revision: 1,
      }),
      id: 'e5',
      sequence: 5,
    }
    const obs = buildObservationsFromEvent(event)
    expect(obs).toHaveLength(1)
    expect(obs[0]!.category).toBe('change')
    expect(obs[0]!.summary).toContain('high')
  })
})
