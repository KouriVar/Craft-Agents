import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Globe, Loader2, Plus, X } from 'lucide-react'
import { BrowserToolbar } from '@/components/browser/BrowserToolbar'
import type { BrowserInstanceInfo } from '../../../shared/types'

type EmbeddedWebview = HTMLElement & {
  loadURL(url: string): Promise<void>
  getURL(): string
  getTitle(): string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
}

interface EmbeddedBrowserTab {
  id: string
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

interface RightSidebarBrowserPanelProps {
  className?: string
}

const NEW_TAB_URL = 'about:blank'

function createTab(): EmbeddedBrowserTab {
  return {
    id: crypto.randomUUID(),
    url: NEW_TAB_URL,
    title: 'New Tab',
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
  }
}

function normalizeUrl(input: string): string {
  const value = input.trim()
  if (!value) return NEW_TAB_URL
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value
  if (value.includes('.') && !value.includes(' ')) return `https://${value}`
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`
}

function getHostLabel(url: string): string {
  if (!url || url === NEW_TAB_URL) return 'New Tab'
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url
  } catch {
    return url
  }
}

function toBrowserInfo(tab: EmbeddedBrowserTab | null): BrowserInstanceInfo | null {
  if (!tab) return null
  return {
    id: tab.id,
    url: tab.url === NEW_TAB_URL ? '' : tab.url,
    title: tab.title,
    favicon: null,
    isLoading: tab.isLoading,
    canGoBack: tab.canGoBack,
    canGoForward: tab.canGoForward,
    boundSessionId: null,
    ownerType: 'manual',
    ownerSessionId: null,
    isVisible: true,
    agentControlActive: false,
    themeColor: null,
    workspaceId: null,
  }
}

interface EmbeddedBrowserViewProps {
  tab: EmbeddedBrowserTab
  active: boolean
  register: (id: string, element: EmbeddedWebview | null) => void
  updateTab: (id: string, patch: Partial<EmbeddedBrowserTab>) => void
}

function EmbeddedBrowserView({ tab, active, register, updateTab }: EmbeddedBrowserViewProps) {
  const ref = useRef<EmbeddedWebview | null>(null)
  const isReadyRef = useRef(false)

  const setRef = useCallback((node: EmbeddedWebview | null) => {
    ref.current = node
    isReadyRef.current = false
    register(tab.id, node)
  }, [register, tab.id])

  const loadTabUrl = useCallback(() => {
    const webview = ref.current
    if (!webview || !isReadyRef.current || !tab.url) return
    const currentUrl = webview.getURL?.() || ''
    if (currentUrl === tab.url) return
    try {
      void webview.loadURL(tab.url)
    } catch (error) {
      console.warn('[RightSidebarBrowserPanel] webview loadURL failed:', error)
    }
  }, [tab.url])

  const refreshState = useCallback(() => {
    const webview = ref.current
    if (!webview) return
    const url = webview.getURL?.() || tab.url
    const title = webview.getTitle?.() || getHostLabel(url)
    updateTab(tab.id, {
      url,
      title: title.trim() || getHostLabel(url),
      canGoBack: Boolean(webview.canGoBack?.()),
      canGoForward: Boolean(webview.canGoForward?.()),
    })
  }, [tab.id, tab.url, updateTab])

  useEffect(() => {
    const webview = ref.current
    if (!webview) return

    const handleStart = () => {
      updateTab(tab.id, { isLoading: true })
      refreshState()
    }
    const handleStop = () => {
      updateTab(tab.id, { isLoading: false })
      refreshState()
    }
    const handleNavigate = () => refreshState()
    const handleTitle = (event: Event) => {
      const title = (event as Event & { title?: string; detail?: { title?: string } }).title
        ?? (event as Event & { detail?: { title?: string } }).detail?.title
      if (title) updateTab(tab.id, { title })
      else refreshState()
    }
    const handleNewWindow = (event: Event) => {
      event.preventDefault()
      const url = (event as Event & { url?: string; detail?: { url?: string } }).url
        ?? (event as Event & { detail?: { url?: string } }).detail?.url
      if (url) void webview.loadURL(url)
    }
    const handleReady = () => {
      isReadyRef.current = true
      loadTabUrl()
      refreshState()
    }
    const handleFail = (event: Event) => {
      const failure = event as Event & { errorDescription?: string; validatedURL?: string }
      updateTab(tab.id, {
        isLoading: false,
        title: failure.errorDescription || 'Failed to load',
        url: failure.validatedURL || tab.url,
      })
    }

    webview.addEventListener('did-start-loading', handleStart)
    webview.addEventListener('did-stop-loading', handleStop)
    webview.addEventListener('did-navigate', handleNavigate)
    webview.addEventListener('did-navigate-in-page', handleNavigate)
    webview.addEventListener('page-title-updated', handleTitle)
    webview.addEventListener('new-window', handleNewWindow)
    webview.addEventListener('dom-ready', handleReady)
    webview.addEventListener('did-fail-load', handleFail)

    return () => {
      webview.removeEventListener('did-start-loading', handleStart)
      webview.removeEventListener('did-stop-loading', handleStop)
      webview.removeEventListener('did-navigate', handleNavigate)
      webview.removeEventListener('did-navigate-in-page', handleNavigate)
      webview.removeEventListener('page-title-updated', handleTitle)
      webview.removeEventListener('new-window', handleNewWindow)
      webview.removeEventListener('dom-ready', handleReady)
      webview.removeEventListener('did-fail-load', handleFail)
      register(tab.id, null)
    }
  }, [loadTabUrl, refreshState, register, tab.id, tab.url, updateTab])

  useEffect(() => {
    loadTabUrl()
  }, [loadTabUrl])

  return (
    <div className={active ? 'h-full min-h-0' : 'hidden'}>
      {createElement('webview', {
        ref: setRef,
        src: tab.url || NEW_TAB_URL,
        partition: 'persist:browser-pane',
        className: 'h-full w-full bg-background',
        webpreferences: 'contextIsolation=yes,nodeIntegration=no,sandbox=yes',
        allowpopups: 'false',
      })}
    </div>
  )
}

export function RightSidebarBrowserPanel({ className = '' }: RightSidebarBrowserPanelProps) {
  const [tabs, setTabs] = useState<EmbeddedBrowserTab[]>(() => [createTab()])
  const [activeTabId, setActiveTabId] = useState(() => tabs[0]?.id ?? '')
  const webviewsRef = useRef(new Map<string, EmbeddedWebview>())

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
    [activeTabId, tabs],
  )
  const activeInfo = useMemo(() => toBrowserInfo(activeTab), [activeTab])

  const registerWebview = useCallback((id: string, element: EmbeddedWebview | null) => {
    if (element) webviewsRef.current.set(id, element)
    else webviewsRef.current.delete(id)
  }, [])

  const updateTab = useCallback((id: string, patch: Partial<EmbeddedBrowserTab>) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, ...patch } : tab))
  }, [])

  const createBrowser = useCallback(() => {
    const tab = createTab()
    setTabs((current) => [...current, tab])
    setActiveTabId(tab.id)
  }, [])

  const closeBrowser = useCallback((id: string) => {
    setTabs((current) => {
      if (current.length <= 1) {
        const replacement = createTab()
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
  }, [])

  const navigateActive = useCallback((input: string) => {
    if (!activeTab) return
    const url = normalizeUrl(input)
    updateTab(activeTab.id, { url, title: getHostLabel(url), isLoading: url !== NEW_TAB_URL })
  }, [activeTab, updateTab])

  const goBack = useCallback(() => {
    if (!activeTab) return
    webviewsRef.current.get(activeTab.id)?.goBack()
  }, [activeTab])

  const goForward = useCallback(() => {
    if (!activeTab) return
    webviewsRef.current.get(activeTab.id)?.goForward()
  }, [activeTab])

  const reload = useCallback(() => {
    if (!activeTab) return
    webviewsRef.current.get(activeTab.id)?.reload()
  }, [activeTab])

  const stop = useCallback(() => {
    if (!activeTab) return
    webviewsRef.current.get(activeTab.id)?.stop()
  }, [activeTab])

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="shrink-0 border-b border-border/50">
        <BrowserToolbar
          instanceInfo={activeInfo}
          onNavigate={navigateActive}
          onGoBack={goBack}
          onGoForward={goForward}
          onReload={reload}
          onStop={stop}
          compact
        />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 border-b border-border/50">
        <div className="min-w-0 text-xs font-medium text-muted-foreground">
          Browser
        </div>
        <button
          type="button"
          onClick={createBrowser}
          className="h-7 w-7 shrink-0 rounded-[4px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="New browser tab"
          title="New browser tab"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="shrink-0 overflow-x-auto border-b border-border/50 px-2 py-2">
        <div className="flex min-w-0 gap-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab?.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                className={[
                  'group flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left text-xs transition-colors',
                  isActive ? 'bg-foreground/[0.07] text-foreground' : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
                ].join(' ')}
                title={tab.url}
              >
                {tab.isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{tab.title || getHostLabel(tab.url)}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation()
                    closeBrowser(tab.id)
                  }}
                  className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-destructive group-hover:flex"
                  aria-label="Close browser tab"
                  title="Close browser tab"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-background">
        {tabs.map((tab) => (
          <EmbeddedBrowserView
            key={tab.id}
            tab={tab}
            active={tab.id === activeTab?.id}
            register={registerWebview}
            updateTab={updateTab}
          />
        ))}
      </div>
    </div>
  )
}
