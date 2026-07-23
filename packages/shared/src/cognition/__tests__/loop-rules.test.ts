import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildLoopDrafts,
  isSimilarLoopTitle,
  LoopStore,
  buildObservationsFromEvent,
  buildCheckpointCreatedEvent,
  buildSessionStoppedEvent,
} from '../index.ts'

describe('loop deduplicator', () => {
  it('detects similar titles', () => {
    expect(isSimilarLoopTitle('继续完善插件市场', '继续完善插件市场搜索')).toBe(true)
    expect(isSimilarLoopTitle('完成插件市场', '继续完善插件市场')).toBe(true)
    expect(isSimilarLoopTitle('完全无关事项', 'OAuth认证失败')).toBe(false)
  })
})

describe('loop rules + store', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const r of roots.splice(0)) {
      try { rmSync(r, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  function root(): string {
    const r = mkdtempSync(join(tmpdir(), 'craft-loops-'))
    roots.push(r)
    return r
  }

  it('builds open loop from nextSteps observation', () => {
    const event = {
      ...buildCheckpointCreatedEvent({
        sessionId: 's1',
        checkpointId: 'cp1',
        source: 'auto',
        outcome: 'completed',
        nextSteps: ['继续完善插件市场'],
      }),
      id: 'e1',
      sequence: 1,
    }
    const observations = buildObservationsFromEvent(event)
    const drafts = buildLoopDrafts({ observations, events: [event] })
    expect(drafts.some((d) => d.status === 'open')).toBe(true)
    expect(drafts.find((d) => d.status === 'open')!.nextAction).toBeTruthy()
  })

  it('builds blocked loop from blocker observation', () => {
    const event = {
      ...buildCheckpointCreatedEvent({
        sessionId: 's1',
        checkpointId: 'cp2',
        source: 'auto',
        outcome: 'failed',
        blockers: ['OAuth认证失败'],
      }),
      id: 'e2',
      sequence: 2,
    }
    const observations = buildObservationsFromEvent(event)
    const drafts = buildLoopDrafts({ observations, events: [event] })
    const blocked = drafts.find((d) => d.status === 'blocked')
    expect(blocked).toBeTruthy()
    expect(blocked!.blocker).toContain('OAuth')
  })

  it('builds resume loop from interrupted session', () => {
    const event = {
      ...buildSessionStoppedEvent({
        sessionId: 's1',
        turnId: 't1',
        reason: 'interrupted',
      }),
      id: 'e3',
      sequence: 3,
    }
    const drafts = buildLoopDrafts({ observations: [], events: [event] })
    expect(drafts.some((d) => d.title.includes('恢复'))).toBe(true)
  })

  it('deduplicates similar loops on upsert', async () => {
    const store = new LoopStore(root())
    await store.upsertFromDrafts([
      {
        title: '继续完善插件市场',
        summary: 'a',
        status: 'open',
        nextAction: '完善插件市场',
        importance: 0.7,
        confidence: 0.8,
        observationIds: ['o1'],
        evidenceRefs: [],
        sessionId: 's1',
      },
    ])
    await store.upsertFromDrafts([
      {
        title: '继续完善插件市场搜索',
        summary: 'b',
        status: 'open',
        nextAction: '完善搜索',
        importance: 0.8,
        confidence: 0.8,
        observationIds: ['o2'],
        evidenceRefs: [],
        sessionId: 's1',
      },
    ])
    const loops = await store.listLoops({ sessionId: 's1', includeResolved: true })
    expect(loops).toHaveLength(1)
    expect(loops[0]!.observationIds).toContain('o1')
    expect(loops[0]!.observationIds).toContain('o2')
  })

  it('does not auto-overwrite resolved loops', async () => {
    const store = new LoopStore(root())
    const createdList = await store.upsertFromDrafts([
      {
        title: '继续完善插件市场',
        summary: 'a',
        status: 'open',
        nextAction: '完善',
        importance: 0.7,
        confidence: 0.8,
        observationIds: ['o1'],
        evidenceRefs: [],
        sessionId: 's1',
      },
    ])
    const created = createdList[0]!
    await store.setLoopStatus(created.id, 'resolved')
    await store.upsertFromDrafts([
      {
        title: '继续完善插件市场搜索',
        summary: 'should not recreate',
        status: 'open',
        nextAction: '完善',
        importance: 0.9,
        confidence: 0.9,
        observationIds: ['o9'],
        evidenceRefs: [],
        sessionId: 's1',
      },
    ])
    const open = await store.listLoops({ sessionId: 's1' })
    expect(open).toHaveLength(0)
    const all = await store.listLoops({ sessionId: 's1', includeResolved: true })
    expect(all).toHaveLength(1)
    expect(all[0]!.status).toBe('resolved')
    expect(all[0]!.userManaged).toBe(true)
  })
})
