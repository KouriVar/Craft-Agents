/**
 * LibraryListPanel — 资源库 navigator list.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, FileText, Plus, Search } from 'lucide-react'
import type { LibraryIndexEntry } from '@craft-agent/shared/protocol'
import { cn } from '@/lib/utils'
import { navigate, routes } from '@/lib/navigate'

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
  const [items, setItems] = useState<LibraryIndexEntry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [menuFor, setMenuFor] = useState<string | null>(null)

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

  const createBlank = async () => {
    const doc = await window.electronAPI.createLibraryDocument({ workspaceId })
    navigate(routes.view.library(doc.meta.id))
  }

  const runItemAction = async (
    item: LibraryIndexEntry,
    action: 'rename' | 'archive' | 'unarchive' | 'delete' | 'export',
  ) => {
    setMenuFor(null)
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
      if (!window.confirm(t('library.deleteConfirm'))) return
      await window.electronAPI.deleteLibraryDocument({ workspaceId, documentId: item.id })
      if (selectedDocumentId === item.id) navigate(routes.view.library())
      await reload()
      return
    }
    if (action === 'export') {
      const result = await window.electronAPI.exportLibraryDocument({
        workspaceId,
        documentId: item.id,
        keepSourceMarkers: false,
      })
      const blob = new Blob([result.markdown || ''], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(item.title || 'document').replace(/[<>:"/\\|?*]/g, '_')}.md`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="flex h-full flex-col" onClick={() => setMenuFor(null)}>
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-foreground">{t('library.title')}</p>
          <p className="text-[11px] text-muted-foreground">{t('library.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => { void createBlank() }}
          className="inline-flex h-7 items-center gap-1 rounded-control bg-foreground/[0.05] px-2 text-xs font-medium text-foreground hover:bg-foreground/[0.08]"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('library.newDocument')}
        </button>
      </div>

      <div className="flex gap-1 border-b border-border/40 px-2 py-1.5">
        {([
          ['all', t('library.filterAll')],
          ['recent', t('library.filterRecent')],
          ['archived', t('library.filterArchived')],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => navigate(
              key === 'archived' ? routes.view.libraryArchived()
                : key === 'recent' ? routes.view.libraryRecent()
                  : routes.view.library(),
            )}
            className={cn(
              'rounded-control px-2 py-1 text-[11px] font-medium transition-colors',
              filter === key ? 'bg-foreground/[0.07] text-foreground' : 'text-muted-foreground hover:bg-foreground/[0.04]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-2 py-2">
        <div className="flex items-center gap-2 rounded-control border border-border/50 bg-background px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('library.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {loading ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">{t('library.loading')}</p>
        ) : items.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-foreground">{t('library.emptyTitle')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('library.emptyDescription')}</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="relative">
              <button
                type="button"
                onClick={() => navigate(routes.view.library(item.id))}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenuFor(item.id)
                }}
                className={cn(
                  'mb-0.5 flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors',
                  selectedDocumentId === item.id ? 'bg-foreground/[0.07]' : 'hover:bg-foreground/[0.04]',
                )}
              >
                {item.status === 'archived'
                  ? <Archive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  : <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">{item.title}</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {t('library.documentKind')}
                    {' · '}
                    {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    }).format(item.updatedAt)}
                    {item.sessionLinkCount > 0 && ` · ${t('library.sessionCount', { count: item.sessionLinkCount })}`}
                    {item.projectId ? ` · ${item.projectId}` : ''}
                  </span>
                </span>
              </button>
              {menuFor === item.id && (
                <div
                  className="absolute right-1 top-8 z-20 min-w-[140px] rounded-[8px] border border-border/60 bg-background py-1 shadow-modal-small"
                  onClick={(e) => e.stopPropagation()}
                >
                  {([
                    ['rename', t('library.rename')] as const,
                    (item.status === 'archived'
                      ? ['unarchive', t('library.unarchive')] as const
                      : ['archive', t('library.archive')] as const),
                    ['export', t('library.export')] as const,
                    ['delete', t('library.delete')] as const,
                  ]).map(([action, label]) => (
                    <button
                      key={action}
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-xs hover:bg-foreground/[0.05]"
                      onClick={() => { void runItemAction(item, action) }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <p className="border-t border-border/40 px-3 py-2 text-[10px] text-muted-foreground">
        {t('library.pendingComingSoon')}
      </p>
    </div>
  )
}
