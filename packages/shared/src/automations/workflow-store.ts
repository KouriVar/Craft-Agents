import { join } from 'node:path'
import { readVersionedStore, writeVersionedStore } from '../migrations/versioned-json-store.ts'
import { validateWorkflow, type WorkflowDefinition } from './workflow.ts'

export interface StoredWorkflow extends WorkflowDefinition { layout: Record<string, { x: number; y: number }>; updatedAt: number }
interface WorkflowStore { schemaVersion: 1; workflows: StoredWorkflow[] }
export const WORKFLOW_STORE_SCHEMA_VERSION = 1 as const
const pathFor = (workspaceRoot: string) => join(workspaceRoot, 'workflows.json')
const read = (workspaceRoot: string): WorkflowStore => readVersionedStore({
  filePath: pathFor(workspaceRoot),
  displayName: '工作流',
  currentVersion: WORKFLOW_STORE_SCHEMA_VERSION,
  empty: () => ({ schemaVersion: 1, workflows: [] }),
  validate: (value): value is WorkflowStore => {
    const store = value as Partial<WorkflowStore>
    return store.schemaVersion === 1 && Array.isArray(store.workflows)
  },
  migrateLegacy: (value) => {
    const legacy = value as { version?: unknown; workflows?: unknown }
    return legacy.version === 1 && Array.isArray(legacy.workflows)
      ? { schemaVersion: 1, workflows: legacy.workflows as StoredWorkflow[] }
      : null
  },
})
export function listWorkflows(workspaceRoot: string): StoredWorkflow[] { return read(workspaceRoot).workflows }
export function getWorkflow(workspaceRoot: string, id: string): StoredWorkflow | undefined { return read(workspaceRoot).workflows.find((workflow) => workflow.id === id) }
export function saveWorkflow(workspaceRoot: string, workflow: Omit<StoredWorkflow, 'updatedAt'>): StoredWorkflow {
  const errors = validateWorkflow(workflow)
  if (errors.length) throw new Error(`Invalid workflow: ${errors.join('; ')}`)
  const store = read(workspaceRoot); const saved: StoredWorkflow = { ...workflow, layout: workflow.layout ?? {}, updatedAt: Date.now() }
  const index = store.workflows.findIndex((item) => item.id === workflow.id)
  if (index === -1) store.workflows.push(saved); else store.workflows[index] = saved
  writeVersionedStore(pathFor(workspaceRoot), store)
  return saved
}
export function deleteWorkflow(workspaceRoot: string, id: string): boolean { const store = read(workspaceRoot); const before = store.workflows.length; store.workflows = store.workflows.filter((workflow) => workflow.id !== id); if (before === store.workflows.length) return false; writeVersionedStore(pathFor(workspaceRoot), store); return true }
