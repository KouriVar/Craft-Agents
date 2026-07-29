import { afterAll, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AutomationSystem } from '../automation-system.ts'

// Tests may run concurrently. Clean up only after all watcher instances have
// finished, otherwise one test can delete another test's live workspace.
const roots: string[] = []; afterAll(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
async function waitFor(check: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for file watcher event')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
test('ProjectChange and FileChange are real prompt-triggering event sources', async () => {
  const root = mkdtempSync(join(tmpdir(), 'automation-events-')); roots.push(root)
  writeFileSync(join(root, 'automations.json'), JSON.stringify({ automations: { ProjectChange: [{ id: 'project', actions: [{ type: 'prompt', prompt: 'project event' }] }], FileChange: [{ id: 'file', actions: [{ type: 'prompt', prompt: 'file event' }] }] } }))
  const ready: string[] = []; const system = new AutomationSystem({ workspaceRootPath: root, workspaceId: 'ws', onPromptsReady: (items) => { ready.push(...items.map((item) => item.prompt)) } })
  await system.eventBus.emit('ProjectChange', { workspaceId: 'ws', timestamp: Date.now(), data: { action: 'updated' } })
  await system.eventBus.emit('FileChange', { workspaceId: 'ws', timestamp: Date.now(), data: { path: 'a.txt' } })
  expect(ready).toEqual(['project event', 'file event'])
  await system.dispose()
})

test('file watcher dispatches a saved workspace file once and closes on dispose', async () => {
  const root = mkdtempSync(join(tmpdir(), 'automation-watch-')); roots.push(root)
  mkdirSync(join(root, 'notes', 'daily'), { recursive: true })
  writeFileSync(join(root, 'automations.json'), JSON.stringify({ automations: { FileChange: [
    { id: 'file', matcher: 'watched\\.txt', actions: [{ type: 'prompt', prompt: 'watch event' }] },
    { id: 'nested', matcher: 'entry\\.md', actions: [{ type: 'prompt', prompt: 'nested event' }] },
  ] } }))
  const ready: string[] = []; const system = new AutomationSystem({ workspaceRootPath: root, workspaceId: 'ws', onPromptsReady: (items) => ready.push(...items.map((item) => item.prompt)) })
  // fs.watch registration is asynchronous on some platforms; wait for the
  // watcher tree to become active before exercising the external write.
  await new Promise((resolve) => setTimeout(resolve, 60))
  writeFileSync(join(root, 'watched.txt'), 'one')
  await waitFor(() => ready.filter((item) => item === 'watch event').length === 1)
  expect(ready.filter((item) => item === 'watch event')).toHaveLength(1)
  writeFileSync(join(root, 'notes', 'daily', 'entry.md'), 'hello')
  await waitFor(() => ready.filter((item) => item === 'nested event').length === 1)
  // EventLogHandler writes events.jsonl. It is excluded so the watcher cannot
  // feed its own persistence back into user automations.
  await new Promise((resolve) => setTimeout(resolve, 80))
  expect(ready.filter((item) => item === 'nested event')).toHaveLength(1)
  await system.dispose(); writeFileSync(join(root, 'watched.txt'), 'two')
  await new Promise((resolve) => setTimeout(resolve, 80))
  expect(ready.filter((item) => item === 'watch event')).toHaveLength(1)
})
