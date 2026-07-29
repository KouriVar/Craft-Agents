import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Loader2, Search, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelectRow,
  SettingsToggle,
} from '@/components/settings'
import { navigate, routes } from '@/lib/navigate'
import { browserNavigatorKindAtom, type BrowserNavigatorKind } from '@/atoms/browser-workspace'
import type { DetailsPageMeta } from '@/lib/details-page-meta'
import type {
  BrowserClearDataRequest,
  BrowserSettings,
  BrowserSiteDataSummary,
  BrowserPermissionEntry,
} from '@craft-agent/shared/protocol'
import BookmarksSettingsPage from './BookmarksSettingsPage'
import {
  SettingsAnchor,
  useSettingsSectionScroll,
} from './SettingsPageChrome'
import { useSettingsNavSection } from './SettingsSectionContext'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'browser',
}

const DEFAULT_CLEAR_REQUEST: BrowserClearDataRequest = {
  timeRange: 'all',
  history: true,
  downloads: false,
  cookiesAndSiteData: true,
  cache: true,
  permissions: false,
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export default function BrowserSettingsPage() {
  const { t } = useTranslation()
  const setBrowserNavigatorKind = useSetAtom(browserNavigatorKindAtom)
  const navSection = useSettingsNavSection()
  useSettingsSectionScroll(navSection)
  const [settings, setSettings] = useState<BrowserSettings | null>(null)
  const [agentEnabled, setAgentEnabled] = useState(true)
  const [cacheSize, setCacheSize] = useState(0)
  const [loading, setLoading] = useState(true)
  const [clearOpen, setClearOpen] = useState(false)
  const [siteDataOpen, setSiteDataOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [clearRequest, setClearRequest] = useState(DEFAULT_CLEAR_REQUEST)
  const [clearing, setClearing] = useState(false)
  const [sites, setSites] = useState<BrowserSiteDataSummary[]>([])
  const [siteQuery, setSiteQuery] = useState('')
  const [sitesLoading, setSitesLoading] = useState(false)
  const [permissionExceptions, setPermissionExceptions] = useState<BrowserPermissionEntry[]>([])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [nextSettings, nextAgentEnabled, nextCacheSize, nextPermissionExceptions] = await Promise.all([
        window.electronAPI.browserPane.getSettings(),
        window.electronAPI.getBrowserToolEnabled(),
        window.electronAPI.browserPane.getCacheSize(),
        window.electronAPI.browserPane.listPermissions(),
      ])
      setSettings(nextSettings)
      setAgentEnabled(nextAgentEnabled)
      setCacheSize(nextCacheSize)
      setPermissionExceptions(nextPermissionExceptions)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.browser.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const updateSettings = useCallback(async (changes: Partial<BrowserSettings>) => {
    if (!settings) return
    const previous = settings
    setSettings({ ...settings, ...changes })
    try {
      setSettings(await window.electronAPI.browserPane.updateSettings(changes))
    } catch (error) {
      setSettings(previous)
      toast.error(error instanceof Error ? error.message : t('settings.browser.saveFailed'))
    }
  }, [settings, t])

  const updateAgentEnabled = useCallback(async (enabled: boolean) => {
    setAgentEnabled(enabled)
    try {
      await window.electronAPI.setBrowserToolEnabled(enabled)
    } catch (error) {
      setAgentEnabled(!enabled)
      toast.error(error instanceof Error ? error.message : t('settings.browser.saveFailed'))
    }
  }, [t])

  const runClear = useCallback(async () => {
    setClearing(true)
    try {
      await window.electronAPI.browserPane.clearData(clearRequest)
      setCacheSize(await window.electronAPI.browserPane.getCacheSize())
      setClearOpen(false)
      toast.success(t('settings.browser.clearSuccess'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.browser.clearFailed'))
    } finally {
      setClearing(false)
    }
  }, [clearRequest, t])

  const clearCache = useCallback(async () => {
    setClearing(true)
    try {
      await window.electronAPI.browserPane.clearData({
        ...DEFAULT_CLEAR_REQUEST,
        history: false,
        cookiesAndSiteData: false,
        cache: true,
      })
      setCacheSize(await window.electronAPI.browserPane.getCacheSize())
      toast.success(t('settings.browser.cacheCleared'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.browser.clearFailed'))
    } finally {
      setClearing(false)
    }
  }, [t])

  const loadSites = useCallback(async () => {
    setSitesLoading(true)
    try {
      setSites(await window.electronAPI.browserPane.listSiteData())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.browser.siteDataLoadFailed'))
    } finally {
      setSitesLoading(false)
    }
  }, [t])

  const openSiteData = useCallback(() => {
    setSiteDataOpen(true)
    void loadSites()
  }, [loadSites])

  const visibleSites = useMemo(() => {
    const query = siteQuery.trim().toLowerCase()
    return query ? sites.filter((site) => site.origin.toLowerCase().includes(query)) : sites
  }, [siteQuery, sites])

  const clearSite = useCallback(async (origin: string) => {
    try {
      await window.electronAPI.browserPane.clearSiteData(origin)
      await loadSites()
      toast.success(t('settings.browser.siteCleared'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.browser.clearFailed'))
    }
  }, [loadSites, t])

  const chooseDownloadPath = useCallback(async () => {
    const path = await window.electronAPI.openFolderDialog()
    if (path) await updateSettings({ downloadPath: path })
  }, [updateSettings])

  const openBrowserCollection = useCallback((kind: BrowserNavigatorKind) => {
    setBrowserNavigatorKind(kind)
    navigate(routes.view.browser())
  }, [setBrowserNavigatorKind])

  if (loading || !settings) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={t('settings.browser.title')}
        actions={<HeaderMenu route={routes.view.settings('browser')} />}
      />
      <div className="min-h-0 flex-1 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="mx-auto max-w-3xl px-5 py-7">
            <div className="space-y-8">
              <SettingsAnchor id="general">
              <SettingsSection title={t('settings.browser.general')}>
                <SettingsCard>
                  <SettingsToggle
                    label={t('settings.browser.agentUse')}
                    description={t('settings.browser.agentUseDesc')}
                    checked={agentEnabled}
                    onCheckedChange={updateAgentEnabled}
                  />
                  <SettingsSelectRow
                    label={t('settings.browser.linkOpen')}
                    description={t('settings.browser.linkOpenDesc')}
                    value={settings.linkOpenBehavior}
                    onValueChange={(value) => void updateSettings({ linkOpenBehavior: value as BrowserSettings['linkOpenBehavior'] })}
                    options={[
                      { value: 'internal', label: t('settings.browser.linkInternal') },
                      { value: 'system', label: t('settings.browser.linkSystem') },
                      { value: 'ask', label: t('settings.browser.linkAsk') },
                    ]}
                  />
                  <SettingsSelectRow
                    label={t('settings.browser.newTab')}
                    description={t('settings.browser.newTabDesc')}
                    value={settings.newTabBehavior}
                    onValueChange={(value) => void updateSettings({ newTabBehavior: value as BrowserSettings['newTabBehavior'] })}
                    options={[
                      { value: 'default', label: t('settings.browser.newTabDefault') },
                      { value: 'blank', label: t('settings.browser.newTabBlank') },
                      { value: 'custom', label: t('settings.browser.newTabCustom') },
                    ]}
                  />
                  {settings.newTabBehavior === 'custom' && (
                    <SettingsRow
                      label={t('settings.browser.customUrl')}
                      description={settings.customNewTabUrl || 'https://'}
                      action={<Button size="sm" variant="outline" onClick={() => {
                        const value = window.prompt(t('settings.browser.customUrlPrompt'), settings.customNewTabUrl)
                        if (value !== null) void updateSettings({ customNewTabUrl: value.trim() })
                      }}>{t('common.edit')}</Button>}
                    />
                  )}
                </SettingsCard>
              </SettingsSection>
              </SettingsAnchor>

              <SettingsAnchor id="browsing-data">
              <SettingsSection title={t('settings.browser.browsingData')}>
                <SettingsCard>
                  <SettingsRow
                    label={t('settings.browser.clearData')}
                    description={t('settings.browser.clearDataDesc')}
                    action={<Button size="sm" variant="outline" onClick={() => setClearOpen(true)}>{t('settings.browser.clearEllipsis')}</Button>}
                  />
                  <SettingsRow
                    label={t('settings.browser.cache')}
                    description={t('settings.browser.cacheUsage', { size: formatBytes(cacheSize) })}
                    action={<Button size="sm" variant="outline" disabled={clearing} onClick={() => void clearCache()}>{t('common.clear')}</Button>}
                  />
                  <SettingsRow
                    label={t('settings.browser.cookies')}
                    description={t('settings.browser.cookiesDesc')}
                    action={<Button size="sm" variant="outline" onClick={openSiteData}>{t('common.manage')}</Button>}
                  />
                </SettingsCard>
              </SettingsSection>
              </SettingsAnchor>

              <SettingsAnchor id="bookmarks">
                <BookmarksSettingsPage embedded />
              </SettingsAnchor>

              <SettingsAnchor id="downloads">
              <SettingsSection title={t('settings.browser.downloads')}>
                <SettingsCard>
                  <SettingsRow
                    label={t('settings.browser.downloadLocation')}
                    description={settings.downloadPath}
                    action={<Button size="sm" variant="outline" onClick={() => void chooseDownloadPath()}>{t('common.change')}</Button>}
                  />
                  <SettingsToggle
                    label={t('settings.browser.askDownload')}
                    description={t('settings.browser.askDownloadDesc')}
                    checked={settings.askDownloadLocation}
                    onCheckedChange={(checked) => void updateSettings({ askDownloadLocation: checked })}
                  />
                  <SettingsRow
                    label={t('settings.browser.downloadHistory')}
                    description={t('settings.browser.downloadHistoryDesc')}
                    action={<Button size="sm" variant="ghost" onClick={() => openBrowserCollection('downloads')}>{t('common.manage')}<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Button>}
                  />
                </SettingsCard>
              </SettingsSection>
              </SettingsAnchor>

              <SettingsAnchor id="permissions">
              <SettingsSection title={t('settings.browser.permissions')}>
                <SettingsCard>
                  <SettingsRow
                    label={t('settings.browser.siteSettings')}
                    description={t('settings.browser.siteSettingsDesc')}
                    action={<Button size="sm" variant="ghost" onClick={() => openBrowserCollection('tabs')}>{t('common.manage')}<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Button>}
                  />
                  <SettingsSelectRow
                    label={t('settings.browser.permissionRequests')}
                    description={t('settings.browser.permissionRequestsDesc')}
                    value={settings.permissionBehavior}
                    onValueChange={(value) => void updateSettings({ permissionBehavior: value as BrowserSettings['permissionBehavior'] })}
                    options={[
                      { value: 'ask', label: t('settings.browser.permissionAsk') },
                      { value: 'block', label: t('settings.browser.permissionBlock') },
                    ]}
                  />
                  {permissionExceptions.map((entry) => (
                    <SettingsRow
                      key={`${entry.origin}|${entry.permission}`}
                      label={entry.origin}
                      description={`${entry.permission} · ${entry.allowed ? t('browser.permissionAllowed') : t('browser.permissionBlocked')}`}
                      action={
                        <Button
                          size="icon"
                          variant="ghost"
                          title={t('browser.resetPermission')}
                          onClick={async () => {
                            await window.electronAPI.browserPane.clearPermission(entry.origin, entry.permission)
                            setPermissionExceptions(await window.electronAPI.browserPane.listPermissions())
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  ))}
                </SettingsCard>
              </SettingsSection>
              </SettingsAnchor>

              <SettingsAnchor id="advanced">
              <SettingsSection title={t('settings.browser.advanced')}>
                <SettingsCard>
                  <SettingsRow
                    label={t('settings.browser.reset')}
                    description={t('settings.browser.resetDesc')}
                    action={<Button size="sm" variant="outline" onClick={() => setResetOpen(true)}>{t('settings.browser.resetEllipsis')}</Button>}
                  />
                </SettingsCard>
              </SettingsSection>
              </SettingsAnchor>
            </div>
          </div>
        </ScrollArea>
      </div>

      <Dialog open={clearOpen} onOpenChange={(open) => { if (!clearing) setClearOpen(open) }}>
        <DialogContent showCloseButton={!clearing}>
          <DialogHeader>
            <DialogTitle>{t('settings.browser.clearData')}</DialogTitle>
            <DialogDescription>{t('settings.browser.clearDialogDesc')}</DialogDescription>
          </DialogHeader>
          <SettingsSelectRow
            label={t('settings.browser.timeRange')}
            value={clearRequest.timeRange}
            onValueChange={(value) => setClearRequest((current) => ({ ...current, timeRange: value as BrowserClearDataRequest['timeRange'] }))}
            options={[
              { value: 'hour', label: t('settings.browser.lastHour') },
              { value: 'day', label: t('settings.browser.lastDay') },
              { value: 'week', label: t('settings.browser.lastWeek') },
              { value: 'four-weeks', label: t('settings.browser.lastFourWeeks') },
              { value: 'all', label: t('settings.browser.allTime') },
            ]}
            inCard={false}
            disabled={clearing}
          />
          <div className="space-y-2 rounded-card bg-muted/35 p-3">
            {([
              ['history', t('settings.browser.history')],
              ['downloads', t('settings.browser.downloadRecords')],
              ['cookiesAndSiteData', t('settings.browser.cookiesAndSiteData')],
              ['cache', t('settings.browser.cachedFiles')],
              ['permissions', t('settings.browser.sitePermissions')],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-foreground"
                  checked={clearRequest[key]}
                  disabled={clearing}
                  onChange={(event) => setClearRequest((current) => ({ ...current, [key]: event.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('settings.browser.clearNotice')}
            {clearRequest.timeRange !== 'all' && (clearRequest.cookiesAndSiteData || clearRequest.cache)
              ? ` ${t('settings.browser.sessionRangeNotice')}`
              : ''}
          </p>
          <DialogFooter>
            <Button variant="outline" disabled={clearing} onClick={() => setClearOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={clearing || !Object.entries(clearRequest).some(([key, value]) => key !== 'timeRange' && value)}
              onClick={() => void runClear()}
            >
              {clearing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t('settings.browser.clearButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={siteDataOpen} onOpenChange={setSiteDataOpen}>
        <DialogContent className="max-h-[75vh]">
          <DialogHeader>
            <DialogTitle>{t('settings.browser.cookies')}</DialogTitle>
            <DialogDescription>{t('settings.browser.siteDataDomainNotice')}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-control border border-border px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={siteQuery}
              onChange={(event) => setSiteQuery(event.target.value)}
              placeholder={t('settings.browser.searchSites')}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <div className="min-h-32 overflow-y-auto rounded-card bg-muted/30">
            {sitesLoading && <div className="flex h-32 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>}
            {!sitesLoading && visibleSites.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">{t('settings.browser.noSiteData')}</div>}
            {!sitesLoading && visibleSites.map((site) => (
              <div key={site.origin} className="flex items-center gap-3 border-b border-border/50 px-3 py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{site.origin}</div>
                  <div className="text-xs text-muted-foreground">{t('settings.browser.cookieCount', { count: site.cookieCount })}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => void clearSite(site.origin)} title={t('common.delete')}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSiteDataOpen(false)}>{t('common.close')}</Button>
            <Button variant="destructive" disabled={sites.length === 0} onClick={async () => {
              try {
                await window.electronAPI.browserPane.clearAllSiteData()
                await loadSites()
                toast.success(t('settings.browser.siteCleared'))
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t('settings.browser.clearFailed'))
              }
            }}>{t('settings.browser.clearAllSites')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.browser.reset')}</DialogTitle>
            <DialogDescription>{t('settings.browser.resetConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={async () => {
              try {
                const next = await window.electronAPI.browserPane.updateSettings({
                  linkOpenBehavior: 'system',
                  newTabBehavior: 'default',
                  customNewTabUrl: '',
                  downloadPath: '',
                  askDownloadLocation: false,
                  permissionBehavior: 'ask',
                })
                await window.electronAPI.setBrowserToolEnabled(true)
                setSettings(next)
                setAgentEnabled(true)
                setResetOpen(false)
                toast.success(t('settings.browser.resetSuccess'))
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t('settings.browser.saveFailed'))
              }
            }}>{t('settings.browser.resetButton')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
