import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, File, FileCode, FileText, Folder, FolderOpen, Image, RefreshCw } from 'lucide-react'
import type { DirectoryListingResult } from '../../../shared/types'
import { cn } from '@/lib/utils'
import { useAppShellContext } from '@/context/AppShellContext'

interface WorkspaceFileBrowserProps {
  rootPath?: string
  className?: string
}

function getEntryIcon(entry: DirectoryListingResult['entries'][number], isCurrent = false) {
  const iconClass = 'h-3.5 w-3.5 text-muted-foreground shrink-0'
  const type = entry.type ?? 'directory'
  if (type === 'directory') {
    return isCurrent ? <FolderOpen className={iconClass} /> : <Folder className={iconClass} />
  }

  const ext = entry.name.split('.').pop()?.toLowerCase()
  if (ext === 'md' || ext === 'markdown' || ext === 'txt') return <FileText className={iconClass} />
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext || '')) return <Image className={iconClass} />
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'yaml', 'yml', 'py', 'rb', 'go', 'rs', 'css', 'html'].includes(ext || '')) return <FileCode className={iconClass} />
  return <File className={iconClass} />
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function WorkspaceFileBrowser({ rootPath, className }: WorkspaceFileBrowserProps) {
  const { t } = useTranslation()
  const { onOpenFile } = useAppShellContext()
  const [currentPath, setCurrentPath] = React.useState(rootPath ?? '')
  const [listing, setListing] = React.useState<DirectoryListingResult | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setCurrentPath(rootPath ?? '')
  }, [rootPath])

  const loadPath = React.useCallback(async (path: string) => {
    if (!path) {
      setListing(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.listServerDirectory(path)
      setListing(result)
      setCurrentPath(result.currentPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list directory')
      setListing(null)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadPath(currentPath)
  }, [currentPath, loadPath])

  const handleEntryClick = React.useCallback((entry: DirectoryListingResult['entries'][number]) => {
    const type = entry.type ?? 'directory'
    if (type === 'directory') {
      setCurrentPath(entry.path)
    } else {
      onOpenFile(entry.path)
    }
  }, [onOpenFile])

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="flex shrink-0 items-center gap-1.5 px-3 py-2 border-b border-border/50">
        <div className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={listing?.currentPath ?? currentPath}>
          {(listing?.currentPath ?? currentPath) || t('chat.chooseWorkingDirectory')}
        </div>
        <button
          type="button"
          onClick={() => void loadPath(currentPath)}
          disabled={!currentPath || loading}
          className="h-7 w-7 shrink-0 rounded-menu-item text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors flex items-center justify-center disabled:opacity-40"
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {listing && (
        <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto px-3 py-2 text-xs text-muted-foreground border-b border-border/50">
          {listing.breadcrumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex shrink-0 items-center gap-0.5">
              {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
              <button
                type="button"
                onClick={() => setCurrentPath(crumb.path)}
                className="hover:text-foreground transition-colors"
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2">
        {error && (
          <div className="px-4 text-xs text-destructive">{error}</div>
        )}

        {!error && loading && (
          <div className="px-4 text-xs text-muted-foreground">Loading...</div>
        )}

        {!error && !loading && listing?.entries.length === 0 && (
          <div className="px-4 text-xs text-muted-foreground">No files</div>
        )}

        {!error && listing && (
          <nav className="grid gap-0.5 px-2">
            {listing.entries.map((entry) => {
              const type = entry.type ?? 'directory'
              return (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => handleEntryClick(entry)}
                  className="grid h-8 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-control px-2 text-left text-sm text-foreground/85 hover:bg-sidebar-hover transition-colors"
                  title={entry.path}
                >
                  {getEntryIcon(entry)}
                  <span className="truncate">{entry.name}</span>
                  {type === 'file' && entry.size !== undefined && (
                    <span className="text-[10px] text-muted-foreground">{formatFileSize(entry.size)}</span>
                  )}
                </button>
              )
            })}
          </nav>
        )}
      </div>
    </div>
  )
}
