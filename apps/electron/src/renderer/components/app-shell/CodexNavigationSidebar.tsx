import * as React from 'react'
import { ChevronDown, ChevronRight, Folder, Globe, LoaderCircle, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import type { SessionMeta } from '@/atoms/sessions'
import type { SessionStatus, SessionStatusId } from '@/config/session-status-config'
import type { LabelConfig } from '@craft-agent/shared/labels'
import type { NativeContextMenuItem } from '../../../shared/types'
import { cn } from '@/lib/utils'
import { LeftSidebar, type LinkItem } from './LeftSidebar'
import { useSessionMenuActions } from '@/hooks/useSessionMenuActions'
import { getSessionStatus, hasMessagesMeta, hasUnreadMeta } from '@/utils/session'

export interface CodexSidebarProject {
  id: string
  name: string
  sessions: SessionMeta[]
}

/** Project options available in the session context menu */
export interface CodexSidebarSessionMenuProject {
  id: string
  slug: string
  name: string
  color?: string
}

/** Session right-click menu callbacks (mirrors SessionList/context value) */
export interface CodexSidebarSessionMenuProps {
  sessionStatuses: SessionStatus[]
  labels: LabelConfig[]
  projects: CodexSidebarSessionMenuProject[]
  hasTransferTargets: boolean
  onLabelsChange: (sessionId: string, labels: string[]) => void
  onSetProjectId: (sessionId: string, projectId: string | null) => void
  onRename: (sessionId: string, name: string) => void
  onFlag?: (sessionId: string) => void
  onUnflag?: (sessionId: string) => void
  onArchive?: (sessionId: string) => void
  onUnarchive?: (sessionId: string) => void
  onMarkUnread: (sessionId: string) => void
  onSessionStatusChange: (sessionId: string, state: SessionStatusId) => void
  onOpenInNewWindow: (item: SessionMeta) => void
  onSendToWorkspace?: (sessionIds: string[]) => void
  onDelete: (sessionId: string) => void
}

/** Browser right-click menu callbacks (bookmarks + tabs) */
export interface CodexSidebarBrowserMenuProps {
  /** Open a URL in a new browser tab */
  onOpenUrl: (url: string) => void
  /** Close one or more browser tabs */
  onCloseTabs: (tabIds: string[]) => void
  /** Reload a browser tab */
  onReloadTab?: (tabId: string) => void
  /** Remove a bookmark by url */
  onRemoveBookmark?: (url: string) => void
  /** Copy text to clipboard */
  onCopyText?: (text: string) => void
}

interface CodexNavigationSidebarProps {
  mode: 'sessions' | 'browser'
  workspaceKey: string | null
  header: React.ReactNode
  footer: React.ReactNode
  primaryLinks: LinkItem[]
  pinnedSessions: SessionMeta[]
  projects: CodexSidebarProject[]
  recentSessions: SessionMeta[]
  browserBookmarks: Array<{
    id: string
    title: string
    url: string
    favicon: string | null
  }>
  browserTabs: Array<{
    id: string
    title: string
    url: string
    favicon: string | null
    isLoading?: boolean
  }>
  selectedSessionId?: string | null
  selectedBrowserTabId?: string | null
  projectsOpen: boolean
  onSessionSelect: (sessionId: string) => void
  onProjectsOpen: () => void
  onProjectSessions: (projectId: string) => void
  onNewProjectSession: (projectId: string) => void
  onBookmarkSelect: (url: string) => void
  onBrowserTabSelect: (tabId: string) => void
  /** Session right-click menu wiring (optional — when absent, no context menu) */
  sessionMenu?: CodexSidebarSessionMenuProps
  /** Browser right-click menu wiring (optional — when absent, no context menu) */
  browserMenu?: CodexSidebarBrowserMenuProps
  getItemProps?: React.ComponentProps<typeof LeftSidebar>['getItemProps']
  focusedItemId?: string | null
}

const PROJECT_SESSION_LIMIT = 5

function getSessionTitle(session: SessionMeta, fallback: string) {
  return session.name?.trim() || session.preview?.trim() || fallback
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center px-3 pb-1.5 pt-4 text-[13px] font-medium text-muted-foreground/75">
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  )
}

function nativeLabelItems(
  labels: LabelConfig[],
  appliedIds: Set<string>,
): NativeContextMenuItem[] {
  return labels.map((label) => {
    const toggleItem: NativeContextMenuItem = {
      type: 'checkbox',
      label: label.name,
      action: `label:${encodeURIComponent(label.id)}`,
      checked: appliedIds.has(label.id),
    }
    if (!label.children?.length) return toggleItem
    return {
      label: label.name,
      submenu: [toggleItem, { type: 'separator' }, ...nativeLabelItems(label.children, appliedIds)],
    }
  })
}

function SessionRow({
  session,
  selected,
  onSelect,
  menu,
}: {
  session: SessionMeta
  selected: boolean
  onSelect: () => void
  menu?: CodexSidebarSessionMenuProps
}) {
  const { t } = useTranslation()
  const title = getSessionTitle(session, t('chat.titlePlaceholder'))
  const actions = useSessionMenuActions({
    item: session,
    onLabelsChange: menu ? (labels) => menu.onLabelsChange(session.id, labels) : undefined,
  })

  const openNativeMenu = React.useCallback(async (event: React.MouseEvent) => {
    if (!menu) return
    event.preventDefault()
    event.stopPropagation()

    const currentStatus = getSessionStatus(session)
    const isPinned = session.isPinned === true
    const isFlagged = session.isFlagged === true
    const isArchived = session.isArchived === true
    const items: NativeContextMenuItem[] = [
      session.sharedUrl
        ? {
            label: t('sessionMenu.shared'),
            submenu: [
              { label: t('common.open'), action: 'share:open' },
              { label: t('sessionMenu.copyLink'), action: 'share:copy' },
              { label: t('sessionMenu.updateShare'), action: 'share:update' },
              { type: 'separator' },
              { label: t('sessionMenu.revokeShare'), action: 'share:revoke' },
            ],
          }
        : { label: t('sessionMenu.share'), action: 'share:create' },
      ...(menu.hasTransferTargets && menu.onSendToWorkspace
        ? [{ label: t('sessionMenu.sendToWorkspace'), action: 'send-workspace' } satisfies NativeContextMenuItem]
        : []),
      {
        label: isPinned
          ? t('sessionMenu.unpin', { defaultValue: '取消置顶' })
          : t('sessionMenu.pin', { defaultValue: '置顶会话' }),
        action: 'toggle-pin',
      },
      { type: 'separator' },
      {
        label: t('sessionMenu.status'),
        submenu: menu.sessionStatuses.map((status) => ({
          type: 'checkbox',
          label: status.label,
          action: `status:${encodeURIComponent(status.id)}`,
          checked: currentStatus === status.id,
        })),
      },
      ...(menu.labels.length > 0
        ? [{
            label: t('sessionMenu.labels'),
            submenu: nativeLabelItems(menu.labels, actions.appliedLabelIds),
          } satisfies NativeContextMenuItem]
        : []),
      ...(menu.projects.length > 0
        ? [{
            label: t('sessionMenu.projects'),
            submenu: [
              {
                type: 'checkbox',
                label: t('sessionMenu.noProject'),
                action: 'project:',
                checked: !session.projectId,
              },
              { type: 'separator' },
              ...menu.projects.map((project) => ({
                type: 'checkbox' as const,
                label: project.name,
                action: `project:${encodeURIComponent(project.id)}`,
                checked: session.projectId === project.id,
              })),
            ],
          } satisfies NativeContextMenuItem]
        : []),
      {
        label: isFlagged ? t('sessionMenu.unflag') : t('sessionMenu.flag'),
        action: isFlagged ? 'unflag' : 'flag',
      },
      {
        label: isArchived ? t('sessionMenu.unarchive') : t('sessionMenu.archive'),
        action: isArchived ? 'unarchive' : 'archive',
      },
      ...(!hasUnreadMeta(session) && hasMessagesMeta(session)
        ? [{ label: t('sessionMenu.markAsUnread'), action: 'mark-unread' } satisfies NativeContextMenuItem]
        : []),
      { type: 'separator' },
      { label: t('common.rename'), action: 'rename' },
      { label: t('sessionMenu.regenerateTitle'), action: 'regenerate-title' },
      { type: 'separator' },
      { label: t('sessionMenu.openInNewWindow'), action: 'open-window' },
      {
        label: t('sessionMenu.showInFileManager', { fileManager: t('common.fileManager', { defaultValue: 'Finder' }) }),
        action: 'show-in-file-manager',
      },
      { label: t('sessionMenu.copyPath'), action: 'copy-path' },
      { type: 'separator' },
      { label: t('common.delete'), action: 'delete' },
    ]

    const action = await window.electronAPI.showNativeContextMenu(items)
    if (!action) return
    if (action.startsWith('status:')) {
      menu.onSessionStatusChange(session.id, decodeURIComponent(action.slice('status:'.length)))
      return
    }
    if (action.startsWith('label:')) {
      actions.toggleLabel(decodeURIComponent(action.slice('label:'.length)))
      return
    }
    if (action.startsWith('project:')) {
      const projectId = decodeURIComponent(action.slice('project:'.length))
      menu.onSetProjectId(session.id, projectId || null)
      return
    }

    switch (action) {
      case 'share:create': void actions.share(); break
      case 'share:open': actions.openSharedInBrowser(); break
      case 'share:copy': void actions.copySharedLink(); break
      case 'share:update': void actions.updateShare(); break
      case 'share:revoke': void actions.revokeShare(); break
      case 'send-workspace': menu.onSendToWorkspace?.([session.id]); break
      case 'toggle-pin': void window.electronAPI.sessionCommand(session.id, { type: 'setPinned', pinned: !isPinned }); break
      case 'flag': menu.onFlag?.(session.id); break
      case 'unflag': menu.onUnflag?.(session.id); break
      case 'archive': menu.onArchive?.(session.id); break
      case 'unarchive': menu.onUnarchive?.(session.id); break
      case 'mark-unread': menu.onMarkUnread(session.id); break
      case 'rename': menu.onRename(session.id, title); break
      case 'regenerate-title': void actions.refreshTitle(); break
      case 'open-window': menu.onOpenInNewWindow(session); break
      case 'show-in-file-manager': actions.showInFinder(); break
      case 'copy-path': void actions.copyPath(); break
      case 'delete': menu.onDelete(session.id); break
    }
  }, [actions, menu, session, t, title])

  const row = (
    <motion.button
      type="button"
      onClick={onSelect}
      onContextMenu={openNativeMenu}
      title={title}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className={cn(
        'group flex h-9 w-full min-w-0 items-center gap-2.5 rounded-[8px] pr-2.5 text-left text-[14px] outline-none',
        'transition-[background-color,color,font-weight,transform] duration-150 ease-out',
        'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
        'pl-8',
        selected
          ? 'bg-foreground/[0.075] font-medium text-foreground'
          : 'font-medium text-foreground/82 hover:bg-foreground/[0.05] hover:text-foreground',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {session.isProcessing ? (
        <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : session.hasUnread ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />
      ) : null}
    </motion.button>
  )

  return row
}

function ProjectGroup({
  project,
  collapsed,
  selectedSessionId,
  onToggle,
  onSessionSelect,
  onProjectSessions,
  onNewProjectSession,
  menu,
}: {
  project: CodexSidebarProject
  collapsed: boolean
  selectedSessionId?: string | null
  onToggle: () => void
  onSessionSelect: (sessionId: string) => void
  onProjectSessions: (projectId: string) => void
  onNewProjectSession: (projectId: string) => void
  menu?: CodexSidebarSessionMenuProps
}) {
  const { t } = useTranslation()
  const visibleSessions = project.sessions.slice(0, PROJECT_SESSION_LIMIT)
  const hasMore = project.sessions.length > PROJECT_SESSION_LIMIT

  return (
    <div>
      <div className="group flex h-9 items-center rounded-[8px] pl-1.5 pr-2.5 transition-colors duration-150 hover:bg-foreground/[0.05]">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left text-[14px] font-medium text-foreground/88 outline-none active:scale-[0.99]"
          aria-expanded={!collapsed}
        >
          <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            <Folder className="h-4 w-4 transition-[opacity,transform] duration-150 group-hover:scale-105 group-hover:opacity-0" />
            {collapsed ? (
              <ChevronRight className="absolute h-4 w-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
            ) : (
              <ChevronDown className="absolute h-4 w-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
            )}
          </span>
          <span className="truncate">{project.name}</span>
        </button>
        <button
          type="button"
          onClick={() => onProjectSessions(project.id)}
          className="ml-1 rounded px-1 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        >
          {project.sessions.length}
        </button>
        <button
          type="button"
          onClick={() => onNewProjectSession(project.id)}
          className="ml-0.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          title={t('sidebar.newSessionInProject', { defaultValue: 'New session in this project' })}
          aria-label={t('sidebar.newSessionInProject', { defaultValue: 'New session in this project' })}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {visibleSessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                selected={selectedSessionId === session.id}
                onSelect={() => onSessionSelect(session.id)}
                menu={menu}
              />
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={() => onProjectSessions(project.id)}
                className="h-8 w-full rounded-[8px] pl-8 text-left text-[12px] text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
              >
                {t('common.more')}…
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function getBrowserItemTitle(title: string, url: string, fallback: string) {
  if (title.trim()) return title.trim()
  if (url === 'about:blank' || url.includes('/browser-empty-state.html')) return fallback
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url
  } catch {
    return url || fallback
  }
}

function BrowserItemRow({
  title,
  url,
  favicon,
  selected = false,
  nested = false,
  loading = false,
  onSelect,
  kind,
  tabId,
  menu,
}: {
  title: string
  url: string
  favicon: string | null
  selected?: boolean
  nested?: boolean
  loading?: boolean
  onSelect: () => void
  kind: 'bookmark' | 'tab'
  tabId?: string
  menu?: CodexSidebarBrowserMenuProps
}) {
  const { t } = useTranslation()

  const openNativeMenu = React.useCallback(async (event: React.MouseEvent) => {
    if (!menu) return
    event.preventDefault()
    event.stopPropagation()

    const items: NativeContextMenuItem[] = kind === 'bookmark'
      ? [
          { label: t('browser.openInNewTab', { defaultValue: '在新标签页中打开' }), action: 'open' },
          { label: t('browser.copyLink', { defaultValue: '复制链接' }), action: 'copy' },
          ...(menu.onRemoveBookmark
            ? [
                { type: 'separator' } as const,
                { label: t('browser.removeBookmark', { defaultValue: '删除书签' }), action: 'remove' },
              ]
            : []),
        ]
      : [
          ...(menu.onReloadTab && tabId
            ? [{ label: t('browser.reload', { defaultValue: '刷新' }), action: 'reload' }]
            : []),
          { label: t('browser.copyLink', { defaultValue: '复制链接' }), action: 'copy' },
          ...(tabId
            ? [
                { type: 'separator' } as const,
                { label: t('browser.closeTab', { defaultValue: '关闭标签页' }), action: 'close' },
              ]
            : []),
        ]

    const action = await window.electronAPI.showNativeContextMenu(items)
    switch (action) {
      case 'open': menu.onOpenUrl(url); break
      case 'copy': menu.onCopyText?.(url); break
      case 'remove': menu.onRemoveBookmark?.(url); break
      case 'reload': if (tabId) menu.onReloadTab?.(tabId); break
      case 'close': if (tabId) menu.onCloseTabs([tabId]); break
    }
  }, [kind, menu, t, tabId, url])

  const row = (
    <motion.button
      type="button"
      onClick={onSelect}
      onContextMenu={openNativeMenu}
      title={title}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className={cn(
        'group flex h-9 w-full min-w-0 items-center gap-2.5 rounded-[8px] pr-2.5 text-left text-[14px] outline-none',
        'transition-[background-color,color,font-weight,transform] duration-150 ease-out',
        'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
        nested ? 'pl-8' : 'pl-1.5',
        selected
          ? 'bg-foreground/[0.075] font-medium text-foreground'
          : 'font-medium text-foreground/82 hover:bg-foreground/[0.05] hover:text-foreground',
      )}
    >
      {favicon ? (
        <img src={favicon} alt="" className="h-4 w-4 shrink-0 rounded-sm object-contain transition-transform duration-150 group-hover:scale-105" />
      ) : loading ? (
        <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Globe className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:scale-105" strokeWidth={1.7} />
      )}
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </motion.button>
  )

  return row
}

export function CodexNavigationSidebar({
  mode,
  workspaceKey,
  header,
  footer,
  primaryLinks,
  pinnedSessions,
  projects,
  recentSessions,
  browserBookmarks,
  browserTabs,
  selectedSessionId,
  selectedBrowserTabId,
  projectsOpen,
  onSessionSelect,
  onProjectsOpen,
  onProjectSessions,
  onNewProjectSession,
  onBookmarkSelect,
  onBrowserTabSelect,
  sessionMenu,
  browserMenu,
  getItemProps,
  focusedItemId,
}: CodexNavigationSidebarProps) {
  const { t } = useTranslation()
  const [collapsedProjects, setCollapsedProjects] = React.useState<Set<string>>(() => new Set())
  const [bookmarksCollapsed, setBookmarksCollapsed] = React.useState(false)

  React.useEffect(() => {
    setCollapsedProjects(new Set())
    setBookmarksCollapsed(false)
  }, [workspaceKey])

  const toggleProject = React.useCallback((projectId: string) => {
    setCollapsedProjects((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          'min-h-0 flex-1',
          'overflow-x-hidden overflow-y-auto scrollbar-hide pb-4',
        )}
      >
        {header}
        {mode === 'sessions' ? (
          <>
            <div className="ca-codex-primary-nav">
              <LeftSidebar isCollapsed={false} links={primaryLinks} gapClassName="gap-[1px]" getItemProps={getItemProps} focusedItemId={focusedItemId} />
            </div>

            {pinnedSessions.length > 0 && (
              <section>
                <SectionLabel>{t('sidebar.pinned')}</SectionLabel>
                <div className="px-[6px]">
                  {pinnedSessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      selected={selectedSessionId === session.id}
                      onSelect={() => onSessionSelect(session.id)}
                      menu={sessionMenu}
                    />
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionLabel>
                <button
                  type="button"
                  onClick={onProjectsOpen}
                  className={cn(
                    'rounded-[5px] text-left font-medium transition-colors hover:text-foreground',
                    projectsOpen && 'text-foreground',
                  )}
                  aria-current={projectsOpen ? 'page' : undefined}
                >
                  {t('sidebar.projects')}
                </button>
              </SectionLabel>
              {projects.length > 0 && (
                <div className="px-[6px]">
                  {projects.map((project) => (
                    <ProjectGroup
                      key={project.id}
                      project={project}
                      collapsed={collapsedProjects.has(project.id)}
                      selectedSessionId={selectedSessionId}
                      onToggle={() => toggleProject(project.id)}
                      onSessionSelect={onSessionSelect}
                      onProjectSessions={onProjectSessions}
                      onNewProjectSession={onNewProjectSession}
                      menu={sessionMenu}
                    />
                  ))}
                </div>
              )}
            </section>

            {recentSessions.length > 0 && (
              <section>
                <SectionLabel>{t('sidebar.allSessions')}</SectionLabel>
                <div className="px-[6px]">
                  {recentSessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      selected={selectedSessionId === session.id}
                      onSelect={() => onSessionSelect(session.id)}
                      menu={sessionMenu}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            <section className="px-[6px] pt-2">
              <div className="group flex h-9 items-center rounded-[8px] pl-1.5 pr-2.5 transition-colors duration-150 hover:bg-foreground/[0.05]">
                <button
                  type="button"
                  onClick={() => setBookmarksCollapsed((value) => !value)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left text-[14px] font-medium text-foreground/88 outline-none active:scale-[0.99]"
                  aria-expanded={!bookmarksCollapsed}
                >
                  <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                    <Folder className="h-4 w-4 transition-[opacity,transform] duration-150 group-hover:scale-105 group-hover:opacity-0" />
                    {bookmarksCollapsed ? (
                      <ChevronRight className="absolute h-4 w-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                    ) : (
                      <ChevronDown className="absolute h-4 w-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                    )}
                  </span>
                  <span className="truncate">{t('sidebar.bookmarkBar', { defaultValue: '书签栏' })}</span>
                </button>
                <span className="ml-1 px-1 text-[11px] tabular-nums text-muted-foreground">{browserBookmarks.length}</span>
              </div>
              <AnimatePresence initial={false}>
                {!bookmarksCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                  {browserBookmarks.length > 0 ? (
                    browserBookmarks.map((bookmark) => (
                      <BrowserItemRow
                        key={bookmark.id}
                        title={getBrowserItemTitle(bookmark.title, bookmark.url, t('browser.newTab'))}
                        url={bookmark.url}
                        favicon={bookmark.favicon}
                        nested
                        kind="bookmark"
                        menu={browserMenu}
                        onSelect={() => onBookmarkSelect(bookmark.url)}
                      />
                    ))
                  ) : (
                    <div className="h-8 pl-8 pr-2 text-[12px] leading-8 text-muted-foreground/70">
                      {t('sidebar.noBookmarks', { defaultValue: '暂无书签' })}
                    </div>
                  )}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            <section>
              <SectionLabel>{t('sidebar.browserTabs', { defaultValue: '标签页' })}</SectionLabel>
              <div className="px-[6px]">
                {browserTabs.length > 0 ? (
                  browserTabs.map((tab) => (
                    <BrowserItemRow
                      key={tab.id}
                      title={getBrowserItemTitle(tab.title, tab.url, t('browser.newTab'))}
                      url={tab.url}
                      favicon={tab.favicon}
                      loading={tab.isLoading}
                      selected={selectedBrowserTabId === tab.id}
                      kind="tab"
                      tabId={tab.id}
                      menu={browserMenu}
                      onSelect={() => onBrowserTabSelect(tab.id)}
                    />
                  ))
                ) : (
                  <div className="h-9 px-3 text-[12px] leading-9 text-muted-foreground/70">
                    {t('sidebar.noBrowserTabs', { defaultValue: '暂无标签页' })}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>

      <div className="shrink-0 pt-1">{footer}</div>
    </div>
  )
}
