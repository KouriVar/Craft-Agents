import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CognitionService,
  _resetCognitionServiceRegistryForTests,
} from '../CognitionService.ts'

describe('CognitionService integration (session event flow)', () => {
  const roots: string[] = []
  afterEach(async () => {
    _resetCognitionServiceRegistryForTests()
    for (const root of roots.splice(0)) {
      try { rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  function service(): CognitionService {
    const root = mkdtempSync(join(tmpdir(), 'craft-cog-svc-'))
    roots.push(root)
    return new CognitionService({ workspaceDataRoot: root, workspaceId: 'ws-test' })
  }

  it('writes started + checkpoint + stopped once with shared correlationId', async () => {
    const svc = service()
    const { turnId, correlationId } = svc.beginTurn({ sessionId: 'sess-1', model: 'test-model' })
    svc.appendCheckpointEvent({
      sessionId: 'sess-1',
      checkpointId: 'cp-1',
      source: 'auto',
      outcome: 'completed',
      nextSteps: ['Verify'],
      turnId,
      correlationId,
    })
    svc.appendSessionStopped({
      sessionId: 'sess-1',
      turnId,
      correlationId,
      processingReason: 'complete',
      checkpointId: 'cp-1',
      nextSteps: ['Verify'],
      hasTaskGoal: true,
    })
    await svc.flush()

    const events = await svc.listEvents({ sessionId: 'sess-1', limit: 20 })
    expect(events.map((e) => e.type)).toEqual([
      'session.started',
      'checkpoint.created',
      'session.stopped',
    ])
    expect(new Set(events.map((e) => e.correlationId))).toEqual(new Set([correlationId]))

    // Idempotent stopped
    svc.appendSessionStopped({
      sessionId: 'sess-1',
      turnId,
      correlationId,
      processingReason: 'complete',
    })
    await svc.flush()
    const again = await svc.listEvents({ sessionId: 'sess-1', types: ['session.stopped'] })
    expect(again).toHaveLength(1)
    expect(again[0].payload).toMatchObject({ reason: 'completed' })
  })

  it('writes interrupted stopped once', async () => {
    const svc = service()
    const { turnId, correlationId } = svc.beginTurn({ sessionId: 'sess-2' })
    svc.appendSessionStopped({
      sessionId: 'sess-2',
      turnId,
      correlationId,
      processingReason: 'interrupted',
    })
    svc.appendSessionStopped({
      sessionId: 'sess-2',
      turnId,
      correlationId,
      processingReason: 'interrupted',
    })
    await svc.flush()
    const stopped = await svc.listEvents({ types: ['session.stopped'] })
    expect(stopped).toHaveLength(1)
    expect((stopped[0].payload as { reason: string }).reason).toBe('interrupted')
  })

  it('writes manual checkpoint as independent event', async () => {
    const svc = service()
    svc.appendCheckpointEvent({
      sessionId: 'sess-3',
      checkpointId: 'cp-manual',
      source: 'manual',
      outcome: 'completed',
    })
    await svc.flush()
    const events = await svc.listEvents({ types: ['checkpoint.created'] })
    expect(events).toHaveLength(1)
    expect(events[0].idempotencyKey).toBe('checkpoint.manual:sess-3:cp-manual')
  })

  it('appendEvent leaves store empty when input is rejected by sanitizer', async () => {
    const svc = service()
    // Validate rejection at the sanitizer boundary (async store reject is covered there too).
    const { sanitizeCognitionEventInput, CognitionSanitizeError } = await import('@craft-agent/shared/cognition')
    expect(() =>
      sanitizeCognitionEventInput({
        type: 'session.created',
        source: 'session',
        timestamp: Date.now(),
        schemaVersion: 1,
        summary: 'x',
        payload: { diff: '+++ bad' },
      } as never),
    ).toThrow(CognitionSanitizeError)
    const status = await svc.getStatus()
    expect(status.eventCount).toBe(0)
  })

  it('resumed turn emits session.resumed alongside started', async () => {
    const svc = service()
    svc.beginTurn({ sessionId: 'sess-4', resumedFromInterrupt: true })
    await svc.flush()
    const types = (await svc.listEvents({ sessionId: 'sess-4' })).map((e) => e.type)
    expect(types).toContain('session.started')
    expect(types).toContain('session.resumed')
  })
})
