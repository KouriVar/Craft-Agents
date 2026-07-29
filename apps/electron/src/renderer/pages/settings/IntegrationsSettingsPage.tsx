/**
 * IntegrationsSettingsPage — messaging, remote access, tools, credentials, proxy.
 */

import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { routes } from '@/lib/navigate'
import type { DetailsPageMeta } from '@/lib/details-page-meta'
import MessagingSettingsPage from './MessagingSettingsPage'
import ServerSettingsPage from './ServerSettingsPage'
import WorkspaceSettingsPage from './WorkspaceSettingsPage'
import AccountsSettingsPage from './AccountsSettingsPage'
import NetworkProxySection from './NetworkProxySection'
import {
  SettingsAnchor,
  useSettingsSectionScroll,
} from './SettingsPageChrome'
import { useSettingsNavSection } from './SettingsSectionContext'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'integrations',
}

export default function IntegrationsSettingsPage() {
  const { t } = useTranslation()
  const navSection = useSettingsNavSection()
  useSettingsSectionScroll(navSection)

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={t('settings.integrations.title')}
        actions={<HeaderMenu route={routes.view.settings('integrations')} />}
      />
      <div className="min-h-0 flex-1 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="mx-auto max-w-3xl px-5 py-7">
            <div className="space-y-10">
              <SettingsAnchor id="messaging">
                <MessagingSettingsPage embedded />
              </SettingsAnchor>

              <SettingsAnchor id="remote-access">
                <ServerSettingsPage embedded />
              </SettingsAnchor>

              <SettingsAnchor id="tools">
                <WorkspaceSettingsPage
                  embedded
                  showIdentity={false}
                  showPermissions={false}
                  showModeCycling={false}
                  showSources={false}
                  showWorkingDirectory={false}
                  showLocalMcp
                  showPluginsLink
                />
              </SettingsAnchor>

              <SettingsAnchor id="credentials">
                <AccountsSettingsPage embedded />
              </SettingsAnchor>

              <SettingsAnchor id="proxy">
                <NetworkProxySection />
              </SettingsAnchor>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
