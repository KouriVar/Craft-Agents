/**
 * LibraryListPanel — 资源库 navigator list.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAtomValue } from 'jotai'
import { Archive, BrainCircuit, FileText, Search } from 'lucide-react'
import type { MindMapDocument } from '@craft-agent/shared/knowledge'
import { toast } from 'sonner'
import type { LibraryIndexEntry } from '@craft-agent/shared/protocol'
import { projectsAtom } from '@/atoms/projects'
import { resolveLibraryProjectLabel } from '@/lib/library-project-label'
import { navigate, routes } from '@/lib/navigate'
import { EntityRow } from '@/components/ui/entity-row'
import {
  StyledContextMenuItem,
  StyledContextMenuSeparator,
} from '@/components/ui/styled-context-menu'
import { LibraryDeleteConfirmDialog } from './LibraryDeleteConfirmDialog'
import { KnowledgeMindMapDialog } from './KnowledgeMindMapDialog'

export function LibraryListPanel({
  workspaceId,
  filter = 'all',
  selectedDocumentId,
}: {
  workspaceId: string
  filter?: 'all' | 'recent' | 'archived'
  selectedDocumentId?: string | null
}) {
  const { t, i18n } = useTranslation()
  const projects = useAtomValue(projectsAtom)
  const [items, setItems] = useState<LibraryIndexEntry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<LibraryIndexEntry | null>(null)
  const [mindMap, setMindMap] = useState<MindMapDocument | null>(null)
  const [mindMaps, setMindMaps] = useState<MindMapDocument[]>([])
  const [searchVisible, setSearchVisible] = useState(false)

  const reload = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const list = await window.electronAPI.listLibraryDocuments({
        workspaceId,
        filter,
        search: search.trim() || undefined,
        limit: 200,
      })
      setItems(list)
      setMindMaps(await window.electronAPI.listKnowledgeMindMaps({ workspaceId }))
    } catch (error) {
      console.warn('[LibraryListPanel] list failed', error)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [filter, search, workspaceId])

  useEffect(() => {
    void reload()
  }, [reload])

  const importFile = useCallback(async () => {
    const [sourcePath] = await window.electronAPI.openFileDialog({ mode: 'files', title: '导入知识文件' })
    if (!sourcePath) return
    const file = await window.electronAPI.importKnowledgeFile({ workspaceId, sourcePath })
    const state = file.extraction.status === 'extracted' ? '已抽取并可搜索' : file.extraction.status === 'ocr_required' ? '需要 OCR，尚未进入全文检索' : `未抽取：${file.extraction.error ?? file.extraction.status}`
    toast.success(`已导入 ${file.title} · ${state}`)
  }, [workspaceId])
  const createMindMap = useCallback(async () => setMindMap(await window.electronAPI.createKnowledgeMindMap({ workspaceId })), [workspaceId])

  useEffect(() => {
    const onImport = () => { void importFile() }
    const onMindMap = () => { void createMindMap() }
    const onSearch = () => setSearchVisible(value => !value)
    window.addEventListener('craft:library-import', onImport)
    window.addEventListener('craft:library-create-mind-map', onMindMap)
    window.addEventListener('craft:library-toggle-search', onSearch)
    return () => {
      window.removeEventListener('craft:library-import', onImport)
      window.removeEventListener('craft:library-create-mind-map', onMindMap)
      window.removeEventListener('craft:library-toggle-search', onSearch)
    }
  }, [createMindMap, importFile])

  const runItemAction = async (
    item: LibraryIndexEntry,
    action: 'rename' | 'archive' | 'unarchive' | 'delete' | 'export',
  ) => {
    if (action === 'rename') {
      const next = window.prompt(t('library.rename'), item.title)
      if (!next?.trim() || next.trim() === item.title) return
      await window.electronAPI.updateLibraryDocument({
        workspaceId,
        documentId: item.id,
        title: next.trim(),
      })
      await reload()
      return
    }
    if (action === 'archive') {
      await window.electronAPI.archiveLibraryDocument({ workspaceId, documentId: item.id })
      await reload()
      return
    }
    if (action === 'unarchive') {
      await window.electronAPI.unarchiveLibraryDocument({ workspaceId, documentId: item.id })
      await reload()
      return
    }
    if (action === 'delete') {
      setPendingDelete(item)
      return
    }
    if (action === 'export') {
      try {
        const result = await window.electronAPI.exportLibraryDocument({
          workspaceId,
          documentId: item.id,
          keepSourceMarkers: false,
        })
        if (result.canceled) return
        if (result.error) {
          toast.error(t('library.exportFailed', { detail: result.error }))
          return
        }
        const markdown = result.markdown
        if (!markdown) {
          toast.error(t('library.exportFailed', { detail: 'empty' }))
          return
        }
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${(item.title || 'document').replace(/[<>:"/\\|?*]/g, '_')}.md`
        a.click()
        URL.revokeObjectURL(url)
        toast.success(t('library.exportDone'))
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        toast.error(t('library.exportFailed', { detail }))
      }
    }
  }

  const formatDate = (timestamp: number) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(timestamp)

  return (
    <div className="flex h-full flex-col">
      {searchVisible && <div className="border-b border-border/40 px-2 py-2">
        <div className="flex items-center gap-2 rounded-control border border-border/50 bg-background px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('library.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70"
          />
        </div>
      </div>}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {mindMaps.map(map => <button key={map.id} type="button" onClick={() => setMindMap(map)} className="mb-0.5 flex w-full items-center gap-2.5 rounded-surface px-2.5 py-2 text-left hover:bg-foreground/[0.04]"><BrainCircuit className="h-3.5 w-3.5 text-muted-foreground" /><span className="min-w-0"><span className="block truncate text-xs font-medium text-foreground">{map.title}</span><span className="block text-[10px] text-muted-foreground">思维导图 · {map.nodes.length} 节点</span></span></button>)}
        {loading ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">{t('library.loading')}</p>
        ) : items.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-foreground">{t('library.emptyTitle')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('library.emptyDescription')}</p>
          </div>
        ) : (
          items.map((item) => {
            const projectLabel = resolveLibraryProjectLabel(item.projectId, projects)
            const subtitleParts: string[] = [
              t('library.documentKind'),
              formatDate(item.updatedAt),
            ]
            if (item.sessionLinkCount > 0) subtitleParts.push(t('library.sessionCount', { count: item.sessionLinkCount }))
            if (projectLabel) subtitleParts.push(projectLabel.missing ? t('library.projectUnbound', { defaultValue: 'Project no longer exists' }) : (projectLabel.name ?? ''))

            return (
              <EntityRow
                key={item.id}
                icon={item.status === 'archived'
                  ? <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                  : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                title={item.title}
                subtitle={subtitleParts.join(' · ')}
                isSelected={selectedDocumentId === item.id}
                onClick={() => navigate(routes.view.library(item.id))}
                menuContent={<>
                  <StyledContextMenuItem onSelect={() => { void runItemAction(item, 'rename') }}>
                    {t('library.rename')}
                  </StyledContextMenuItem>
                  <StyledContextMenuItem
                    onSelect={() => {
                      void runItemAction(item, item.status === 'archived' ? 'unarchive' : 'archive')
                    }}
                  >
                    {item.status === 'archived' ? t('library.unarchive') : t('library.archive')}
                  </StyledContextMenuItem>
                  <StyledContextMenuItem onSelect={() => { void runItemAction(item, 'export') }}>
                    {t('library.export')}
                  </StyledContextMenuItem>
                  <StyledContextMenuSeparator />
                  <StyledContextMenuItem
                    variant="destructive"
                    onSelect={() => { void runItemAction(item, 'delete') }}
                  >
                    {t('library.delete')}
                  </StyledContextMenuItem>
                </>}
              />
            )
          })
        )}
      </div>

      <LibraryDeleteConfirmDialog
        open={pendingDelete != null}
        documentTitle={pendingDelete?.title ?? ''}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        onConfirm={async () => {
          if (!pendingDelete) return
          await window.electronAPI.deleteLibraryDocument({
            workspaceId,
            documentId: pendingDelete.id,
          })
          if (selectedDocumentId === pendingDelete.id) navigate(routes.view.library())
          await reload()
        }}
      />
      <KnowledgeMindMapDialog map={mindMap} onClose={() => setMindMap(null)} onSave={async next => { const saved = await window.electronAPI.updateKnowledgeMindMap(next); setMindMap(saved); setMindMaps(current => [saved, ...current.filter(item => item.id !== saved.id)]); toast.success('思维导图已保存') }} />
    </div>
  )
}
