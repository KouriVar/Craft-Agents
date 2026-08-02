/** Codex-style grouped settings navigation. */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Bell,
  BatteryCharging,
  Stethoscope,
  Info,
  Palette,
  TextCursorInput,
  PanelRight,
  Keyboard,
  Columns3,
  Workflow,
  SlidersHorizontal,
  UserRound,
  Building2,
  Paintbrush,
  Tags,
  Bot,
  Layers3,
  PlugZap,
  Gauge,
  Globe2,
  Database,
  Bookmark,
  Download,
  ShieldCheck,
  Settings2,
  MessageSquareMore,
  RadioTower,
  Wrench,
  KeyRound,
  Network,
  UserCog,
  ListChecks,
  LockKeyhole,
  Search,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DetailsPageMeta } from '@/lib/details-page-meta'
import type { SettingsSubpage } from '../../../shared/types'

export const meta: DetailsPageMeta = { navigator: 'settings', slug: 'navigator' }

interface SettingsNavigatorProps {
  selectedSubpage: SettingsSubpage | null
  selectedSection?: string
  onSelectSubpage: (subpage: SettingsSubpage) => void
  onSelectSection?: (subpage: SettingsSubpage, section: string) => void
  onBack: () => void
}

interface SettingsDestination {
  subpage: SettingsSubpage
  section: string
  labelKey: string
  label?: string
  icon: LucideIcon
}

interface SettingsGroup {
  labelKey: string
  items: SettingsDestination[]
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    labelKey: 'settings.groups.app',
    items: [
      { subpage: 'app', section: 'notifications', labelKey: 'settings.notifications.title', icon: Bell },
      { subpage: 'app', section: 'power', labelKey: 'settings.power.title', icon: BatteryCharging },
      { subpage: 'app', section: 'diagnostics', labelKey: 'settings.diagnostics.title', icon: Stethoscope },
      { subpage: 'app', section: 'about', labelKey: 'settings.about.title', icon: Info },
    ],
  },
  {
    labelKey: 'settings.groups.interface',
    items: [
      { subpage: 'interface', section: 'appearance', labelKey: 'settings.appearance.title', icon: Palette },
      { subpage: 'interface', section: 'input', labelKey: 'settings.input.title', icon: TextCursorInput },
      { subpage: 'interface', section: 'layout', labelKey: 'settings.input.rightSidebar', icon: PanelRight },
      { subpage: 'interface', section: 'shortcuts', labelKey: 'settings.shortcuts.title', icon: Keyboard },
      { subpage: 'interface', section: 'kanban', labelKey: 'settings.appearance.kanbanBoard', icon: Columns3 },
      { subpage: 'interface', section: 'kanban-behavior', labelKey: 'settings.appearance.kanbanColumnStatus', icon: Workflow },
      { subpage: 'interface', section: 'advanced-ui', labelKey: 'settings.interface.advancedUi', icon: SlidersHorizontal },
    ],
  },
  {
    labelKey: 'settings.groups.personalWorkspace',
    items: [
      { subpage: 'profile', section: 'about-me', labelKey: 'settings.preferences.title', icon: UserRound },
      { subpage: 'profile', section: 'workspace', labelKey: 'settings.workspace.workspaceSettings', icon: Building2 },
      { subpage: 'profile', section: 'workspace-appearance', labelKey: 'settings.appearance.workspaceThemes', icon: Paintbrush },
      { subpage: 'profile', section: 'labels', labelKey: 'settings.labels.title', icon: Tags },
    ],
  },
  {
    labelKey: 'settings.groups.ai',
    items: [
      { subpage: 'ai', section: 'defaults', labelKey: 'settings.ai.defaultSection', icon: Bot },
      { subpage: 'ai', section: 'workspace-overrides', labelKey: 'settings.ai.workspaceOverrides', icon: Layers3 },
      { subpage: 'ai', section: 'connections', labelKey: 'settings.ai.connections', icon: PlugZap },
      { subpage: 'ai', section: 'performance', labelKey: 'settings.ai.performance', icon: Gauge },
    ],
  },
  {
    labelKey: 'settings.groups.browser',
    items: [
      { subpage: 'browser', section: 'general', labelKey: 'settings.browser.general', icon: Globe2 },
      { subpage: 'browser', section: 'browsing-data', labelKey: 'settings.browser.browsingData', icon: Database },
      { subpage: 'browser', section: 'bookmarks', labelKey: 'settings.bookmarks.title', icon: Bookmark },
      { subpage: 'browser', section: 'downloads', labelKey: 'settings.browser.downloads', icon: Download },
      { subpage: 'browser', section: 'permissions', labelKey: 'settings.browser.permissions', icon: ShieldCheck },
      { subpage: 'browser', section: 'advanced', labelKey: 'settings.browser.advanced', icon: Settings2 },
    ],
  },
  {
    labelKey: 'settings.groups.integrations',
    items: [
      { subpage: 'integrations', section: 'messaging', labelKey: 'settings.messaging.title', icon: MessageSquareMore },
      { subpage: 'integrations', section: 'remote-access', labelKey: 'settings.server.remoteAccess', icon: RadioTower },
      { subpage: 'integrations', section: 'tools', labelKey: 'settings.tools.title', icon: Wrench },
      { subpage: 'integrations', section: 'credentials', labelKey: 'settings.integrations.credentialsTitle', icon: KeyRound },
      { subpage: 'integrations', section: 'proxy', labelKey: 'settings.network.title', icon: Network },
    ],
  },
  {
    labelKey: 'settings.groups.security',
    items: [
      { subpage: 'security', section: 'agent-permissions', labelKey: 'settings.workspace.permissionsSection', label: '会话权限', icon: UserCog },
      { subpage: 'security', section: 'permission-rules', labelKey: 'settings.permissions.title', label: '权限规则', icon: ListChecks },
      { subpage: 'security', section: 'privacy', labelKey: 'settings.privacy.title', icon: LockKeyhole },
    ],
  },
]

export default function SettingsNavigator({
  selectedSubpage,
  selectedSection,
  onSelectSubpage,
  onSelectSection,
  onBack,
}: SettingsNavigatorProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return SETTINGS_GROUPS.map(group => ({
      ...group,
      label: t(group.labelKey),
      items: group.items.map(item => ({ ...item, label: item.label ?? t(item.labelKey) }))
        .filter(item => !normalizedQuery || item.label.toLocaleLowerCase().includes(normalizedQuery)),
    })).filter(group => group.items.length > 0)
  }, [query, t])

  return (
    <div className="flex h-full min-h-0 flex-col select-none">
      <button
        type="button"
        onClick={onBack}
        className="mx-[6px] mt-2 flex h-9 shrink-0 items-center gap-2 rounded-[8px] px-2 text-left text-[15px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.05]"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>{t('settings.navigator.backToApp', { defaultValue: '返回应用' })}</span>
      </button>

      <div className="relative mx-[6px] mt-2 shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t('settings.navigator.search', { defaultValue: '搜索设置…' })}
          className="h-9 w-full rounded-[9px] border border-foreground/10 bg-foreground/[0.035] pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/20 focus:bg-foreground/[0.05]"
        />
      </div>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-[6px] pb-4">
        {groups.map(group => (
          <section key={group.label} className="pt-3">
            <div className="px-3 pb-1 text-[12px] font-semibold text-muted-foreground/65">{group.label}</div>
            <nav className="grid gap-[1px]" aria-label={group.label}>
              {group.items.map(({ subpage, section, label, icon: Icon }) => {
                const selected = selectedSubpage === subpage && selectedSection === section
                return (
                  <button
                    key={`${subpage}:${section}`}
                    type="button"
                    onClick={() => onSelectSection ? onSelectSection(subpage, section) : onSelectSubpage(subpage)}
                    className={cn(
                      'flex h-9 w-full items-center gap-2.5 rounded-[8px] px-3 text-left text-[14px] outline-none transition-[background-color,color] duration-75',
                      selected
                        ? 'bg-foreground/[0.09] font-medium text-foreground'
                        : 'text-foreground/78 hover:bg-foreground/[0.045] hover:text-foreground',
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', selected ? 'text-foreground' : 'text-muted-foreground')} />
                    <span className="min-w-0 truncate">{label}</span>
                  </button>
                )
              })}
            </nav>
          </section>
        ))}
        {groups.length === 0 && (
          <div className="px-3 py-8 text-center text-[13px] text-muted-foreground">{t('settings.navigator.noMatches', { defaultValue: '没有匹配的设置' })}</div>
        )}
      </div>
    </div>
  )
}
