import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readVersionedStore, writeVersionedStore } from '../migrations/versioned-json-store.ts'
import type { WorkflowResumeState } from './workflow.ts'

export type WorkflowApprovalStatus = 'pending' | 'rejected' | 'completed' | 'failed'

export interface PendingWorkflowApproval {
  runId: string
  workflowId: string
  workflowName: string
  approvalNodeId: string
  title: string
  message?: string
  projectId?: string
  state: WorkflowResumeState
  status: WorkflowApprovalStatus
  createdAt: number
  decidedAt?: number
  error?: string
}

interface WorkflowApprovalStore {
  schemaVersion: 1
  runs: PendingWorkflowApproval[]
}

export const WORKFLOW_APPROVAL_STORE_SCHEMA_VERSION = 1 as const
const pathFor = (workspaceRoot: string) => join(workspaceRoot, 'workflow-approvals.json')
const read = (workspaceRoot: string): WorkflowApprovalStore => readVersionedStore({
  filePath: pathFor(workspaceRoot),
  displayName: '工作流审批',
  currentVersion: WORKFLOW_APPROVAL_STORE_SCHEMA_VERSION,
  empty: () => ({ schemaVersion: 1, runs: [] }),
  validate: (value): value is WorkflowApprovalStore => {
    const store = value as Partial<WorkflowApprovalStore>
    return store.schemaVersion === 1 && Array.isArray(store.runs)
  },
  migrateLegacy: (value) => {
    const legacy = value as { runs?: unknown }
    return Array.isArray(legacy.runs) ? { schemaVersion: 1, runs: legacy.runs as PendingWorkflowApproval[] } : null
  },
})

export function savePendingWorkflowApproval(
  workspaceRoot: string,
  input: Omit<PendingWorkflowApproval, 'runId' | 'status' | 'createdAt'> & { runId?: string },
): PendingWorkflowApproval {
  const store = read(workspaceRoot)
  const current = input.runId ? store.runs.find((run) => run.runId === input.runId) : undefined
  const saved: PendingWorkflowApproval = {
    ...input,
    runId: input.runId ?? randomUUID(),
    status: 'pending',
    createdAt: current?.createdAt ?? Date.now(),
  }
  const index = store.runs.findIndex((run) => run.runId === saved.runId)
  if (index === -1) store.runs.push(saved)
  else store.runs[index] = saved
  writeVersionedStore(pathFor(workspaceRoot), store)
  return saved
}

export function getWorkflowApproval(workspaceRoot: string, runId: string): PendingWorkflowApproval | undefined {
  return read(workspaceRoot).runs.find((run) => run.runId === runId)
}

export function finishWorkflowApproval(
  workspaceRoot: string,
  runId: string,
  status: Exclude<WorkflowApprovalStatus, 'pending'>,
  error?: string,
): PendingWorkflowApproval {
  const store = read(workspaceRoot)
  const run = store.runs.find((item) => item.runId === runId)
  if (!run) throw new Error('工作流审批运行不存在')
  run.status = status
  run.decidedAt = Date.now()
  run.error = error
  writeVersionedStore(pathFor(workspaceRoot), store)
  return run
}
