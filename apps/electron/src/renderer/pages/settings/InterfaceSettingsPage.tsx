/**
 * InterfaceSettingsPage — appearance, input, layout, shortcuts, kanban, advanced UI.
 */

import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { routes } from '@/lib/navigate'
import type { DetailsPageMeta } from '@/lib/details-page-meta'
import AppearanceSettingsPage from './AppearanceSettingsPage'
import InputSettingsPage from './InputSettingsPage'
import { ShortcutsContent } from './ShortcutsPage'
import {
  SettingsAnchor,
  useSettingsSectionScroll,
} from './SettingsPageChrome'
import { useSettingsNavSection } from './SettingsSectionContext'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'interface',
}

export default function InterfaceSettingsPage() {
  const { t } = useTranslation()
  const navSection = useSettingsNavSection()
  useSettingsSectionScroll(navSection)

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={t('settings.interface.title')}
        actions={<HeaderMenu route={routes.view.settings('interface')} />}
      />
      <div className="min-h-0 flex-1 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="mx-auto max-w-3xl px-5 py-7">
            <div className="space-y-10">
              <SettingsAnchor id="appearance">
                <AppearanceSettingsPage
                  embedded
                  showDefaultTheme
                  showInterface
                  showWorkspaceThemes={false}
                  showKanban={false}
                  showKanbanBehavior={false}
                  showToolIcons={false}
                />
              </SettingsAnchor>

              <SettingsAnchor id="input">
                <InputSettingsPage
                  embedded
                  showTyping
                  showSending
                  showHistory
                  showLayout={false}
                />
              </SettingsAnchor>

              <SettingsAnchor id="layout">
                <InputSettingsPage
                  embedded
                  showTyping={false}
                  showSending={false}
                  showHistory={false}
                  showLayout
                />
              </SettingsAnchor>

              <SettingsAnchor id="shortcuts">
                <ShortcutsContent embedded />
              </SettingsAnchor>

              <SettingsAnchor id="kanban">
                <AppearanceSettingsPage
                  embedded
                  showDefaultTheme={false}
                  showWorkspaceThemes={false}
                  showInterface={false}
                  showKanban
                  showKanbanBehavior={false}
                  showToolIcons={false}
                />
              </SettingsAnchor>

              <SettingsAnchor id="kanban-behavior">
                <AppearanceSettingsPage
                  embedded
                  showDefaultTheme={false}
                  showWorkspaceThemes={false}
                  showInterface={false}
                  showKanban={false}
                  showKanbanBehavior
                  showToolIcons={false}
                />
              </SettingsAnchor>

              <SettingsAnchor id="advanced-ui">
                <AppearanceSettingsPage
                  embedded
                  showDefaultTheme={false}
                  showWorkspaceThemes={false}
                  showInterface={false}
                  showKanban={false}
                  showKanbanBehavior={false}
                  showToolIcons
                />
              </SettingsAnchor>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
