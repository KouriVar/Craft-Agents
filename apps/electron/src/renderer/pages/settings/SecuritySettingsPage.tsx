/**
 * SecuritySettingsPage — agent permissions, permission rules, privacy.
 */

import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { routes } from '@/lib/navigate'
import type { DetailsPageMeta } from '@/lib/details-page-meta'
import WorkspaceSettingsPage from './WorkspaceSettingsPage'
import PermissionsSettingsPage from './PermissionsSettingsPage'
import PrivacySettingsPage from './PrivacySettingsPage'
import {
  SettingsAnchor,
  useSettingsSectionScroll,
} from './SettingsPageChrome'
import { useSettingsNavSection } from './SettingsSectionContext'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'security',
}

function ScopeBadge({ label }: { label: string }) {
  return (
    <span className="mb-3 inline-flex items-center rounded-md bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {label}
    </span>
  )
}

export default function SecuritySettingsPage() {
  const { t } = useTranslation()
  const navSection = useSettingsNavSection()
  useSettingsSectionScroll(navSection)

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={t('settings.security.title')}
        actions={<HeaderMenu route={routes.view.settings('security')} />}
      />
      <div className="min-h-0 flex-1 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="mx-auto max-w-3xl px-5 py-7">
            <div className="space-y-10">
              <SettingsAnchor id="agent-permissions">
                <ScopeBadge label={t('settings.profile.scopeWorkspace')} />
                <WorkspaceSettingsPage
                  embedded
                  showIdentity={false}
                  showPermissions
                  showModeCycling
                  showSources={false}
                  showWorkingDirectory={false}
                  showLocalMcp={false}
                  showPluginsLink={false}
                />
              </SettingsAnchor>

              <SettingsAnchor id="permission-rules">
                <PermissionsSettingsPage embedded />
              </SettingsAnchor>

              <SettingsAnchor id="privacy">
                <PrivacySettingsPage embedded />
              </SettingsAnchor>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
