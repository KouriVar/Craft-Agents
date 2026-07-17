import { Globe, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EntityList } from '@/components/ui/entity-list'
import { cn } from '@/lib/utils'
import type { BrowserWorkspaceTab } from '@/atoms/browser-workspace'

interface BrowserTabsListPanelProps {
  tabs: BrowserWorkspaceTab[]
  selectedTabId?: string | null
  onTabClick: (tabId: string) => void
  onTabClose: (tabId: string) => void
}

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
  selectedTabId,
  onTabClick,
  onTabClose,
}: BrowserTabsListPanelProps) {
  const { t } = useTranslation()
  const newTabLabel = t('browser.newTab', { defaultValue: 'New Tab' })

  return (
    <EntityList
      items={tabs}
      getKey={(tab) => tab.id}
      containerProps={{ 'data-list-role': 'browser-tabs' }}
      renderItem={(tab, _index, isFirst) => {
        const isSelected = tab.id === selectedTabId
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
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onTabClose(tab.id)
              }}
              className={cn(
                'absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[5px]',
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
