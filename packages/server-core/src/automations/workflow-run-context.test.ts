import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkflowRunContext } from './workflow-run-context.ts'

describe('workflow run context', () => {
  test('starts auditable Run Sessions for expert and connector nodes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'workflow-run-'))
    const calls: Array<Record<string, unknown>> = []
    const sessionManager = { executePromptAutomation: async (input: Record<string, unknown>) => { calls.push(input); return { sessionId: `run_${calls.length}` } } }
    const context = createWorkflowRunContext({ sessionManager: sessionManager as never, workspaceId: 'ws', workspaceRoot: root, workflowName: 'nightly', projectId: 'project-a' })
    await context.runSession({ id: 'expert', type: 'session', prompt: 'analyse', expertId: 'expert-a' })
    await context.callConnector({ id: 'connector', type: 'connector', connectorId: 'mail', operation: 'send', input: { to: 'a@example.test' } })
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ permissionMode: 'ask', expertId: 'expert-a', projectId: 'project-a', waitForCompletion: true })
    expect(calls[1]).toMatchObject({ permissionMode: 'ask', projectId: 'project-a', waitForCompletion: true })
    expect(calls[1].prompt).toContain('connector mail')
    rmSync(root, { recursive: true, force: true })
  })
})
