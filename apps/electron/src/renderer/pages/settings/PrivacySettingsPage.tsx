/**
 * PrivacySettingsPage — Settings → Privacy (v0.16 Phase B).
 *
 * Controls context awareness, Today useContext, privacy mode, per-source
 * permissions, access log, and whitelist-based cognition cleanup.
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
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import type {
  PrivacyAccessLogEntryDto,
  PrivacyPermission3Dto,
  PrivacyPolicyDto,
  PrivacyStorageUsageDto,
} from '../../../shared/types'
import { PRIVACY_NEVER_COLLECT_DTO } from '@craft-agent/shared/protocol'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'privacy',
}

type SourceToggleKey =
  | 'session.meta'
  | 'session.body'
  | 'session.attachments'
  | 'session.archived'
  | 'browser.urlTitle'
  | 'browser.pageContent'
  | 'browser.history'
  | 'git.statusMeta'
  | 'git.diffContent'
  | 'files.metadata'
  | 'files.content'
  | 'messaging.wechat'
  | 'messaging.lark'
  | 'automation'
  | 'mcpPlugins'
  | 'projectMemory'

const SOURCE_ROWS: Array<{
  key: SourceToggleKey
  labelKey: string
  descKey: string
  /** Not wired into Cognition yet — show as unavailable. */
  unavailable?: boolean
}> = [
  { key: 'session.meta', labelKey: 'settings.privacy.source.sessionMeta', descKey: 'settings.privacy.source.sessionMetaDesc' },
  { key: 'session.body', labelKey: 'settings.privacy.source.sessionBody', descKey: 'settings.privacy.source.sessionBodyDesc' },
  { key: 'session.attachments', labelKey: 'settings.privacy.source.sessionAttachments', descKey: 'settings.privacy.source.sessionAttachmentsDesc' },
  { key: 'session.archived', labelKey: 'settings.privacy.source.sessionArchived', descKey: 'settings.privacy.source.sessionArchivedDesc' },
  { key: 'browser.urlTitle', labelKey: 'settings.privacy.source.browserUrlTitle', descKey: 'settings.privacy.source.browserUrlTitleDesc' },
  { key: 'browser.pageContent', labelKey: 'settings.privacy.source.browserPageContent', descKey: 'settings.privacy.source.browserPageContentDesc' },
  { key: 'browser.history', labelKey: 'settings.privacy.source.browserHistory', descKey: 'settings.privacy.source.browserHistoryDesc' },
  { key: 'git.statusMeta', labelKey: 'settings.privacy.source.gitStatus', descKey: 'settings.privacy.source.gitStatusDesc' },
  { key: 'git.diffContent', labelKey: 'settings.privacy.source.gitDiff', descKey: 'settings.privacy.source.gitDiffDesc' },
  { key: 'files.metadata', labelKey: 'settings.privacy.source.fileMeta', descKey: 'settings.privacy.source.fileMetaDesc', unavailable: true },
  { key: 'files.content', labelKey: 'settings.privacy.source.fileContent', descKey: 'settings.privacy.source.fileContentDesc', unavailable: true },
  { key: 'messaging.wechat', labelKey: 'settings.privacy.source.wechat', descKey: 'settings.privacy.source.wechatDesc', unavailable: true },
  { key: 'messaging.lark', labelKey: 'settings.privacy.source.lark', descKey: 'settings.privacy.source.larkDesc', unavailable: true },
  { key: 'automation', labelKey: 'settings.privacy.source.automation', descKey: 'settings.privacy.source.automationDesc', unavailable: true },
  { key: 'mcpPlugins', labelKey: 'settings.privacy.source.mcp', descKey: 'settings.privacy.source.mcpDesc', unavailable: true },
  { key: 'projectMemory', labelKey: 'settings.privacy.source.projectMemory', descKey: 'settings.privacy.source.projectMemoryDesc', unavailable: true },
]

function getPermission(policy: PrivacyPolicyDto, key: SourceToggleKey): PrivacyPermission3Dto {
  switch (key) {
    case 'session.meta': return policy.sources.session.meta
    case 'session.body': return policy.sources.session.body
    case 'session.attachments': return policy.sources.session.attachments
    case 'session.archived': return policy.sources.session.archived
    case 'browser.urlTitle': return policy.sources.browser.urlTitle
    case 'browser.pageContent': return policy.sources.browser.pageContent
    case 'browser.history': return policy.sources.browser.history
    case 'git.statusMeta': return policy.sources.git.statusMeta
    case 'git.diffContent': return policy.sources.git.diffContent
    case 'files.metadata': return policy.sources.files.metadata
    case 'files.content': return policy.sources.files.content
    case 'messaging.wechat': return policy.sources.messaging.wechat
    case 'messaging.lark': return policy.sources.messaging.lark
    case 'automation': return policy.sources.automation
    case 'mcpPlugins': return policy.sources.mcpPlugins
    case 'projectMemory': return policy.sources.projectMemory
  }
}

function patchPermission(
  policy: PrivacyPolicyDto,
  key: SourceToggleKey,
  value: PrivacyPermission3Dto,
): Partial<PrivacyPolicyDto> {
  const sources = structuredClone(policy.sources)
  switch (key) {
    case 'session.meta': sources.session.meta = value; break
    case 'session.body': sources.session.body = value; break
    case 'session.attachments': sources.session.attachments = value; break
    case 'session.archived': sources.session.archived = value; break
    case 'browser.urlTitle': sources.browser.urlTitle = value; break
    case 'browser.pageContent': sources.browser.pageContent = value; break
    case 'browser.history': sources.browser.history = value; break
    case 'git.statusMeta': sources.git.statusMeta = value; break
    case 'git.diffContent': sources.git.diffContent = value; break
    case 'files.metadata': sources.files.metadata = value; break
    case 'files.content': sources.files.content = value; break
    case 'messaging.wechat': sources.messaging.wechat = value; break
    case 'messaging.lark': sources.messaging.lark = value; break
    case 'automation': sources.automation = value; break
    case 'mcpPlugins': sources.mcpPlugins = value; break
    case 'projectMemory': sources.projectMemory = value; break
  }
  return { sources }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function PrivacySettingsPage() {
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
    exploreBriefCache?: boolean
  }) => {
    if (!activeWorkspaceId) return
    const confirmKey = target.cognition
      ? 'settings.privacy.clearCognitionConfirm'
      : target.accessLog
        ? 'settings.privacy.clearLogConfirm'
        : 'settings.privacy.clearBriefConfirm'
    if (!window.confirm(t(confirmKey))) return
    setBusy(true)
    setClearNote(null)
    try {
      if (target.exploreBriefCache) {
        try {
          localStorage.removeItem('craft-agent:explore-brief-cache')
          localStorage.removeItem('explore-brief-cache')
        } catch { /* ignore */ }
      }
      const result = await window.electronAPI.clearPrivacyData({
        workspaceId: activeWorkspaceId,
        target,
      })
      const cleared = result.cleared.length
        ? result.cleared.join(', ')
        : (target.exploreBriefCache ? t('settings.privacy.clearBriefLocalOnly') : '—')
      const skipped = result.skipped.length ? result.skipped.join(', ') : '—'
      // Never claim success for targets that were only skipped
      if (!result.cleared.length && !target.exploreBriefCache) {
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

  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        title={t('settings.privacy.title')}
        actions={<HeaderMenu route={routes.view.settings('privacy')} />}
      />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
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
                    label={t('settings.privacy.todayUseContext')}
                    description={t('settings.privacy.todayUseContextDesc')}
                    checked={Boolean(policy?.today.useContext)}
                    disabled={!policy || busy || !policy.contextAwarenessEnabled}
                    onCheckedChange={(checked) => void savePatch({ today: { useContext: checked } })}
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
                title={t('settings.privacy.sourcesTitle')}
                description={t('settings.privacy.sourcesDesc')}
              >
                <SettingsCard>
                  {SOURCE_ROWS.map((row) => {
                    const value = policy ? getPermission(policy, row.key) : 'deny'
                    const disabled = !policy || busy || row.unavailable || privacyActive
                    return (
                      <SettingsRow
                        key={row.key}
                        label={t(row.labelKey)}
                        description={
                          row.unavailable
                            ? t('settings.privacy.sourceUnavailable')
                            : t(row.descKey)
                        }
                      >
                        <SettingsSegmentedControl<PrivacyPermission3Dto>
                          size="sm"
                          value={row.unavailable ? 'deny' : value}
                          disabled={disabled}
                          onValueChange={(next) => {
                            if (!policy || row.unavailable) return
                            void savePatch(patchPermission(policy, row.key, next))
                          }}
                          options={[
                            { value: 'allow', label: t('settings.privacy.permAllow') },
                            { value: 'ask', label: t('settings.privacy.permAsk') },
                            { value: 'deny', label: t('settings.privacy.permDeny') },
                          ]}
                        />
                      </SettingsRow>
                    )
                  })}
                </SettingsCard>
              </SettingsSection>

              <SettingsSection
                title={t('settings.privacy.neverTitle')}
                description={t('settings.privacy.neverDesc')}
              >
                <SettingsCard>
                  {PRIVACY_NEVER_COLLECT_DTO.map((kind) => (
                    <SettingsRow
                      key={kind}
                      label={t(`settings.privacy.never.${kind}`)}
                      description={t('settings.privacy.neverLocked')}
                    >
                      <span className="text-xs text-muted-foreground">
                        {t('settings.privacy.permDeny')}
                      </span>
                    </SettingsRow>
                  ))}
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
                  <SettingsRow label={t('settings.privacy.clearCognition')} description={t('settings.privacy.clearCognitionDesc')}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !activeWorkspaceId}
                      onClick={() => void clearTarget({ cognition: true })}
                    >
                      {t('settings.privacy.clear')}
                    </Button>
                  </SettingsRow>
                  <SettingsRow label={t('settings.privacy.clearLog')} description={t('settings.privacy.clearLogDesc')}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !activeWorkspaceId}
                      onClick={() => void clearTarget({ accessLog: true })}
                    >
                      {t('settings.privacy.clear')}
                    </Button>
                  </SettingsRow>
                  <SettingsRow label={t('settings.privacy.clearBrief')} description={t('settings.privacy.clearBriefDesc')}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !activeWorkspaceId}
                      onClick={() => void clearTarget({ exploreBriefCache: true })}
                    >
                      {t('settings.privacy.clear')}
                    </Button>
                  </SettingsRow>
                  <SettingsRow
                    label={t('settings.privacy.clearBrowserNote')}
                    description={t('settings.privacy.clearBrowserNoteDesc')}
                  >
                    <span className="text-xs text-muted-foreground max-w-[14rem] text-right">
                      {t('settings.privacy.clearBrowserUnsupported')}
                    </span>
                  </SettingsRow>
                  {clearNote && (
                    <p className="px-4 pb-3 text-xs text-muted-foreground">{clearNote}</p>
                  )}
                </SettingsCard>
              </SettingsSection>

              <SettingsSection
                title={t('settings.privacy.accessLogTitle')}
                description={t('settings.privacy.accessLogDesc')}
              >
                <SettingsCard>
                  {log.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      {t('settings.privacy.accessLogEmpty')}
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {log.slice(0, 20).map((entry) => (
                        <li key={entry.id} className="px-4 py-3 text-sm">
                          <div className="flex justify-between gap-3">
                            <span className="font-medium">{entry.decision}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(entry.at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {entry.feature} · {entry.sources.join(',') || '—'} · {entry.code}
                            {entry.purpose ? ` · ${entry.purpose}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
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
