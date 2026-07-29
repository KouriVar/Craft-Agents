import { describe, expect, it } from 'bun:test'
import { runWorkflow, validateWorkflow, WorkflowApprovalRejected, WorkflowApprovalRequired, type WorkflowDefinition } from '../workflow.ts'

describe('v0.20 executable workflow', () => {
  it('executes every supported node type and persists output through its supplied sink', async () => {
    const definition: WorkflowDefinition = { version: 1, id: 'wf', name: 'Test', start: 'start', nodes: [
      { id: 'start', type: 'sequence', next: 'when' },
      { id: 'when', type: 'condition', expression: 'approved', ifTrue: 'fanout', ifFalse: 'file' },
      { id: 'fanout', type: 'parallel', branches: ['session', 'connector'], join: 'knowledge' },
      { id: 'session', type: 'session', prompt: 'summarize' },
      { id: 'connector', type: 'connector', connectorId: 'mail', operation: 'list' },
      { id: 'knowledge', type: 'output', outputKind: 'knowledge', name: 'Summary', content: 'done' },
      { id: 'file', type: 'output', outputKind: 'project-file', name: 'Skipped', content: 'no' },
    ] }
    const calls: string[] = []
    const result = await runWorkflow(definition, {
      evaluateCondition: () => true,
      runSession: async () => { calls.push('session'); return { sessionId: 'run-session' } },
      callConnector: async () => { calls.push('connector'); return { ok: true } },
      writeOutput: async (node) => { calls.push(node.outputKind); return { id: node.name } },
    })
    expect(calls.sort()).toEqual(['connector', 'knowledge', 'session'])
    expect(result.runs.map((run) => run.type).sort()).toEqual(['condition', 'connector', 'output', 'parallel', 'sequence', 'session'])
    expect(result.outputs).toEqual([{ id: 'Summary' }])
  })

  it('rejects loops and missing node references before a run starts', () => {
    const invalid = { version: 1, id: 'bad', name: 'Bad', start: 'a', nodes: [{ id: 'a', type: 'sequence', next: 'b' }, { id: 'b', type: 'sequence', next: 'a' }] } as WorkflowDefinition
    expect(validateWorkflow(invalid).join(' ')).toContain('cycles are not supported')
  })

  it('runs a parallel join once and applies finite retries', async () => {
    const definition: WorkflowDefinition = {
      version: 1, id: 'retry', name: 'Retry', start: 'fan', retryLimit: 1,
      nodes: [
        { id: 'fan', type: 'parallel', branches: ['left', 'right'], join: 'join' },
        { id: 'left', type: 'session', prompt: 'left', next: 'join' },
        { id: 'right', type: 'connector', connectorId: 'demo', operation: 'read', next: 'join' },
        { id: 'join', type: 'output', outputKind: 'knowledge', name: 'done', content: 'done' },
      ],
    }
    let connectorAttempts = 0
    let outputWrites = 0
    const result = await runWorkflow(definition, {
      evaluateCondition: () => true,
      runSession: async () => ({ sessionId: 'left' }),
      callConnector: async () => {
        connectorAttempts += 1
        if (connectorAttempts === 1) throw new Error('temporary')
        return { ok: true }
      },
      writeOutput: async () => { outputWrites += 1; return { id: 'done' } },
    })
    expect(connectorAttempts).toBe(2)
    expect(outputWrites).toBe(1)
    expect(result.runs.filter((run) => run.status === 'failed')).toHaveLength(1)
  })

  it('persists a deterministic approval continuation and resumes without replaying completed nodes', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      id: 'approval',
      name: 'Approval',
      start: 'before',
      nodes: [
        { id: 'before', type: 'session', prompt: 'before', next: 'gate' },
        { id: 'gate', type: 'approval', title: '继续？', next: 'after' },
        { id: 'after', type: 'output', outputKind: 'knowledge', name: 'done', content: 'done' },
      ],
    }
    let sessions = 0
    const context = {
      evaluateCondition: () => true,
      runSession: async () => { sessions += 1; return { sessionId: 'before' } },
      callConnector: async () => ({}),
      writeOutput: async () => ({ id: 'done' }),
    }
    let suspended: WorkflowApprovalRequired | undefined
    try { await runWorkflow(definition, context) } catch (error) {
      expect(error).toBeInstanceOf(WorkflowApprovalRequired)
      suspended = error as WorkflowApprovalRequired
    }
    expect(suspended?.state.approvalNodeId).toBe('gate')
    const resumed = await runWorkflow(definition, context, { state: suspended!.state, approved: true })
    expect(sessions).toBe(1)
    expect(resumed.runs.at(-1)).toMatchObject({ nodeId: 'after', status: 'completed' })
    await expect(runWorkflow(definition, context, { state: suspended!.state, approved: false })).rejects.toBeInstanceOf(WorkflowApprovalRejected)
  })

  it('rejects approvals inside parallel branches so restart never replays a sibling', () => {
    const definition: WorkflowDefinition = {
      version: 1,
      id: 'parallel-approval',
      name: 'Parallel approval',
      start: 'fan',
      nodes: [
        { id: 'fan', type: 'parallel', branches: ['gate', 'other'], join: 'done' },
        { id: 'gate', type: 'approval', title: 'unsafe', next: 'done' },
        { id: 'other', type: 'sequence', next: 'done' },
        { id: 'done', type: 'sequence' },
      ],
    }
    expect(validateWorkflow(definition).join(' ')).toContain('place approval after the join')
  })
})
