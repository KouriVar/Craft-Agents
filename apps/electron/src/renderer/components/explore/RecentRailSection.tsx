/**
 * RecentRail — compact recent sessions + pages for Explore Today.
 */

import { Globe2, MessageSquare, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RecentRailSessionItem, RecentRailTabItem } from './recent-rail'

export function RecentRailSection({
  sessions,
  tabs,
  onOpenSession,
  onOpenTab,
}: {
  sessions: RecentRailSessionItem[]
  tabs: RecentRailTabItem[]
  onOpenSession: (sessionId: string) => void
  onOpenTab: (tabId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const empty = sessions.length === 0 && tabs.length === 0

  return (
    <section aria-labelledby="recent-rail-heading" className="flex flex-col gap-3">
      <div className="px-0.5">
        <h2 id="recent-rail-heading" className="text-sm font-medium text-foreground">
          {t('today.recent.title')}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('today.recent.description')}</p>
      </div>

      {empty ? (
        <p className="px-0.5 text-xs text-muted-foreground">{t('today.recent.empty')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {sessions.length > 0 && (
            <RailGroup
              label={t('today.recent.sessions')}
              items={sessions.map((item) => ({
                id: item.id,
                title: item.title,
                subtitle: item.at
                  ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(item.at)
                  : undefined,
                icon: MessageSquare,
                onClick: () => onOpenSession(item.id),
              }))}
            />
          )}
          {tabs.length > 0 && (
            <RailGroup
              label={t('today.recent.pages')}
              items={tabs.map((item) => ({
                id: item.id,
                title: item.title,
                subtitle: item.url,
                icon: Globe2,
                onClick: () => onOpenTab(item.id),
              }))}
            />
          )}
        </div>
      )}
    </section>
  )
}

function RailGroup({
  label,
  items,
}: {
  label: string
  items: Array<{
    id: string
    title: string
    subtitle?: string
    icon: typeof MessageSquare
    onClick: () => void
  }>
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
        {label}
      </p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="group flex min-w-[168px] max-w-[220px] shrink-0 items-center gap-2.5 rounded-[10px] border border-border/50 bg-background px-3 py-2.5 text-left shadow-minimal transition-colors hover:bg-foreground/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">{item.title}</span>
                {item.subtitle && (
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{item.subtitle}</span>
                )}
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/25 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
