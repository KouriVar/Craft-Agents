import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { finishWorkflowApproval, getWorkflowApproval, savePendingWorkflowApproval } from '../workflow-approval-store.ts'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

describe('workflow approval persistence', () => {
  it('survives a new read, updates the same run for the next gate, and records the final decision', () => {
    const root = mkdtempSync(join(tmpdir(), 'workflow-approval-')); roots.push(root)
    const first = savePendingWorkflowApproval(root, {
      workflowId: 'wf',
      workflowName: 'Workflow',
      approvalNodeId: 'gate-1',
      title: 'First',
      state: { start: 'gate-1', approvalNodeId: 'gate-1', runs: [], outputs: [], values: {} },
    })
    expect(getWorkflowApproval(root, first.runId)).toMatchObject({ status: 'pending', approvalNodeId: 'gate-1' })
    savePendingWorkflowApproval(root, {
      runId: first.runId,
      workflowId: 'wf',
      workflowName: 'Workflow',
      approvalNodeId: 'gate-2',
      title: 'Second',
      state: { start: 'gate-2', approvalNodeId: 'gate-2', runs: [], outputs: [], values: {} },
    })
    expect(getWorkflowApproval(root, first.runId)).toMatchObject({ status: 'pending', approvalNodeId: 'gate-2' })
    expect(finishWorkflowApproval(root, first.runId, 'completed')).toMatchObject({ status: 'completed' })
  })

  it('migrates an unversioned run list once and preserves a backup', () => {
    const root = mkdtempSync(join(tmpdir(), 'workflow-approval-')); roots.push(root)
    const file = join(root, 'workflow-approvals.json')
    writeFileSync(file, JSON.stringify({ runs: [] }))
    expect(getWorkflowApproval(root, 'missing')).toBeUndefined()
    expect(JSON.parse(readFileSync(file, 'utf8')).schemaVersion).toBe(1)
    expect(existsSync(`${file}.pre-v020-schema-v0.bak`)).toBe(true)
  })
})
