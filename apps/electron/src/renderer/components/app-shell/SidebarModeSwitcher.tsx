import { Check, ChevronDown, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@craft-agent/ui'

import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'

export type SidebarMode = 'sessions' | 'browser'

interface SidebarModeSwitcherProps {
  mode: SidebarMode
  onModeChange: (mode: SidebarMode) => void
  onSearch: () => void
}

export function SidebarModeSwitcher({
  mode,
  onModeChange,
  onSearch,
}: SidebarModeSwitcherProps) {
  const { t } = useTranslation()
  const modeLabel = mode === 'browser' ? t('sidebar.browser') : t('sidebar.sessions')
  const brandedModeLabel = `Craft ${modeLabel}`

  return (
    <div className="flex h-11 items-center gap-1 pr-2 pb-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group flex h-9 min-w-0 shrink-0 items-center gap-1.5 rounded-xl bg-transparent px-3 text-[16px] font-semibold text-foreground transition-[background-color,transform] duration-150 hover:bg-foreground/[0.055] active:scale-[0.985] data-[state=open]:bg-foreground/[0.065]"
            aria-label={t('sidebar.switchMode')}
          >
            <span className="truncate">{brandedModeLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180" strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <StyledDropdownMenuContent
          align="start"
          sideOffset={6}
          minWidth="min-w-[244px]"
          className="rounded-[14px] p-1.5"
        >
          <StyledDropdownMenuItem
            onClick={() => onModeChange('sessions')}
            className="min-h-[50px] items-center rounded-[10px] px-3"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-medium text-foreground">Craft {t('sidebar.sessions')}</span>
              <span className="text-[11px] text-muted-foreground">{t('sidebar.sessionsDescription')}</span>
            </span>
            {mode === 'sessions' && <Check className="h-4 w-4 shrink-0" strokeWidth={2} />}
          </StyledDropdownMenuItem>
          <StyledDropdownMenuItem
            onClick={() => onModeChange('browser')}
            className="min-h-[50px] items-center rounded-[10px] px-3"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-medium text-foreground">Craft {t('sidebar.browser')}</span>
              <span className="text-[11px] text-muted-foreground">{t('sidebar.browserDescription')}</span>
            </span>
            {mode === 'browser' && <Check className="h-4 w-4 shrink-0" strokeWidth={2} />}
          </StyledDropdownMenuItem>
        </StyledDropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onSearch}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:scale-105 hover:bg-foreground/[0.055] hover:text-foreground active:scale-95"
              aria-label={t('common.search')}
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('common.search')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
