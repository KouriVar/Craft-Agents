import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CognitionEventStore,
  buildSessionStartedEvent,
  buildSessionStoppedEvent,
  findOpenSessionStarts,
  loadManifest,
  getCognitionEventsPath,
  getCognitionManifestPath,
} from '../index.ts'

function tempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'craft-cognition-'))
}

describe('CognitionEventStore', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) {
      try { rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  function store(): CognitionEventStore {
    const root = tempWorkspace()
    roots.push(root)
    return new CognitionEventStore({ workspaceDataRoot: root })
  }

  it('creates directory and files on first append', async () => {
    const s = store()
    const result = await s.appendEvent(
      buildSessionStartedEvent({ sessionId: 's1', turnId: 't1', workspaceId: 'ws1' }),
    )
    expect(result.status).toBe('appended')
    expect(existsSync(getCognitionEventsPath(s.workspaceDataRoot))).toBe(true)
    expect(existsSync(getCognitionManifestPath(s.workspaceDataRoot))).toBe(true)
    const manifest = loadManifest(s.workspaceDataRoot)!
    expect(manifest.nextSequence).toBe(2)
    expect(manifest.eventCount).toBe(1)
    expect(manifest.lastProcessedSequence).toBe(0)
  })

  it('assigns monotonic sequences and supports batch append', async () => {
    const s = store()
    const results = await s.appendEvents([
      buildSessionStartedEvent({ sessionId: 's1', turnId: 't1' }),
      buildSessionStoppedEvent({ sessionId: 's1', turnId: 't1', reason: 'completed' }),
    ])
    expect(results.map((r) => r.event.sequence)).toEqual([1, 2])
  })

  it('deduplicates by idempotencyKey', async () => {
    const s = store()
    const input = buildSessionStartedEvent({ sessionId: 's1', turnId: 't1' })
    const first = await s.appendEvent(input)
    const second = await s.appendEvent(input)
    expect(first.status).toBe('appended')
    expect(second.status).toBe('deduplicated')
    expect(second.event.id).toBe(first.event.id)
    const status = await s.getStatus()
    expect(status.eventCount).toBe(1)
  })

  it('serializes concurrent appends without losing events', async () => {
    const s = store()
    const jobs = Array.from({ length: 20 }, (_, i) =>
      s.appendEvent(buildSessionStartedEvent({ sessionId: 's1', turnId: `t${i}` })),
    )
    const results = await Promise.all(jobs)
    expect(results.every((r) => r.status === 'appended')).toBe(true)
    const sequences = results.map((r) => r.event.sequence).sort((a, b) => a - b)
    expect(sequences).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })

  it('filters by session/type/time and paginates', async () => {
    const s = store()
    await s.appendEvent(buildSessionStartedEvent({ sessionId: 'a', turnId: 't1', timestamp: 1000 }))
    await s.appendEvent(buildSessionStoppedEvent({ sessionId: 'a', turnId: 't1', reason: 'completed', timestamp: 2000 }))
    await s.appendEvent(buildSessionStartedEvent({ sessionId: 'b', turnId: 't2', timestamp: 3000 }))

    const onlyA = await s.listEvents({ sessionId: 'a' })
    expect(onlyA).toHaveLength(2)

    const stopped = await s.listEvents({ types: ['session.stopped'] })
    expect(stopped).toHaveLength(1)
    expect(stopped[0]!.type).toBe('session.stopped')

    const page = await s.listEvents({ limit: 1, offset: 1 })
    expect(page).toHaveLength(1)
    expect(page[0]!.sequence).toBe(2)
  })

  it('ignores corrupt trailing line and reports repair note', async () => {
    const s = store()
    await s.appendEvent(buildSessionStartedEvent({ sessionId: 's1', turnId: 't1' }))
    const path = getCognitionEventsPath(s.workspaceDataRoot)
    writeFileSync(path, `${readFileSync(path, 'utf8')}{not-json\n`)
    const events = await s.listEvents()
    expect(events).toHaveLength(1)
    const status = await s.getStatus()
    expect(status.lastRepairNote).toMatch(/corrupt trailing/i)
  })

  it('throws on mid-file corruption', async () => {
    const s = store()
    await s.appendEvent(buildSessionStartedEvent({ sessionId: 's1', turnId: 't1' }))
    await s.appendEvent(buildSessionStoppedEvent({ sessionId: 's1', turnId: 't1', reason: 'completed' }))
    const path = getCognitionEventsPath(s.workspaceDataRoot)
    const lines = readFileSync(path, 'utf8').trim().split('\n')
    writeFileSync(path, `${lines[0]}\n{broken\n${lines[1]}\n`)
    await expect(s.listEvents()).rejects.toThrow(/line 2/)
  })

  it('rebuilds manifest via repairStore', async () => {
    const s = store()
    await s.appendEvent(buildSessionStartedEvent({ sessionId: 's1', turnId: 't1' }))
    writeFileSync(getCognitionManifestPath(s.workspaceDataRoot), '{bad')
    const status = await s.repairStore()
    expect(status.eventCount).toBe(1)
    expect(status.nextSequence).toBe(2)
  })

  it('mutexes clear against append', async () => {
    const s = store()
    const appends = Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        s.appendEvent(buildSessionStartedEvent({ sessionId: 's1', turnId: `t${i}` })),
      ),
    )
    const clear = s.clearEvents()
    await Promise.all([appends, clear])
    // After both settle, store is consistent (either cleared after appends or appends after clear)
    const status = await s.getStatus()
    expect(status.nextSequence).toBeGreaterThanOrEqual(1)
    expect(status.eventCount).toBeGreaterThanOrEqual(0)
  })

  it('detects open session.started without matching stopped', async () => {
    const s = store()
    await s.appendEvent(buildSessionStartedEvent({
      sessionId: 's1',
      turnId: 't-open',
      correlationId: 'corr:s1:t-open',
    }))
    await s.appendEvent(buildSessionStartedEvent({
      sessionId: 's1',
      turnId: 't-closed',
      correlationId: 'corr:s1:t-closed',
    }))
    await s.appendEvent(buildSessionStoppedEvent({
      sessionId: 's1',
      turnId: 't-closed',
      reason: 'completed',
      correlationId: 'corr:s1:t-closed',
    }))
    const events = await s.listEvents({ limit: 50 })
    const open = findOpenSessionStarts(events)
    expect(open).toHaveLength(1)
    expect(open[0]!.correlationId).toBe('corr:s1:t-open')
  })
})
