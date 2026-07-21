import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Copy, Globe, KeyRound, Loader2, Puzzle, RotateCw, ShieldCheck, Star, X } from 'lucide-react'
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
  onToggleBookmark: (tab: BrowserWorkspaceTab) => void
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
  onShowTabMenu,
}: BrowserTabsListPanelProps) {
  const { t } = useTranslation()
  const newTabLabel = t('browser.newTab', { defaultValue: 'New Tab' })
  const [extensions, setExtensions] = useState<BrowserExtensionEntry[]>([])

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

  useEffect(() => {
    void refreshExtensions()
    const refresh = () => { void refreshExtensions() }
    window.addEventListener('craft-browser-extensions-changed', refresh)
    return () => window.removeEventListener('craft-browser-extensions-changed', refresh)
  }, [refreshExtensions])

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
      .map((group) => collapsedGroups.has(group.key) ? { ...group, items: [] } : group)
  }, [t, tabs, collapsedGroups])

  return (
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
        const title = isBlankTab
          ? newTabLabel
          : (tab.title.trim() || tab.url)
        const hasWebUrl = !!tab.url && /^https?:/i.test(tab.url)

        return (
          <ContextMenu modal>
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
                  className="flex min-h-[54px] w-full items-center gap-2.5 px-2.5 pr-9 text-left"
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
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{title}</span>
                    {!isBlankTab && (
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground" title={tab.url}>
                        {tab.url}
                      </span>
                    )}
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
                    'absolute right-2 top-[15px] size-6 rounded-control',
                    'text-muted-foreground opacity-0 transition-[opacity,color,background-color]',
                    'hover:bg-foreground/[0.06] hover:text-destructive group-hover:opacity-100',
                    isSelected && 'opacity-60 hover:opacity-100',
                  )}
                  aria-label={t('browser.closeTab', { defaultValue: 'Close tab' })}
                  title={t('browser.closeTab', { defaultValue: 'Close tab' })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </ContextMenuTrigger>
            <StyledContextMenuContent>
              <StyledContextMenuItem disabled={!tab.canGoBack} onClick={() => onTabGoBack(tab.id)}>
                <ArrowLeft />
                <span className="flex-1">{t('browser.back', { defaultValue: 'Back' })}</span>
              </StyledContextMenuItem>
              <StyledContextMenuItem disabled={!tab.canGoForward} onClick={() => onTabGoForward(tab.id)}>
                <ArrowRight />
                <span className="flex-1">{t('browser.forward', { defaultValue: 'Forward' })}</span>
              </StyledContextMenuItem>
              <StyledContextMenuItem onClick={() => tab.isLoading ? onTabStop(tab.id) : onTabReload(tab.id)}>
                {tab.isLoading ? <X /> : <RotateCw />}
                <span className="flex-1">{tab.isLoading ? t('browser.stopLoading') : t('common.reload')}</span>
              </StyledContextMenuItem>
              <StyledContextMenuSeparator />
              <StyledContextMenuItem disabled={!hasWebUrl} onClick={() => onCopyLink(tab)}>
                <Copy />
                <span className="flex-1">{t('browser.copyLink', { defaultValue: 'Copy link' })}</span>
              </StyledContextMenuItem>
              <StyledContextMenuItem disabled={!hasWebUrl} onClick={() => onToggleBookmark(tab)}>
                <Star />
                <span className="flex-1">{t('browser.toggleBookmark', { defaultValue: 'Toggle bookmark' })}</span>
              </StyledContextMenuItem>
              <StyledContextMenuSeparator />
              <StyledContextMenuItem disabled={!hasWebUrl} onClick={() => onShowTabMenu('passwords', tab)}>
                <KeyRound />
                <span className="flex-1">{t('browser.passwords', { defaultValue: 'Passwords' })}</span>
              </StyledContextMenuItem>
              <StyledContextMenuItem disabled={!hasWebUrl} onClick={() => onShowTabMenu('permissions', tab)}>
                <ShieldCheck />
                <span className="flex-1">{t('browser.sitePermissions', { defaultValue: 'Site permissions' })}</span>
              </StyledContextMenuItem>
              {sortedExtensions.length > 0 && (
                <StyledContextMenuSub>
                  <StyledContextMenuSubTrigger>
                    <Puzzle />
                    <span className="flex-1">{t('plugins.browserExtensions', { defaultValue: 'Extensions' })}</span>
                  </StyledContextMenuSubTrigger>
                  <StyledContextMenuSubContent>
                    {sortedExtensions.map((extension) => (
                      <StyledContextMenuItem
                        key={extension.id}
                        onClick={() => void window.electronAPI.browserPane.openExtensionAction(extension.id, tab.id)}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-menu-item bg-foreground/[0.04]">
                          {extension.icon ? <img src={extension.icon} alt="" className="h-3.5 w-3.5 object-contain" /> : <Puzzle className="h-3 w-3" />}
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
            </StyledContextMenuContent>
          </ContextMenu>
        )
      }}
    />
  )
}
