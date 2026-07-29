/**
 * CognitionDebugPage — inspect Event → Observation → Loop → Reflection → Guidance.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { routes } from '@/lib/navigate'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
} from '@/components/settings'
import type { DetailsPageMeta } from '@/lib/details-page-meta'
import { useAppShellContext } from '@/context/AppShellContext'
import type {
  CognitionEventSummary,
  CognitionGuidanceDto,
  CognitionLoopDto,
  CognitionObservationDto,
  CognitionReflectionDto,
  CognitionStoreStatusDto,
} from '@craft-agent/shared/protocol'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'cognition',
}

type Tab = 'events' | 'observations' | 'loops' | 'reflections' | 'guidance'

export default function CognitionDebugPage() {
  const { t } = useTranslation()
  const { activeWorkspaceId } = useAppShellContext()
  const workspaceId = activeWorkspaceId || ''
  const [tab, setTab] = useState<Tab>('guidance')
  const [status, setStatus] = useState<CognitionStoreStatusDto | null>(null)
  const [events, setEvents] = useState<CognitionEventSummary[]>([])
  const [observations, setObservations] = useState<CognitionObservationDto[]>([])
  const [loops, setLoops] = useState<CognitionLoopDto[]>([])
  const [reflections, setReflections] = useState<CognitionReflectionDto[]>([])
  const [guidance, setGuidance] = useState<CognitionGuidanceDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!workspaceId) return
    setBusy(true)
    setError(null)
    try {
      const [nextStatus, nextEvents, nextObs, nextLoops, nextRefl, nextGuid] = await Promise.all([
        window.electronAPI.getCognitionStatus(workspaceId),
        window.electronAPI.listCognitionEvents({ workspaceId, limit: 40 }),
        window.electronAPI.listCognitionObservations({ workspaceId, limit: 40 }),
        window.electronAPI.listCognitionLoops({ workspaceId, includeResolved: true, limit: 40 }),
        window.electronAPI.listCognitionReflections({ workspaceId, latestOnly: true, limit: 20 }),
        window.electronAPI.listCognitionGuidance({ workspaceId, includeDismissed: true, limit: 40, forDebug: true }),
      ])
      setStatus(nextStatus)
      setEvents(nextEvents)
      setObservations(nextObs)
      setLoops(nextLoops)
      setReflections(nextRefl)
      setGuidance(nextGuid)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void reload()
  }, [reload])

  const clearAll = async () => {
    if (!workspaceId) return
    if (!window.confirm(t('settings.cognition.clearConfirm'))) return
    await window.electronAPI.clearCognitionEvents(workspaceId)
    await reload()
  }

  const repair = async () => {
    if (!workspaceId) return
    await window.electronAPI.repairCognitionStore(workspaceId)
    await reload()
  }

  const refreshGuidance = async () => {
    if (!workspaceId) return
    await window.electronAPI.refreshCognitionGuidance({ workspaceId, includeDaily: true })
    await reload()
  }

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'events', label: t('settings.cognition.tabEvents'), count: events.length },
    { id: 'observations', label: t('settings.cognition.tabObservations'), count: observations.length },
    { id: 'loops', label: t('settings.cognition.tabLoops'), count: loops.length },
    { id: 'reflections', label: t('settings.cognition.tabReflections'), count: reflections.length },
    { id: 'guidance', label: t('settings.cognition.tabGuidance'), count: guidance.length },
  ]

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('settings.cognition.title')} actions={<HeaderMenu route={routes.view.settings('cognition')} />} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-4xl mx-auto space-y-8">
            <SettingsSection
              title={t('settings.cognition.pipeline')}
              description={t('settings.cognition.pipelineDesc')}
            >
              <SettingsCard>
                <SettingsRow label={t('settings.cognition.status')}>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {status
                      ? `events=${status.eventCount} seq=${status.nextSequence} processed=${status.lastProcessedSequence}`
                      : '—'}
                  </span>
                </SettingsRow>
                <div className="flex flex-wrap gap-2 px-4 py-3">
                  <button type="button" disabled={busy || !workspaceId} onClick={() => { void reload() }} className="rounded-control bg-foreground/[0.05] px-3 py-1.5 text-xs font-medium hover:bg-foreground/[0.08] disabled:opacity-50">
                    {t('settings.cognition.reload')}
                  </button>
                  <button type="button" disabled={busy || !workspaceId} onClick={() => { void refreshGuidance() }} className="rounded-control bg-foreground/[0.05] px-3 py-1.5 text-xs font-medium hover:bg-foreground/[0.08] disabled:opacity-50">
                    {t('settings.cognition.refreshGuidance')}
                  </button>
                  <button type="button" disabled={busy || !workspaceId} onClick={() => { void repair() }} className="rounded-control bg-foreground/[0.05] px-3 py-1.5 text-xs font-medium hover:bg-foreground/[0.08] disabled:opacity-50">
                    {t('settings.cognition.repair')}
                  </button>
                  <button type="button" disabled={busy || !workspaceId} onClick={() => { void clearAll() }} className="rounded-control bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/15 disabled:opacity-50">
                    {t('settings.cognition.clear')}
                  </button>
                </div>
                {error && <p className="px-4 pb-3 text-xs text-destructive">{error}</p>}
              </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('settings.cognition.inspect')} description={t('settings.cognition.inspectDesc')}>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`rounded-control px-3 py-1.5 text-xs font-medium transition-colors ${
                      tab === item.id ? 'bg-foreground text-background' : 'bg-foreground/[0.05] text-foreground hover:bg-foreground/[0.08]'
                    }`}
                  >
                    {item.label} ({item.count})
                  </button>
                ))}
              </div>
              <SettingsCard>
                <div className="divide-y divide-border/50">
                  {tab === 'events' && events.map((e) => (
                    <div key={e.id} className="px-4 py-3 text-xs">
                      <p className="font-medium text-foreground">{e.type} · #{e.sequence}</p>
                      <p className="mt-1 text-muted-foreground">{e.summary}</p>
                      {e.sessionId && <p className="mt-1 text-muted-foreground/70">session={e.sessionId}</p>}
                    </div>
                  ))}
                  {tab === 'observations' && observations.map((o) => (
                    <div key={o.id} className="px-4 py-3 text-xs">
                      <p className="font-medium text-foreground">[{o.category}] {o.title}</p>
                      <p className="mt-1 text-muted-foreground">{o.summary}</p>
                      <p className="mt-1 text-muted-foreground/70">events={o.sourceEventIds.join(', ')}</p>
                    </div>
                  ))}
                  {tab === 'loops' && loops.map((loop) => (
                    <div key={loop.id} className="px-4 py-3 text-xs">
                      <p className="font-medium text-foreground">[{loop.status}] {loop.title}</p>
                      <p className="mt-1 text-muted-foreground">{loop.summary}</p>
                      {loop.nextAction && <p className="mt-1">next={loop.nextAction}</p>}
                      <p className="mt-1 text-muted-foreground/70">obs={loop.observationIds.join(', ')}</p>
                    </div>
                  ))}
                  {tab === 'reflections' && reflections.map((r) => (
                    <div key={r.id} className="px-4 py-3 text-xs">
                      <p className="font-medium text-foreground">[{r.type}] {r.title}</p>
                      <p className="mt-1 text-muted-foreground">{r.summary}</p>
                      <p className="mt-1 text-muted-foreground/70">
                        blockers={r.blockers.length} unresolved={r.unresolved.length} next={r.nextActions.length}
                      </p>
                    </div>
                  ))}
                  {tab === 'guidance' && guidance.map((g) => (
                    <div key={g.id} className="px-4 py-3 text-xs">
                      <p className="font-medium text-foreground">[{g.type}] {g.title}{g.dismissedAt ? ' (dismissed)' : ''}</p>
                      <p className="mt-1 text-muted-foreground">{t('settings.cognition.reason')}: {g.reason}</p>
                      <p className="mt-1">{t('settings.cognition.action')}: {g.action}</p>
                      <p className="mt-1 text-muted-foreground/70">
                        score={g.score?.toFixed?.(2) ?? '—'} · loops={g.sourceLoopIds.join(', ')} · session={g.targetSessionId || '—'}
                      </p>
                    </div>
                  ))}
                  {((tab === 'events' && !events.length)
                    || (tab === 'observations' && !observations.length)
                    || (tab === 'loops' && !loops.length)
                    || (tab === 'reflections' && !reflections.length)
                    || (tab === 'guidance' && !guidance.length)) && (
                    <p className="px-4 py-6 text-center text-xs text-muted-foreground">{t('settings.cognition.empty')}</p>
                  )}
                </div>
              </SettingsCard>
            </SettingsSection>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
