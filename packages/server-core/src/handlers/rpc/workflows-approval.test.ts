import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  getWorkflowApproval,
  savePendingWorkflowApproval,
  saveWorkflow,
} from '@craft-agent/shared/automations'
import type { HandlerDeps } from '../handler-deps'
import { respondWorkflowApproval } from './workflows.ts'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
const deps = { sessionManager: {} } as HandlerDeps

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'workflow-approval-rpc-')); roots.push(root)
  saveWorkflow(root, {
    version: 1,
    id: 'wf',
    name: 'Workflow',
    start: 'gate',
    nodes: [
      { id: 'gate', type: 'approval', title: '批准继续', next: 'done' },
      { id: 'done', type: 'sequence' },
    ],
    layout: {},
  })
  const pending = savePendingWorkflowApproval(root, {
    workflowId: 'wf',
    workflowName: 'Workflow',
    approvalNodeId: 'gate',
    title: '批准继续',
    state: {
      start: 'gate',
      approvalNodeId: 'gate',
      runs: [{ nodeId: 'gate', type: 'approval', status: 'waiting' }],
      outputs: [],
      values: {},
    },
  })
  return { root, pending }
}

test('approved workflow continuation resumes from disk and becomes completed exactly once', async () => {
  const { root, pending } = fixture()
  expect(await respondWorkflowApproval({
    workspaceId: 'workspace',
    workspaceRoot: root,
    runId: pending.runId,
    requestId: 'workflow-approval:gate',
    allowed: true,
    deps,
  })).toBe(true)
  expect(getWorkflowApproval(root, pending.runId)?.status).toBe('completed')
  await expect(respondWorkflowApproval({
    workspaceId: 'workspace',
    workspaceRoot: root,
    runId: pending.runId,
    requestId: 'workflow-approval:gate',
    allowed: true,
    deps,
  })).rejects.toThrow('已处理')
})

test('rejected workflow continuation records a deterministic terminal state', async () => {
  const { root, pending } = fixture()
  expect(await respondWorkflowApproval({
    workspaceId: 'workspace',
    workspaceRoot: root,
    runId: pending.runId,
    requestId: 'workflow-approval:gate',
    allowed: false,
    deps,
  })).toBe(true)
  expect(getWorkflowApproval(root, pending.runId)).toMatchObject({ status: 'rejected', error: '工作流审批已拒绝' })
})
