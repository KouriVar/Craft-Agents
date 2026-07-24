/**
 * SettingsNavigator
 *
 * Navigator panel content for settings. Settings pages are grouped into a
 * compact, flat list so the hierarchy stays legible at sidebar width.
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal, AppWindow } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'
import { DropdownMenuProvider } from '@/components/ui/menu-context'
import { cn } from '@/lib/utils'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import type { SettingsSubpage } from '../../../shared/types'
import { SETTINGS_MENU_ITEMS } from '../../../shared/menu-schema'
import { SETTINGS_ICONS } from '@/components/icons/SettingsIcons'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'navigator',
}

interface SettingsNavigatorProps {
  /**
   * Currently selected settings subpage. `null` means the bare `settings`
   * route (no row highlighted) — happens in compact mode where the navigator
   * stands alone before the user drills into a subpage.
   */
  selectedSubpage: SettingsSubpage | null
  /** Called when a subpage is selected */
  onSelectSubpage: (subpage: SettingsSubpage) => void
}

interface SettingsItem {
  id: SettingsSubpage
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface SettingsSection {
  id: string
  label: string
  pages: SettingsSubpage[]
}

interface SettingsItemRowProps {
  item: SettingsItem
  isSelected: boolean
  onSelect: () => void
}

/**
 * SettingsItemRow - Individual settings item with dropdown menu
 * Tracks menu open state to keep "..." button visible when menu is open
 */
function SettingsItemRow({ item, isSelected, onSelect }: SettingsItemRowProps) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const Icon = item.icon

  // Open settings page in a new window via deep link
  const handleOpenInNewWindow = () => {
    window.electronAPI.openUrl(`craftagents://settings/${item.id}?window=focused`)
  }

  return (
    <div className="group relative select-none" data-selected={isSelected || undefined}>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex h-10 w-full items-center gap-3 rounded-[10px] px-3 pr-10 text-left text-sm outline-none',
          'transition-[background-color,color] duration-75',
          isSelected
            ? 'bg-foreground/[0.08] font-medium text-foreground hover:bg-foreground/[0.1]'
            : 'text-foreground/78 hover:bg-foreground/[0.045] hover:text-foreground',
        )}
      >
        <Icon
          className={cn(
            'h-[17px] w-[17px] shrink-0',
            isSelected ? 'text-foreground' : 'text-muted-foreground',
          )}
        />
        <span className="min-w-0 truncate">{item.label}</span>
      </button>

      <div
        data-touch-reveal="true"
        className={cn(
          'absolute right-1.5 top-1/2 z-10 -translate-y-1/2 transition-opacity',
          menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <DropdownMenu modal={true} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('common.more')}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground data-[state=open]:bg-foreground/10"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <StyledDropdownMenuContent align="end">
            <DropdownMenuProvider>
              <StyledDropdownMenuItem onClick={handleOpenInNewWindow}>
                <AppWindow className="h-3.5 w-3.5" />
                <span className="flex-1">{t('sessionMenu.openInNewWindow')}</span>
              </StyledDropdownMenuItem>
            </DropdownMenuProvider>
          </StyledDropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export default function SettingsNavigator({
  selectedSubpage,
  onSelectSubpage,
}: SettingsNavigatorProps) {
  const { t } = useTranslation()

  const settingsItems: SettingsItem[] = useMemo(() =>
    SETTINGS_MENU_ITEMS.map((item) => ({
      id: item.id,
      label:
        item.id === 'app'
          ? t('shortcuts.category.general')
          : item.id === 'server'
            ? t('settings.workspace.advanced')
            : t(item.labelKey),
      icon: SETTINGS_ICONS[item.id],
    })),
    [t]
  )

  const itemsById = useMemo(
    () => new Map(settingsItems.map((item) => [item.id, item])),
    [settingsItems],
  )

  const sections: SettingsSection[] = useMemo(() => [
    {
      id: 'application',
      label: t('settings.group.application'),
      pages: ['app', 'input', 'appearance', 'preferences'],
    },
    {
      id: 'work',
      label: t('settings.group.work'),
      pages: ['ai', 'workspace', 'labels'],
    },
    {
      id: 'connections',
      label: t('settings.group.connections'),
      pages: ['accounts', 'messaging'],
    },
    {
      id: 'system',
      label: t('settings.group.system'),
      // privacy / cognition are first-class settings pages (v0.16+)
      pages: ['privacy', 'permissions', 'cognition', 'server'],
    },
  ], [t])

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        <div className="space-y-5">
          {sections.map((section) => {
            const items = section.pages
              .map((pageId) => itemsById.get(pageId))
              .filter((item): item is SettingsItem => item != null)
            if (items.length === 0) return null

            return (
              <section key={section.id} aria-labelledby={`settings-section-${section.id}`}>
                <h2
                  id={`settings-section-${section.id}`}
                  className="px-3 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground/65"
                >
                  {section.label}
                </h2>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <SettingsItemRow
                      key={item.id}
                      item={item}
                      isSelected={selectedSubpage === item.id}
                      onSelect={() => onSelectSubpage(item.id)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
