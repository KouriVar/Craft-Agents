/**
 * TopBar - Window controls scoped to the primary sidebar.
 *
 * Desktop: the sidebar controls remain at the top-left while content panels
 * extend to the window's top edge. Windows caption controls remain on the
 * top-right until their dedicated presentation is redesigned.
 *
 * Compact: remains a full-width persistent top bar.
 * macOS: offset left to avoid stoplight controls.
 */

import { useTranslation } from "react-i18next"
import { useEffect, useRef, useState } from "react"
import * as Icons from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@craft-agent/ui"
import { TopBarButton } from "../ui/TopBarButton"
import { cn } from "@/lib/utils"
import { isMac, isWebUI, isWindows } from "@/lib/platform"
import { useActionLabel } from "@/actions"
import type { SettingsMenuItem } from "../../../shared/menu-schema"
import type { Workspace } from "../../../shared/types"
import { CompactWorkspaceSwitcher } from "./CompactWorkspaceSwitcher"
import { AppMenu } from "../AppMenu"
import { PANEL_EDGE_INSET } from "./panel-constants"

interface TopBarProps {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onSelectWorkspace: (workspaceId: string, openInNewWindow?: boolean) => void | Promise<void>
  workspaceUnreadMap?: Record<string, boolean>
  onWorkspaceCreated?: (workspace: Workspace) => void
  onWorkspaceRemoved?: () => void
  onNewChat: () => void
  onNewWindow?: () => void
  onOpenSettings: () => void
  onOpenSettingsSubpage: (subpage: SettingsMenuItem['id']) => void
  onOpenKeyboardShortcuts: () => void
  onOpenStoredUserPreferences: () => void
  onBack: () => void
  onForward: () => void
  canGoBack: boolean
  canGoForward: boolean
  onToggleSidebar: () => void
  onToggleSessionList: () => void
  onToggleFocusMode: () => void
  isSidebarVisible?: boolean
  isSessionListVisible?: boolean
  isFocusModeActive?: boolean
  /** Current primary-sidebar width; desktop controls stay within this region. */
  desktopSidebarWidth?: number
  /** When true, hides controls that don't apply in compact/mobile layout */
  isCompact?: boolean
}

export function TopBar({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  workspaceUnreadMap,
  onWorkspaceCreated,
  onWorkspaceRemoved,
  onNewChat,
  onNewWindow,
  onOpenSettings,
  onOpenSettingsSubpage,
  onOpenKeyboardShortcuts,
  onOpenStoredUserPreferences,
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  onToggleSidebar,
  onToggleSessionList,
  onToggleFocusMode,
  isSidebarVisible = true,
  isFocusModeActive = false,
  desktopSidebarWidth = 220,
  isCompact,
}: TopBarProps) {
  const { t } = useTranslation()
  const [focusTopBarRevealed, setFocusTopBarRevealed] = useState(!isFocusModeActive)
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const topBarCollapsed = isFocusModeActive && !focusTopBarRevealed

  const cancelCollapse = () => {
    if (collapseTimerRef.current === null) return
    clearTimeout(collapseTimerRef.current)
    collapseTimerRef.current = null
  }

  useEffect(() => {
    cancelCollapse()
    setFocusTopBarRevealed(!isFocusModeActive)
  }, [isFocusModeActive])

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--app-topbar-inset',
      isCompact && !topBarCollapsed ? 'var(--topbar-height)' : '0px',
    )
    return () => {
      document.documentElement.style.removeProperty('--app-topbar-inset')
    }
  }, [isCompact, topBarCollapsed])

  useEffect(() => () => cancelCollapse(), [])

  const scheduleCollapse = () => {
    if (!isFocusModeActive) return
    cancelCollapse()
    collapseTimerRef.current = setTimeout(() => {
      collapseTimerRef.current = null
      if (rootRef.current?.matches(':hover') || document.querySelector('[role="menu"][data-state="open"]')) return
      setFocusTopBarRevealed(false)
    }, 220)
  }

  const goBackHotkey = useActionLabel('nav.goBackAlt').hotkey
  const goForwardHotkey = useActionLabel('nav.goForwardAlt').hotkey

  // Stoplight padding clears macOS traffic-light controls, which only exist
  // in the Electron desktop window. The webui runs in a regular browser tab
  // and has no traffic lights regardless of host OS — collapse to a normal
  // 12px inset so the logo sits at the edge.
  const menuLeftPadding = isMac && !isWebUI ? 86 : 12

  const activateSidebarToggle = () => {
    onToggleSidebar()
  }

  return (
    <>
    {!isCompact && (
      <TopBarButton
        onClick={activateSidebarToggle}
        aria-label={t("menu.collapseSidebar")}
        aria-pressed={!isSidebarVisible}
        title={t("menu.collapseSidebar")}
        data-sidebar-toggle="true"
        className="titlebar-no-drag pointer-events-auto fixed z-splash"
        style={{
          left: menuLeftPadding,
          top: 'calc((var(--topbar-height) - 28px) / 2)',
        }}
      >
        <Icons.PanelLeft className="h-[18px] w-[18px] text-foreground/70" />
      </TopBarButton>
    )}
    <div
      ref={rootRef}
      className="ca-topbar-surface pointer-events-none fixed top-0 left-0 right-0 z-dropdown-backdrop"
      style={{
        height: 'var(--topbar-height)',
        transform: topBarCollapsed
          ? `translateY(calc(-100% + ${PANEL_EDGE_INSET}px))`
          : 'translateY(0)',
        transition: 'transform 160ms ease',
      }}
      onMouseEnter={() => {
        cancelCollapse()
        if (isFocusModeActive) setFocusTopBarRevealed(true)
      }}
      onMouseMove={cancelCollapse}
      onMouseLeave={scheduleCollapse}
    >
      <div aria-hidden="true" className="pointer-events-auto absolute inset-0 titlebar-drag-region" />
      <div className="relative z-local flex h-full w-full items-center justify-between gap-2">
      {/* === LEFT: Sidebar + Menu + Navigation + Workspace === */}
      {/* Keep this container draggable. Only individual interactive controls should use titlebar-no-drag. */}
      {/* In compact mode the right slot is hidden, so we add right padding here
          so the workspace pill doesn't run flush against the viewport edge. */}
      <div
        className={cn(
          "pointer-events-auto titlebar-no-drag relative z-local flex min-w-0 items-center gap-0.5",
          isCompact ? "flex-1" : "shrink-0",
        )}
        style={{
          width: isCompact ? undefined : desktopSidebarWidth,
          paddingLeft: menuLeftPadding,
          paddingRight: isCompact ? 12 : 0,
        }}
      >
        <div className="flex items-center gap-0.5">
        {!isCompact && <div aria-hidden="true" className="h-7 w-7 shrink-0" />}

        {isCompact && (
          <AppMenu
            onNewChat={onNewChat}
            onNewWindow={onNewWindow}
            onOpenSettings={onOpenSettings}
            onOpenSettingsSubpage={onOpenSettingsSubpage}
            onOpenKeyboardShortcuts={onOpenKeyboardShortcuts}
            onOpenStoredUserPreferences={onOpenStoredUserPreferences}
            onToggleSidebar={onToggleSidebar}
            onToggleSessionList={onToggleSessionList}
            onToggleFocusMode={onToggleFocusMode}
          />
        )}
        </div>

        {/* Back / Forward / Workspace selector (moved from center).
            In compact mode the back/forward buttons are dropped — the iOS-style
            drill-in chevron in PanelHeader plus the browser's native back gesture
            cover that affordance, and the freed width lets the workspace pill
            actually fit on phone-width viewports. */}
        <div className={cn("ml-1 flex min-w-0 items-center gap-1", isCompact && "flex-1")}>
          {!isCompact && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TopBarButton onClick={onBack} disabled={!canGoBack} aria-label={t("common.back")}>
                    <Icons.ChevronLeft className="h-[18px] w-[18px] text-foreground/70" />
                  </TopBarButton>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("common.back")} {goBackHotkey}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <TopBarButton onClick={onForward} disabled={!canGoForward} aria-label={t("common.forward")}>
                    <Icons.ChevronRight className="h-[18px] w-[18px] text-foreground/70" />
                  </TopBarButton>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("common.forward")} {goForwardHotkey}</TooltipContent>
              </Tooltip>
            </>
          )}

          {isCompact && (
            <div className="min-w-0 flex-1">
              <CompactWorkspaceSwitcher
                workspaces={workspaces}
                activeWorkspaceId={activeWorkspaceId}
                onSelect={onSelectWorkspace}
                onWorkspaceCreated={onWorkspaceCreated}
                onWorkspaceRemoved={onWorkspaceRemoved}
                workspaceUnreadMap={workspaceUnreadMap}
              />
            </div>
          )}
        </div>
      </div>

      {!isCompact && isWindows && (
        <div className="pointer-events-auto flex min-w-0 shrink-0 items-center justify-end" style={{ paddingRight: 8 }}>
          <WindowsWindowControls />
        </div>
      )}
      </div>
    </div>
    </>
  )
}

function WindowsWindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    let mounted = true
    void window.electronAPI.getWindowMaximizedState()
      .then((value) => {
        if (mounted) setIsMaximized(value)
      })
      .catch(() => {})
    const dispose = window.electronAPI.onWindowMaximizedChange(setIsMaximized)
    return () => {
      mounted = false
      dispose()
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.windowMaximized = String(isMaximized)
    return () => {
      delete document.documentElement.dataset.windowMaximized
    }
  }, [isMaximized])

  return (
    <div className="titlebar-no-drag ml-1 flex h-[30px] shrink-0 items-center overflow-hidden">
      <button
        type="button"
        aria-label="Minimize"
        className="flex h-[30px] w-11 items-center justify-center text-foreground/55 transition-colors hover:bg-foreground/8 hover:text-foreground/80"
        onClick={() => void window.electronAPI.menuMinimize()}
      >
        <Icons.Minus className="h-4 w-4" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        aria-label={isMaximized ? "Restore" : "Maximize"}
        className="flex h-[30px] w-11 items-center justify-center text-foreground/55 transition-colors hover:bg-foreground/8 hover:text-foreground/80"
        onClick={() => void window.electronAPI.menuMaximize()}
      >
        {isMaximized ? (
          <Icons.Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
        ) : (
          <Icons.Square className="h-3.5 w-3.5" strokeWidth={1.5} />
        )}
      </button>
      <button
        type="button"
        aria-label="Close"
        className="flex h-[30px] w-11 items-center justify-center text-foreground/55 transition-colors hover:bg-destructive hover:text-white"
        onClick={() => void window.electronAPI.closeWindow()}
      >
        <Icons.X className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  )
}
