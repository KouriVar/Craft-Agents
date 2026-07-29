import { useEffect, useState } from 'react'
import type { MindMapDocument } from '@craft-agent/shared/knowledge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function KnowledgeMindMapDialog({ map, onClose, onSave }: { map: MindMapDocument | null; onClose: () => void; onSave: (map: MindMapDocument) => Promise<void> }) {
  const [draft, setDraft] = useState<MindMapDocument | null>(map)
  const [busy, setBusy] = useState(false)
  useEffect(() => setDraft(map), [map])
  if (!draft) return null
  const addNode = () => setDraft({ ...draft, nodes: [...draft.nodes, { id: `node_${Date.now()}`, text: '新节点', x: 80 + draft.nodes.length * 35, y: 100 + draft.nodes.length * 25, parentId: 'root' }] })
  return <Dialog open={Boolean(map)} onOpenChange={open => !open && onClose()}>
    <DialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle>{draft.title}</DialogTitle><DialogDescription>思维导图独立保存，不会转换为 Markdown 或普通文件。</DialogDescription></DialogHeader>
      <div className="relative h-80 overflow-hidden rounded-control border border-border/60 bg-muted/20">
        {draft.nodes.map(node => <div key={node.id} className="absolute rounded-control border border-border bg-background px-2 py-1 text-xs shadow-xs" style={{ left: node.x, top: node.y }}>{node.text}</div>)}
      </div>
      <div className="flex gap-2"><Button variant="outline" size="sm" onClick={addNode}>添加节点</Button><input className="min-w-0 flex-1 rounded-control border border-border bg-background px-2 text-sm" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} aria-label="思维导图标题" /></div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>取消</Button><Button disabled={busy} onClick={() => { setBusy(true); void onSave(draft).finally(() => setBusy(false)) }}>保存思维导图</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
