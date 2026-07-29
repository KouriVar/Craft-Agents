import type { ISessionManager } from '../handlers/session-manager-interface.ts'
import { evaluateWorkflowCondition, type WorkflowRunContext, type WorkflowNode } from '@craft-agent/shared/automations'
import { createWorkflowOutputContext } from './workflow-output-context.ts'

/** Real runtime bindings for Workflow nodes; connector execution is injected, never mocked. */
export function createWorkflowRunContext(input: {
  sessionManager: ISessionManager; workspaceId: string; workspaceRoot: string; workflowName: string; projectId?: string
  evaluateCondition?: WorkflowRunContext['evaluateCondition']
}): WorkflowRunContext {
  const outputs = createWorkflowOutputContext({ workspaceRoot: input.workspaceRoot, workspaceId: input.workspaceId, projectId: input.projectId })
  return {
    async runSession(node: Extract<WorkflowNode, { type: 'session' }>) {
      const result = await input.sessionManager.executePromptAutomation({ workspaceId: input.workspaceId, workspaceRootPath: input.workspaceRoot, prompt: node.prompt, permissionMode: 'ask', automationName: input.workflowName, projectId: input.projectId, expertId: node.expertId, waitForCompletion: true })
      return { sessionId: result.sessionId }
    },
    async callConnector(node: Extract<WorkflowNode, { type: 'connector' }>) {
      // Connectors execute through the normal agent runtime: this creates a
      // Run Session with the usual permission gate and leaves an auditable run.
      // It intentionally does not return a fabricated connector result.
      const request = JSON.stringify(node.input ?? {})
      const result = await input.sessionManager.executePromptAutomation({
        workspaceId: input.workspaceId,
        workspaceRootPath: input.workspaceRoot,
        projectId: input.projectId,
        permissionMode: 'ask',
        automationName: input.workflowName,
        waitForCompletion: true,
        prompt: `Use connector ${node.connectorId} to perform operation ${node.operation}. Input: ${request}. Complete the connector call and report the result.`,
      })
      return { sessionId: result.sessionId }
    },
    writeOutput: outputs.writeOutput,
    evaluateCondition: input.evaluateCondition ?? evaluateWorkflowCondition,
  }
}
