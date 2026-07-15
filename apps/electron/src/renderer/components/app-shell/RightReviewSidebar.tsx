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
import { AlertTriangle, AppWindow, Brush, FolderOpen, Globe, ListTree, LoaderCircle, Plus, RotateCcw, Terminal, X } from 'lucide-react'
import { useActiveWorkspace, useAppShellContext } from '@/context/AppShellContext'
import { EmbeddedTerminal } from './EmbeddedTerminal'
import { WorkspaceFileBrowser } from './WorkspaceFileBrowser'
import { RightSidebarBrowserPanel } from './RightSidebarBrowserPanel'
import { ResourceRow, type ResourceItem } from './SessionResourcesPopover'
import { cn } from '@/lib/utils'
import { useSession } from '@/hooks/useSession'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from '@/components/ui/styled-dropdown'
import type { McpAppWidgetDescriptor } from '../../../shared/widget-runtime'
import { McpAppWidget } from '../widgets/McpAppWidget'
import * as storage from '@/lib/local-storage'

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

type RightSidebarTool = 'files' | 'terminal' | 'browser' | 'cowart' | 'sources' | 'widget'
interface RightSidebarTab {
  id: string
  type: RightSidebarTool
  label: string
  url?: string
  preload?: string
  resources?: ResourceItem[]
  widget?: McpAppWidgetDescriptor
  sessionId?: string
  runtimeStatus?: 'loading' | 'ready' | 'error' | 'closed'
  runtimeError?: string
  restored?: boolean
}

interface PersistedWidgetTab {
  id: string
  label: string
  sessionId: string
  widget: Pick<McpAppWidgetDescriptor, 'kind' | 'id' | 'serverSlug' | 'resourceUri' | 'toolName' | 'toolInput' | 'source' | 'title' | 'displayMode'>
}

const SENSITIVE_INPUT_KEY = /token|secret|password|authorization|api[-_]?key|credential|cookie/i

function persistedToolInput(input: Record<string, unknown>): Record<string, unknown> | null {
  let sensitive = false
  try {
    const json = JSON.stringify(input, (key, value) => {
      if (key && SENSITIVE_INPUT_KEY.test(key)) sensitive = true
      return value
    })
    if (sensitive || json.length > 64 * 1024) return null
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

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
  if (type === 'widget') return <AppWindow className={className} />
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
  const [session] = useSession()
  const activeWorkspace = useActiveWorkspace()
  const rootPath = activeWorkspace?.rootPath
  const newTabLabel = t('browser.newTab', { defaultValue: '新标签页' })
  const [tabs, setTabs] = React.useState<RightSidebarTab[]>(() => [
    createSidebarTab('browser', newTabLabel),
  ])
  const [activeTabId, setActiveTabId] = React.useState(() => tabs[0]?.id ?? '')
  const [loadedWorkspaceId, setLoadedWorkspaceId] = React.useState<string | null>(null)
  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
    [activeTabId, tabs],
  )

  React.useEffect(() => {
    if (!activeWorkspace?.id) return
    setLoadedWorkspaceId(null)
    const persisted = storage.get<PersistedWidgetTab[]>(storage.KEYS.rightSidebarWidgetTabs, [], activeWorkspace.id)
    const restored = persisted.map(item => ({
      id: item.id,
      type: 'widget' as const,
      label: item.label,
      sessionId: item.sessionId,
      widget: item.widget as McpAppWidgetDescriptor,
      runtimeStatus: 'closed' as const,
      restored: true,
    }))
    const next = restored.length > 0 ? restored : [createSidebarTab('browser', newTabLabel)]
    setTabs(next)
    setActiveTabId(next[0].id)
    setLoadedWorkspaceId(activeWorkspace.id)
  }, [activeWorkspace?.id, newTabLabel])

  React.useEffect(() => {
    if (!activeWorkspace?.id || loadedWorkspaceId !== activeWorkspace.id) return
    const persisted: PersistedWidgetTab[] = tabs.flatMap(tab => {
      const toolInput = tab.widget ? persistedToolInput(tab.widget.toolInput) : null
      return tab.type === 'widget' && tab.widget && tab.sessionId && toolInput
      ? [{
          id: tab.id,
          label: tab.label,
          sessionId: tab.sessionId,
          widget: {
            kind: tab.widget.kind,
            id: tab.widget.id,
            serverSlug: tab.widget.serverSlug,
            resourceUri: tab.widget.resourceUri,
            toolName: tab.widget.toolName,
            toolInput,
            source: tab.widget.source,
            title: tab.widget.title,
            displayMode: tab.widget.displayMode,
          },
        }]
      : []
    })
    storage.set(storage.KEYS.rightSidebarWidgetTabs, persisted, activeWorkspace.id)
  }, [activeWorkspace?.id, loadedWorkspaceId, tabs])

  const addTab = useCallback((type: RightSidebarTool, label: string, url?: string) => {
    const tab = createSidebarTab(type, label, url)
    setTabs((current) => [...current, tab])
    setActiveTabId(tab.id)
    return tab.id
  }, [])

  const updateTab = useCallback((id: string, patch: Partial<RightSidebarTab>) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, ...patch } : tab))
  }, [])

  const restoreWidgetTab = React.useCallback(async (tab: RightSidebarTab) => {
    if (!tab.widget || !tab.sessionId) return
    updateTab(tab.id, { runtimeStatus: 'loading', runtimeError: undefined })
    const result = await window.electronAPI.callMcpWidgetTool({
      sessionId: tab.sessionId,
      serverSlug: tab.widget.serverSlug,
      toolName: tab.widget.toolName,
      arguments: tab.widget.toolInput,
      approved: true,
    })
    if (!result.ok) {
      updateTab(tab.id, { runtimeStatus: 'error', runtimeError: result.error })
      return
    }
    updateTab(tab.id, {
      restored: false,
      runtimeStatus: 'loading',
      widget: {
        ...tab.widget,
        resultContent: result.result.contentBlocks,
        structuredContent: result.result.structuredContent,
        responseMeta: result.result._meta,
      },
    })
  }, [updateTab])

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

  const handleOpenCowart = useCallback(async (projectDirOverride?: string, pageId?: string, sessionId?: string) => {
    const existingTab = tabs.find((tab) => tab.type === 'cowart')
    const tabId = existingTab?.id
      ?? addTab('cowart', t('rightSidebar.openCowart', { defaultValue: 'Cowart 画布' }), 'about:blank')
    if (existingTab) setActiveTabId(existingTab.id)
    const projectDir = projectDirOverride || rootPath
    if (!projectDir) return
    try {
      const result = await window.electronAPI?.startCowartCanvas?.({ projectDir, pageId, sessionId })
      if (result?.ok) {
        updateTab(tabId, { url: result.url, preload: result.preload })
      } else if (result?.error) {
        console.warn('[RightReviewSidebar] Failed to start Cowart canvas:', result.error)
      }
    } catch (error) {
      console.warn('[RightReviewSidebar] Failed to start Cowart canvas:', error)
    }
  }, [addTab, rootPath, t, tabs, updateTab])

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

    const handleCowartWidget = (event: Event) => {
      const detail = (event as CustomEvent<{ projectDir?: string; pageId?: string; sessionId?: string }>).detail
      void handleOpenCowart(detail?.projectDir, detail?.pageId, detail?.sessionId)
    }

    const handleMcpWidget = (event: Event) => {
      const detail = (event as CustomEvent<{ descriptor?: McpAppWidgetDescriptor; sessionId?: string }>).detail
      if (!detail?.descriptor || !detail.sessionId) return
      const descriptor = detail.descriptor
      const widgetSessionId = detail.sessionId
      setTabs(current => {
        const existing = current.find(tab => tab.type === 'widget' && tab.widget?.id === descriptor.id)
        if (existing) {
          setActiveTabId(existing.id)
          return current.map(tab => tab.id === existing.id ? { ...tab, widget: descriptor, sessionId: widgetSessionId, restored: false, runtimeStatus: 'loading' } : tab)
        }
        const tab = createSidebarTab('widget', descriptor.title || descriptor.toolName)
        tab.widget = descriptor
        tab.sessionId = widgetSessionId
        tab.runtimeStatus = 'loading'
        setActiveTabId(tab.id)
        return [...current, tab]
      })
    }

    const handleWidgetStatus = (event: Event) => {
      const detail = (event as CustomEvent<{
        descriptorId?: string
        status?: RightSidebarTab['runtimeStatus']
        error?: string
      }>).detail
      if (!detail?.descriptorId || !detail.status) return
      setTabs(current => current.map(tab => tab.widget?.id === detail.descriptorId
        ? { ...tab, runtimeStatus: detail.status, runtimeError: detail.error }
        : tab))
    }

    const handleSessionDeleted = (event: Event) => {
      const deletedSessionId = (event as CustomEvent<{ sessionId?: string }>).detail?.sessionId
      if (!deletedSessionId) return
      setTabs(current => {
        const next = current.filter(tab => tab.sessionId !== deletedSessionId)
        if (next.length > 0) {
          setActiveTabId(active => next.some(tab => tab.id === active) ? active : next[0].id)
          return next
        }
        const replacement = createSidebarTab('browser', newTabLabel)
        setActiveTabId(replacement.id)
        return [replacement]
      })
    }

    window.addEventListener('craft:right-sidebar-open-sources', handleOpenSources)
    window.addEventListener('craft:right-sidebar-open-cowart', handleCowartWidget)
    window.addEventListener('craft:right-sidebar-open-widget', handleMcpWidget)
    window.addEventListener('craft:widget-runtime-status', handleWidgetStatus)
    window.addEventListener('craft:session-deleted', handleSessionDeleted)
    return () => {
      window.removeEventListener('craft:right-sidebar-open-sources', handleOpenSources)
      window.removeEventListener('craft:right-sidebar-open-cowart', handleCowartWidget)
      window.removeEventListener('craft:right-sidebar-open-widget', handleMcpWidget)
      window.removeEventListener('craft:widget-runtime-status', handleWidgetStatus)
      window.removeEventListener('craft:session-deleted', handleSessionDeleted)
    }
  }, [handleOpenCowart, newTabLabel, t])

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
                {tab.runtimeStatus === 'error'
                  ? <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                  : tab.runtimeStatus === 'loading'
                    ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
                    : getToolIcon(tab.type)}
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
              onClick={() => { void handleOpenCowart(undefined, undefined, session.selected ?? undefined) }}
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
          if (tab.type === 'widget' && tab.widget && tab.sessionId && tab.restored) {
            return (
              <div key={tab.id} className={cn(className, 'flex items-center justify-center p-6')}>
                <div className="max-w-sm text-center">
                  <AppWindow className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">{tab.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('rightSidebar.widgetRestoreDescription', { defaultValue: 'Reconnect this widget to restore a fresh, session-bound runtime.' })}</p>
                  {tab.runtimeError && <p className="mt-2 text-xs text-destructive">{tab.runtimeError}</p>}
                  <button
                    type="button"
                    onClick={() => { void restoreWidgetTab(tab) }}
                    disabled={tab.runtimeStatus === 'loading'}
                    className="mt-4 inline-flex h-8 items-center gap-2 rounded-[6px] border border-border px-3 text-xs font-medium hover:bg-foreground/[0.05] disabled:opacity-50"
                  >
                    <RotateCcw className={cn('h-3.5 w-3.5', tab.runtimeStatus === 'loading' && 'animate-spin')} />
                    {t('rightSidebar.widgetReconnect', { defaultValue: 'Reconnect' })}
                  </button>
                </div>
              </div>
            )
          }
          if (tab.type === 'widget' && tab.widget && tab.sessionId) {
            return <McpAppWidget key={tab.id} descriptor={tab.widget} sessionId={tab.sessionId} displayMode="fullscreen" className={className} />
          }
          return (
            <RightSidebarBrowserPanel
              key={tab.id}
              className={className}
              initialUrl={tab.url}
              guestPreload={tab.preload}
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
