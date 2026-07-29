import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { StoredWorkflow, WorkflowDefinition, WorkflowNode } from '@craft-agent/shared/automations'
import { Button } from '@/components/ui/button'
import { WorkflowCanvas, type WorkflowCanvasLayout } from './WorkflowCanvas'

const emptyWorkflow = (): Omit<StoredWorkflow, 'updatedAt'> => ({ version: 1, id: `wf_${Date.now()}`, name: '新工作流', start: 'start', nodes: [{ id: 'start', type: 'sequence' }], layout: { start: { x: 80, y: 100 } } })

/** Persistent editor backed by workflows:* RPC. It exposes no non-runnable node types. */
export function WorkflowEditor({ workspaceId }: { workspaceId: string }) {
  const [workflows, setWorkflows] = useState<StoredWorkflow[]>([])
  const [draft, setDraft] = useState<Omit<StoredWorkflow, 'updatedAt'> | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  useEffect(() => { void window.electronAPI.listWorkflows(workspaceId).then((items) => { setWorkflows(items); setDraft(items[0] ? ({ ...items[0], layout: { ...items[0].layout } }) : emptyWorkflow()) }) }, [workspaceId])
  if (!draft) return null
  const save = async () => { try { const saved = await window.electronAPI.saveWorkflow(workspaceId, draft); setWorkflows((items) => [...items.filter((item) => item.id !== saved.id), saved]); setDraft(saved); toast.success('工作流已保存') } catch (error) { toast.error(error instanceof Error ? error.message : '工作流无效') } }
  const connect = (from: string, to: string) => setDraft((current) => current ? { ...current, nodes: current.nodes.map((node) => {
    if (node.id !== from) return node
    if (node.type === 'condition') return !node.ifTrue ? { ...node, ifTrue: to } : { ...node, ifFalse: to }
    if (node.type === 'parallel') return node.branches.includes(to) ? node : { ...node, branches: [...node.branches, to] }
    return { ...node, next: to }
  }) } : current)
  const addNode = (type: WorkflowNode['type']) => setDraft((current) => {
    if (!current) return current
    const id = `${type}-${current.nodes.filter((node) => node.type === type).length + 1}`
    const node: WorkflowNode = type === 'sequence' ? { id, type } : type === 'condition' ? { id, type, expression: 'true' } : type === 'parallel' ? { id, type, branches: [] } : type === 'session' ? { id, type, prompt: '描述要执行的工作' } : type === 'connector' ? { id, type, connectorId: '连接器标识', operation: '操作名称' } : type === 'approval' ? { id, type, title: '请确认工作流继续执行' } : { id, type, outputKind: 'knowledge', name: '工作流产出', content: '' }
    setSelectedNodeId(id)
    return { ...current, nodes: [...current.nodes, node], layout: { ...current.layout, [id]: { x: 120 + current.nodes.length * 32, y: 140 + current.nodes.length * 28 } } }
  })
  const selected = draft.nodes.find((node) => node.id === selectedNodeId) ?? null
  const updateNode = (patch: Partial<WorkflowNode>) => setDraft((current) => current ? { ...current, nodes: current.nodes.map((node) => node.id === selectedNodeId ? { ...node, ...patch } as WorkflowNode : node) } : current)
  const run = async () => { try { const result = await window.electronAPI.runWorkflow(workspaceId, draft.id); toast.success(result.suspended ? '工作流已暂停，等待审批' : `工作流已完成：${result.runs.length} 个节点`) } catch (error) { toast.error(error instanceof Error ? error.message : '工作流运行失败') } }
  return <div className="flex h-full flex-col gap-3 p-4"><div className="flex flex-wrap items-center gap-2"><select className="rounded border bg-background px-2 py-1 text-sm" value={draft.id} onChange={(event) => { const selected = workflows.find((workflow) => workflow.id === event.target.value); if (selected) { setDraft({ ...selected, layout: { ...selected.layout } }); setSelectedNodeId(null) } }}>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select><Button size="sm" variant="outline" onClick={() => { setDraft(emptyWorkflow()); setSelectedNodeId('start') }}>新建工作流</Button><Button size="sm" onClick={() => void save()}>保存</Button><Button size="sm" variant="secondary" onClick={() => void run()}>运行</Button></div><div className="flex flex-wrap gap-1 rounded border p-2"><span className="mr-1 text-xs text-muted-foreground">添加可执行节点：</span>{(['sequence', 'condition', 'parallel', 'session', 'connector', 'output', 'approval'] as WorkflowNode['type'][]).map((type) => <Button key={type} size="sm" variant="outline" onClick={() => addNode(type)}>{({ sequence: '顺序', condition: '条件', parallel: '并行', session: '专家/会话', connector: '连接器', output: '产出', approval: '审批' } as Record<WorkflowNode['type'], string>)[type]}</Button>)}</div><div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_280px]"><WorkflowCanvas definition={draft as WorkflowDefinition} layout={draft.layout} onLayoutChange={(layout: WorkflowCanvasLayout) => setDraft({ ...draft, layout })} onConnect={connect} onSelect={setSelectedNodeId} /><NodeInspector node={selected} onChange={updateNode} /></div></div>
}

function NodeInspector({ node, onChange }: { node: WorkflowNode | null; onChange(patch: Partial<WorkflowNode>): void }) {
  if (!node) return <div className="rounded border p-3 text-sm text-muted-foreground">选择节点后编辑其真实执行参数。</div>
  const text = (label: string, value: string, key: string) => <label className="block text-xs"><span className="mb-1 block text-muted-foreground">{label}</span><input className="w-full rounded border bg-background px-2 py-1 text-sm" value={value} onChange={(event) => onChange({ [key]: event.target.value } as Partial<WorkflowNode>)} /></label>
  return <div className="space-y-3 rounded border p-3"><div className="text-sm font-medium">{node.id}</div>{node.type === 'condition' && text('条件表达式', node.expression, 'expression')}{node.type === 'session' && <>{text('执行提示', node.prompt, 'prompt')}{text('专家 ID（可选）', node.expertId ?? '', 'expertId')}</>}{node.type === 'connector' && <>{text('连接器 ID', node.connectorId, 'connectorId')}{text('操作', node.operation, 'operation')}</>}{node.type === 'approval' && <>{text('审批标题', node.title, 'title')}{text('审批说明（可选）', node.message ?? '', 'message')}</>}{node.type === 'output' && <>{text('名称', node.name, 'name')}<label className="block text-xs"><span className="mb-1 block text-muted-foreground">产出位置</span><select className="w-full rounded border bg-background px-2 py-1 text-sm" value={node.outputKind} onChange={(event) => onChange({ outputKind: event.target.value as 'knowledge' | 'project-file' })}><option value="knowledge">知识库</option><option value="project-file">项目文件</option></select></label><label className="block text-xs"><span className="mb-1 block text-muted-foreground">内容</span><textarea className="min-h-24 w-full rounded border bg-background px-2 py-1 text-sm" value={node.content} onChange={(event) => onChange({ content: event.target.value })} /></label></>}{node.type === 'parallel' && <p className="text-xs text-muted-foreground">依次连接多个节点建立分支；连接后会并行执行。审批节点必须放在汇合之后。</p>}{node.type === 'condition' && <p className="text-xs text-muted-foreground">依次连接两个节点，分别作为真 / 假分支。</p>}{node.type === 'sequence' && <p className="text-xs text-muted-foreground">连接下一个节点后顺序继续。</p>}{node.type === 'approval' && <p className="text-xs text-muted-foreground">运行会持久化暂停，并在“动态”中等待批准或拒绝；重启应用后仍可继续处理。</p>}</div>
}
