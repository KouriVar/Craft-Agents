/**
 * ExploreSettingsPage — Explore home display switches (C/D) + reminders.
 *
 * Phase C: showTodaySection / showSessionComposer are canonical.
 * Legacy Brief / proactive / cognitionGuidance toggles no longer drive the home.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { routes, navigate } from '@/lib/navigate'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsToggle,
} from '@/components/settings'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import {
  DEFAULT_EXPLORE_SETTINGS,
  getExploreSettings,
  saveExploreSettings,
  type ExploreSettings,
} from '@/lib/explore-settings'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'explore',
}

export default function ExploreSettingsPage() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<ExploreSettings>(DEFAULT_EXPLORE_SETTINGS)

  useEffect(() => {
    let active = true
    void getExploreSettings().then((value) => {
      if (active) setSettings(value)
    })
    return () => { active = false }
  }, [])

  const update = (patch: Partial<ExploreSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch, _phaseCMigrated: true }
      void saveExploreSettings(next)
      return next
    })
  }

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('settings.explore.title')} actions={<HeaderMenu route={routes.view.settings('explore')} />} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            <div className="space-y-8">
              <SettingsSection
                title={t('settings.explore.homeDisplay')}
                description={t('settings.explore.homeDisplayDesc')}
              >
                <SettingsCard>
                  <SettingsToggle
                    label={t('settings.explore.showTodaySection')}
                    description={t('settings.explore.showTodaySectionDesc')}
                    checked={settings.showTodaySection}
                    onCheckedChange={(checked) => update({ showTodaySection: checked })}
                  />
                  <SettingsToggle
                    label={t('settings.explore.showSessionComposer')}
                    description={t('settings.explore.showSessionComposerDesc')}
                    checked={settings.showSessionComposer}
                    onCheckedChange={(checked) => update({ showSessionComposer: checked })}
                  />
                </SettingsCard>
              </SettingsSection>

              <SettingsSection
                title={t('settings.explore.remindersTitle')}
                description={t('settings.explore.remindersSectionDesc')}
              >
                <SettingsCard>
                  <SettingsToggle
                    label={t('settings.explore.remindersEnabled')}
                    description={t('settings.explore.remindersEnabledDesc')}
                    checked={settings.remindersEnabled}
                    onCheckedChange={(checked) => update({ remindersEnabled: checked })}
                  />
                  <SettingsRow
                    label={t('settings.explore.quietHours')}
                    description={t('settings.explore.quietHoursDesc')}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="time"
                        value={settings.quietHoursStart}
                        onChange={(event) => update({ quietHoursStart: event.target.value })}
                        className="rounded-control border border-border/60 bg-background px-2 py-1"
                      />
                      <span>—</span>
                      <input
                        type="time"
                        value={settings.quietHoursEnd}
                        onChange={(event) => update({ quietHoursEnd: event.target.value })}
                        className="rounded-control border border-border/60 bg-background px-2 py-1"
                      />
                    </div>
                  </SettingsRow>
                </SettingsCard>
              </SettingsSection>

              <SettingsSection
                title={t('settings.explore.cognitionDebug')}
                description={t('settings.explore.cognitionDebugDesc')}
              >
                <SettingsCard>
                  <SettingsToggle
                    label={t('settings.explore.cognitionGuidanceAutoRefresh')}
                    description={t('settings.explore.cognitionGuidanceAutoRefreshDesc')}
                    checked={settings.cognitionGuidanceAutoRefresh}
                    onCheckedChange={(checked) => update({ cognitionGuidanceAutoRefresh: checked })}
                  />
                  <SettingsRow
                    label={t('settings.explore.openCognitionDebug')}
                    description={t('settings.explore.cognitionDebugDesc')}
                  >
                    <button
                      type="button"
                      className="text-xs font-medium text-accent hover:underline"
                      onClick={() => navigate(routes.view.settings('cognition'))}
                    >
                      {t('settings.explore.openCognitionDebug')}
                    </button>
                  </SettingsRow>
                </SettingsCard>
              </SettingsSection>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
