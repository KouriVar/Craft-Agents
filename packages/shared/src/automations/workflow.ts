/**
 * Executable v0.20 workflow model.
 *
 * The canvas is deliberately only an editor for this graph: every node below
 * has a runner implementation.  Do not add a node here until it can run.
 */
export type WorkflowOutputKind = 'knowledge' | 'project-file'

export type WorkflowNode =
  | { id: string; type: 'sequence'; next?: string }
  | { id: string; type: 'condition'; expression: string; ifTrue?: string; ifFalse?: string }
  | { id: string; type: 'parallel'; branches: string[]; join?: string }
  | { id: string; type: 'session'; prompt: string; expertId?: string; next?: string }
  | { id: string; type: 'connector'; connectorId: string; operation: string; input?: Record<string, unknown>; next?: string }
  | { id: string; type: 'output'; outputKind: WorkflowOutputKind; name: string; content: string; next?: string }
  | { id: string; type: 'approval'; title: string; message?: string; next?: string }

export interface WorkflowDefinition {
  version: 1
  id: string
  name: string
  start: string
  nodes: WorkflowNode[]
  /** Finite per-node retry count. Arbitrary loops remain unsupported. */
  retryLimit?: number
}

export interface WorkflowRunContext {
  /** Creates a Run Session (the source of truth for agent process and permissions). */
  runSession(node: Extract<WorkflowNode, { type: 'session' }>): Promise<{ sessionId: string; value?: unknown }>
  callConnector(node: Extract<WorkflowNode, { type: 'connector' }>): Promise<unknown>
  writeOutput(node: Extract<WorkflowNode, { type: 'output' }>): Promise<{ id: string; path?: string }>
  evaluateCondition(expression: string, values: Readonly<Record<string, unknown>>): Promise<boolean> | boolean
}

export interface WorkflowNodeRun {
  nodeId: string
  type: WorkflowNode['type']
  status: 'completed' | 'skipped' | 'failed' | 'waiting'
  attempt?: number
  error?: string
  value?: unknown
}

export interface WorkflowRunResult { runs: WorkflowNodeRun[]; outputs: Array<{ id: string; path?: string }> }

export interface WorkflowResumeState {
  start: string
  approvalNodeId: string
  runs: WorkflowNodeRun[]
  outputs: Array<{ id: string; path?: string }>
  values: Record<string, unknown>
}

export class WorkflowApprovalRequired extends Error {
  constructor(
    public readonly node: Extract<WorkflowNode, { type: 'approval' }>,
    public readonly state: WorkflowResumeState,
  ) {
    super(`Workflow approval required: ${node.title}`)
    this.name = 'WorkflowApprovalRequired'
  }
}

export class WorkflowApprovalRejected extends Error {
  constructor(public readonly nodeId: string) {
    super('工作流审批已拒绝')
    this.name = 'WorkflowApprovalRejected'
  }
}

/** Small, deterministic condition language; unsupported expressions fail loudly. */
export function evaluateWorkflowCondition(expression: string, values: Readonly<Record<string, unknown>>): boolean {
  const text = expression.trim()
  if (text === 'true') return true
  if (text === 'false') return false
  const exists = /^exists\(([^)]+)\)$/.exec(text)
  if (exists) return values[exists[1]!.trim()] !== undefined
  const comparison = /^([A-Za-z0-9_-]+)\s*(==|!=)\s*(.+)$/.exec(text)
  if (comparison) {
    const actual = values[comparison[1]!]
    let expected: unknown
    try { expected = JSON.parse(comparison[3]!) } catch { expected = comparison[3]!.trim() }
    const equal = JSON.stringify(actual) === JSON.stringify(expected)
    return comparison[2] === '==' ? equal : !equal
  }
  throw new Error(`Unsupported workflow condition: ${expression}`)
}

function links(node: WorkflowNode): string[] {
  if (node.type === 'condition') return [node.ifTrue, node.ifFalse].filter((x): x is string => !!x)
  if (node.type === 'parallel') return [...node.branches, ...(node.join ? [node.join] : [])]
  return node.next ? [node.next] : []
}

/** Rejects missing targets and cycles; arbitrary loops are intentionally unsupported. */
export function validateWorkflow(definition: WorkflowDefinition): string[] {
  const errors: string[] = []
  const byId = new Map<string, WorkflowNode>()
  for (const node of definition.nodes) {
    if (byId.has(node.id)) errors.push(`Duplicate workflow node: ${node.id}`)
    byId.set(node.id, node)
    if (node.type === 'parallel' && node.branches.length === 0) errors.push(`Parallel node ${node.id} needs at least one branch`)
  }
  if (definition.retryLimit !== undefined && (!Number.isInteger(definition.retryLimit) || definition.retryLimit < 0 || definition.retryLimit > 5)) {
    errors.push('Workflow retryLimit must be an integer from 0 to 5')
  }
  if (!byId.has(definition.start)) errors.push(`Workflow start node does not exist: ${definition.start}`)
  for (const node of definition.nodes) for (const target of links(node)) if (!byId.has(target)) errors.push(`Node ${node.id} links to missing node ${target}`)
  const visiting = new Set<string>(); const visited = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) { errors.push(`Workflow cycles are not supported (${id})`); return }
    if (visited.has(id)) return
    visiting.add(id); for (const target of links(byId.get(id)!)) visit(target); visiting.delete(id); visited.add(id)
  }
  if (byId.has(definition.start)) visit(definition.start)
  // A suspended parallel branch cannot be resumed deterministically without
  // replaying its siblings. Keep approval after the join, where its persisted
  // continuation is unambiguous and restart-safe.
  const findApprovalBefore = (id: string | undefined, stop: string | undefined, seen = new Set<string>()): boolean => {
    if (!id || id === stop || seen.has(id)) return false
    seen.add(id)
    const node = byId.get(id)
    if (!node) return false
    if (node.type === 'approval') return true
    if (node.type === 'condition') {
      return findApprovalBefore(node.ifTrue, stop, new Set(seen))
        || findApprovalBefore(node.ifFalse, stop, new Set(seen))
    }
    if (node.type === 'parallel') {
      return node.branches.some((branch) => findApprovalBefore(branch, node.join, new Set(seen)))
        || findApprovalBefore(node.join, stop, new Set(seen))
    }
    return findApprovalBefore(node.next, stop, seen)
  }
  for (const node of definition.nodes) {
    if (node.type === 'parallel' && node.branches.some((branch) => findApprovalBefore(branch, node.join))) {
      errors.push(`Approval nodes cannot run inside parallel branches (${node.id}); place approval after the join`)
    }
  }
  return errors
}

export async function runWorkflow(
  definition: WorkflowDefinition,
  context: WorkflowRunContext,
  resume?: { state: WorkflowResumeState; approved: boolean },
): Promise<WorkflowRunResult> {
  const errors = validateWorkflow(definition)
  if (errors.length) throw new Error(`Invalid workflow: ${errors.join('; ')}`)
  const byId = new Map(definition.nodes.map((node) => [node.id, node]))
  const result: WorkflowRunResult = {
    runs: resume ? [...resume.state.runs] : [],
    outputs: resume ? [...resume.state.outputs] : [],
  }
  const values: Record<string, unknown> = resume ? { ...resume.state.values } : {}
  const execute = async <T>(node: WorkflowNode, operation: () => Promise<T>): Promise<T> => {
    const retries = definition.retryLimit ?? 0
    for (let attempt = 0; ; attempt++) {
      try { return await operation() }
      catch (error) {
        result.runs.push({ nodeId: node.id, type: node.type, status: 'failed', attempt: attempt + 1, error: error instanceof Error ? error.message : String(error) })
        if (attempt >= retries) throw error
      }
    }
  }
  const run = async (id: string | undefined, stopBefore?: string): Promise<void> => {
    if (!id || id === stopBefore) return
    const node = byId.get(id)!
    switch (node.type) {
      case 'sequence': result.runs.push({ nodeId: id, type: node.type, status: 'completed' }); return run(node.next, stopBefore)
      case 'condition': {
        const pass = await context.evaluateCondition(node.expression, values)
        values[id] = pass
        result.runs.push({ nodeId: id, type: node.type, status: 'completed', value: pass })
        return run(pass ? node.ifTrue : node.ifFalse, stopBefore)
      }
      case 'parallel': {
        result.runs.push({ nodeId: id, type: node.type, status: 'completed' })
        await Promise.all(node.branches.map((branch) => run(branch, node.join))); return run(node.join, stopBefore)
      }
      case 'session': {
        const value = await execute(node, () => context.runSession(node)); values[id] = value; result.runs.push({ nodeId: id, type: node.type, status: 'completed', value }); return run(node.next, stopBefore)
      }
      case 'connector': {
        const value = await execute(node, () => context.callConnector(node)); values[id] = value; result.runs.push({ nodeId: id, type: node.type, status: 'completed', value }); return run(node.next, stopBefore)
      }
      case 'output': {
        const output = await execute(node, () => context.writeOutput(node)); values[id] = output; result.outputs.push(output); result.runs.push({ nodeId: id, type: node.type, status: 'completed', value: output }); return run(node.next, stopBefore)
      }
      case 'approval': {
        if (resume?.state.approvalNodeId === id) {
          if (!resume.approved) {
            result.runs.push({ nodeId: id, type: node.type, status: 'failed', error: '工作流审批已拒绝' })
            throw new WorkflowApprovalRejected(id)
          }
          values[id] = true
          result.runs.push({ nodeId: id, type: node.type, status: 'completed', value: true })
          return run(node.next, stopBefore)
        }
        result.runs.push({ nodeId: id, type: node.type, status: 'waiting' })
        throw new WorkflowApprovalRequired(node, {
          start: id,
          approvalNodeId: id,
          runs: [...result.runs],
          outputs: [...result.outputs],
          values: { ...values },
        })
      }
    }
  }
  await run(resume?.state.start ?? definition.start)
  return result
}
