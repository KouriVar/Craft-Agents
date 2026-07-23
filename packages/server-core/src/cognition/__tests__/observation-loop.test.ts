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

describe('CognitionService Observation+Loop pipeline', () => {
  const roots: string[] = []
  afterEach(async () => {
    _resetCognitionServiceRegistryForTests()
    for (const root of roots.splice(0)) {
      try { rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  function service(): CognitionService {
    const root = mkdtempSync(join(tmpdir(), 'craft-cog-p3-'))
    roots.push(root)
    return new CognitionService({ workspaceDataRoot: root, workspaceId: 'ws' })
  }

  it('session.stopped → Observation → Loop', async () => {
    const svc = service()
    await svc.appendEvent(
      buildSessionStoppedEvent({
        sessionId: 'sess-1',
        turnId: 'turn-1',
        reason: 'interrupted',
        nextSteps: ['继续完善插件市场'],
      }),
    )
    await svc.flush()
    await svc.processUnprocessedEvents()

    const observations = await svc.listObservations({ sessionId: 'sess-1' })
    expect(observations.length).toBeGreaterThan(0)
    expect(observations.some((o) => o.category === 'context' || o.category === 'progress')).toBe(true)

    const loops = await svc.listLoops({ sessionId: 'sess-1' })
    expect(loops.length).toBeGreaterThan(0)
    expect(loops.some((l) => l.status === 'open')).toBe(true)

    const status = await svc.getStatus()
    expect(status.lastProcessedSequence).toBeGreaterThan(0)
  })

  it('checkpoint blockers produce blocked Loop', async () => {
    const svc = service()
    await svc.appendEvent(
      buildCheckpointCreatedEvent({
        sessionId: 'sess-2',
        checkpointId: 'cp-1',
        source: 'auto',
        outcome: 'failed',
        blockers: ['OAuth认证失败'],
      }),
    )
    await svc.flush()
    await svc.processUnprocessedEvents()

    const observations = await svc.listObservations({ sessionId: 'sess-2' })
    expect(observations.some((o) => o.category === 'blocker')).toBe(true)

    const loops = await svc.listLoops({ sessionId: 'sess-2' })
    expect(loops.some((l) => l.status === 'blocked')).toBe(true)
  })

  it('resolveLoop protects against auto overwrite', async () => {
    const svc = service()
    await svc.appendEvent(
      buildCheckpointCreatedEvent({
        sessionId: 'sess-3',
        checkpointId: 'cp-a',
        source: 'auto',
        outcome: 'completed',
        nextSteps: ['继续完善插件市场'],
      }),
    )
    await svc.flush()
    await svc.processUnprocessedEvents()
    const [loop] = await svc.listLoops({ sessionId: 'sess-3' })
    expect(loop).toBeTruthy()
    await svc.resolveLoop(loop!.id)

    await svc.appendEvent(
      buildCheckpointCreatedEvent({
        sessionId: 'sess-3',
        checkpointId: 'cp-b',
        source: 'auto',
        outcome: 'completed',
        nextSteps: ['继续完善插件市场搜索'],
      }),
    )
    await svc.flush()
    await svc.processUnprocessedEvents()

    const open = await svc.listLoops({ sessionId: 'sess-3' })
    expect(open).toHaveLength(0)
    const all = await svc.listLoops({ sessionId: 'sess-3', includeResolved: true })
    expect(all.some((l) => l.status === 'resolved' && l.userManaged)).toBe(true)
  })
})
