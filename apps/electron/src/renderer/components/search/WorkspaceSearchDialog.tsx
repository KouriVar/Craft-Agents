import { useEffect, useState } from 'react'
import type { SearchIndexEntry } from '@craft-agent/shared/search-index'
import { BookOpen, FolderKanban, Globe, MessageSquare, Search, Settings, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { navigate, routes } from '@/lib/navigate'

interface WorkspaceSearchDialogProps {
  workspaceId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onNewChat?: () => void
  onOpenBrowserUrl?: (url: string) => void
  sessionEntries?: Array<{ id: string; title: string; text: string; updatedAt: number }>
}

interface QuickAction {
  id: string
  title: string
  shortcut?: string
  icon: typeof Search
  action: () => void
}

const kindLabels: Record<SearchIndexEntry['kind'], string> = {
  session: '聊天',
  knowledge: '知识库',
  file: '文件',
  project: '项目',
  'browser-history': '浏览历史',
  expert: '专家',
  skill: '技能',
  'setting-command': '设置',
}

export function WorkspaceSearchDialog({
  workspaceId,
  open,
  onOpenChange,
  onNewChat,
  onOpenBrowserUrl,
  sessionEntries = [],
}: WorkspaceSearchDialogProps) {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<SearchIndexEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const hasQuery = query.trim().length > 0

  const closeAndRun = (action: () => void) => {
    onOpenChange(false)
    action()
  }

  const quickActions: QuickAction[] = [
    {
      id: 'new-chat',
      title: '新建会话',
      shortcut: '⌘N',
      icon: MessageSquare,
      action: () => closeAndRun(() => onNewChat?.()),
    },
    {
      id: 'projects',
      title: '打开项目',
      icon: FolderKanban,
      action: () => closeAndRun(() => navigate(routes.view.projects())),
    },
    {
      id: 'library',
      title: '打开知识库',
      icon: BookOpen,
      action: () => closeAndRun(() => navigate(routes.view.library())),
    },
    {
      id: 'settings',
      title: '设置',
      icon: Settings,
      action: () => closeAndRun(() => navigate(routes.view.settings())),
    },
  ]

  useEffect(() => {
    if (!open) return
    setQuery('')
    setEntries([])
    setLoading(false)
    setSelectedIndex(0)
  }, [open])

  useEffect(() => {
    const normalizedQuery = query.trim()
    if (!workspaceId || !normalizedQuery) {
      setEntries([])
      setLoading(false)
      return
    }

    let disposed = false
    const terms = normalizedQuery.toLowerCase().split(/\s+/).filter(Boolean)
    const localSessionMatches: SearchIndexEntry[] = sessionEntries
      .filter((entry) => {
        const haystack = `${entry.title}\n${entry.text}`.toLowerCase()
        return terms.every((term) => haystack.includes(term))
      })
      .map((entry) => ({
        id: `session:${entry.id}`,
        kind: 'session' as const,
        title: entry.title,
        text: entry.text,
        updatedAt: entry.updatedAt,
        workspaceId,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)

    setEntries(localSessionMatches.slice(0, 30))
    setLoading(true)
    const timer = setTimeout(() => {
      void window.electronAPI
        .searchWorkspace({ workspaceId, query: normalizedQuery, limit: 30 })
        .then((result) => {
          if (disposed) return
          const merged = new Map<string, SearchIndexEntry>()
          for (const entry of [...localSessionMatches, ...result.entries]) merged.set(entry.id, entry)
          setEntries([...merged.values()].slice(0, 30))
        })
        .catch(() => {
          if (!disposed) setEntries([])
        })
        .finally(() => {
          if (!disposed) setLoading(false)
        })
    }, 120)

    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [workspaceId, query, sessionEntries])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const openResult = (entry: SearchIndexEntry) => {
    onOpenChange(false)
    if (entry.kind === 'session') navigate(routes.view.allSessions(entry.id.replace(/^session:/, '')))
    else if (entry.kind === 'knowledge' || entry.kind === 'file') navigate(routes.view.library(entry.id.replace(/^(knowledge|file):/, '')))
    else if (entry.kind === 'project') navigate(routes.view.projects(entry.id.replace(/^project:/, '')))
    else if (entry.kind === 'skill' || entry.kind === 'expert') navigate(routes.view.skills())
    else if (entry.kind === 'setting-command') navigate(routes.view.settings())
    else if (entry.kind === 'browser-history') onOpenBrowserUrl?.(entry.text)
  }

  const activeItemCount = hasQuery ? entries.length : quickActions.length
  const activateSelected = () => {
    if (hasQuery) {
      const entry = entries[selectedIndex]
      if (entry) openResult(entry)
      return
    }
    quickActions[selectedIndex]?.action()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[458px] w-[488px] max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-modal p-0"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>搜索</DialogTitle>
        </DialogHeader>

        <div className="flex h-[58px] items-center gap-3 border-b border-border/70 px-5">
          <Search className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.7} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelectedIndex((current) => (activeItemCount ? (current + 1) % activeItemCount : 0))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelectedIndex((current) => (activeItemCount ? (current - 1 + activeItemCount) % activeItemCount : 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                activateSelected()
              }
            }}
            placeholder="搜索会话、知识、文件、项目、历史、技能和设置…"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/75"
          />
          <kbd className="rounded-control bg-foreground/[0.055] px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
        </div>

        <div className="min-h-0 overflow-y-auto p-2.5">
          {!hasQuery ? (
            <>
              <div className="flex items-center gap-1.5 px-2.5 pb-2 pt-1 text-[11px] font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.6} />
                快捷功能
              </div>
              <div className="space-y-0.5">
                {quickActions.map((item, index) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={item.action}
                      className={cn(
                        'flex h-10 w-full items-center gap-3 rounded-control px-3 text-left text-[13px] transition-colors',
                        selectedIndex === index ? 'bg-foreground/[0.07]' : 'hover:bg-foreground/[0.045]',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {item.shortcut && (
                        <kbd className="rounded-control bg-foreground/[0.055] px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {item.shortcut}
                        </kbd>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 border-t border-border/60 px-2.5 pt-3 text-[11px] leading-5 text-muted-foreground">
                输入关键词后，会自动匹配聊天内容、知识库、文件、项目、浏览历史、技能和设置。
              </div>
            </>
          ) : (
            <>
              <div className="px-2.5 pb-2 pt-1 text-[11px] font-medium text-muted-foreground">
                {loading ? '正在搜索…' : `搜索结果${entries.length ? ` · ${entries.length}` : ''}`}
              </div>
              {!loading && entries.length === 0 && (
                <div className="flex h-52 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <Search className="h-6 w-6 opacity-50" strokeWidth={1.5} />
                  <p className="text-[13px]">没有找到匹配结果</p>
                  <p className="text-[11px] opacity-75">试试更短或不同的关键词</p>
                </div>
              )}
              <div className="space-y-0.5">
                {entries.map((entry, index) => (
                  <button
                    key={entry.id}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => openResult(entry)}
                    className={cn(
                      'flex min-h-12 w-full items-start gap-3 rounded-control px-3 py-2 text-left transition-colors',
                      selectedIndex === index ? 'bg-foreground/[0.07]' : 'hover:bg-foreground/[0.045]',
                    )}
                  >
                    {entry.kind === 'browser-history' ? (
                      <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                    ) : (
                      <Search className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{entry.title}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{kindLabels[entry.kind]}</span>
                      </span>
                      {entry.text && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">{entry.text}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
