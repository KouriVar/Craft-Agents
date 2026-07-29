import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProject } from '@craft-agent/shared/projects'
import { getLibraryService } from '../library/LibraryService.ts'
import { createWorkflowOutputContext } from './workflow-output-context.ts'

const roots: string[] = []; afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
describe('workflow output context', () => it('writes knowledge and project file outputs to their canonical stores', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workflow-output-')); roots.push(root)
  const project = createProject(root, { name: 'Demo' })
  const sink = createWorkflowOutputContext({ workspaceRoot: root, workspaceId: 'workspace', projectId: project.id })
  const document = await sink.writeOutput({ id: 'a', type: 'output', outputKind: 'knowledge', name: 'Report', content: 'Body' })
  expect(getLibraryService(root, 'workspace').get(document.id)?.body).toContain('Body')
  const file = await sink.writeOutput({ id: 'b', type: 'output', outputKind: 'project-file', name: 'report.txt', content: 'File body' })
  expect(file.path).toContain('report.txt')
}))
