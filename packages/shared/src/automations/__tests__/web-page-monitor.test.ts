import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listDynamicItems } from '../../dynamic/index.ts'
import { WebPageMonitorService } from '../web-page-monitor.ts'

const roots: string[] = []; afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
test('web monitor snapshots first fetch, emits only changes, limits frequency and recovers after failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'web-monitor-')); roots.push(root); let now = 0; let response: string | Error = 'one'; const changes: string[] = []
  const service = new WebPageMonitorService({ workspaceRoot: root, workspaceId: 'ws', now: () => now, targets: () => [{ id: 'm1', monitor: { url: 'https://example.test', rule: 'content', frequencyMinutes: 1 } }], fetchText: async () => { if (response instanceof Error) throw response; return response }, onChanged: async () => { changes.push('changed') } })
  await service.tick(); expect(changes).toEqual([])
  now += 30_000; response = 'two'; await service.tick(); expect(changes).toEqual([])
  now += 31_000; await service.tick(); expect(changes).toEqual(['changed'])
  response = new Error('offline'); now += 61_000; await service.tick(); expect(listDynamicItems(root, 'automation')).toHaveLength(1)
  response = 'three'; now += 121_000; await service.tick(); expect(changes).toEqual(['changed', 'changed'])
  expect(JSON.parse(readFileSync(join(root, 'automation-web-monitors.json'), 'utf8')).schemaVersion).toBe(1)
})

test('migrates legacy monitor state without losing snapshots', async () => {
  const root = mkdtempSync(join(tmpdir(), 'web-monitor-schema-')); roots.push(root)
  writeFileSync(join(root, 'automation-web-monitors.json'), JSON.stringify({ version: 1, monitors: { m1: { hash: 'kept', failures: 0, lastCheckedAt: 100 } } }))
  const service = new WebPageMonitorService({ workspaceRoot: root, workspaceId: 'ws', now: () => 110, targets: () => [{ id: 'm1', monitor: { url: 'https://example.test', rule: 'content', frequencyMinutes: 1 } }], fetchText: async () => 'unused', onChanged: async () => {} })
  await service.tick()
  expect(JSON.parse(readFileSync(join(root, 'automation-web-monitors.json'), 'utf8').replace(/^\uFEFF/, '')).monitors.m1.hash).toBe('kept')
  expect(existsSync(join(root, 'automation-web-monitors.json.pre-v020-schema-v0.bak'))).toBe(true)
})
