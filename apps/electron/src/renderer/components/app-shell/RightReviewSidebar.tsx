/**
 * RightReviewSidebar
 *
 * Codex-style right panel. Layout skeleton with consistent styling:
 *  - Header (42px, matches PanelHeader)
 *  - Toolbar: quick actions (terminal / folder / browser)
 *  - Content: sectioned placeholders (file changes / diff preview / git info)
 *  - All CSS classes match existing app design language (no custom styles)
 */

import { useCallback } from 'react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useAtomValue } from 'jotai'
import { Info, Terminal, FolderOpen, Globe } from 'lucide-react'
import { focusedSessionIdAtom } from '@/atoms/panel-stack'
import { useActiveWorkspace, useSession } from '@/context/AppShellContext'
import { EmbeddedTerminal } from './EmbeddedTerminal'
import { WorkspaceFileBrowser } from './WorkspaceFileBrowser'
import { RightSidebarBrowserPanel } from './RightSidebarBrowserPanel'
import { SessionInfoContent } from './SessionInfoPopover'

// --- Toolbar button (matches HeaderIconButton styling) ---
function ToolbarButton({
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
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={[
        'h-7 w-7 shrink-0 rounded-[4px] hover:text-foreground hover:bg-foreground/[0.06] transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40 disabled:pointer-events-none',
        active ? 'text-accent bg-foreground/[0.06]' : 'text-muted-foreground',
      ].join(' ')}
    >
      {icon}
    </button>
  )
}

type RightSidebarTool = 'info' | 'files' | 'terminal' | 'browser'

export function RightReviewSidebar() {
  const { t } = useTranslation()
  const activeWorkspace = useActiveWorkspace()
  const rootPath = activeWorkspace?.rootPath
  const focusedSessionId = useAtomValue(focusedSessionIdAtom)
  const focusedSession = useSession(focusedSessionId ?? '')
  const [activeTool, setActiveTool] = React.useState<RightSidebarTool>('info')

  const handleOpenInfo = useCallback(() => {
    setActiveTool('info')
  }, [])

  const handleOpenTerminal = useCallback(() => {
    setActiveTool('terminal')
  }, [])

  const handleOpenFolder = useCallback(() => {
    setActiveTool('files')
  }, [])

  const handleOpenBrowser = useCallback(async () => {
    try {
      const mode = await window.electronAPI?.getBrowserOpenMode?.()
      if (mode === 'window') {
        const id = await window.electronAPI?.browserPane?.create({ show: true })
        if (id) {
          await window.electronAPI?.browserPane?.focus(id)
        }
        return
      }
    } catch (error) {
      console.warn('[RightReviewSidebar] Failed to resolve browser open mode:', error)
    }
    setActiveTool('browser')
  }, [])

  const noWorkspace = !rootPath

  return (
    <div className="flex h-full flex-col">
      {/* Header — matches PanelHeader (42px, pl-4, pr-2, titlebar-no-drag) */}
      <div className="titlebar-no-drag flex shrink-0 items-center pr-2 min-w-0 gap-1.5 relative z-panel h-[42px] pl-4">
        <h1 className="text-sm font-semibold truncate font-sans leading-tight">
          {t('rightSidebar.title')}
        </h1>
      </div>

      {/* Toolbar — quick action buttons */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50">
        <ToolbarButton
          icon={<Info className="h-4 w-4" />}
          label={t('chat.sessionInfo')}
          onClick={handleOpenInfo}
          disabled={!focusedSessionId}
          active={activeTool === 'info'}
        />
        <ToolbarButton
          icon={<Terminal className="h-4 w-4" />}
          label={t('rightSidebar.openTerminal')}
          onClick={handleOpenTerminal}
          disabled={noWorkspace}
          active={activeTool === 'terminal'}
        />
        <ToolbarButton
          icon={<FolderOpen className="h-4 w-4" />}
          label={t('rightSidebar.openFolder')}
          onClick={handleOpenFolder}
          disabled={noWorkspace}
          active={activeTool === 'files'}
        />
        <ToolbarButton
          icon={<Globe className="h-4 w-4" />}
          label={t('rightSidebar.openBrowser')}
          onClick={handleOpenBrowser}
          active={activeTool === 'browser'}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTool === 'info' && focusedSessionId ? (
          <SessionInfoContent
            sessionId={focusedSessionId}
            sessionFolderPath={focusedSession?.sessionFolderPath}
          />
        ) : activeTool === 'terminal' ? (
          <EmbeddedTerminal cwd={rootPath} className="h-full" />
        ) : activeTool === 'browser' ? (
          <RightSidebarBrowserPanel className="h-full" />
        ) : (
          <WorkspaceFileBrowser rootPath={rootPath} className="h-full" />
        )}
      </div>
    </div>
  )
}
