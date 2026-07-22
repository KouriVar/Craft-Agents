import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Globe,
  KeyRound,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  Puzzle,
  RotateCw,
  ShieldCheck,
  Star,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { EntityList } from '@/components/ui/entity-list'
import {
  ContextMenu,
  ContextMenuTrigger,
  StyledContextMenuContent,
  StyledContextMenuItem,
  StyledContextMenuSeparator,
  StyledContextMenuSub,
  StyledContextMenuSubTrigger,
  StyledContextMenuSubContent,
} from '@/components/ui/styled-context-menu'
import { cn } from '@/lib/utils'
import * as storage from '@/lib/local-storage'
import type { BrowserWorkspaceTab } from '@/atoms/browser-workspace'
import type { BrowserExtensionEntry } from '../../../shared/types'
import { useNavigation, useNavigationState } from '@/contexts/NavigationContext'

interface BrowserTabsListPanelProps {
  tabs: BrowserWorkspaceTab[]
  selectedTabId?: string | null
  onTabClick: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabGoBack: (tabId: string) => void
  onTabGoForward: (tabId: string) => void
  onTabReload: (tabId: string) => void
  onTabStop: (tabId: string) => void
  onCopyLink: (tab: BrowserWorkspaceTab) => void
  onToggleBookmark: (tab: BrowserWorkspaceTab) => void | Promise<void>
  onTogglePinned: (tabId: string) => void
  onToggleMuted: (tab: BrowserWorkspaceTab) => void
  onCloseOtherTabs: (tabId: string) => void
  onCloseTabsBelow: (tabId: string) => void
  onShowTabMenu: (kind: 'permissions' | 'passwords', tab: BrowserWorkspaceTab) => void
}

type ExploreListItem = { kind: 'tab'; tab: BrowserWorkspaceTab }

export function BrowserTabsListPanel({
  tabs,
  selectedTabId,
  onTabClick,
  onTabClose,
  onTabGoBack,
  onTabGoForward,
  onTabReload,
  onTabStop,
  onCopyLink,
  onToggleBookmark,
  onTogglePinned,
  onToggleMuted,
  onCloseOtherTabs,
  onCloseTabsBelow,
  onShowTabMenu,
}: BrowserTabsListPanelProps) {
  const { t } = useTranslation()
  const navState = useNavigationState()
  const { updateRightSidebar } = useNavigation()
  const newTabLabel = t('browser.newTab', { defaultValue: 'New Tab' })
  const [extensions, setExtensions] = useState<BrowserExtensionEntry[]>([])
  const [bookmarkedUrls, setBookmarkedUrls] = useState<Set<string>>(new Set())
  const [menuBoundary, setMenuBoundary] = useState<HTMLDivElement | null>(null)
  const rightSidebarOpen = !!navState.rightSidebar

  const toggleAssistant = useCallback(() => {
    if (rightSidebarOpen) {
      updateRightSidebar(undefined)
      return
    }
    updateRightSidebar({ type: 'review' })
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('craft:right-sidebar-open-chat'))
    }, 0)
  }, [rightSidebarOpen, updateRightSidebar])

  // Collapsed group state — persisted so the user's layout survives restarts.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(storage.get<string[]>(storage.KEYS.collapsedExploreGroups, [])),
  )
  useEffect(() => {
    storage.set(storage.KEYS.collapsedExploreGroups, Array.from(collapsedGroups))
  }, [collapsedGroups])

  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }, [])
  const collapseAllGroups = useCallback(() => setCollapsedGroups(new Set(['tabs'])), [])
  const expandAllGroups = useCallback(() => setCollapsedGroups(new Set()), [])

  const refreshExtensions = useCallback(async () => {
    const next = await window.electronAPI.browserPane.listExtensions()
    setExtensions(next.filter((extension) => !extension.hidden && extension.hasAction))
  }, [])

  const refreshBookmarks = useCallback(async () => {
    const bookmarks = await window.electronAPI.browserPane.listBookmarks()
    setBookmarkedUrls(new Set(bookmarks.map((bookmark) => bookmark.url)))
  }, [])

  useEffect(() => {
    void refreshExtensions()
    void refreshBookmarks()
    const refresh = () => {
      void refreshExtensions()
    }
    window.addEventListener('craft-browser-extensions-changed', refresh)
    const unsubscribeProfile = window.electronAPI.browserPane.onProfileChanged((kind) => {
      if (kind === 'bookmarks') void refreshBookmarks()
    })
    return () => {
      window.removeEventListener('craft-browser-extensions-changed', refresh)
      unsubscribeProfile()
    }
  }, [refreshBookmarks, refreshExtensions])

  const sortedExtensions = useMemo(
    () => [...extensions].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)),
    [extensions],
  )

  const groups = useMemo(() => {
    const tabItems = tabs.map((tab): ExploreListItem => ({ kind: 'tab', tab }))

    // Web mode shows only browser tabs — the session list lives in the
    // sessions perspective, so it is intentionally omitted here.
    return [
      {
        key: 'tabs',
        label: t('browser.tabs', { defaultValue: 'Tabs' }),
        collapsible: true,
        items: tabItems,
        collapsedCount: tabItems.length,
      },
    ]
      .filter((group) => group.collapsedCount > 0)
      .map((group) => (collapsedGroups.has(group.key) ? { ...group, items: [] } : group))
  }, [t, tabs, collapsedGroups])

  return (
    <div ref={setMenuBoundary} className="flex min-h-0 flex-1 flex-col">
    <EntityList<ExploreListItem>
      groups={groups}
      getKey={(item) => `tab:${item.tab.id}`}
      containerProps={{ 'data-list-role': 'browser-tabs' }}
      collapsedGroups={collapsedGroups}
      onToggleCollapse={toggleGroupCollapse}
      onCollapseAll={collapseAllGroups}
      onExpandAll={expandAllGroups}
      renderItem={(item, _index, isFirst) => {
        const tab = item.tab
        const isSelected = tab.id === selectedTabId
        const isBlankTab = !tab.url || tab.url === 'about:blank'
          const title = isBlankTab ? newTabLabel : tab.title.trim() || tab.url
        const hasWebUrl = !!tab.url && /^https?:/i.test(tab.url)
          const isBookmarked = bookmarkedUrls.has(tab.url)
          const tabIndex = tabs.findIndex((candidate) => candidate.id === tab.id)
          const hasClosableOtherTabs = tabs.some((candidate) => candidate.id !== tab.id && !candidate.pinned)
          const hasClosableTabsBelow = tabs.slice(tabIndex + 1).some((candidate) => !candidate.pinned)

        return (
            <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>
              <div
                className={cn(
                  'group relative mx-2 rounded-surface transition-colors',
                  isSelected ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/[0.03]',
                )}
              >
                {!isFirst && <div className="absolute left-10 right-3 top-0 border-t border-border/40" />}
                <button
                  type="button"
                  onClick={() => onTabClick(tab.id)}
                  className="grid min-h-[54px] w-full grid-cols-[24px_minmax(0,1fr)_24px] items-center gap-2.5 px-2.5 text-left"
                  aria-current={isSelected ? 'page' : undefined}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-control bg-foreground/[0.04]">
                    {tab.isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : tab.favicon ? (
                      <img src={tab.favicon} alt="" className="h-4 w-4 object-contain" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col justify-center">
                    <span className="block truncate text-sm font-medium leading-5 text-foreground">{title}</span>
                    {!isBlankTab && (
                      <span className="mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground" title={tab.url}>
                        {tab.url}
                      </span>
                    )}
                  </span>
                    <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center">
                      {tab.pinned && <Pin className="h-3.5 w-3.5 text-muted-foreground/70" />}
                    </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={(event) => {
                    event.stopPropagation()
                    onTabClose(tab.id)
                  }}
                  className={cn(
                    'absolute right-2.5 top-1/2 size-6 -translate-y-1/2 rounded-control',
                    'text-muted-foreground opacity-0 transition-[opacity,color,background-color]',
                    'hover:bg-foreground/[0.06] hover:text-destructive group-hover:opacity-100',
                    isSelected && 'opacity-60 hover:opacity-100',
                  )}
                    aria-label={t('browser.closeTab', {
                      defaultValue: 'Close tab',
                    })}
                  title={t('browser.closeTab', { defaultValue: 'Close tab' })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </ContextMenuTrigger>
              <StyledContextMenuContent
                collisionBoundary={menuBoundary}
                collisionPadding={8}
                data-native-view-passthrough="true"
                minWidth="min-w-52"
              >
              <StyledContextMenuItem disabled={!tab.canGoBack} onClick={() => onTabGoBack(tab.id)}>
                <ArrowLeft />
                <span className="flex-1">{t('browser.back', { defaultValue: 'Back' })}</span>
              </StyledContextMenuItem>
              <StyledContextMenuItem disabled={!tab.canGoForward} onClick={() => onTabGoForward(tab.id)}>
                <ArrowRight />
                <span className="flex-1">{t('browser.forward', { defaultValue: 'Forward' })}</span>
              </StyledContextMenuItem>
                <StyledContextMenuItem onClick={() => (tab.isLoading ? onTabStop(tab.id) : onTabReload(tab.id))}>
                {tab.isLoading ? <X /> : <RotateCw />}
                <span className="flex-1">{tab.isLoading ? t('browser.stopLoading') : t('common.reload')}</span>
              </StyledContextMenuItem>
              <StyledContextMenuSeparator />
              <StyledContextMenuItem disabled={!hasWebUrl} onClick={() => onCopyLink(tab)}>
                <Copy />
                <span className="flex-1">{t('browser.copyLink', { defaultValue: 'Copy link' })}</span>
              </StyledContextMenuItem>
                <StyledContextMenuItem
                  disabled={!hasWebUrl}
                  onClick={() => {
                    void Promise.resolve(onToggleBookmark(tab)).then(refreshBookmarks)
                  }}
                >
                  <Star className={isBookmarked ? 'fill-current text-foreground' : undefined} />
                  <span className="flex-1">
                    {isBookmarked
                      ? t('browser.removeBookmark', {
                          defaultValue: 'Remove bookmark',
                        })
                      : t('browser.addBookmark', {
                          defaultValue: 'Add to bookmarks',
                        })}
                  </span>
              </StyledContextMenuItem>
                <StyledContextMenuItem onClick={() => onTogglePinned(tab.id)}>
                  <Pin className={tab.pinned ? 'fill-current text-foreground' : undefined} />
                  <span className="flex-1">
                    {tab.pinned ? t('browser.unpinTab', { defaultValue: 'Unpin tab' }) : t('browser.pinTab', { defaultValue: 'Pin tab' })}
                  </span>
                </StyledContextMenuItem>
                <StyledContextMenuItem disabled={isBlankTab} onClick={() => onToggleMuted(tab)}>
                  {tab.muted ? <Volume2 /> : <VolumeX />}
                <span className="flex-1">
                    {tab.muted
                      ? t('browser.unmuteSite', { defaultValue: 'Unmute site' })
                      : t('browser.muteSite', { defaultValue: 'Mute site' })}
                </span>
              </StyledContextMenuItem>
                <StyledContextMenuItem onClick={toggleAssistant}>
                  {rightSidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}
                  <span className="flex-1">{rightSidebarOpen ? t('rightSidebar.closePanel') : t('rightSidebar.openSession')}</span>
                </StyledContextMenuItem>
              <StyledContextMenuSeparator />
              <StyledContextMenuItem disabled={!hasWebUrl} onClick={() => onShowTabMenu('passwords', tab)}>
                <KeyRound />
                <span className="flex-1">{t('browser.passwords', { defaultValue: 'Passwords' })}</span>
              </StyledContextMenuItem>
              <StyledContextMenuItem disabled={!hasWebUrl} onClick={() => onShowTabMenu('permissions', tab)}>
                <ShieldCheck />
                  <span className="flex-1">
                    {t('browser.sitePermissions', {
                      defaultValue: 'Site permissions',
                    })}
                  </span>
              </StyledContextMenuItem>
              {sortedExtensions.length > 0 && (
                <StyledContextMenuSub>
                  <StyledContextMenuSubTrigger>
                    <Puzzle />
                      <span className="flex-1">
                        {t('plugins.browserExtensions', {
                          defaultValue: 'Extensions',
                        })}
                      </span>
                  </StyledContextMenuSubTrigger>
                    <StyledContextMenuSubContent collisionBoundary={menuBoundary} collisionPadding={8} data-native-view-passthrough="true">
                    {sortedExtensions.map((extension) => (
                      <StyledContextMenuItem
                        key={extension.id}
                        onClick={() => void window.electronAPI.browserPane.openExtensionAction(extension.id, tab.id)}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-menu-item bg-foreground/[0.04]">
                            {extension.icon ? (
                              <img src={extension.icon} alt="" className="h-3.5 w-3.5 object-contain" />
                            ) : (
                              <Puzzle className="h-3 w-3" />
                            )}
                        </span>
                        <span className="flex-1 truncate">{extension.name}</span>
                      </StyledContextMenuItem>
                    ))}
                  </StyledContextMenuSubContent>
                </StyledContextMenuSub>
              )}
              <StyledContextMenuSeparator />
              <StyledContextMenuItem variant="destructive" onClick={() => onTabClose(tab.id)}>
                <X />
                <span className="flex-1">{t('browser.closeTab', { defaultValue: 'Close tab' })}</span>
              </StyledContextMenuItem>
                <StyledContextMenuItem disabled={!hasClosableOtherTabs} onClick={() => onCloseOtherTabs(tab.id)}>
                  <X />
                  <span className="flex-1">
                    {t('browser.closeOtherTabs', {
                      defaultValue: 'Close other tabs',
                    })}
                  </span>
                </StyledContextMenuItem>
                <StyledContextMenuItem disabled={!hasClosableTabsBelow} onClick={() => onCloseTabsBelow(tab.id)}>
                  <X />
                  <span className="flex-1">
                    {t('browser.closeTabsBelow', {
                      defaultValue: 'Close tabs below',
                    })}
                  </span>
                </StyledContextMenuItem>
            </StyledContextMenuContent>
          </ContextMenu>
        )
      }}
    />
    </div>
  )
}
