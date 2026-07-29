/**
 * PrivacySettingsPage — Settings → Privacy (UI-1 information architecture).
 *
 * Display-layer only: maps existing policy keys into user-facing groups.
 * Does not change schema, defaults, decide, sanitizer, or consent.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { Button } from '@/components/ui/button'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsToggle,
  SettingsSegmentedControl,
} from '@/components/settings'
import { useAppShellContext } from '@/context/AppShellContext'
import { routes } from '@/lib/navigate'
import type { DetailsPageMeta } from '@/lib/details-page-meta'
import type {
  PrivacyAccessLogEntryDto,
  PrivacyPermission3Dto,
  PrivacyPolicyDto,
  PrivacyStorageUsageDto,
} from '../../../shared/types'
import { resolveAccessLogDisplay } from './access-log-display'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'privacy',
}

/** Background cognition sources — UI is allow/off only (ask displays as off, never auto-written). */
type BackgroundSourceKey = 'session.meta' | 'browser.urlTitle' | 'git.statusMeta'

/** Interactive / user-triggered sources — keep allow/ask/deny. */
type InteractiveSourceKey = 'session.body' | 'session.archived' | 'library.generateWithModel'

type BackgroundUiValue = 'allow' | 'deny'

const BACKGROUND_ROWS: Array<{
  key: BackgroundSourceKey
  labelKey: string
  descKey: string
}> = [
  {
    key: 'session.meta',
    labelKey: 'settings.privacy.sessionActivity',
    descKey: 'settings.privacy.sessionActivityDesc',
  },
  {
    key: 'browser.urlTitle',
    labelKey: 'settings.privacy.browserActivity',
    descKey: 'settings.privacy.browserActivityDesc',
  },
  {
    key: 'git.statusMeta',
    labelKey: 'settings.privacy.projectActivity',
    descKey: 'settings.privacy.projectActivityDesc',
  },
]

const INTERACTIVE_ROWS: Array<{
  key: InteractiveSourceKey
  labelKey: string
  descKey: string
}> = [
  {
    key: 'session.body',
    labelKey: 'settings.privacy.sessionContent',
    descKey: 'settings.privacy.sessionContentDesc',
  },
  {
    key: 'session.archived',
    labelKey: 'settings.privacy.archivedSessions',
    descKey: 'settings.privacy.archivedSessionsDesc',
  },
  {
    key: 'library.generateWithModel',
    labelKey: 'settings.privacy.libraryGenerate',
    descKey: 'settings.privacy.libraryGenerateDesc',
  },
]

function getBackgroundPermission(
  policy: PrivacyPolicyDto,
  key: BackgroundSourceKey,
): PrivacyPermission3Dto {
  switch (key) {
    case 'session.meta':
      return policy.sources.session.meta
    case 'browser.urlTitle':
      return policy.sources.browser.urlTitle
    case 'git.statusMeta':
      return policy.sources.git.statusMeta
  }
}

function getInteractivePermission(
  policy: PrivacyPolicyDto,
  key: InteractiveSourceKey,
): PrivacyPermission3Dto {
  switch (key) {
    case 'session.body':
      return policy.sources.session.body
    case 'session.archived':
      return policy.sources.session.archived
    case 'library.generateWithModel':
      return policy.sources.library.generateWithModel
  }
}

/** Map stored ask → UI off without writing deny until the user acts. */
function toBackgroundUiValue(stored: PrivacyPermission3Dto): BackgroundUiValue {
  return stored === 'allow' ? 'allow' : 'deny'
}

function patchBackgroundPermission(
  policy: PrivacyPolicyDto,
  key: BackgroundSourceKey,
  value: BackgroundUiValue,
): Partial<PrivacyPolicyDto> {
  const sources = structuredClone(policy.sources)
  switch (key) {
    case 'session.meta':
      sources.session.meta = value
      break
    case 'browser.urlTitle':
      sources.browser.urlTitle = value
      break
    case 'git.statusMeta':
      sources.git.statusMeta = value
      break
  }
  return { sources }
}

function patchInteractivePermission(
  policy: PrivacyPolicyDto,
  key: InteractiveSourceKey,
  value: PrivacyPermission3Dto,
): Partial<PrivacyPolicyDto> {
  const sources = structuredClone(policy.sources)
  switch (key) {
    case 'session.body':
      sources.session.body = value
      break
    case 'session.archived':
      sources.session.archived = value
      break
    case 'library.generateWithModel':
      sources.library.generateWithModel = value
      break
  }
  return { sources }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const ACCESS_LOG_VISIBLE = 10

export default function PrivacySettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  const { activeWorkspaceId } = useAppShellContext()
  const [policy, setPolicy] = useState<PrivacyPolicyDto | null>(null)
  const [log, setLog] = useState<PrivacyAccessLogEntryDto[]>([])
  const [usage, setUsage] = useState<PrivacyStorageUsageDto | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clearNote, setClearNote] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!activeWorkspaceId) return
    setBusy(true)
    setError(null)
    try {
      const [nextPolicy, nextLog, nextUsage] = await Promise.all([
        window.electronAPI.getPrivacyPolicy({ workspaceId: activeWorkspaceId }),
        window.electronAPI.listPrivacyAccessLog({ workspaceId: activeWorkspaceId, limit: 40 }),
        window.electronAPI.getPrivacyStorageUsage(activeWorkspaceId),
      ])
      setPolicy(nextPolicy)
      setLog(nextLog)
      setUsage(nextUsage)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [activeWorkspaceId])

  useEffect(() => {
    void reload()
  }, [reload])

  const savePatch = async (patch: Partial<PrivacyPolicyDto>) => {
    if (!activeWorkspaceId || !policy) return
    setBusy(true)
    setError(null)
    try {
      const next = await window.electronAPI.setPrivacyPolicy({
        workspaceId: activeWorkspaceId,
        policy: patch,
      })
      setPolicy(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const setMode = async (active: boolean) => {
    if (!activeWorkspaceId) return
    setBusy(true)
    try {
      const next = await window.electronAPI.setPrivacyMode({
        workspaceId: activeWorkspaceId,
        mode: {
          active,
          pauseAutomations: true,
          persistAcrossRestart: true,
        },
      })
      setPolicy(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const clearTarget = async (target: {
    cognition?: boolean
    accessLog?: boolean
  }) => {
    if (!activeWorkspaceId) return
    const confirmKey = target.cognition
      ? 'settings.privacy.clearCognitionConfirm'
      : 'settings.privacy.clearLogConfirm'
    if (!window.confirm(t(confirmKey))) return
    setBusy(true)
    setClearNote(null)
    try {
      const result = await window.electronAPI.clearPrivacyData({
        workspaceId: activeWorkspaceId,
        target,
      })
      const cleared = result.cleared.length ? result.cleared.join(', ') : '—'
      const skipped = result.skipped.length ? result.skipped.join(', ') : '—'
      if (!result.cleared.length) {
        setClearNote(t('settings.privacy.clearSkippedOnly', { skipped }))
      } else {
        setClearNote(
          t('settings.privacy.clearResult', { cleared, skipped }),
        )
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const privacyActive = Boolean(policy?.effectivePrivacyModeActive ?? policy?.privacyMode.active)
  const sourcesDisabled = !policy || busy || privacyActive

  const body = (
            <div className="space-y-8">
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <SettingsSection
                title={t('settings.privacy.globalTitle')}
                description={t('settings.privacy.globalDesc')}
              >
                <SettingsCard>
                  <SettingsToggle
                    label={t('settings.privacy.contextAwareness')}
                    description={t('settings.privacy.contextAwarenessDesc')}
                    checked={Boolean(policy?.contextAwarenessEnabled)}
                    disabled={!policy || busy}
                    onCheckedChange={(checked) => void savePatch({ contextAwarenessEnabled: checked })}
                  />
                  <SettingsToggle
                    label={t('settings.privacy.privacyMode')}
                    description={
                      privacyActive
                        ? t('settings.privacy.privacyModeActiveDesc')
                        : t('settings.privacy.privacyModeDesc')
                    }
                    checked={privacyActive}
                    disabled={!policy || busy}
                    onCheckedChange={(checked) => void setMode(checked)}
                  />
                </SettingsCard>
              </SettingsSection>

              <SettingsSection
                title={t('settings.privacy.autoContextTitle')}
                description={t('settings.privacy.autoContextDesc')}
              >
                <SettingsCard>
                  {BACKGROUND_ROWS.map((row) => {
                    const stored = policy ? getBackgroundPermission(policy, row.key) : 'deny'
                    const uiValue = toBackgroundUiValue(stored)
                    return (
                      <SettingsRow
                        key={row.key}
                        label={t(row.labelKey)}
                        description={t(row.descKey)}
                      >
                        <SettingsSegmentedControl<BackgroundUiValue>
                          size="sm"
                          value={uiValue}
                          disabled={sourcesDisabled}
                          onValueChange={(next) => {
                            if (!policy) return
                            // ask is shown as off; do not write deny unless the user
                            // changes the control away from its current UI value.
                            if (next === uiValue) return
                            void savePatch(patchBackgroundPermission(policy, row.key, next))
                          }}
                          options={[
                            { value: 'allow', label: t('settings.privacy.permAllow') },
                            { value: 'deny', label: t('settings.privacy.permOff') },
                          ]}
                        />
                      </SettingsRow>
                    )
                  })}
                </SettingsCard>
              </SettingsSection>

              <SettingsSection
                title={t('settings.privacy.interactiveTitle')}
                description={t('settings.privacy.interactiveDesc')}
              >
                <SettingsCard>
                  {INTERACTIVE_ROWS.map((row) => {
                    const value = policy ? getInteractivePermission(policy, row.key) : 'deny'
                    return (
                      <SettingsRow
                        key={row.key}
                        label={t(row.labelKey)}
                        description={t(row.descKey)}
                      >
                        <SettingsSegmentedControl<PrivacyPermission3Dto>
                          size="sm"
                          value={value}
                          disabled={sourcesDisabled}
                          onValueChange={(next) => {
                            if (!policy) return
                            if (next === value) return
                            void savePatch(patchInteractivePermission(policy, row.key, next))
                          }}
                          options={[
                            { value: 'allow', label: t('settings.privacy.permAllow') },
                            { value: 'ask', label: t('settings.privacy.permAskEachTime') },
                            { value: 'deny', label: t('settings.privacy.permDeny') },
                          ]}
                        />
                      </SettingsRow>
                    )
                  })}
                </SettingsCard>
              </SettingsSection>

              <SettingsSection
                title={t('settings.privacy.sensitiveTitle')}
                description={t('settings.privacy.sensitiveDesc')}
              >
                <SettingsCard>
                  <SettingsRow
                    label={t('settings.security.sensitiveAlwaysOn')}
                    description={t('settings.privacy.sensitiveBody')}
                  >
                    <span className="inline-flex items-center rounded-md bg-foreground/[0.06] px-2 py-1 text-xs font-medium text-muted-foreground">
                      {t('settings.security.alwaysOn')}
                    </span>
                  </SettingsRow>
                </SettingsCard>
              </SettingsSection>

              <SettingsSection
                title={t('settings.privacy.cleanupTitle')}
                description={t('settings.privacy.cleanupDesc')}
              >
                <SettingsCard>
                  <SettingsRow
                    label={t('settings.privacy.storageUsage')}
                    description={
                      usage
                        ? t('settings.privacy.storageUsageDesc', {
                            cognition: formatBytes(usage.cognitionBytes),
                            log: formatBytes(usage.accessLogBytes),
                            total: formatBytes(usage.totalBytes),
                          })
                        : '—'
                    }
                  >
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => void reload()}>
                      {t('settings.privacy.reload')}
                    </Button>
                  </SettingsRow>
                  <SettingsRow
                    label={t('settings.privacy.clearCognition')}
                    description={t('settings.privacy.clearCognitionDesc')}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !activeWorkspaceId}
                      onClick={() => void clearTarget({ cognition: true })}
                    >
                      {t('settings.privacy.clear')}
                    </Button>
                  </SettingsRow>
                  <SettingsRow
                    label={t('settings.privacy.clearLog')}
                    description={t('settings.privacy.clearLogDesc')}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !activeWorkspaceId}
                      onClick={() => void clearTarget({ accessLog: true })}
                    >
                      {t('settings.privacy.clear')}
                    </Button>
                  </SettingsRow>
                  {clearNote && (
                    <p className="px-4 pb-3 text-xs text-muted-foreground">{clearNote}</p>
                  )}
                </SettingsCard>
              </SettingsSection>

              <SettingsSection
                title={t('settings.privacy.transparencyTitle')}
                description={t('settings.privacy.transparencyDesc')}
              >
                <SettingsCard>
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-sm font-medium">{t('settings.privacy.accessLogTitle')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('settings.privacy.accessLogDesc')}
                    </p>
                  </div>
                  {log.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      {t('settings.privacy.accessLogEmpty')}
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {log.slice(0, ACCESS_LOG_VISIBLE).map((entry) => {
                        const display = resolveAccessLogDisplay(entry)
                        return (
                          <li key={entry.id} className="px-4 py-3 text-sm">
                            <div className="flex justify-between gap-3 items-start">
                              <span className="font-medium">{t(display.sourceKey)}</span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {new Date(entry.at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5">
                              {t('settings.privacy.logPurposeLabel')}: {t(display.purposeKey)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t('settings.privacy.logDecisionLabel')}: {t(display.decisionKey)}
                            </p>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </SettingsCard>
              </SettingsSection>
            </div>
  )

  if (embedded) return body

  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        title={t('settings.privacy.title')}
        actions={<HeaderMenu route={routes.view.settings('privacy')} />}
      />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            {body}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
