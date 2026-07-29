import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { pauseProjectAutomations, restoreProjectAutomations, listPausedProjectAutomations } from '../project-lifecycle.ts'
const roots: string[] = []; afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
describe('project automation lifecycle', () => it('pauses only archived project automations and never restores them implicitly', () => {
  const root = mkdtempSync(join(tmpdir(), 'automation-project-')); roots.push(root)
  writeFileSync(join(root, 'automations.json'), JSON.stringify({ automations: { SchedulerTick: [{ id: 'a', projectId: 'p1', actions: [{ type: 'prompt', prompt: 'x' }] }, { id: 'manual', projectId: 'p1', enabled: false, actions: [{ type: 'prompt', prompt: 'off' }] }, { id: 'b', projectId: 'p2', actions: [{ type: 'prompt', prompt: 'y' }] }] } }))
  expect(pauseProjectAutomations(root, 'p1')).toBe(1)
  const data = JSON.parse(readFileSync(join(root, 'automations.json'), 'utf8'))
  expect(data.automations.SchedulerTick[0].enabled).toBe(false)
  expect(data.automations.SchedulerTick[2].enabled).toBeUndefined()
  expect(data.automations.SchedulerTick[0].pausedByProjectArchive).toBe(true)
  expect(listPausedProjectAutomations(root, 'p1')).toEqual([{ id: 'a', name: 'SchedulerTick automation', event: 'SchedulerTick' }])
  expect(restoreProjectAutomations(root, 'p1', ['not-a-rule'])).toBe(0)
  expect(restoreProjectAutomations(root, 'p1', ['a'])).toBe(1)
  const restored = JSON.parse(readFileSync(join(root, 'automations.json'), 'utf8'))
  expect(restored.automations.SchedulerTick[0].enabled).toBeUndefined()
  expect(restored.automations.SchedulerTick[0].pausedByProjectArchive).toBeUndefined()
  expect(restored.automations.SchedulerTick[1].enabled).toBe(false)
  expect(restoreProjectAutomations(root, 'p1', ['a'])).toBe(0)
}))
