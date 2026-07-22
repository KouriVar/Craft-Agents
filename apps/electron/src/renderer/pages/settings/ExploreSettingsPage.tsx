/**
 * ExploreSettingsPage
 *
 * Settings for the Explore unified entry. Phase 1 exposes the AI work-resume
 * preferences (enable / frequency / count); the generation itself lands in
 * Phase 2.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { routes } from '@/lib/navigate'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsToggle,
  SettingsSegmentedControl,
} from '@/components/settings'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import {
  DEFAULT_EXPLORE_SETTINGS,
  getExploreSettings,
  saveExploreSettings,
  type ExploreAiFrequency,
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
      const next = { ...prev, ...patch }
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
                title={t('settings.explore.aiResume')}
                description={t('settings.explore.aiResumeDesc')}
              >
                <SettingsCard>
                  <SettingsToggle
                    label={t('settings.explore.aiEnabled')}
                    description={t('settings.explore.aiEnabledDesc')}
                    checked={settings.aiStatusEnabled}
                    onCheckedChange={(checked) => update({ aiStatusEnabled: checked })}
                  />
                  <SettingsRow
                    label={t('settings.explore.aiFrequency')}
                    description={t('settings.explore.aiFrequencyDesc')}
                  >
                    <SettingsSegmentedControl<ExploreAiFrequency>
                      size="sm"
                      value={settings.aiFrequency}
                      onValueChange={(value) => update({ aiFrequency: value })}
                      options={[
                        { value: 'startup', label: t('settings.explore.freqStartup') },
                        { value: '6h', label: t('settings.explore.freq6h') },
                        { value: '12h', label: t('settings.explore.freq12h') },
                        { value: '24h', label: t('settings.explore.freq24h') },
                      ]}
                    />
                  </SettingsRow>
                  <SettingsRow
                    label={t('settings.explore.aiCount')}
                    description={t('settings.explore.aiCountDesc')}
                  >
                    <SettingsSegmentedControl<string>
                      size="sm"
                      value={String(settings.aiCount)}
                      onValueChange={(value) => update({ aiCount: value === '5' ? 5 : 3 })}
                      options={[
                        { value: '3', label: '3' },
                        { value: '5', label: '5' },
                      ]}
                    />
                  </SettingsRow>
                </SettingsCard>
              </SettingsSection>
              <SettingsSection
                title={t('settings.explore.proactiveTitle', { defaultValue: '主动工作台' })}
                description={t('settings.explore.proactiveDesc', { defaultValue: '控制 Today、主动建议和任务提醒。' })}
              >
                <SettingsCard>
                  <SettingsToggle
                    label={t('settings.explore.proactiveEnabled', { defaultValue: '主动建议' })}
                    description={t('settings.explore.proactiveEnabledDesc', { defaultValue: '根据任务状态、检查点和时间给出下一步建议。' })}
                    checked={settings.proactiveSuggestionsEnabled}
                    onCheckedChange={(checked) => update({ proactiveSuggestionsEnabled: checked })}
                  />
                  <SettingsToggle
                    label={t('settings.explore.remindersEnabled', { defaultValue: '任务提醒' })}
                    description={t('settings.explore.remindersEnabledDesc', { defaultValue: '在设置的时间通过系统通知提醒你继续任务。' })}
                    checked={settings.remindersEnabled}
                    onCheckedChange={(checked) => update({ remindersEnabled: checked })}
                  />
                  <SettingsRow
                    label={t('settings.explore.quietHours', { defaultValue: '免打扰时间' })}
                    description={t('settings.explore.quietHoursDesc', { defaultValue: '免打扰期间延后系统提醒；开始和结束相同表示关闭。' })}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={settings.quietHoursStart}
                        onChange={(event) => update({ quietHoursStart: event.target.value })}
                        className="h-8 rounded-control border border-border bg-background px-2 text-xs text-foreground"
                      />
                      <span className="text-xs text-muted-foreground">–</span>
                      <input
                        type="time"
                        value={settings.quietHoursEnd}
                        onChange={(event) => update({ quietHoursEnd: event.target.value })}
                        className="h-8 rounded-control border border-border bg-background px-2 text-xs text-foreground"
                      />
                    </div>
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
