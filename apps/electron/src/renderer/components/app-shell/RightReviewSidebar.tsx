/**
 * RightReviewSidebar
 *
 * Codex-style right panel. Layout skeleton with consistent styling:
 *  - Header (42px, matches PanelHeader) with top-level tool tabs
 *  - Content: active browser / terminal / folder / Cowart tab
 */

import { useCallback } from 'react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Brush, FolderOpen, Globe, ListTree, Plus, Terminal, X } from 'lucide-react'
import { useActiveWorkspace, useAppShellContext } from '@/context/AppShellContext'
import { EmbeddedTerminal } from './EmbeddedTerminal'
import { WorkspaceFileBrowser } from './WorkspaceFileBrowser'
import { RightSidebarBrowserPanel } from './RightSidebarBrowserPanel'
import { ResourceRow, type ResourceItem } from './SessionResourcesPopover'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from '@/components/ui/styled-dropdown'

// --- Toolbar button (matches HeaderIconButton styling) ---
function ToolMenuItem({
  icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <StyledDropdownMenuItem
      onClick={onClick}
      disabled={disabled}
      className={active ? 'bg-foreground/[0.08] text-foreground' : undefined}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="flex-1">{label}</span>
    </StyledDropdownMenuItem>
  )
}

type RightSidebarTool = 'files' | 'terminal' | 'browser' | 'cowart' | 'sources'
interface RightSidebarTab {
  id: string
  type: RightSidebarTool
  label: string
  url?: string
  resources?: ResourceItem[]
}

const COWART_CANVAS_URL = 'http://127.0.0.1:43217'

function createSidebarTab(type: RightSidebarTool, label: string, url?: string, resources?: ResourceItem[]): RightSidebarTab {
  return {
    id: crypto.randomUUID(),
    type,
    label,
    url,
    resources,
  }
}

function getToolIcon(type: RightSidebarTool, className = 'h-4 w-4 shrink-0') {
  if (type === 'terminal') return <Terminal className={className} />
  if (type === 'files') return <FolderOpen className={className} />
  if (type === 'cowart') return <Brush className={className} />
  if (type === 'sources') return <ListTree className={className} />
  return <Globe className={className} />
}

function SourcesReviewPanel({
  items,
  className,
}: {
  items: ResourceItem[]
  className?: string
}) {
  const { onOpenFile, onOpenUrl } = useAppShellContext()

  const handleOpen = React.useCallback((item: ResourceItem) => {
    if (item.url) {
      onOpenUrl(item.url)
      return
    }
    if (!item.path) return
    if (item.kind === 'folder') {
      void window.electronAPI.openFile(item.path)
      return
    }
    onOpenFile(item.path)
  }, [onOpenFile, onOpenUrl])

  return (
    <div className={cn('h-full min-h-0 overflow-y-auto px-4 py-4', className)}>
      <div className="grid gap-1">
        {items.map((item) => (
          <ResourceRow key={item.id} item={item} onOpen={handleOpen} />
        ))}
      </div>
    </div>
  )
}

export function RightReviewSidebar() {
  const { t } = useTranslation()
  const activeWorkspace = useActiveWorkspace()
  const rootPath = activeWorkspace?.rootPath
  const newTabLabel = t('browser.newTab', { defaultValue: '新标签页' })
  const [tabs, setTabs] = React.useState<RightSidebarTab[]>(() => [
    createSidebarTab('browser', newTabLabel),
  ])
  const [activeTabId, setActiveTabId] = React.useState(() => tabs[0]?.id ?? '')
  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
    [activeTabId, tabs],
  )

  const addTab = useCallback((type: RightSidebarTool, label: string, url?: string) => {
    const tab = createSidebarTab(type, label, url)
    setTabs((current) => [...current, tab])
    setActiveTabId(tab.id)
    return tab.id
  }, [])

  const updateTab = useCallback((id: string, patch: Partial<RightSidebarTab>) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, ...patch } : tab))
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      if (current.length <= 1) {
        const replacement = createSidebarTab('browser', newTabLabel)
        setActiveTabId(replacement.id)
        return [replacement]
      }
      const index = current.findIndex((tab) => tab.id === id)
      const next = current.filter((tab) => tab.id !== id)
      setActiveTabId((active) => {
        if (active !== id) return active
        return next[Math.max(0, index - 1)]?.id ?? next[0]?.id ?? ''
      })
      return next
    })
  }, [newTabLabel])

  const handleOpenTerminal = useCallback(() => {
    addTab('terminal', t('rightSidebar.openTerminal'))
  }, [addTab, t])

  const handleOpenFolder = useCallback(() => {
    addTab('files', t('rightSidebar.openFolder'))
  }, [addTab, t])

  const handleOpenBrowser = useCallback(() => {
    addTab('browser', newTabLabel)
  }, [addTab, newTabLabel])

  const handleOpenCowart = useCallback(async () => {
    const tabId = addTab('cowart', t('rightSidebar.openCowart', { defaultValue: 'Cowart 画布' }), COWART_CANVAS_URL)
    if (!rootPath) return
    try {
      const result = await window.electronAPI?.startCowartCanvas?.(rootPath)
      if (result?.ok) {
        updateTab(tabId, { url: result.url })
      } else if (result?.error) {
        console.warn('[RightReviewSidebar] Failed to start Cowart canvas:', result.error)
      }
    } catch (error) {
      console.warn('[RightReviewSidebar] Failed to start Cowart canvas:', error)
    }
  }, [addTab, rootPath, t, updateTab])

  React.useEffect(() => {
    const handleOpenSources = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string; items?: ResourceItem[] }>).detail
      const items = detail?.items ?? []
      setTabs((current) => {
        const existing = current.find((tab) => tab.type === 'sources')
        if (existing) {
          setActiveTabId(existing.id)
          return current.map((tab) => tab.id === existing.id
            ? { ...tab, label: t('resources.sources'), resources: items }
            : tab)
        }
        const tab = createSidebarTab('sources', t('resources.sources'), undefined, items)
        setActiveTabId(tab.id)
        return [...current, tab]
      })
    }

    window.addEventListener('craft:right-sidebar-open-sources', handleOpenSources)
    return () => window.removeEventListener('craft:right-sidebar-open-sources', handleOpenSources)
  }, [t])

  const noWorkspace = !rootPath

  return (
    <div className="flex h-full flex-col">
      {/* Header — matches PanelHeader (42px, pl-4, pr-2, titlebar-no-drag) */}
      <div className="titlebar-no-drag flex shrink-0 items-center pr-3 min-w-0 gap-3 relative z-panel h-[42px] pl-4 border-b border-border/50">
        <h1 className="shrink-0 text-sm font-semibold truncate font-sans leading-tight">
          {t('rightSidebar.title')}
        </h1>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab?.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                className={cn(
                  'group flex h-8 min-w-[132px] max-w-[220px] items-center gap-2 rounded-[8px] px-2.5 text-left text-sm transition-colors',
                  isActive
                    ? 'bg-foreground/[0.08] text-foreground shadow-minimal'
                    : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
                )}
                title={tab.label}
              >
                {getToolIcon(tab.type)}
                <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation()
                    closeTab(tab.id)
                  }}
                  className={cn(
                    'hidden h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-destructive group-hover:flex',
                    isActive && tabs.length > 1 ? 'sm:flex sm:opacity-60 sm:hover:opacity-100' : '',
                  )}
                  aria-label="Close tab"
                  title="Close tab"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              </button>
            )
          })}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-foreground/[0.08] data-[state=open]:text-foreground"
              aria-label={t('rightSidebar.addTool')}
              title={t('rightSidebar.addTool')}
            >
              <Plus className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <StyledDropdownMenuContent align="end" minWidth="min-w-[220px]">
            <ToolMenuItem
              icon={<Globe className="h-4 w-4" />}
              label={t('rightSidebar.openBrowser')}
              onClick={handleOpenBrowser}
              active={activeTab?.type === 'browser'}
            />
            <ToolMenuItem
              icon={<Terminal className="h-4 w-4" />}
              label={t('rightSidebar.openTerminal')}
              onClick={handleOpenTerminal}
              disabled={noWorkspace}
              active={activeTab?.type === 'terminal'}
            />
            <ToolMenuItem
              icon={<FolderOpen className="h-4 w-4" />}
              label={t('rightSidebar.openFolder')}
              onClick={handleOpenFolder}
              disabled={noWorkspace}
              active={activeTab?.type === 'files'}
            />
            <StyledDropdownMenuSeparator />
            <ToolMenuItem
              icon={<Brush className="h-4 w-4" />}
              label={t('rightSidebar.openCowart', { defaultValue: 'Cowart 画布' })}
              onClick={handleOpenCowart}
              disabled={noWorkspace}
              active={activeTab?.type === 'cowart'}
            />
          </StyledDropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab?.id
          const className = cn('h-full min-h-0', !isActive && 'hidden')
          if (tab.type === 'terminal') {
            return <EmbeddedTerminal key={tab.id} cwd={rootPath} className={className} />
          }
          if (tab.type === 'files') {
            return <WorkspaceFileBrowser key={tab.id} rootPath={rootPath} className={className} />
          }
          if (tab.type === 'sources') {
            return <SourcesReviewPanel key={tab.id} items={tab.resources ?? []} className={className} />
          }
          return (
            <RightSidebarBrowserPanel
              key={tab.id}
              className={className}
              initialUrl={tab.url}
              initialTitle={tab.label}
              showTabStrip={false}
              onTitleChange={(label) => updateTab(tab.id, { label })}
            />
          )
        })}
      </div>
    </div>
  )
}
