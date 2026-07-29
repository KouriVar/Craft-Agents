/**
 * Browser Toolbar — React entry point
 *
 * Renders the shared BrowserControls component inside a chromeless
 * BrowserWindow. Communicates with the main process via a dedicated
 * preload script (browser-toolbar preload).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { useTranslation, initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { setupI18n } from '@craft-agent/shared/i18n'
import { EyeOff, Pin, Puzzle, ShieldCheck, Star, X, XCircle } from 'lucide-react'
import { BrowserControls } from '@craft-agent/ui'
import { HeaderIconButton } from '@/components/ui/HeaderIconButton'
import { getEmbeddedToolbarModeTransition, type EmbeddedToolbarMode } from '@/lib/embedded-toolbar-state'
import { applyPlatformAttribute } from '@/lib/platform'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'
import './index.css'

applyPlatformAttribute()

// This is a standalone entry (browser-toolbar.html) — i18n must be initialized
// here or BrowserControls and the menu below render raw translation keys.
setupI18n([LanguageDetector, initReactI18next])

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ToolbarState {
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  themeColor?: string | null
  bookmarked?: boolean
  embedded?: boolean
  toolbarMode?: EmbeddedToolbarMode
}

declare global {
  interface Window {
    browserToolbar: {
      instanceId: string
      embedded: boolean
      navigate: (url: string) => Promise<void>
      goBack: () => Promise<void>
      goForward: () => Promise<void>
      reload: () => Promise<void>
      stop: () => Promise<void>
      setRevealed: (revealed: boolean) => Promise<void>
      pinEmbedded: () => Promise<boolean>
      showEmbeddedMenu: (kind: 'extensions' | 'permissions') => Promise<void>
      toggleBookmark: () => Promise<void>
      setMenuGeometry: (open: boolean, height?: number) => Promise<void>
      hideWindow: () => Promise<void>
      closeWindowEntirely: () => Promise<void>
      onStateUpdate: (callback: (state: ToolbarState) => void) => () => void
      onThemeColor: (callback: (color: string | null) => void) => () => void
      onForceCloseMenu: (callback: (payload: { reason?: string }) => void) => () => void
    }
  }
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

function BrowserToolbarApp() {
  const { t } = useTranslation()
  const [state, setState] = useState<ToolbarState>({
    url: 'about:blank',
    title: 'New Tab',
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
  })
  const [themeColor, setThemeColor] = useState<string | null>(null)
  const [windowMenuOpen, setWindowMenuOpen] = useState(false)
  const [embeddedRevealed, setEmbeddedRevealed] = useState(false)
  const [embeddedPinPending, setEmbeddedPinPending] = useState(false)
  const menuContentRef = useRef<HTMLDivElement | null>(null)
  const toolbarRootRef = useRef<HTMLDivElement | null>(null)
  const embeddedFocusedRef = useRef(false)
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastToolbarModeRef = useRef<EmbeddedToolbarMode | null>(null)

  const api = window.browserToolbar

  useEffect(() => {
    if (!api) return
    return api.onStateUpdate((s) => {
      setState(s)
      const transition = getEmbeddedToolbarModeTransition(lastToolbarModeRef.current, s.toolbarMode)
      if (s.toolbarMode) lastToolbarModeRef.current = s.toolbarMode
      if (transition) {
        setEmbeddedPinPending(transition.pinPending)
        setEmbeddedRevealed(transition.revealed)
        embeddedFocusedRef.current = false
      }
      // Sync theme color from full state push (initial load / reconnection)
      if ('themeColor' in s) {
        setThemeColor((s as ToolbarState).themeColor ?? null)
      }
    })
  }, [api])

  useEffect(() => {
    if (!api) return
    return api.onThemeColor(setThemeColor)
  }, [api])

  useEffect(() => {
    if (!api) return
    return api.onForceCloseMenu(() => {
      setWindowMenuOpen(false)
    })
  }, [api])

  useEffect(() => {
    if (!api) return

    if (!windowMenuOpen) {
      void api.setMenuGeometry(false, 0)
      return
    }

    // Prime expansion immediately to avoid a constrained first measurement.
    void api.setMenuGeometry(true, 120)

    const sendGeometry = () => {
      const height = Math.ceil(menuContentRef.current?.getBoundingClientRect().height ?? 0)
      void api.setMenuGeometry(true, height)
    }

    let frame = requestAnimationFrame(sendGeometry)
    const observer = new ResizeObserver(() => {
      sendGeometry()
    })

    if (menuContentRef.current) {
      observer.observe(menuContentRef.current)
    }

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      void api.setMenuGeometry(false, 0)
    }
  }, [api, windowMenuOpen])

  const handleNavigate = useCallback((url: string) => {
    void api?.navigate(url)
  }, [api])

  const handleGoBack = useCallback(() => {
    void api?.goBack()
  }, [api])

  const handleGoForward = useCallback(() => {
    void api?.goForward()
  }, [api])

  const handleReload = useCallback(() => {
    void api?.reload()
  }, [api])

  const handleStop = useCallback(() => {
    void api?.stop()
  }, [api])

  const handleHideWindow = useCallback(() => {
    setWindowMenuOpen(false)
    void api?.hideWindow()
  }, [api])

  const handleCloseWindowEntirely = useCallback(() => {
    setWindowMenuOpen(false)
    void api?.closeWindowEntirely()
  }, [api])

  const handlePinEmbedded = useCallback(async () => {
    if (!api || embeddedPinPending) return
    setEmbeddedPinPending(true)
    try {
      const pinned = await api.pinEmbedded()
      if (!pinned) {
        setEmbeddedPinPending(false)
        return
      }
      // The main-process broadcast replaces this floating toolbar with the
      // pinned renderer. Keep the pressed treatment visible until unmount.
    } catch {
      setEmbeddedPinPending(false)
    }
  }, [api, embeddedPinPending])

  const embedded = Boolean(api?.embedded)
  const toolbarVisible = !embedded || embeddedRevealed

  const cancelScheduledCollapse = useCallback(() => {
    if (collapseTimerRef.current === null) return
    clearTimeout(collapseTimerRef.current)
    collapseTimerRef.current = null
  }, [])

  const revealEmbeddedToolbar = useCallback(() => {
    cancelScheduledCollapse()
    setEmbeddedRevealed(true)
    void api?.setRevealed(true)
  }, [api, cancelScheduledCollapse])

  const scheduleEmbeddedToolbarCollapse = useCallback(() => {
    if (embeddedFocusedRef.current) return
    cancelScheduledCollapse()
    // Resizing the native WebContentsView from the 8px sensor to the complete
    // toolbar can produce a transient mouseleave on Electron/macOS. Keep the
    // expanded 48px surface as the active hover zone: pointer movement inside
    // it cancels this task, while a genuine exit into the page lets it finish.
    collapseTimerRef.current = setTimeout(() => {
      collapseTimerRef.current = null
      if (embeddedFocusedRef.current || toolbarRootRef.current?.matches(':hover')) return
      setEmbeddedRevealed(false)
      void api?.setRevealed(false)
    }, 180)
  }, [api, cancelScheduledCollapse])

  useEffect(() => () => {
    cancelScheduledCollapse()
  }, [cancelScheduledCollapse])

  return (
    <div
      ref={toolbarRootRef}
      className={embedded
        ? (embeddedRevealed
            ? 'flex h-full items-center overflow-hidden rounded-[10px] border border-border bg-background p-[3px] shadow-minimal'
            // The collapsed WebContentsView is the native hover target. Give
            // it the exact CA surface token: transparent native sibling views
            // can otherwise expose Electron's near-white window background as
            // a visible strip in light mode (and a mismatched seam in dark).
            : 'h-full overflow-hidden bg-transparent shadow-none')
        : 'h-full'}
      onMouseEnter={embedded ? revealEmbeddedToolbar : undefined}
      onMouseMove={embedded ? cancelScheduledCollapse : undefined}
      onMouseLeave={embedded ? scheduleEmbeddedToolbarCollapse : undefined}
      onFocusCapture={embedded ? () => {
        cancelScheduledCollapse()
        embeddedFocusedRef.current = true
        setEmbeddedRevealed(true)
        void api?.setRevealed(true)
      } : undefined}
      onBlurCapture={embedded ? (event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        embeddedFocusedRef.current = false
        scheduleEmbeddedToolbarCollapse()
      } : undefined}
    >
      {/*
        Full-window outside-tap catcher while menu is open.
        Critical for draggable titlebar windows (Windows) where outside-click
        dismissal can be unreliable if events fall into app-region: drag zones.
      */}
      {windowMenuOpen && (
        <div
          className="fixed inset-0 z-dropdown-backdrop titlebar-no-drag bg-black/[0.0039215686]"
          onPointerDown={(event) => {
            event.preventDefault()
            setWindowMenuOpen(false)
          }}
        />
      )}

      {toolbarVisible && <BrowserControls
        url={state.url}
        loading={state.isLoading}
        canGoBack={state.canGoBack}
        canGoForward={state.canGoForward}
        onNavigate={handleNavigate}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onReload={handleReload}
        onStop={handleStop}
        trailingContent={embedded ? (
          <div className="ml-2 flex items-center gap-1 titlebar-no-drag">
            <HeaderIconButton
              icon={<ShieldCheck className="h-4 w-4" />}
              aria-label={t('browser.sitePermissions', { defaultValue: 'Site permissions' })}
              onClick={() => { void api?.showEmbeddedMenu('permissions') }}
              className="rounded-[6px] hover:bg-foreground/5"
            />
            <HeaderIconButton
              icon={<Puzzle className="h-4 w-4" />}
              aria-label={t('plugins.browserExtensions', { defaultValue: 'Extensions' })}
              onClick={() => { void api?.showEmbeddedMenu('extensions') }}
              className="rounded-[6px] hover:bg-foreground/5"
            />
            <HeaderIconButton
              icon={<Star className={state.bookmarked ? 'h-4 w-4 fill-current' : 'h-4 w-4'} />}
              aria-label={state.bookmarked
                ? t('browser.removeBookmark', { defaultValue: 'Remove bookmark' })
                : t('browser.addBookmark', { defaultValue: 'Add bookmark' })}
              onClick={() => { void api?.toggleBookmark() }}
              className={state.bookmarked ? 'rounded-[6px] bg-foreground/[0.08] text-foreground' : 'rounded-[6px] hover:bg-foreground/5'}
            />
            <HeaderIconButton
              icon={<Pin className="h-4 w-4 rotate-45" />}
              aria-label={t('rightSidebar.pinToolbar', { defaultValue: '固定工具栏' })}
              aria-pressed={embeddedPinPending}
              onClick={() => { void handlePinEmbedded() }}
              className={embeddedPinPending
                ? 'rounded-[6px] bg-foreground/[0.08] text-foreground hover:bg-foreground/[0.12]'
                : 'rounded-[6px] hover:bg-foreground/5'}
            />
          </div>
        ) : (
          <div className="ml-2 flex items-center gap-1.5 titlebar-no-drag">
            <DropdownMenu open={windowMenuOpen} onOpenChange={setWindowMenuOpen}>
              <DropdownMenuTrigger asChild>
                <HeaderIconButton
                  icon={<X className="h-3.5 w-3.5" />}
                  aria-label={t('browser.windowOptions')}
                  className={themeColor ? '' : 'bg-background shadow-minimal hover:bg-foreground/5'}
                  style={themeColor ? { color: 'var(--tb-fg)' } : undefined}
                />
              </DropdownMenuTrigger>

              <StyledDropdownMenuContent
                ref={menuContentRef}
                align="end"
                side="bottom"
                sideOffset={6}
                minWidth="min-w-44"
                className="titlebar-no-drag max-h-none overflow-visible"
              >
                <StyledDropdownMenuItem onSelect={handleHideWindow}>
                  <EyeOff className="h-3.5 w-3.5" />
                  {t('browser.hideWindow')}
                </StyledDropdownMenuItem>
                <StyledDropdownMenuItem variant="destructive" onSelect={handleCloseWindowEntirely}>
                  <XCircle className="h-3.5 w-3.5" />
                  {t('browser.closeWindowEntirely')}
                </StyledDropdownMenuItem>
              </StyledDropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        compact={embedded}
        showProgressBar={!embedded}
        themeColor={embedded ? null : themeColor}
        urlBarClassName={embedded ? 'max-w-none' : 'max-w-[600px]'}
        className={embedded
          // An embedded WebContentsView is not a draggable window titlebar.
          // Keeping app-region: drag here causes Chromium to route pointer
          // input to native window dragging before buttons/forms receive it.
          ? 'titlebar-no-drag min-w-0 flex-1 bg-transparent'
          : 'titlebar-drag-region bg-background'}
      />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Mount                                                              */
/* ------------------------------------------------------------------ */

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserToolbarApp />
  </React.StrictMode>,
)
