import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { createWorkflowRunContext } from '../../automations/workflow-run-context'

export const HANDLED_CHANNELS = [RPC_CHANNELS.workflows.LIST, RPC_CHANNELS.workflows.SAVE, RPC_CHANNELS.workflows.DELETE, RPC_CHANNELS.workflows.RUN] as const

const activeApprovalResumes = new Set<string>()

async function executeWorkflow(input: {
  workspaceId: string
  workspaceRoot: string
  workflow: import('@craft-agent/shared/automations').StoredWorkflow
  projectId?: string
  deps: HandlerDeps
  runId?: string
  resume?: { state: import('@craft-agent/shared/automations').WorkflowResumeState; approved: boolean }
}): Promise<import('@craft-agent/shared/automations').WorkflowRunResult & { suspended?: boolean; approvalRunId?: string }> {
  const automation = await import('@craft-agent/shared/automations')
  const { createDynamicItem } = await import('@craft-agent/shared/dynamic')
  try {
    const result = await automation.runWorkflow(
      input.workflow,
      createWorkflowRunContext({
        sessionManager: input.deps.sessionManager,
        workspaceId: input.workspaceId,
        workspaceRoot: input.workspaceRoot,
        workflowName: input.workflow.name,
        projectId: input.projectId,
      }),
      input.resume,
    )
    const sessionId = result.runs.map((run) => (run.value as { sessionId?: string } | undefined)?.sessionId).find(Boolean)
    if (input.runId) automation.finishWorkflowApproval(input.workspaceRoot, input.runId, 'completed')
    await automation.appendAutomationHistoryEntry(input.workspaceRoot, {
      id: input.workflow.id,
      ts: Date.now(),
      ok: true,
      sessionId,
      workflow: true,
      nodeRuns: result.runs.length,
      approvalRunId: input.runId,
    })
    return result
  } catch (error) {
    if (error instanceof automation.WorkflowApprovalRequired) {
      const pending = automation.savePendingWorkflowApproval(input.workspaceRoot, {
        runId: input.runId,
        workflowId: input.workflow.id,
        workflowName: input.workflow.name,
        approvalNodeId: error.node.id,
        title: error.node.title,
        message: error.node.message,
        projectId: input.projectId,
        state: error.state,
      })
      createDynamicItem(input.workspaceRoot, {
        kind: 'permission',
        title: error.node.title,
        body: error.node.message ?? `工作流“${input.workflow.name}”已暂停，等待你的决定。`,
        automationId: input.workflow.id,
        projectId: input.projectId,
        source: {
          runId: pending.runId,
          projectId: input.projectId,
          requestId: `workflow-approval:${error.node.id}`,
        },
        requiresAction: true,
        priority: 'high',
      })
      return { runs: error.state.runs, outputs: error.state.outputs, suspended: true, approvalRunId: pending.runId }
    }
    const message = error instanceof Error ? error.message : String(error)
    if (input.runId) automation.finishWorkflowApproval(input.workspaceRoot, input.runId, 'failed', message)
    await automation.appendAutomationHistoryEntry(input.workspaceRoot, {
      id: input.workflow.id,
      ts: Date.now(),
      ok: false,
      error: message,
      workflow: true,
      approvalRunId: input.runId,
    })
    createDynamicItem(input.workspaceRoot, {
      kind: 'automation',
      title: '工作流运行失败',
      body: `${input.workflow.name}：${message}`,
      automationId: input.workflow.id,
      projectId: input.projectId,
      source: { projectId: input.projectId, runId: input.runId },
      requiresAction: true,
      priority: 'high',
    })
    throw error
  }
}

/** Resume a persisted approval. The file-backed continuation makes this work
 * after an app restart; the in-process claim prevents double-click execution. */
export async function respondWorkflowApproval(input: {
  workspaceId: string
  workspaceRoot: string
  runId: string
  requestId: string
  allowed: boolean
  deps: HandlerDeps
}): Promise<boolean> {
  const automation = await import('@craft-agent/shared/automations')
  const pending = automation.getWorkflowApproval(input.workspaceRoot, input.runId)
  if (!pending || pending.status !== 'pending') throw new Error('工作流审批已处理或不存在')
  if (input.requestId !== `workflow-approval:${pending.approvalNodeId}`) throw new Error('工作流审批来源不匹配')
  const claim = `${input.workspaceRoot}:${input.runId}`
  if (activeApprovalResumes.has(claim)) throw new Error('工作流审批正在处理')
  activeApprovalResumes.add(claim)
  try {
    if (!input.allowed) {
      automation.finishWorkflowApproval(input.workspaceRoot, input.runId, 'rejected', '工作流审批已拒绝')
      await automation.appendAutomationHistoryEntry(input.workspaceRoot, {
        id: pending.workflowId,
        ts: Date.now(),
        ok: false,
        rejected: true,
        error: '工作流审批已拒绝',
        workflow: true,
        approvalRunId: input.runId,
      })
      return true
    }
    const workflow = automation.getWorkflow(input.workspaceRoot, pending.workflowId)
    if (!workflow) {
      automation.finishWorkflowApproval(input.workspaceRoot, input.runId, 'failed', '工作流定义已不存在')
      throw new Error('工作流定义已不存在，无法继续审批后的运行')
    }
    try {
      await executeWorkflow({
        workspaceId: input.workspaceId,
        workspaceRoot: input.workspaceRoot,
        workflow,
        projectId: pending.projectId,
        deps: input.deps,
        runId: input.runId,
        resume: { state: pending.state, approved: true },
      })
    } catch {
      // executeWorkflow already persisted the failure and created an actionable
      // Dynamic item. The approval decision itself was delivered successfully.
    }
    return true
  } finally {
    activeApprovalResumes.delete(claim)
  }
}

export function registerWorkflowHandlers(server: RpcServer, deps: HandlerDeps): void {
  const root = (workspaceId: string) => { const workspace = getWorkspaceByNameOrId(workspaceId); if (!workspace) throw new Error('Workspace not found'); return workspace.rootPath }
  server.handle(RPC_CHANNELS.workflows.LIST, async (_ctx, workspaceId: string) => { const { listWorkflows } = await import('@craft-agent/shared/automations'); return listWorkflows(root(workspaceId)) })
  server.handle(RPC_CHANNELS.workflows.SAVE, async (_ctx, workspaceId: string, workflow: Omit<import('@craft-agent/shared/automations').StoredWorkflow, 'updatedAt'>) => { const { saveWorkflow } = await import('@craft-agent/shared/automations'); return saveWorkflow(root(workspaceId), workflow) })
  server.handle(RPC_CHANNELS.workflows.DELETE, async (_ctx, workspaceId: string, id: string) => { const { deleteWorkflow } = await import('@craft-agent/shared/automations'); return deleteWorkflow(root(workspaceId), id) })
  server.handle(RPC_CHANNELS.workflows.RUN, async (_ctx, workspaceId: string, id: string, projectId?: string) => {
    const workspaceRoot = root(workspaceId)
    const { getWorkflow } = await import('@craft-agent/shared/automations')
    const workflow = getWorkflow(workspaceRoot, id)
    if (!workflow) throw new Error('Workflow not found')
    return executeWorkflow({ workspaceId, workspaceRoot, workflow, projectId, deps })
  })
}
