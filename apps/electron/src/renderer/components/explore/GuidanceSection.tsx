/**
 * GuidanceSection — bypass Today guidance cards (suggestions ≠ tasks).
 * Fail-soft: cognition RPC failures never block the page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, RefreshCw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  CognitionGuidanceDto,
  CognitionLoopDto,
  CognitionObservationDto,
  CognitionReflectionDto,
} from '@craft-agent/shared/protocol'
import { cn } from '@/lib/utils'
import {
  buildTodayGuidance,
  guidanceOpenSessionId,
  type TodayGuidanceItem,
  type TodayGuidanceScope,
} from './build-today-guidance'

const TYPE_DOT: Record<string, string> = {
  resolve_blocker: 'bg-destructive',
  resume: 'bg-emerald-500',
  review: 'bg-violet-500',
  follow_up: 'bg-amber-500',
  continue: 'bg-blue-500',
}

const TYPE_TEXT: Record<string, string> = {
  resolve_blocker: 'text-destructive',
  resume: 'text-emerald-700 dark:text-emerald-300',
  review: 'text-violet-700 dark:text-violet-300',
  follow_up: 'text-amber-700 dark:text-amber-300',
  continue: 'text-blue-700 dark:text-blue-300',
}

interface GuidanceEvidence {
  observations: CognitionObservationDto[]
  loops: CognitionLoopDto[]
  reflections: CognitionReflectionDto[]
}

export function GuidanceSection({
  workspaceId,
  activeSessionIds,
  excludeSessionIds,
  scope = 'workspace',
  autoRefresh = true,
  limit = 5,
  onOpenSession,
}: {
  workspaceId: string
  activeSessionIds?: string[]
  excludeSessionIds?: string[]
  scope?: TodayGuidanceScope
  autoRefresh?: boolean
  limit?: number
  onOpenSession: (sessionId: string) => void
}) {
  const { t } = useTranslation()
  const [raw, setRaw] = useState<CognitionGuidanceDto[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [evidenceById, setEvidenceById] = useState<Record<string, GuidanceEvidence>>({})

  const load = useCallback(async (refresh: boolean) => {
    if (!workspaceId) return
    setLoading(true)
    setFailed(false)
    try {
      if (refresh) {
        await window.electronAPI.refreshCognitionGuidance({
          workspaceId,
          includeDaily: false,
        }).catch(() => null)
      }
      const items = await window.electronAPI.listCognitionGuidance({
        workspaceId,
        limit: 20,
      })
      setRaw(Array.isArray(items) ? items : [])
    } catch (error) {
      console.warn('[GuidanceSection] cognition guidance unavailable', error)
      setFailed(true)
      setRaw([])
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void load(autoRefresh)
  }, [load, autoRefresh])

  const items = useMemo(
    () => buildTodayGuidance(raw, {
      excludeSessionIds,
      activeSessionIds,
      scope,
      limit,
    }),
    [raw, excludeSessionIds, activeSessionIds, scope, limit],
  )

  const dismiss = async (id: string) => {
    try {
      await window.electronAPI.dismissCognitionGuidance({ workspaceId, guidanceId: id })
      setRaw((prev) => prev.filter((g) => g.id !== id))
      if (expandedId === id) setExpandedId(null)
    } catch (error) {
      console.warn('[GuidanceSection] dismiss failed', error)
    }
  }

  const toggleEvidence = async (item: TodayGuidanceItem) => {
    if (expandedId === item.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(item.id)
    if (evidenceById[item.id]) return
    try {
      const sessionId = item.targetSessionId
      const [observations, loops, reflections] = await Promise.all([
        window.electronAPI.listCognitionObservations({
          workspaceId,
          sessionId,
          limit: 50,
        }).catch(() => [] as CognitionObservationDto[]),
        window.electronAPI.listCognitionLoops({
          workspaceId,
          sessionId,
          includeResolved: true,
          limit: 50,
        }).catch(() => [] as CognitionLoopDto[]),
        window.electronAPI.listCognitionReflections({
          workspaceId,
          sessionId,
          latestOnly: true,
          limit: 20,
        }).catch(() => [] as CognitionReflectionDto[]),
      ])
      const obsIds = new Set(item.sourceObservationIds)
      const loopIds = new Set(item.sourceLoopIds)
      setEvidenceById((prev) => ({
        ...prev,
        [item.id]: {
          observations: observations.filter((o) => obsIds.has(o.id)),
          loops: loops.filter((l) => loopIds.has(l.id) || l.id === item.targetLoopId),
          reflections: reflections.filter(
            (r) => r.id === item.sourceReflectionId || (sessionId && r.sessionId === sessionId),
          ).slice(0, 2),
        },
      }))
    } catch (error) {
      console.warn('[GuidanceSection] evidence load failed', error)
      setEvidenceById((prev) => ({
        ...prev,
        [item.id]: { observations: [], loops: [], reflections: [] },
      }))
    }
  }

  const openItem = (item: TodayGuidanceItem) => {
    const sessionId = guidanceOpenSessionId(item)
    if (sessionId) onOpenSession(sessionId)
  }

  return (
    <section aria-labelledby="guidance-heading" className="flex flex-col gap-2.5">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <h2 id="guidance-heading" className="text-sm font-medium text-foreground">
            {t('today.guidance.title', { defaultValue: '工作建议' })}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('today.guidance.description', { defaultValue: '基于未闭环事项的下一步建议（不是任务）' })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 pb-0.5">
          {items.length > 0 && (
            <span className="text-[11px] tabular-nums text-muted-foreground/70">
              {t('today.guidance.itemCount', { count: items.length, defaultValue: `${items.length} 条` })}
            </span>
          )}
          <button
            type="button"
            onClick={() => { void load(true) }}
            disabled={loading}
            aria-label={t('today.guidance.refresh', { defaultValue: '刷新建议' })}
            title={t('today.guidance.refresh', { defaultValue: '刷新建议' })}
            className="flex size-7 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="overflow-hidden rounded-[12px] border border-border/55 bg-background shadow-minimal">
          {items.map((item) => {
            const evidence = evidenceById[item.id]
            const expanded = expandedId === item.id
            const canOpen = Boolean(guidanceOpenSessionId(item))
            return (
              <div key={item.id} className="border-t border-border/45 first:border-t-0">
                <div className="group flex min-h-[68px] w-full items-center gap-3.5 px-4 py-3 md:px-5">
                  <span className={cn('size-1.5 shrink-0 rounded-full', TYPE_DOT[item.type] ?? 'bg-muted-foreground/55')} aria-hidden="true" />
                  <button
                    type="button"
                    disabled={!canOpen}
                    onClick={() => openItem(item)}
                    className={cn(
                      'min-w-0 flex-1 text-left focus-visible:outline-none',
                      canOpen ? 'cursor-pointer' : 'cursor-default opacity-90',
                    )}
                  >
                    <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
                      <span className={cn('shrink-0 font-medium', TYPE_TEXT[item.type] ?? 'text-muted-foreground')}>
                        {t(`today.guidance.type.${item.type}`, { defaultValue: item.type })}
                      </span>
                      <span className="text-muted-foreground/35" aria-hidden="true">·</span>
                      <span className="truncate text-muted-foreground">{item.action || item.reason}</span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {item.importance >= 0.75 && (
                      <span className="text-[10px] font-medium text-destructive/80">
                        {t('today.guidance.high', { defaultValue: '重要' })}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => { void toggleEvidence(item) }}
                      aria-expanded={expanded}
                      aria-label={t('today.guidance.showEvidence', { defaultValue: '查看依据' })}
                      title={t('today.guidance.showEvidence', { defaultValue: '查看依据' })}
                      className="flex size-7 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                    >
                      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { void dismiss(item.id) }}
                      aria-label={t('today.guidance.dismiss', { defaultValue: '忽略建议' })}
                      title={t('today.guidance.dismiss', { defaultValue: '忽略建议' })}
                      className="flex size-7 items-center justify-center rounded-control text-muted-foreground/60 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {canOpen && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground/25 opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100" />
                    )}
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-border/35 bg-foreground/[0.015] px-4 py-3 text-xs text-muted-foreground md:px-5">
                    <p className="text-foreground/85">
                      <span className="font-medium text-foreground">{t('today.guidance.reason', { defaultValue: '原因' })}：</span>
                      {item.reason}
                    </p>
                    <p className="mt-1.5">
                      <span className="font-medium text-foreground">{t('today.guidance.next', { defaultValue: '下一步' })}：</span>
                      {item.action}
                    </p>
                    <div className="mt-2.5 space-y-1.5">
                      <p className="font-medium text-foreground">
                        {t('today.guidance.evidence', { defaultValue: '依据' })}
                      </p>
                      {!evidence && (
                        <p>{t('today.guidance.evidenceLoading', { defaultValue: '加载依据…' })}</p>
                      )}
                      {evidence && evidence.loops.length === 0 && evidence.observations.length === 0 && evidence.reflections.length === 0 && (
                        <p>{t('today.guidance.evidenceEmpty', { defaultValue: '暂无详细依据条目' })}</p>
                      )}
                      {evidence?.loops.map((loop) => (
                        <p key={loop.id}>
                          <span className="text-foreground/80">Loop</span>
                          {' · '}
                          {loop.title}
                          {loop.status ? ` (${loop.status})` : ''}
                        </p>
                      ))}
                      {evidence?.observations.map((obs) => (
                        <p key={obs.id}>
                          <span className="text-foreground/80">Observation</span>
                          {' · '}
                          [{obs.category}] {obs.title}
                        </p>
                      ))}
                      {evidence?.reflections.map((refl) => (
                        <p key={refl.id}>
                          <span className="text-foreground/80">Reflection</span>
                          {' · '}
                          {refl.title}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-card border border-dashed border-border/70 px-5 py-7 text-center">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('today.guidance.loading', { defaultValue: '正在加载工作建议…' })}</p>
          ) : failed ? (
            <>
              <p className="text-sm font-medium text-foreground/80">
                {t('today.guidance.unavailable', { defaultValue: '工作建议暂时不可用' })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('today.guidance.unavailableHint', { defaultValue: '不影响下方任务队列；可稍后重试。' })}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground/80">
                {t('today.guidance.emptyTitle', { defaultValue: '暂无工作建议' })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('today.guidance.emptyDescription', { defaultValue: '有未闭环事项时，这里会出现可执行的下一步建议。' })}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
