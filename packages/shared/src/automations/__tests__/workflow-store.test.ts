import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getWorkflow, listWorkflows, saveWorkflow } from '../workflow-store.ts'
const roots: string[] = []; afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
describe('workflow store', () => it('persists only executable definitions and canvas layout', () => {
  const root = mkdtempSync(join(tmpdir(), 'workflow-store-')); roots.push(root)
  const saved = saveWorkflow(root, { version: 1, id: 'wf', name: 'Workflow', start: 'a', nodes: [{ id: 'a', type: 'output', outputKind: 'knowledge', name: 'Doc', content: 'text' }], layout: { a: { x: 10, y: 20 } } })
  expect(saved.updatedAt).toBeNumber(); expect(getWorkflow(root, 'wf')?.layout.a).toEqual({ x: 10, y: 20 }); expect(listWorkflows(root)).toHaveLength(1)
}))
