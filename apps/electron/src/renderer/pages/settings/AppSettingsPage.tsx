/**
 * AppSettingsPage
 *
 * Global app-level settings that apply across all workspaces.
 *
 * Settings:
 * - Notifications
 * - Power
 * - Diagnostics
 * - About (version, updates)
 *
 * Note: Browser tool toggle lives in BrowserSettingsPage.
 * Note: Network/proxy lives in IntegrationsSettingsPage (NetworkProxySection).
 * Note: AI settings have been moved to AiSettingsPage.
 * Note: Appearance settings have been moved to AppearanceSettingsPage.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { routes } from '@/lib/navigate'
import { Spinner } from '@craft-agent/ui'
import { toast } from 'sonner'
import type { DetailsPageMeta } from '@/lib/details-page-meta'

import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsToggle,
} from '@/components/settings'
import { useUpdateChecker } from '@/hooks/useUpdateChecker'
import { useSettingsSectionScroll } from './SettingsPageChrome'
import { useSettingsNavSection } from './SettingsSectionContext'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'app',
}

function formatDisplayVersion(version?: string | null): string | null {
  if (!version) return null
  return version.replace(/-rc\.(\d+)$/i, ' RC $1')
}

export default function AppSettingsPage() {
  const { t } = useTranslation()
  useSettingsSectionScroll(useSettingsNavSection())

  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [keepAwakeEnabled, setKeepAwakeEnabled] = useState(false)

  const isElectron = window.electronAPI.getRuntimeEnvironment() === 'electron'
  const updateChecker = useUpdateChecker()
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false)
  const [isExportingDiagnostics, setIsExportingDiagnostics] = useState(false)

  const handleCheckForUpdates = useCallback(async () => {
    setIsCheckingForUpdates(true)
    try {
      await updateChecker.checkForUpdates()
    } finally {
      setIsCheckingForUpdates(false)
    }
  }, [updateChecker])

  const handleExportDiagnostics = useCallback(async () => {
    setIsExportingDiagnostics(true)
    try {
      const result = await window.electronAPI.exportDiagnostics()
      if (!result.canceled) toast.success(t('settings.diagnostics.exported'))
    } catch (error) {
      console.error('Failed to export diagnostics:', error)
      toast.error(t('settings.diagnostics.failed'))
    } finally {
      setIsExportingDiagnostics(false)
    }
  }, [t])

  const loadSettings = useCallback(async () => {
    if (!window.electronAPI) return
    try {
      const [notificationsOn, keepAwakeOn] = await Promise.all([
        window.electronAPI.getNotificationsEnabled(),
        window.electronAPI.getKeepAwakeWhileRunning(),
      ])
      setNotificationsEnabled(notificationsOn)
      setKeepAwakeEnabled(keepAwakeOn)
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [])

  const handleNotificationsEnabledChange = useCallback(async (enabled: boolean) => {
    setNotificationsEnabled(enabled)
    await window.electronAPI.setNotificationsEnabled(enabled)
  }, [])

  const handleKeepAwakeEnabledChange = useCallback(async (enabled: boolean) => {
    setKeepAwakeEnabled(enabled)
    await window.electronAPI.setKeepAwakeWhileRunning(enabled)
  }, [])

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('settings.app.title')} actions={<HeaderMenu route={routes.view.settings('app')} helpFeature="app-settings" />} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            <div className="space-y-8">
              <SettingsSection id="notifications" title={t('settings.notifications.title')}>
                <SettingsCard>
                  <SettingsToggle
                    label={t('settings.notifications.desktopNotifications')}
                    description={t('settings.notifications.desktopNotificationsDesc')}
                    checked={notificationsEnabled}
                    onCheckedChange={handleNotificationsEnabledChange}
                  />
                </SettingsCard>
              </SettingsSection>

              <SettingsSection id="power" title={t('settings.power.title')}>
                <SettingsCard>
                  <SettingsToggle
                    label={t('settings.power.keepScreenAwake')}
                    description={t('settings.power.keepScreenAwakeDesc')}
                    checked={keepAwakeEnabled}
                    onCheckedChange={handleKeepAwakeEnabledChange}
                  />
                </SettingsCard>
              </SettingsSection>

              {isElectron && (
                <SettingsSection id="diagnostics" title={t('settings.diagnostics.title')}>
                  <SettingsCard>
                    <SettingsRow
                      label={t('settings.diagnostics.export')}
                      description={t('settings.diagnostics.description')}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportDiagnostics}
                        disabled={isExportingDiagnostics}
                      >
                        {isExportingDiagnostics ? (
                          <>
                            <Spinner className="mr-1.5" />
                            {t('settings.diagnostics.exporting')}
                          </>
                        ) : t('settings.diagnostics.exportButton')}
                      </Button>
                    </SettingsRow>
                  </SettingsCard>
                </SettingsSection>
              )}

              <SettingsSection id="about" title={t('settings.about.title')}>
                <SettingsCard>
                  <SettingsRow label={t('settings.about.version')}>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {formatDisplayVersion(updateChecker.updateInfo?.currentVersion) ?? t('common.loading')}
                      </span>
                      {isElectron && updateChecker.isDownloading && updateChecker.updateInfo?.latestVersion && (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Spinner className="w-3 h-3" />
                          <span>{t('settings.about.downloading', { version: updateChecker.updateInfo.latestVersion, percent: updateChecker.downloadProgress })}</span>
                        </div>
                      )}
                    </div>
                  </SettingsRow>
                  {isElectron && (
                    <SettingsRow label={t('settings.about.checkForUpdates')}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCheckForUpdates}
                        disabled={isCheckingForUpdates}
                      >
                        {isCheckingForUpdates ? (
                          <>
                            <Spinner className="mr-1.5" />
                            {t('common.checking')}
                          </>
                        ) : (
                          t('settings.about.checkNow')
                        )}
                      </Button>
                    </SettingsRow>
                  )}
                  {isElectron && updateChecker.isReadyToInstall && updateChecker.updateInfo?.latestVersion && (
                    <SettingsRow label={t('settings.about.updateReady')}>
                      <Button
                        size="sm"
                        onClick={updateChecker.installUpdate}
                      >
                        {t('settings.about.restartToUpdate', { version: updateChecker.updateInfo.latestVersion })}
                      </Button>
                    </SettingsRow>
                  )}
                  {isElectron && updateChecker.updateInfo?.downloadState === 'manual' && updateChecker.updateInfo.latestVersion && (
                    <SettingsRow label={t('settings.about.updateAvailable', { version: updateChecker.updateInfo.latestVersion })}>
                      <Button size="sm" onClick={updateChecker.openRelease}>
                        {t('settings.about.openRelease')}
                      </Button>
                    </SettingsRow>
                  )}
                  {isElectron && updateChecker.updateInfo?.downloadState === 'error' && (
                    <SettingsRow label={t('settings.about.updateFailed')}>
                      <Button variant="outline" size="sm" onClick={updateChecker.openRelease}>
                        {t('settings.about.openRelease')}
                      </Button>
                    </SettingsRow>
                  )}
                </SettingsCard>
              </SettingsSection>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
