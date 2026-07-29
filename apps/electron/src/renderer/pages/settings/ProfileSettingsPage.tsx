/**
 * ProfileSettingsPage — about me, workspace identity, workspace themes, labels.
 */

import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { routes } from '@/lib/navigate'
import type { DetailsPageMeta } from '@/lib/details-page-meta'
import PreferencesPage from './PreferencesPage'
import WorkspaceSettingsPage from './WorkspaceSettingsPage'
import AppearanceSettingsPage from './AppearanceSettingsPage'
import LabelsSettingsPage from './LabelsSettingsPage'
import {
  SettingsAnchor,
  useSettingsSectionScroll,
} from './SettingsPageChrome'
import { useSettingsNavSection } from './SettingsSectionContext'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'profile',
}

function ScopeBadge({ label }: { label: string }) {
  return (
    <span className="mb-3 inline-flex items-center rounded-md bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {label}
    </span>
  )
}

export default function ProfileSettingsPage() {
  const { t } = useTranslation()
  const navSection = useSettingsNavSection()
  useSettingsSectionScroll(navSection)

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={t('settings.profile.title')}
        actions={<HeaderMenu route={routes.view.settings('profile')} />}
      />
      <div className="min-h-0 flex-1 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="mx-auto max-w-3xl px-5 py-7">
            <div className="space-y-10">
              <SettingsAnchor id="about-me">
                <ScopeBadge label={t('settings.profile.scopeGlobal')} />
                <PreferencesPage embedded />
              </SettingsAnchor>

              <SettingsAnchor id="workspace">
                <ScopeBadge label={t('settings.profile.scopeWorkspace')} />
                <WorkspaceSettingsPage
                  embedded
                  showIdentity
                  showWorkingDirectory
                  showSources
                  showPluginsLink
                  showPermissions={false}
                  showModeCycling={false}
                  showLocalMcp={false}
                />
              </SettingsAnchor>

              <SettingsAnchor id="workspace-appearance">
                <ScopeBadge label={t('settings.profile.scopeWorkspace')} />
                <AppearanceSettingsPage
                  embedded
                  showDefaultTheme={false}
                  showWorkspaceThemes
                  showInterface={false}
                  showKanban={false}
                  showKanbanBehavior={false}
                  showToolIcons={false}
                />
              </SettingsAnchor>

              <SettingsAnchor id="labels">
                <ScopeBadge label={t('settings.profile.scopeWorkspace')} />
                <LabelsSettingsPage embedded />
              </SettingsAnchor>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
