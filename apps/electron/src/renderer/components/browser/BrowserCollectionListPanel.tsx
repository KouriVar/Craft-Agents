import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, ExternalLink, Folder, FolderOpen, FolderPlus, History, Pencil, Pause, Play, RotateCcw, Search, Star, Trash2, Upload, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BrowserDownloadRecord, BrowserHistoryEntry, BrowserBookmarkEntry, BrowserBookmarkFolder } from '../../../shared/types'
import type { BrowserNavigatorKind } from '@/atoms/browser-workspace'
import { cn } from '@/lib/utils'

type CollectionKind = Exclude<BrowserNavigatorKind, 'tabs'>
type CollectionEntry = BrowserBookmarkEntry | BrowserHistoryEntry | BrowserDownloadRecord

const CONFIG = {
  bookmarks: { icon: Star, emptyKey: 'browser.emptyBookmarks', empty: 'No bookmarks yet', descriptionKey: 'browser.emptyBookmarksDescription', description: 'Pages you bookmark will appear here.' },
  history: { icon: History, emptyKey: 'browser.emptyHistory', empty: 'No browsing history yet', descriptionKey: 'browser.emptyHistoryDescription', description: 'Pages you visit will appear here.' },
  downloads: { icon: Download, emptyKey: 'browser.emptyDownloads', empty: 'No downloads yet', descriptionKey: 'browser.emptyDownloadsDescription', description: 'Downloaded files and their progress will appear here.' },
} as const

interface BrowserCollectionListPanelProps {
  kind: CollectionKind
  onOpenUrl: (url: string) => void
}

export function BrowserCollectionListPanel({ kind, onOpenUrl }: BrowserCollectionListPanelProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<CollectionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [folders, setFolders] = useState<BrowserBookmarkFolder[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string>('all')
  const refreshRevisionRef = useRef(0)
  const config = CONFIG[kind]
  const Icon = config.icon
  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const folderFiltered = kind === 'bookmarks' && activeFolderId !== 'all'
      ? entries.filter((entry) => (entry as BrowserBookmarkEntry).folderId === (activeFolderId === 'unfiled' ? null : activeFolderId))
      : entries
    if (!normalized) return folderFiltered
    return folderFiltered.filter((entry) => {
      if ('filename' in entry) return `${entry.filename} ${entry.url}`.toLowerCase().includes(normalized)
      return `${entry.title} ${entry.url}`.toLowerCase().includes(normalized)
    })
  }, [activeFolderId, entries, kind, query])

  const refresh = useCallback(async () => {
    const revision = ++refreshRevisionRef.current
    const api = window.electronAPI.browserPane
    const next = kind === 'bookmarks'
      ? await api.listBookmarks()
      : kind === 'history'
        ? await api.listHistory(500)
        : await api.listDownloads(500)
    const nextFolders = kind === 'bookmarks' ? await api.listBookmarkFolders() : null
    if (revision !== refreshRevisionRef.current) return
    setEntries(next)
    if (nextFolders) setFolders(nextFolders)
    setLoading(false)
  }, [kind])

  useEffect(() => {
    setQuery('')
    setLoading(true)
    void refresh().catch(() => setLoading(false))
    const unsubscribe = window.electronAPI.browserPane.onProfileChanged((changedKind) => {
      if (changedKind === kind) void refresh()
    })
    return () => {
      refreshRevisionRef.current += 1
      unsubscribe()
    }
  }, [kind, refresh])

  const clear = useCallback(async () => {
    if (kind === 'history') await window.electronAPI.browserPane.clearHistory()
    if (kind === 'downloads') await window.electronAPI.browserPane.clearDownloads()
    await refresh()
  }, [kind, refresh])

  const createFolder = useCallback(async () => {
    const name = window.prompt(t('browser.newFolderPrompt', { defaultValue: 'Folder name' }))?.trim()
    if (!name) return
    const folder = await window.electronAPI.browserPane.createBookmarkFolder(name)
    setActiveFolderId(folder.id)
    await refresh()
  }, [refresh, t])

  const renameFolder = useCallback(async (folder: BrowserBookmarkFolder) => {
    const name = window.prompt(t('browser.renameFolderPrompt', { defaultValue: 'Rename folder' }), folder.name)?.trim()
    if (!name || name === folder.name) return
    await window.electronAPI.browserPane.renameBookmarkFolder(folder.id, name)
    await refresh()
  }, [refresh, t])

  const removeFolder = useCallback(async (folder: BrowserBookmarkFolder) => {
    if (!window.confirm(t('browser.removeFolderConfirm', { defaultValue: `Delete “${folder.name}”? Its bookmarks will be kept in Unfiled.`, name: folder.name }))) return
    await window.electronAPI.browserPane.removeBookmarkFolder(folder.id)
    if (activeFolderId === folder.id) setActiveFolderId('all')
    await refresh()
  }, [activeFolderId, refresh, t])

  const importBookmarks = useCallback(async () => {
    const result = await window.electronAPI.browserPane.importBookmarks()
    if (result.canceled) return
    await refresh()
    window.alert(t('browser.importBookmarksComplete', {
      defaultValue: `Imported ${result.imported} bookmarks.`,
      count: result.imported,
    }))
  }, [refresh, t])

  const exportBookmarks = useCallback(async () => {
    const result = await window.electronAPI.browserPane.exportBookmarks()
    if (result.canceled) return
    window.alert(t('browser.exportBookmarksComplete', {
      defaultValue: `Exported ${result.exported} bookmarks.`,
      count: result.exported,
    }))
  }, [t])

  if (!loading && entries.length === 0 && kind !== 'bookmarks') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-5 text-center">
        <div className="flex max-w-[220px] flex-col items-center text-muted-foreground">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-[12px] bg-foreground/[0.04]">
            <Icon className="h-4 w-4" />
          </span>
          <p className="text-sm font-medium text-foreground">{t(config.emptyKey, { defaultValue: config.empty })}</p>
          <p className="mt-1 text-xs leading-relaxed">{t(config.descriptionKey, { defaultValue: config.description })}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {(entries.length > 0 || kind === 'bookmarks') && (
        <div className="flex items-center gap-2 px-3 py-2">
          <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[7px] bg-foreground/[0.04] px-2 py-1.5 text-muted-foreground">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('browser.searchProfile', { defaultValue: 'Search' })}
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/70"
            />
          </label>
          {kind !== 'bookmarks' && (
            <button type="button" onClick={() => void clear()} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
              {t('browser.clearList', { defaultValue: 'Clear' })}
            </button>
          )}
          {kind === 'bookmarks' && (
            <div className="flex shrink-0 items-center">
              <button type="button" onClick={() => void importBookmarks()} className="rounded p-1.5 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground" title={t('browser.importBookmarks', { defaultValue: 'Import bookmarks' })}>
                <Upload className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => void exportBookmarks()} className="rounded p-1.5 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground" title={t('browser.exportBookmarks', { defaultValue: 'Export bookmarks' })}>
                <Download className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => void createFolder()} className="rounded p-1.5 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground" title={t('browser.newFolder', { defaultValue: 'New folder' })}>
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
      {kind === 'bookmarks' && (folders.length > 0 || entries.length > 0) && (
        <div className="max-h-[38%] shrink-0 overflow-y-auto border-b border-border/40 px-2 pb-2">
          <button type="button" onClick={() => setActiveFolderId('all')} className={cn('mb-0.5 flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground', activeFolderId === 'all' && 'bg-foreground/[0.06] text-foreground')}>
            <Star className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">{t('browser.allBookmarks', { defaultValue: 'All bookmarks' })}</span>
            <span className="text-[10px] tabular-nums">{entries.length}</span>
          </button>
          <button type="button" onClick={() => setActiveFolderId('unfiled')} className={cn('mb-0.5 flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground', activeFolderId === 'unfiled' && 'bg-foreground/[0.06] text-foreground')}>
            <Folder className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">{t('browser.unfiledBookmarks', { defaultValue: 'Unfiled' })}</span>
            <span className="text-[10px] tabular-nums">{entries.filter((entry) => !(entry as BrowserBookmarkEntry).folderId).length}</span>
          </button>
          {folders.map((folder) => (
            <div key={folder.id} className={cn('group/folder mb-0.5 flex items-center rounded-[8px] text-xs text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground', activeFolderId === folder.id && 'bg-foreground/[0.06] text-foreground')}>
              <button type="button" onClick={() => setActiveFolderId(folder.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left">
                <Folder className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{folder.name}</span>
                <span className="text-[10px] tabular-nums">{entries.filter((entry) => (entry as BrowserBookmarkEntry).folderId === folder.id).length}</span>
              </button>
              <div className="flex pr-1 opacity-0 group-hover/folder:opacity-100">
                <button type="button" onClick={() => void renameFolder(folder)} className="rounded p-1 hover:bg-foreground/[0.06]" title={t('browser.renameFolder', { defaultValue: 'Rename folder' })}><Pencil className="h-3 w-3" /></button>
                <button type="button" onClick={() => void removeFolder(folder)} className="rounded p-1 hover:bg-foreground/[0.06]" title={t('browser.removeFolder', { defaultValue: 'Delete folder' })}><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!loading && kind === 'bookmarks' && visibleEntries.length === 0 && (
          <div className="flex h-full items-center justify-center px-5 text-center">
            <div className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
              {entries.length === 0
                ? t(config.descriptionKey, { defaultValue: config.description })
                : t('browser.emptyBookmarkFolder', { defaultValue: 'No bookmarks in this folder.' })}
            </div>
          </div>
        )}
        {visibleEntries.map((entry, index) => {
          if (kind === 'downloads') {
            const download = entry as BrowserDownloadRecord
            const progress = download.totalBytes > 0 ? Math.min(100, Math.round(download.bytesReceived / download.totalBytes * 100)) : 0
            return (
              <div key={download.id} className="group mb-1 rounded-[10px] px-3 py-2 hover:bg-foreground/[0.04]">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{download.filename}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{download.state === 'started' ? `${progress}%` : download.state}</p>
                  </div>
                  <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                    {download.state === 'started' && (
                      <button type="button" onClick={() => void window.electronAPI.browserPane.pauseDownload(download.id).then(refresh)} className="rounded p-1 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground" title={t('browser.pauseDownload', { defaultValue: 'Pause' })}><Pause className="h-3.5 w-3.5" /></button>
                    )}
                    {download.state === 'paused' && (
                      <button type="button" onClick={() => void window.electronAPI.browserPane.resumeDownload(download.id).then(refresh)} className="rounded p-1 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground" title={t('browser.resumeDownload', { defaultValue: 'Resume' })}><Play className="h-3.5 w-3.5" /></button>
                    )}
                    {(download.state === 'started' || download.state === 'paused') && (
                      <button type="button" onClick={() => void window.electronAPI.browserPane.cancelDownload(download.id).then(refresh)} className="rounded p-1 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground" title={t('browser.cancelDownload', { defaultValue: 'Cancel' })}><X className="h-3.5 w-3.5" /></button>
                    )}
                    {(download.state === 'interrupted' || download.state === 'cancelled') && (
                      <button type="button" onClick={() => void window.electronAPI.browserPane.retryDownload(download.id).then(refresh)} className="rounded p-1 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground" title={t('browser.retryDownload', { defaultValue: 'Retry' })}><RotateCcw className="h-3.5 w-3.5" /></button>
                    )}
                    {download.savePath && (
                      <>
                      <button type="button" onClick={() => void window.electronAPI.browserPane.openDownload(download.id)} className="rounded p-1 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground" title={t('browser.openDownload', { defaultValue: 'Open' })}><ExternalLink className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => void window.electronAPI.browserPane.showDownload(download.id)} className="rounded p-1 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground" title={t('browser.showInFolder', { defaultValue: 'Show in folder' })}><FolderOpen className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </div>
                </div>
                {(download.state === 'started' || download.state === 'paused') && <div className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/[0.06]"><div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} /></div>}
              </div>
            )
          }

          const page = entry as BrowserBookmarkEntry | BrowserHistoryEntry
          const currentDay = kind === 'history' ? new Date((page as BrowserHistoryEntry).visitedAt).toLocaleDateString() : null
          const previous = index > 0 ? visibleEntries[index - 1] as BrowserHistoryEntry : null
          const previousDay = kind === 'history' && previous ? new Date(previous.visitedAt).toLocaleDateString() : null
          return (
            <Fragment key={page.id}>
              {currentDay && currentDay !== previousDay && (
                <p className="px-3 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">{currentDay}</p>
              )}
              <div className="group mb-1 flex items-center gap-2 rounded-[10px] px-3 py-2 hover:bg-foreground/[0.04]">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onOpenUrl(page.url)}>
                  {page.favicon ? <img src={page.favicon} alt="" className="h-4 w-4 shrink-0 rounded-sm" /> : <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{page.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{kind === 'history' ? new Date((page as BrowserHistoryEntry).visitedAt).toLocaleTimeString() : page.url}</span>
                  </span>
                </button>
                {kind === 'bookmarks' && (
                  <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                    <select
                      value={(page as BrowserBookmarkEntry).folderId ?? ''}
                      onChange={(event) => void window.electronAPI.browserPane.updateBookmark(page.id, { folderId: event.target.value || null }).then(refresh)}
                      className="max-w-[72px] rounded bg-transparent text-[10px] text-muted-foreground outline-none"
                      title={t('browser.moveBookmark', { defaultValue: 'Move bookmark' })}
                    >
                      <option value="">{t('browser.unfiledBookmarks', { defaultValue: 'Unfiled' })}</option>
                      {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                    </select>
                    <button type="button" onClick={() => void window.electronAPI.browserPane.removeBookmark(page.id).then(refresh)} className={cn('rounded p-1 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground')} title={t('browser.removeBookmark', { defaultValue: 'Remove bookmark' })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {kind === 'history' && (
                  <button type="button" onClick={() => void window.electronAPI.browserPane.removeHistoryEntry(page.id).then(refresh)} className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/[0.06] hover:text-foreground group-hover:opacity-100" title={t('browser.removeHistoryEntry', { defaultValue: 'Remove from history' })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
