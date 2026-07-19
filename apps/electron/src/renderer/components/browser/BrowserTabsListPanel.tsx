import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Copy, Ellipsis, Globe, KeyRound, Loader2, MessageCircle, Pin, Puzzle, RotateCw, ShieldCheck, Star, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EntityList } from '@/components/ui/entity-list'
import { cn } from '@/lib/utils'
import type { BrowserWorkspaceTab } from '@/atoms/browser-workspace'
import type { SessionMeta } from '@/atoms/sessions'
import { getSessionTitle, hasUnreadMeta } from '@/utils/session'
import type { BrowserExtensionEntry } from '../../../shared/types'

interface BrowserTabsListPanelProps {
  tabs: BrowserWorkspaceTab[]
  sessions?: SessionMeta[]
  selectedTabId?: string | null
  selectedSessionId?: string | null
  onTabClick: (tabId: string) => void
  onSessionClick?: (sessionId: string) => void
  onTabClose: (tabId: string) => void
  onTabGoBack: (tabId: string) => void
  onTabGoForward: (tabId: string) => void
  onTabReload: (tabId: string) => void
  onTabStop: (tabId: string) => void
  onCopyLink: (tab: BrowserWorkspaceTab) => void
  onToggleBookmark: (tab: BrowserWorkspaceTab) => void
  onShowTabMenu: (kind: 'permissions' | 'passwords', tab: BrowserWorkspaceTab) => void
}

type ExploreListItem =
  | { kind: 'tab'; tab: BrowserWorkspaceTab }
  | { kind: 'session'; session: SessionMeta }

function getTabSubtitle(tab: BrowserWorkspaceTab, newTabLabel: string): string {
  if (!tab.url || tab.url === 'about:blank') return newTabLabel
  try {
    return new URL(tab.url).hostname.replace(/^www\./, '') || tab.url
  } catch {
    return tab.url
  }
}

export function BrowserTabsListPanel({
  tabs,
  sessions = [],
  selectedTabId,
  selectedSessionId,
  onTabClick,
  onSessionClick,
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
  const [openActionsTabId, setOpenActionsTabId] = useState<string | null>(null)
  const [extensionsExpanded, setExtensionsExpanded] = useState(false)
  const [extensions, setExtensions] = useState<BrowserExtensionEntry[]>([])

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

  useEffect(() => {
    if (openActionsTabId && openActionsTabId !== selectedTabId) setOpenActionsTabId(null)
  }, [openActionsTabId, selectedTabId])

  const sortedExtensions = useMemo(
    () => [...extensions].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)),
    [extensions],
  )
  const groups = useMemo(() => [
    {
      key: 'tabs',
      label: t('browser.tabs', { defaultValue: 'Tabs' }),
      items: tabs.map((tab): ExploreListItem => ({ kind: 'tab', tab })),
    },
    {
      key: 'chats',
      label: t('sidebar.allSessions', { defaultValue: 'Chats' }),
      items: sessions
        .slice()
        .sort((left, right) => (right.lastMessageAt ?? 0) - (left.lastMessageAt ?? 0))
        .slice(0, 50)
        .map((session): ExploreListItem => ({ kind: 'session', session })),
    },
  ].filter((group) => group.items.length > 0), [sessions, t, tabs])

  const toggleExtensionPin = useCallback(async (extension: BrowserExtensionEntry) => {
    await window.electronAPI.browserPane.setExtensionPreference(extension.id, {
      pinned: !extension.pinned,
      hidden: false,
    })
    await refreshExtensions()
    window.dispatchEvent(new Event('craft-browser-extensions-changed'))
  }, [refreshExtensions])

  return (
    <EntityList<ExploreListItem>
      groups={groups}
      getKey={(item) => item.kind === 'tab' ? `tab:${item.tab.id}` : `session:${item.session.id}`}
      containerProps={{ 'data-list-role': 'browser-tabs' }}
      renderItem={(item, _index, isFirst) => {
        if (item.kind === 'session') {
          const session = item.session
          const isSelected = session.id === selectedSessionId
          return (
            <div
              className={cn(
                'group relative mx-2 rounded-[8px] transition-colors',
                isSelected ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/[0.03]',
              )}
            >
              {!isFirst && <div className="absolute left-10 right-3 top-0 border-t border-border/40" />}
              <button
                type="button"
                onClick={() => onSessionClick?.(session.id)}
                className="flex min-h-[48px] w-full items-center gap-2.5 px-2.5 text-left"
                aria-current={isSelected ? 'page' : undefined}
              >
                <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-foreground/[0.04] text-muted-foreground">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {(session.isProcessing || hasUnreadMeta(session)) && (
                    <span className={cn(
                      'absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-background',
                      session.isProcessing ? 'animate-pulse bg-accent' : 'bg-accent',
                    )} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-foreground">{getSessionTitle(session)}</span>
                  {session.preview && (
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{session.preview}</span>
                  )}
                </span>
              </button>
            </div>
          )
        }

        const tab = item.tab
        const isSelected = tab.id === selectedTabId
        const actionsOpen = isSelected && openActionsTabId === tab.id
        const visibleExtensions = extensionsExpanded
          ? sortedExtensions
          : sortedExtensions.filter((extension) => extension.pinned)
        const title = tab.url === 'about:blank'
          ? newTabLabel
          : (tab.title.trim() || getTabSubtitle(tab, newTabLabel))

        return (
          <div
            className={cn(
              'group relative mx-2 rounded-[8px] transition-colors',
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
              <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-foreground/[0.04]">
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
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {getTabSubtitle(tab, newTabLabel)}
                </span>
              </span>
            </button>
            {isSelected && (
              <div className="flex items-center gap-0.5 px-2.5 pb-2">
                <button
                  type="button"
                  disabled={!tab.canGoBack}
                  onClick={() => onTabGoBack(tab.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
                  aria-label={t('browser.back', { defaultValue: 'Back' })}
                  title={t('browser.back', { defaultValue: 'Back' })}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!tab.canGoForward}
                  onClick={() => onTabGoForward(tab.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
                  aria-label={t('browser.forward', { defaultValue: 'Forward' })}
                  title={t('browser.forward', { defaultValue: 'Forward' })}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => tab.isLoading ? onTabStop(tab.id) : onTabReload(tab.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                  aria-label={tab.isLoading ? t('browser.stopLoading') : t('common.reload')}
                  title={tab.isLoading ? t('browser.stopLoading') : t('common.reload')}
                >
                  {tab.isLoading ? <X className="h-3.5 w-3.5" /> : <RotateCw className="h-3.5 w-3.5" />}
                </button>
                <div className="mx-1 h-4 w-px bg-border/60" />
                <button
                  type="button"
                  disabled={!tab.url || tab.url === 'about:blank'}
                  onClick={() => onCopyLink(tab)}
                  className="flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[6px] px-2 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
                  aria-label={t('browser.copyLink', { defaultValue: 'Copy link' })}
                  title={t('browser.copyLink', { defaultValue: 'Copy link' })}
                >
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t('browser.copyLink', { defaultValue: '复制链接' })}</span>
                </button>
                <button
                  type="button"
                  disabled={!tab.url || tab.url === 'about:blank'}
                  onClick={() => {
                    setOpenActionsTabId((current) => current === tab.id ? null : tab.id)
                    setExtensionsExpanded(false)
                  }}
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-25',
                    actionsOpen && 'bg-foreground/[0.07] text-foreground',
                  )}
                  aria-expanded={actionsOpen}
                  aria-label={t('browser.pageActions', { defaultValue: '页面功能' })}
                  title={t('browser.pageActions', { defaultValue: '页面功能' })}
                >
                  <Ellipsis className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {actionsOpen && (
              <div className="mx-2 mb-2 overflow-hidden rounded-[8px] border border-border/55 bg-background/55 p-1">
                <InlineActionRow icon={<Star />} label={t('browser.toggleBookmark', { defaultValue: '切换收藏' })} onClick={() => onToggleBookmark(tab)} />
                <InlineActionRow icon={<KeyRound />} label={t('browser.passwords', { defaultValue: '密码' })} onClick={() => onShowTabMenu('passwords', tab)} />
                <InlineActionRow icon={<ShieldCheck />} label={t('browser.sitePermissions')} onClick={() => onShowTabMenu('permissions', tab)} />

                <button
                  type="button"
                  onClick={() => setExtensionsExpanded((expanded) => !expanded)}
                  className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left text-xs text-foreground/85 transition-colors hover:bg-foreground/[0.05]"
                  aria-expanded={extensionsExpanded}
                >
                  {extensionsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <Puzzle className="h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1 truncate">{t('plugins.browserExtensions', { defaultValue: '扩展' })}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{sortedExtensions.length}</span>
                </button>

                {visibleExtensions.length > 0 ? (
                  <div className="ml-3 border-l border-border/60 pl-1">
                    {visibleExtensions.map((extension) => (
                      <div key={extension.id} className="group/extension flex min-w-0 items-center rounded-[6px] hover:bg-foreground/[0.05]">
                        <button
                          type="button"
                          onClick={() => void window.electronAPI.browserPane.openExtensionAction(extension.id, tab.id)}
                          className="flex h-8 min-w-0 flex-1 items-center gap-2 px-2 text-left text-xs text-foreground/80"
                          title={extension.name}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-foreground/[0.04]">
                            {extension.icon ? <img src={extension.icon} alt="" className="h-4 w-4 object-contain" /> : <Puzzle className="h-3.5 w-3.5" />}
                          </span>
                          <span className="truncate">{extension.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { void toggleExtensionPin(extension) }}
                          className={cn(
                            'mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground',
                            extension.pinned && 'bg-foreground/[0.07] text-foreground',
                          )}
                          aria-label={extension.pinned ? '取消固定扩展' : '固定扩展'}
                          title={extension.pinned ? '取消固定' : '固定'}
                        >
                          <Pin className={cn('h-3.5 w-3.5', extension.pinned && 'fill-current')} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : extensionsExpanded ? (
                  <div className="ml-8 px-2 py-1.5 text-[11px] text-muted-foreground">暂无可用扩展</div>
                ) : null}
              </div>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onTabClose(tab.id)
              }}
              className={cn(
                'absolute right-2 top-[15px] flex h-6 w-6 items-center justify-center rounded-[5px]',
                'text-muted-foreground opacity-0 transition-[opacity,color,background-color]',
                'hover:bg-foreground/[0.06] hover:text-destructive group-hover:opacity-100',
                isSelected && 'opacity-60 hover:opacity-100',
              )}
              aria-label={t('browser.closeTab', { defaultValue: 'Close tab' })}
              title={t('browser.closeTab', { defaultValue: 'Close tab' })}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      }}
    />
  )
}

function InlineActionRow({ icon, label, onClick }: { icon: React.ReactElement; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left text-xs text-foreground/85 transition-colors hover:bg-foreground/[0.05] [&_svg]:h-3.5 [&_svg]:w-3.5"
    >
      <span className="w-3.5 shrink-0" />
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}
