/**
 * SettingsNavigator
 *
 * Flat list of canonical settings pages from SETTINGS_MENU_ITEMS.
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppWindow, ChevronRight, MoreHorizontal } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'
import { DropdownMenuProvider } from '@/components/ui/menu-context'
import { cn } from '@/lib/utils'
import type { DetailsPageMeta } from '@/lib/details-page-meta'
import type { SettingsSubpage } from '../../../shared/types'
import { SETTINGS_MENU_ITEMS } from '../../../shared/menu-schema'
import { SETTINGS_ICONS } from '@/components/icons/SettingsIcons'
import { LeftSidebar, type LinkItem } from '@/components/app-shell/LeftSidebar'

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
  /** Currently selected in-page section. */
  selectedSection?: string
  /** Called when a subpage is selected */
  onSelectSubpage: (subpage: SettingsSubpage) => void
  /** Called when a nested in-page section is selected. */
  onSelectSection?: (subpage: SettingsSubpage, section: string) => void
}

interface SettingsItem {
  id: SettingsSubpage
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface SettingsItemRowProps {
  item: SettingsItem
  isSelected: boolean
  isExpanded: boolean
  onSelect: () => void
  onToggle: () => void
}

interface SettingsSectionDefinition {
  id: string
  labelKey: string
}

const SETTINGS_SECTIONS: Partial<Record<SettingsSubpage, SettingsSectionDefinition[]>> = {
  app: [
    { id: 'notifications', labelKey: 'settings.notifications.title' },
    { id: 'power', labelKey: 'settings.power.title' },
    { id: 'diagnostics', labelKey: 'settings.diagnostics.title' },
    { id: 'about', labelKey: 'settings.about.title' },
  ],
  interface: [
    { id: 'appearance', labelKey: 'settings.appearance.title' },
    { id: 'input', labelKey: 'settings.input.title' },
    { id: 'layout', labelKey: 'settings.input.rightSidebar' },
    { id: 'shortcuts', labelKey: 'settings.shortcuts.title' },
    { id: 'kanban', labelKey: 'settings.appearance.kanbanBoard' },
    { id: 'kanban-behavior', labelKey: 'settings.appearance.kanbanColumnStatus' },
    { id: 'advanced-ui', labelKey: 'settings.interface.advancedUi' },
  ],
  profile: [
    { id: 'about-me', labelKey: 'settings.preferences.title' },
    { id: 'workspace', labelKey: 'settings.workspace.workspaceSettings' },
    { id: 'workspace-appearance', labelKey: 'settings.appearance.workspaceThemes' },
    { id: 'labels', labelKey: 'settings.labels.title' },
  ],
  ai: [
    { id: 'defaults', labelKey: 'settings.ai.defaultSection' },
    { id: 'workspace-overrides', labelKey: 'settings.ai.workspaceOverrides' },
    { id: 'connections', labelKey: 'settings.ai.connections' },
    { id: 'performance', labelKey: 'settings.ai.performance' },
  ],
  browser: [
    { id: 'general', labelKey: 'settings.browser.general' },
    { id: 'browsing-data', labelKey: 'settings.browser.browsingData' },
    { id: 'bookmarks', labelKey: 'settings.bookmarks.title' },
    { id: 'downloads', labelKey: 'settings.browser.downloads' },
    { id: 'permissions', labelKey: 'settings.browser.permissions' },
    { id: 'advanced', labelKey: 'settings.browser.advanced' },
  ],
  integrations: [
    { id: 'messaging', labelKey: 'settings.messaging.title' },
    { id: 'remote-access', labelKey: 'settings.server.remoteAccess' },
    { id: 'tools', labelKey: 'settings.tools.title' },
    { id: 'credentials', labelKey: 'settings.integrations.credentialsTitle' },
    { id: 'proxy', labelKey: 'settings.network.title' },
  ],
  security: [
    { id: 'agent-permissions', labelKey: 'settings.workspace.permissionsSection' },
    { id: 'permission-rules', labelKey: 'settings.permissions.title' },
    { id: 'privacy', labelKey: 'settings.privacy.title' },
  ],
}

/**
 * SettingsItemRow - Individual settings item with dropdown menu
 * Tracks menu open state to keep "..." button visible when menu is open
 */
function SettingsItemRow({
  item,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
}: SettingsItemRowProps) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const Icon = item.icon

  // Open settings page in a new window via deep link
  const handleOpenInNewWindow = () => {
    window.electronAPI.openUrl(`craftagents://settings/${item.id}?window=focused`)
  }

  return (
    <div className="group/setting relative select-none" data-selected={isSelected || undefined}>
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
            'h-[17px] w-[17px] shrink-0 transition-opacity group-hover/setting:opacity-0',
            isSelected ? 'text-foreground' : 'text-muted-foreground',
          )}
        />
        <span className="min-w-0 truncate">{item.label}</span>
      </button>

      <div
        data-touch-reveal="true"
        className="absolute left-3 top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity group-hover/setting:opacity-100"
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label={isExpanded ? t('menu.collapse') : t('menu.expand')}
          aria-expanded={isExpanded}
          className="flex h-[17px] w-[17px] items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              'h-4 w-4 transition-transform duration-200',
              isExpanded && 'rotate-90',
            )}
          />
        </button>
      </div>

      <div
        data-touch-reveal="true"
        className={cn(
          'absolute right-1.5 top-1/2 z-10 -translate-y-1/2 transition-opacity',
          menuOpen ? 'opacity-100' : 'opacity-0 group-hover/setting:opacity-100',
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
  selectedSection,
  onSelectSubpage,
  onSelectSection,
}: SettingsNavigatorProps) {
  const { t } = useTranslation()

  const settingsItems: SettingsItem[] = useMemo(() =>
    SETTINGS_MENU_ITEMS.map((item) => ({
      id: item.id,
      label: t(item.labelKey),
      icon: SETTINGS_ICONS[item.id],
    })),
    [t]
  )

  const effectiveSubpage = selectedSubpage ?? 'app'
  const [expandedSubpage, setExpandedSubpage] = useState<SettingsSubpage | null>(effectiveSubpage)

  useEffect(() => {
    setExpandedSubpage(effectiveSubpage)
  }, [effectiveSubpage])

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        <div className="space-y-0.5">
          {settingsItems.map((item) => {
            const sectionLinks: LinkItem[] = (SETTINGS_SECTIONS[item.id] ?? []).map((section) => ({
              id: `settings:${item.id}:${section.id}`,
              title: <span className="min-w-0 truncate">{t(section.labelKey)}</span>,
              icon: <span className="h-1 w-1 rounded-full bg-current" />,
              variant:
                effectiveSubpage === item.id && selectedSection === section.id
                  ? 'default'
                  : 'ghost',
              onClick: () => onSelectSection?.(item.id, section.id),
            }))
            const isExpanded = expandedSubpage === item.id

            return (
              <div key={item.id} className="group/section">
                <SettingsItemRow
                  item={item}
                  isSelected={effectiveSubpage === item.id}
                  isExpanded={isExpanded}
                  onSelect={() => {
                    setExpandedSubpage(item.id)
                    onSelectSubpage(item.id)
                  }}
                  onToggle={() => {
                    setExpandedSubpage((current) => current === item.id ? null : item.id)
                  }}
                />
                <AnimatePresence initial={false}>
                  {isExpanded && sectionLinks.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0, marginTop: 0, marginBottom: 0 }}
                      animate={{ height: 'auto', opacity: 1, marginTop: 2, marginBottom: 8 }}
                      exit={{ height: 0, opacity: 0, marginTop: 0, marginBottom: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <LeftSidebar isCollapsed={false} isNested links={sectionLinks} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
