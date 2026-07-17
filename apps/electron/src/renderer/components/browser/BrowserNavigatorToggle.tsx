import { Download, History, List, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@craft-agent/ui'
import type { BrowserNavigatorKind } from '@/atoms/browser-workspace'
import { cn } from '@/lib/utils'

interface BrowserNavigatorToggleProps {
  value: BrowserNavigatorKind
  onChange: (value: BrowserNavigatorKind) => void
  compact?: boolean
  className?: string
}

const ITEMS = [
  { value: 'tabs', icon: List, key: 'browser.navigatorTabs', fallback: 'Tabs' },
  { value: 'bookmarks', icon: Star, key: 'browser.bookmarks', fallback: 'Bookmarks' },
  { value: 'history', icon: History, key: 'browser.history', fallback: 'History' },
  { value: 'downloads', icon: Download, key: 'browser.downloads', fallback: 'Downloads' },
] as const

export function BrowserNavigatorToggle({
  value,
  onChange,
  compact = false,
  className,
}: BrowserNavigatorToggleProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'inline-flex min-w-0 items-center gap-0.5 rounded-lg border border-border/60 bg-foreground/[0.02] p-0.5',
        className,
      )}
      role="group"
      aria-label={t('sidebar.browser', { defaultValue: 'Browser' })}
    >
      {ITEMS.map((item) => {
        const label = t(item.key, { defaultValue: item.fallback })
        const button = (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            aria-pressed={value === item.value}
            aria-label={label}
            className={cn(
              'inline-flex h-7 min-w-0 items-center justify-center rounded-md text-xs font-medium transition-colors',
              compact ? 'w-7 px-0' : 'gap-1 px-1.5',
              value === item.value
                ? 'bg-card text-foreground shadow-minimal'
                : 'text-foreground/50 hover:text-foreground/80',
            )}
          >
            <item.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {!compact && <span className="whitespace-nowrap">{label}</span>}
          </button>
        )

        if (!compact) return button
        return (
          <Tooltip key={item.value}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
