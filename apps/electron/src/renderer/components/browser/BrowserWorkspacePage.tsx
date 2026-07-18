import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useAtomValue } from 'jotai'
import { KeyRound, Pin, Puzzle, ShieldCheck, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BrowserExtensionEntry } from '../../../shared/types'
import { BrowserToolbar } from './BrowserToolbar'
import { BROWSER_NEW_TAB_URL, browserNativeViewsSuspendedAtom, browserNotificationBottomAtom, browserWorkspaceTabsAtom } from '@/atoms/browser-workspace'
import { cn } from '@/lib/utils'
import { PANEL_GAP } from '@/components/app-shell/panel-constants'
import { resolveBrowserAddress } from './utils'

interface BrowserWorkspacePageProps {
  activeTabId?: string | null
}

// The former embedded address/extension toolbar is intentionally retained
// below for rollback, but the workspace now keeps navigation controls with the
// selected tab and uses an address field only on the new-tab page.
const SHOW_LEGACY_EMBEDDED_TOOLBAR = false

interface RendererNewTabProps {
  tabId: string
  onNavigate: (value: string) => Promise<void>
}

function RendererNewTab({ tabId, onNavigate }: RendererNewTabProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const input = value.trim()
    if (!input || submitting) return
    setSubmitting(true)
    try {
      await onNavigate(input)
    } catch (error) {
      console.warn(`[BrowserWorkspacePage] Failed to navigate new tab ${tabId}:`, error)
      setSubmitting(false)
    }
  }

  return (
    <main className="absolute inset-0 z-10 flex min-h-[360px] items-center justify-center rounded-[10px] bg-background px-8">
      <form onSubmit={handleSubmit} className="w-full max-w-[720px]">
        <label htmlFor={`browser-new-tab-address-${tabId}`} className="sr-only">
          {t('browser.urlPlaceholder')}
        </label>
        <div className="flex h-14 items-center rounded-[14px] border border-border/70 bg-background px-5 shadow-minimal transition-[border-color,box-shadow] focus-within:border-foreground/20 focus-within:shadow-modal-small">
          <input
            id={`browser-new-tab-address-${tabId}`}
            autoFocus
            value={value}
            disabled={submitting}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('browser.urlPlaceholder')}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-70"
          />
        </div>
      </form>
    </main>
  )
}

export function BrowserWorkspacePage({ activeTabId }: BrowserWorkspacePageProps) {
  const { t } = useTranslation()
  const tabs = useAtomValue(browserWorkspaceTabsAtom)
  const nativeViewsSuspended = useAtomValue(browserNativeViewsSuspendedAtom)
  const notificationBottom = useAtomValue(browserNotificationBottomAtom)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [bookmarked, setBookmarked] = useState(false)
  const [extensions, setExtensions] = useState<BrowserExtensionEntry[]>([])
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
    [activeTabId, tabs],
  )
  const activeId = activeTab?.id ?? null
  const isNewTab = activeTab?.url === BROWSER_NEW_TAB_URL
  const toolbarPinned = activeTab?.toolbarMode !== 'floating'
  const tabIdsKey = useMemo(() => tabs.map((tab) => tab.id).join('|'), [tabs])
  const tabIds = useMemo(() => tabIdsKey ? tabIdsKey.split('|') : [], [tabIdsKey])
  const activeOrigin = useMemo(() => {
    try {
      return activeTab?.url ? new URL(activeTab.url).origin : null
    } catch {
      return null
    }
  }, [activeTab?.url])
  const pinnedExtensions = extensions.filter((extension) => extension.pinned && !extension.hidden && extension.hasAction).slice(0, 3)

  useEffect(() => {
    if (!activeId || SHOW_LEGACY_EMBEDDED_TOOLBAR) return
    // Fixed mode hides the separate native floating toolbar. The React toolbar
    // remains in this file behind the feature constant above; no code is deleted.
    void window.electronAPI.browserPane.setEmbeddedToolbarMode(activeId, 'fixed').catch(() => {})
  }, [activeId])

  const refreshExtensions = useCallback(async () => {
    setExtensions(await window.electronAPI.browserPane.listExtensions())
  }, [])

  useEffect(() => {
    void refreshExtensions()
    const refresh = () => { void refreshExtensions() }
    window.addEventListener('craft-browser-extensions-changed', refresh)
    return () => window.removeEventListener('craft-browser-extensions-changed', refresh)
  }, [refreshExtensions])

  useEffect(() => {
    const url = activeTab?.url
    if (!url || !/^https?:/i.test(url)) {
      setBookmarked(false)
      return
    }
    void window.electronAPI.browserPane.listBookmarks()
      .then((items) => setBookmarked(items.some((item) => item.url === url)))
      .catch(() => setBookmarked(false))
  }, [activeTab?.url])

  const syncActiveSurface = useCallback(async () => {
    const api = window.electronAPI?.browserPane
    const surface = surfaceRef.current
    if (!api || !surface || !activeId) return

    const rect = surface.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return

    const notificationInset = Math.max(0, Math.min(rect.height, notificationBottom + 8 - rect.top))
    await api.setEmbeddedBounds(activeId, {
      x: rect.left,
      y: rect.top + notificationInset,
      width: rect.width,
      height: Math.max(1, rect.height - notificationInset),
    })
    await api.setEmbeddedVisible(activeId, true)
  }, [activeId, notificationBottom])

  const navigateNewTab = useCallback(async (value: string) => {
    if (!activeId) return
    await window.electronAPI.browserPane.navigate(activeId, resolveBrowserAddress(value))
  }, [activeId])

  useEffect(() => {
    const api = window.electronAPI?.browserPane
    if (!api || !activeId) return

    if (nativeViewsSuspended || isNewTab) {
      for (const tabId of tabIds) {
        void api.setEmbeddedVisible(tabId, false).catch(() => {})
      }
      return
    }

    for (const tabId of tabIds) {
      if (tabId !== activeId) {
        void api.setEmbeddedVisible(tabId, false).catch(() => {})
      }
    }
    void syncActiveSurface().catch((error) => {
      console.warn(`[BrowserWorkspacePage] Failed to embed runtime tab ${activeId}:`, error)
    })

    return () => {
      void api.setEmbeddedVisible(activeId, false).catch(() => {})
    }
  }, [activeId, isNewTab, nativeViewsSuspended, syncActiveSurface, tabIds])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !activeId || nativeViewsSuspended || isNewTab) return

    let frame = 0
    const scheduleSync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        void syncActiveSurface().catch((error) => {
          console.warn('[BrowserWorkspacePage] Failed to resize embedded runtime:', error)
        })
      })
    }
    const observer = new ResizeObserver(scheduleSync)
    observer.observe(surface)
    window.addEventListener('resize', scheduleSync)
    scheduleSync()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', scheduleSync)
    }
  }, [activeId, isNewTab, nativeViewsSuspended, syncActiveSurface])

  const navigateActive = useCallback((input: string) => {
    if (!activeId) return
    void window.electronAPI.browserPane.navigate(activeId, input).catch((error) => {
      console.warn(`[BrowserWorkspacePage] Navigation failed for ${activeId}:`, error)
    })
  }, [activeId])

  const goBack = useCallback(() => {
    if (activeId) void window.electronAPI.browserPane.goBack(activeId)
  }, [activeId])

  const goForward = useCallback(() => {
    if (activeId) void window.electronAPI.browserPane.goForward(activeId)
  }, [activeId])

  const reload = useCallback(() => {
    if (activeId) void window.electronAPI.browserPane.reload(activeId)
  }, [activeId])

  const stop = useCallback(() => {
    if (activeId) void window.electronAPI.browserPane.stop(activeId)
  }, [activeId])

  const toggleBookmark = useCallback(async () => {
    if (!activeTab || !/^https?:/i.test(activeTab.url)) return
    if (bookmarked) {
      await window.electronAPI.browserPane.removeBookmark(activeTab.url)
      setBookmarked(false)
    } else {
      await window.electronAPI.browserPane.addBookmark({
        url: activeTab.url,
        title: activeTab.title,
        favicon: activeTab.favicon,
      })
      setBookmarked(true)
    }
    window.dispatchEvent(new Event('craft-browser-profile-changed'))
  }, [activeTab, bookmarked])

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-foreground-2">
      {SHOW_LEGACY_EMBEDDED_TOOLBAR && toolbarPinned && (
        <div
          className="mx-2 mt-2 shrink-0 rounded-[10px] border border-border bg-background/95 p-1 shadow-minimal"
          style={{ marginBottom: PANEL_GAP }}
        >
        <BrowserToolbar
          instanceInfo={activeTab}
          onNavigate={navigateActive}
          onGoBack={goBack}
          onGoForward={goForward}
          onReload={reload}
          onStop={stop}
          compact
          trailingContent={(
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={!activeOrigin || activeOrigin === 'null'}
                onClick={() => {
                  if (activeOrigin) void window.electronAPI.browserPane.showToolbarMenu('passwords', activeId, activeOrigin)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-30"
                title={t('browser.passwords', { defaultValue: 'Passwords' })}
              >
                <KeyRound className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={!activeOrigin || activeOrigin === 'null'}
                onClick={() => {
                  if (activeOrigin) void window.electronAPI.browserPane.showToolbarMenu('permissions', activeId, activeOrigin)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-30"
                title={t('browser.sitePermissions', { defaultValue: 'Site permissions' })}
              >
                <ShieldCheck className="h-4 w-4" />
              </button>
              {pinnedExtensions.map((extension) => (
                <button
                  key={extension.id}
                  type="button"
                  onClick={() => void window.electronAPI.browserPane.openExtensionAction(extension.id, activeId)}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                  title={extension.name}
                >
                  {extension.icon ? (
                    <img src={extension.icon} alt="" className="h-4 w-4 rounded-[3px] object-contain" />
                  ) : (
                    <Puzzle className="h-4 w-4" />
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void window.electronAPI.browserPane.showToolbarMenu('extensions', activeId)}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={t('plugins.browserExtensions', { defaultValue: 'Extensions' })}
                title={t('plugins.browserExtensions', { defaultValue: 'Extensions' })}
              >
                <Puzzle className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void toggleBookmark()}
                disabled={!activeTab || !/^https?:/i.test(activeTab.url)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-30',
                  bookmarked && 'bg-foreground/[0.08] text-foreground',
                )}
                aria-label={bookmarked ? t('browser.removeBookmark', { defaultValue: 'Remove bookmark' }) : t('browser.addBookmark', { defaultValue: 'Add bookmark' })}
                title={bookmarked ? t('browser.removeBookmark', { defaultValue: 'Remove bookmark' }) : t('browser.addBookmark', { defaultValue: 'Add bookmark' })}
              >
                <Star className={cn('h-4 w-4', bookmarked && 'fill-current')} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeId) void window.electronAPI.browserPane.setEmbeddedToolbarMode(activeId, 'floating')
                }}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-foreground/[0.08] text-foreground transition-colors hover:bg-foreground/[0.12] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={t('rightSidebar.unpinToolbar', { defaultValue: '取消固定工具栏' })}
                title={t('rightSidebar.unpinToolbar', { defaultValue: '取消固定工具栏' })}
              >
                <Pin className="h-4 w-4" />
              </button>
            </div>
          )}
        />
        </div>
      )}
      <div className="relative min-h-0 flex-1 bg-foreground-2">
        <div ref={surfaceRef} className="h-full min-h-0 w-full rounded-[10px] bg-background" />
        {activeId && isNewTab && (
          <RendererNewTab key={activeId} tabId={activeId} onNavigate={navigateNewTab} />
        )}
      </div>
    </div>
  )
}
