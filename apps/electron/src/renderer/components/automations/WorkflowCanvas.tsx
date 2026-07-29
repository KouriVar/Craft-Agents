import { useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import type { WorkflowDefinition, WorkflowNode } from '@craft-agent/shared/automations'

export type WorkflowCanvasLayout = Record<string, { x: number; y: number }>
export interface WorkflowCanvasEdge { from: string; to: string }

/** Exposed separately so editor tests and the runner share one graph view. */
export function buildWorkflowCanvasEdges(definition: WorkflowDefinition): WorkflowCanvasEdge[] {
  const edges: WorkflowCanvasEdge[] = []
  for (const node of definition.nodes) {
    if (node.type === 'parallel') { node.branches.forEach((to) => edges.push({ from: node.id, to })); if (node.join) edges.push({ from: node.id, to: node.join }) }
    else if (node.type === 'condition') { if (node.ifTrue) edges.push({ from: node.id, to: node.ifTrue }); if (node.ifFalse) edges.push({ from: node.id, to: node.ifFalse }) }
    else if (node.next) edges.push({ from: node.id, to: node.next })
  }
  return edges
}

const labels: Record<WorkflowNode['type'], string> = { sequence: '顺序', condition: '条件', parallel: '并行', session: '专家 / 会话', connector: '连接器', output: '产出', approval: '审批' }

/**
 * Lightweight graph canvas with no placeholder node palette. Position and edge
 * writes are delegated to the editor, whose validation calls validateWorkflow.
 */
export function WorkflowCanvas({ definition, layout, onLayoutChange, onConnect, onSelect }: {
  definition: WorkflowDefinition; layout: WorkflowCanvasLayout
  onLayoutChange(layout: WorkflowCanvasLayout): void; onConnect?(from: string, to: string): void; onSelect?(nodeId: string): void
}) {
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const panRef = useRef<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const point = (id: string) => layout[id] ?? { x: 80, y: 80 }
  const onWheel = (event: WheelEvent<HTMLDivElement>) => { event.preventDefault(); setView((v) => ({ ...v, scale: Math.max(0.4, Math.min(2.5, v.scale * (event.deltaY > 0 ? .9 : 1.1))) })) }
  const downCanvas = (event: PointerEvent<HTMLDivElement>) => { if (event.target !== event.currentTarget) return; panRef.current = { x: event.clientX - view.x, y: event.clientY - view.y }; event.currentTarget.setPointerCapture(event.pointerId) }
  const move = (event: PointerEvent<HTMLDivElement>) => { if (dragRef.current) { const d = dragRef.current; onLayoutChange({ ...layout, [d.id]: { x: (event.clientX - d.x - view.x) / view.scale, y: (event.clientY - d.y - view.y) / view.scale } }); return } if (panRef.current) setView((v) => ({ ...v, x: event.clientX - panRef.current!.x, y: event.clientY - panRef.current!.y })) }
  const up = () => { panRef.current = null; dragRef.current = null }
  return <div className="relative h-[460px] overflow-hidden rounded-lg border border-border bg-muted/20 touch-none" onWheel={onWheel} onPointerDown={downCanvas} onPointerMove={move} onPointerUp={up}>
    <div className="absolute inset-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
      <svg className="absolute inset-0 h-full w-full overflow-visible pointer-events-none">{buildWorkflowCanvasEdges(definition).map((edge) => { const a = point(edge.from); const b = point(edge.to); return <line key={`${edge.from}:${edge.to}`} x1={a.x + 150} y1={a.y + 34} x2={b.x} y2={b.y + 34} stroke="currentColor" className="text-muted-foreground" strokeWidth="2" /> })}</svg>
      {definition.nodes.map((node) => { const p = point(node.id); return <button type="button" key={node.id} className={`absolute w-36 rounded-md border bg-background px-3 py-2 text-left shadow-sm ${linkFrom === node.id ? 'ring-2 ring-primary' : ''}`} style={{ left: p.x, top: p.y }} onPointerDown={(event) => { event.stopPropagation(); dragRef.current = { id: node.id, x: event.clientX - p.x * view.scale - view.x, y: event.clientY - p.y * view.scale - view.y }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId) }} onClick={(event) => { event.stopPropagation(); onSelect?.(node.id); if (linkFrom && linkFrom !== node.id) { onConnect?.(linkFrom, node.id); setLinkFrom(null) } else setLinkFrom(node.id) }}><span className="block text-[10px] text-muted-foreground">{labels[node.type]}</span><span className="block truncate text-xs font-medium">{node.id}</span></button> })}
    </div>
    <div className="absolute bottom-2 right-2 rounded bg-background/90 px-2 py-1 text-[10px] text-muted-foreground">滚轮缩放 · 拖动画布/节点 · 依次点击两节点连线</div>
  </div>
}
