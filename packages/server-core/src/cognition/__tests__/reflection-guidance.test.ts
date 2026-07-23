import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CognitionService,
  _resetCognitionServiceRegistryForTests,
} from '../CognitionService.ts'
import {
  buildCheckpointCreatedEvent,
  buildSessionStoppedEvent,
} from '@craft-agent/shared/cognition'

describe('CognitionService Reflection+Guidance pipeline', () => {
  const roots: string[] = []
  afterEach(async () => {
    _resetCognitionServiceRegistryForTests()
    for (const root of roots.splice(0)) {
      try { rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  function service(): CognitionService {
    const root = mkdtempSync(join(tmpdir(), 'craft-cog-p4-'))
    roots.push(root)
    return new CognitionService({ workspaceDataRoot: root, workspaceId: 'ws' })
  }

  it('Event → Observation → Loop → Reflection → Guidance', async () => {
    const svc = service()
    await svc.appendEvent(
      buildCheckpointCreatedEvent({
        sessionId: 'sess-p4',
        checkpointId: 'cp-1',
        source: 'auto',
        outcome: 'completed',
        nextSteps: ['继续完善插件市场搜索'],
        blockers: ['OAuth认证未完成'],
      }),
    )
    await svc.flush()
    await svc.processUnprocessedEvents()

    const reflections = await svc.listReflections({ sessionId: 'sess-p4', latestOnly: true })
    expect(reflections.length).toBeGreaterThan(0)
    expect(reflections[0]!.type).toBe('task')
    expect(reflections[0]!.blockers.length + reflections[0]!.unresolved.length).toBeGreaterThan(0)
    expect(reflections[0]!.sourceObservationIds.length).toBeGreaterThan(0)
    expect(reflections[0]!.sourceLoopIds.length).toBeGreaterThan(0)

    const guidance = await svc.listGuidance({ sessionId: 'sess-p4' })
    expect(guidance.length).toBeGreaterThan(0)
    expect(guidance.some((g) => g.type === 'resolve_blocker' || g.type === 'continue')).toBe(true)
    expect(guidance.every((g) => g.sourceLoopIds.length > 0)).toBe(true)
  })

  it('resolved loop does not produce guidance', async () => {
    const svc = service()
    await svc.appendEvent(
      buildCheckpointCreatedEvent({
        sessionId: 'sess-res',
        checkpointId: 'cp-r',
        source: 'auto',
        outcome: 'failed',
        blockers: ['OAuth认证失败'],
      }),
    )
    await svc.flush()
    await svc.processUnprocessedEvents()
    const [loop] = await svc.listLoops({ sessionId: 'sess-res' })
    expect(loop).toBeTruthy()
    await svc.resolveLoop(loop!.id)

    const guidance = await svc.listGuidance({ sessionId: 'sess-res' })
    expect(guidance.every((g) => g.targetLoopId !== loop!.id)).toBe(true)
  })

  it('dismissed guidance is not revived on refresh', async () => {
    const svc = service()
    await svc.appendEvent(
      buildSessionStoppedEvent({
        sessionId: 'sess-d',
        turnId: 't1',
        reason: 'interrupted',
        nextSteps: ['恢复开发任务'],
      }),
    )
    await svc.flush()
    await svc.processUnprocessedEvents()
    const [g] = await svc.listGuidance({ sessionId: 'sess-d' })
    expect(g).toBeTruthy()
    await svc.dismissGuidance(g!.id)

    await svc.refreshGuidance({ includeDaily: false })
    const active = await svc.listGuidance({ sessionId: 'sess-d' })
    expect(active.every((x) => x.targetLoopId !== g!.targetLoopId)).toBe(true)

    const all = await svc.listGuidance({ sessionId: 'sess-d', includeDismissed: true })
    expect(all.some((x) => x.id === g!.id && x.dismissedAt)).toBe(true)
  })

  it('refreshGuidance builds daily reflection on demand', async () => {
    const svc = service()
    await svc.appendEvent(
      buildCheckpointCreatedEvent({
        sessionId: 'sess-daily',
        checkpointId: 'cp-d',
        source: 'manual',
        outcome: 'completed',
        nextSteps: ['完成插件市场测试'],
      }),
    )
    await svc.flush()
    const result = await svc.refreshGuidance({ includeDaily: true })
    expect(result.dailyReflection?.type).toBe('daily')
    expect(result.guidance.length).toBeGreaterThan(0)

    const dailies = await svc.listReflections({ type: 'daily', latestOnly: true })
    expect(dailies.length).toBeGreaterThan(0)
  })
})
