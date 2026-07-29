import { formatDistanceToNowStrict } from 'date-fns'
import type { Locale } from 'date-fns'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Globe,
  Loader2,
  Pin,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EntityRow } from '@/components/ui/entity-row'
import { EntityList } from '@/components/ui/entity-list'
import { shortTimeLocale } from '@/utils/session'
import * as storage from '@/lib/local-storage'
import type { BrowserTabMenuAction } from '../../../shared/types'
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
  onShowTabMenu: (kind: 'permissions', tab: BrowserWorkspaceTab) => void
  lastAccessedAtById?: Record<string, number>
}

type BrowserListItem = { kind: 'tab'; tab: BrowserWorkspaceTab }

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
  lastAccessedAtById = {},
}: BrowserTabsListPanelProps) {
  const { t } = useTranslation()
  const navState = useNavigationState()
  const { updateRightSidebar } = useNavigation()
  const newTabLabel = t('browser.newTab', { defaultValue: 'New Tab' })
  const [extensions, setExtensions] = useState<BrowserExtensionEntry[]>([])
  const [bookmarkedUrls, setBookmarkedUrls] = useState<Set<string>>(new Set())
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
    () =>
      new Set(
        storage.get<string[]>(
          storage.KEYS.browserCollapsedGroups,
          storage.get<string[]>(storage.KEYS.legacyCollapsedExploreGroups, []),
        ),
      ),
  )
  useEffect(() => {
    storage.set(storage.KEYS.browserCollapsedGroups, Array.from(collapsedGroups))
    storage.remove(storage.KEYS.legacyCollapsedExploreGroups)
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

  const runTabMenuAction = useCallback(
    (action: BrowserTabMenuAction | null, tab: BrowserWorkspaceTab) => {
      if (!action) return
      if (action.startsWith('extension:')) {
        const extensionId = action.slice('extension:'.length)
        if (extensionId) void window.electronAPI.browserPane.openExtensionAction(extensionId, tab.id)
        return
      }

      switch (action) {
        case 'back':
          onTabGoBack(tab.id)
          break
        case 'forward':
          onTabGoForward(tab.id)
          break
        case 'reload-or-stop':
          if (tab.isLoading) onTabStop(tab.id)
          else onTabReload(tab.id)
          break
        case 'copy-link':
          onCopyLink(tab)
          break
        case 'toggle-bookmark':
          void Promise.resolve(onToggleBookmark(tab)).then(refreshBookmarks)
          break
        case 'toggle-pinned':
          onTogglePinned(tab.id)
          break
        case 'toggle-muted':
          onToggleMuted(tab)
          break
        case 'toggle-assistant':
          toggleAssistant()
          break
        case 'site-permissions':
          onShowTabMenu('permissions', tab)
          break
        case 'close':
          onTabClose(tab.id)
          break
        case 'close-other-tabs':
          onCloseOtherTabs(tab.id)
          break
        case 'close-tabs-below':
          onCloseTabsBelow(tab.id)
          break
      }
    },
    [
      onCloseOtherTabs,
      onCloseTabsBelow,
      onCopyLink,
      onShowTabMenu,
      onTabClose,
      onTabGoBack,
      onTabGoForward,
      onTabReload,
      onTabStop,
      onToggleBookmark,
      onToggleMuted,
      onTogglePinned,
      refreshBookmarks,
      toggleAssistant,
    ],
  )

  const groups = useMemo(() => {
    const tabItems = tabs.map((tab): BrowserListItem => ({ kind: 'tab', tab }))

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
    <EntityList<BrowserListItem>
      groups={groups}
      getKey={(item) => `tab:${item.tab.id}`}
      containerProps={{ 'data-list-role': 'browser-tabs' }}
      collapsedGroups={collapsedGroups}
      onToggleCollapse={toggleGroupCollapse}
      onCollapseAll={collapseAllGroups}
      onExpandAll={expandAllGroups}
      renderItem={(item) => {
        const tab = item.tab
        const isSelected = tab.id === selectedTabId
        const isBlankTab = !tab.url || tab.url === 'about:blank'
        const title = isBlankTab ? newTabLabel : tab.title.trim() || tab.url
        const hasWebUrl = !!tab.url && /^https?:/i.test(tab.url)
        const isBookmarked = bookmarkedUrls.has(tab.url)
        const tabIndex = tabs.findIndex((candidate) => candidate.id === tab.id)
        const hasClosableOtherTabs = tabs.some((candidate) => candidate.id !== tab.id && !candidate.pinned)
        const hasClosableTabsBelow = tabs.slice(tabIndex + 1).some((candidate) => !candidate.pinned)
        const lastAccessedAt = lastAccessedAtById[tab.id]
        const openNativeTabMenu = async () => {
          const action = await window.electronAPI.browserPane.showTabMenu({
            tabId: tab.id,
            pinned: tab.pinned === true,
            hasWebUrl,
            isBookmarked,
            hasClosableOtherTabs,
            hasClosableTabsBelow,
            rightSidebarOpen,
            extensions: sortedExtensions.map((extension) => ({
              id: extension.id,
              name: extension.name,
              hasAction: extension.hasAction,
            })),
          })
          runTabMenuAction(action, tab)
        }

        return (
          <EntityRow
            key={tab.id}
            isSelected={isSelected}
            onClick={() => onTabClick(tab.id)}
            showSeparator={tabIndex > 0}
            separatorClassName="pl-[42px] pr-3"
            icon={
              <span className="!flex !h-5 !w-5 shrink-0 items-center justify-center overflow-hidden rounded-full">
                {tab.isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : tab.favicon ? (
                  <img src={tab.favicon} alt="" className="h-4 w-4 rounded-sm object-contain" />
                ) : (
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </span>
            }
            title={title}
            titleClassName="text-control"
            onOpenNativeMenu={openNativeTabMenu}
            titleSuffix={
              tab.pinned
                ? <Pin className="h-3 w-3 text-muted-foreground/70" />
                : undefined
            }
            titleTrailing={
              lastAccessedAt ? (
                <span className="text-[11px] text-foreground/40 whitespace-nowrap">
                  {formatDistanceToNowStrict(new Date(lastAccessedAt), { locale: shortTimeLocale as Locale, roundingMethod: 'floor' })}
                </span>
              ) : undefined
            }
          />
        )
      }}
    />
  )
}
