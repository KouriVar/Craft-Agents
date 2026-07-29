import { describe, expect, it } from 'bun:test'
import { buildWorkflowCanvasEdges } from '../WorkflowCanvas.tsx'
import type { WorkflowDefinition } from '@craft-agent/shared/automations'
describe('WorkflowCanvas', () => it('renders edges exclusively from executable workflow nodes', () => {
  const workflow: WorkflowDefinition = { version: 1, id: 'wf', name: 'wf', start: 'a', nodes: [{ id: 'a', type: 'sequence', next: 'b' }, { id: 'b', type: 'condition', expression: 'x', ifTrue: 'c', ifFalse: 'd' }, { id: 'c', type: 'parallel', branches: ['d'], join: 'e' }, { id: 'd', type: 'output', outputKind: 'knowledge', name: 'x', content: 'x' }, { id: 'e', type: 'output', outputKind: 'project-file', name: 'y', content: 'y' }] }
  expect(buildWorkflowCanvasEdges(workflow)).toEqual([{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }, { from: 'c', to: 'e' }])
}))
