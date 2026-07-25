import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowUp, Check, Globe2, Search, Settings2, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAtomValue } from 'jotai'
import type {
  CognitionGuidanceDto,
  CognitionLoopDto,
  CompleteAndArchiveResponse,
  PrivacyPolicyDto,
} from '@craft-agent/shared/protocol'
import { cn } from '@/lib/utils'
import { classifyBrowserNewTabIntent, type BrowserNewTabIntent } from '../browser/new-tab-intent'
import { buildBrowserSearchUrl, resolveBrowserAddress } from '../browser/utils'
import {
  applyExplorePrivacyMigration,
  DEFAULT_EXPLORE_SETTINGS,
  getExploreSettings,
  type ExploreSettings,
} from '@/lib/explore-settings'
import { navigate, routes } from '@/lib/navigate'
import { buildContinueTaskPrompt, findProjectResumeSession } from '@/lib/project-resume'
import { resolveLastActiveProject, setLastActiveProjectId } from '@/lib/last-active-project'
import type { SessionMeta } from '@/atoms/sessions'
import { projectsAtom } from '@/atoms/projects'
import type { BrowserWorkspaceTab } from '@/atoms/browser-workspace'
import { useAppShellContext } from '@/context/AppShellContext'
import { ContinueProjectCard } from './ContinueProjectCard'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'
import { buildPendingQueue, pendingSnoozeKey, type PendingItem } from './pending-queue'
import { buildRecentRailSessions, buildRecentRailTabs } from './recent-rail'
import {
  PendingEvidencePanel,
  PendingQueueSection,
  type SnoozePreset,
} from './PendingQueueSection'
import { RecentRailSection } from './RecentRailSection'

interface ExploreHomeProps {
  workspaceId: string
  recentSessions: SessionMeta[]
  taskSessions: SessionMeta[]
  recentTabs: BrowserWorkspaceTab[]
  onOpenSession: (sessionId: string) => void
  onOpenTab: (tabId: string) => void
  onOpenUrl: (url: string) => void
  onNewSession: (prompt: string) => void
}

function snoozeUntil(preset: SnoozePreset, now = Date.now()): number | null {
  if (preset === 'indefinite') return null
  const date = new Date(now)
  date.setSeconds(0, 0)
  if (preset === 'tomorrow') {
    date.setDate(date.getDate() + 1)
    date.setHours(9, 0, 0, 0)
    return date.getTime()
  }
  if (preset === '3days') {
    date.setDate(date.getDate() + 3)
    date.setHours(9, 0, 0, 0)
    return date.getTime()
  }
  // nextWeek — next Monday 09:00
  const day = date.getDay()
  const add = day === 0 ? 1 : 8 - day
  date.setDate(date.getDate() + add)
  date.setHours(9, 0, 0, 0)
  return date.getTime()
}

function formatCompleteAndArchiveFeedback(
  result: CompleteAndArchiveResponse,
  t: (key: string, options?: Record<string, unknown>) => string,
): { tone: 'ok' | 'partial' | 'error'; message: string } {
  if (result.ok && result.alreadyCompleted) {
    return { tone: 'ok', message: t('today.pending.alreadyCompleted') }
  }
  if (result.ok) {
    return { tone: 'ok', message: t('today.pending.completedOk') }
  }
  const markDone = result.steps.find((s) => s.step === 'mark_done')
  const archive = result.steps.find((s) => s.step === 'archive')
  if (markDone && (markDone.status === 'ok' || markDone.status === 'already_done') && archive?.status === 'failed') {
    return { tone: 'partial', message: t('today.pending.completedButArchiveFailed') }
  }
  const failed = result.steps.find((s) => s.status === 'failed')
  return {
    tone: 'error',
    message: t('today.pending.completeFailed', {
      step: failed?.step ?? 'unknown',
      detail: failed?.detail ?? '',
    }),
  }
}

export function ExploreHome({
  workspaceId,
  recentSessions,
  taskSessions,
  recentTabs,
  onOpenSession,
  onOpenTab,
  onOpenUrl,
  onNewSession,
}: ExploreHomeProps) {
  const { t } = useTranslation()
  const { onSendMessage } = useAppShellContext()
  const projects = useAtomValue(projectsAtom)
  const [input, setInput] = useState('')
  const [intentOverride, setIntentOverride] = useState<BrowserNewTabIntent | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [settings, setSettings] = useState(DEFAULT_EXPLORE_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [privacy, setPrivacy] = useState<PrivacyPolicyDto | null>(null)
  const [guidance, setGuidance] = useState<CognitionGuidanceDto[]>([])
  const [loops, setLoops] = useState<CognitionLoopDto[]>([])
  const [snoozedKeys, setSnoozedKeys] = useState<string[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'partial' | 'error'; message: string } | null>(null)
  const [evidenceItem, setEvidenceItem] = useState<PendingItem | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let active = true
    void getExploreSettings().then(async (value) => {
      if (!active) return
      setSettings(value)
      setSettingsLoaded(true)
      if (workspaceId) await applyExplorePrivacyMigration(workspaceId, value)
    })
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<ExploreSettings>).detail
      if (detail) setSettings(detail)
    }
    window.addEventListener('craft:explore-settings-changed', onChanged)
    return () => {
      active = false
      window.removeEventListener('craft:explore-settings-changed', onChanged)
    }
  }, [workspaceId])

  const allowCognitionDerived = Boolean(
    privacy
    && privacy.contextAwarenessEnabled
    && privacy.today.useContext
    && !privacy.effectivePrivacyModeActive
    && !privacy.privacyMode?.active,
  )

  const refreshTodayInputs = useCallback(async () => {
    if (!workspaceId || !settings.showTodaySection) return
    try {
      const [policy, state] = await Promise.all([
        window.electronAPI.getPrivacyPolicy({ workspaceId }),
        window.electronAPI.getTodayState({ workspaceId }),
      ])
      setPrivacy(policy)
      setSnoozedKeys(state.snoozes.map((item) => item.targetKey))

      const canUseContext = Boolean(
        policy.contextAwarenessEnabled
        && policy.today.useContext
        && !policy.effectivePrivacyModeActive
        && !policy.privacyMode?.active,
      )

      if (!canUseContext) {
        setGuidance([])
        setLoops([])
        return
      }

      if (settings.cognitionGuidanceAutoRefresh) {
        await window.electronAPI.refreshCognitionGuidance({ workspaceId }).catch(() => {})
      }

      const [guidanceItems, loopItems] = await Promise.all([
        window.electronAPI.listCognitionGuidance({
          workspaceId,
          includeDismissed: false,
          limit: 40,
          forToday: true,
        }),
        window.electronAPI.listCognitionLoops({
          workspaceId,
          includeResolved: false,
          limit: 40,
        }),
      ])
      setGuidance(guidanceItems)
      setLoops(loopItems.filter((loop) =>
        loop.status === 'open' || loop.status === 'waiting' || loop.status === 'blocked' || loop.status === 'stale',
      ))
    } catch (error) {
      console.warn('[ExploreHome] Failed to load Today inputs', error)
    }
  }, [settings.cognitionGuidanceAutoRefresh, settings.showTodaySection, workspaceId])

  useEffect(() => {
    if (!settingsLoaded || !settings.showTodaySection) return
    void refreshTodayInputs()
  }, [refreshTodayInputs, settings.showTodaySection, settingsLoaded, tick, taskSessions])

  // Re-evaluate snooze expiry periodically without cognition refresh resurrecting snoozed cards.
  useEffect(() => {
    if (!settings.showTodaySection) return
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [settings.showTodaySection])

  const pendingItems = useMemo(() => {
    if (!settings.showTodaySection) return []
    return buildPendingQueue({
      sessions: taskSessions,
      guidance,
      loops,
      allowCognitionDerived,
      snoozedKeys,
      now: Date.now(),
      limit: 40,
    })
  }, [allowCognitionDerived, guidance, loops, settings.showTodaySection, snoozedKeys, taskSessions, tick])

  const recentSessionItems = useMemo(
    () => (settings.showTodaySection ? buildRecentRailSessions(recentSessions, { limit: 8 }) : []),
    [recentSessions, settings.showTodaySection],
  )
  const recentTabItems = useMemo(
    () => (settings.showTodaySection ? buildRecentRailTabs(recentTabs, { limit: 8 }) : []),
    [recentTabs, settings.showTodaySection],
  )

  // Last-active project pointer → light Continue entry (no auto-navigation).
  const lastActiveProject = useMemo(
    () => (settings.showTodaySection ? resolveLastActiveProject(workspaceId, projects) : null),
    [projects, settings.showTodaySection, workspaceId, tick],
  )
  const lastActiveResumeSession = useMemo(
    () => (lastActiveProject
      ? findProjectResumeSession(taskSessions, lastActiveProject.config.id)
      : null),
    [lastActiveProject, taskSessions],
  )

  const handleOpenLastProject = useCallback(() => {
    if (!lastActiveProject) return
    setLastActiveProjectId(workspaceId, lastActiveProject.config.id)
    navigate(routes.view.projects(lastActiveProject.config.slug))
  }, [lastActiveProject, workspaceId])

  const handleContinueLastProject = useCallback(() => {
    if (!lastActiveProject || !lastActiveResumeSession) return
    setLastActiveProjectId(workspaceId, lastActiveProject.config.id)
    const prompt = buildContinueTaskPrompt(lastActiveResumeSession, t)
    navigate(routes.view.allSessions(lastActiveResumeSession.id))
    onSendMessage(lastActiveResumeSession.id, prompt)
  }, [lastActiveProject, lastActiveResumeSession, onSendMessage, t, workspaceId])

  const decision = useMemo(() => classifyBrowserNewTabIntent(input), [input])
  const selectedIntent = intentOverride ?? decision.intent
  const selectedIntentLabel = selectedIntent === 'navigate'
    ? t('browser.navigateMode')
    : selectedIntent === 'search'
      ? t('browser.searchMode')
      : t('browser.askAiMode')

  const submit = () => {
    const query = input.trim()
    if (!query) return
    if (selectedIntent === 'navigate') {
      onOpenUrl(resolveBrowserAddress(query))
      return
    }
    if (selectedIntent === 'search') {
      onOpenUrl(buildBrowserSearchUrl(query))
      return
    }
    onNewSession(query)
  }

  const handleContinue = (item: PendingItem) => {
    if (!item.sessionId) return
    // Reuse existing session open — restores workspace/checkpoint via current navigation path.
    onOpenSession(item.sessionId)
  }

  const handleCompleteAndArchive = async (item: PendingItem) => {
    if (!item.sessionId || !workspaceId) return
    setBusyId(item.id)
    setFeedback(null)
    try {
      const result = await window.electronAPI.completeAndArchiveSession({
        workspaceId,
        sessionId: item.sessionId,
        idempotencyKey: `caa:${item.sessionId}:${item.id}`,
      })
      setFeedback(formatCompleteAndArchiveFeedback(result, t))
      await refreshTodayInputs()
    } catch (error) {
      console.warn('[ExploreHome] completeAndArchive failed', error)
      setFeedback({
        tone: 'error',
        message: t('today.pending.completeFailed', { step: 'rpc', detail: error instanceof Error ? error.message : String(error) }),
      })
    } finally {
      setBusyId(null)
    }
  }

  const handleSnooze = async (item: PendingItem, preset: SnoozePreset) => {
    if (!workspaceId) return
    const targetKey = pendingSnoozeKey(item)
    setBusyId(item.id)
    try {
      const state = await window.electronAPI.snoozeTodayItem({
        workspaceId,
        targetKey,
        until: snoozeUntil(preset),
      })
      setSnoozedKeys(state.snoozes.map((entry) => entry.targetKey))
      setFeedback({
        tone: 'ok',
        message: preset === 'indefinite'
          ? t('today.pending.snoozedIndefiniteToast')
          : t('today.pending.snoozedToast'),
      })
    } catch (error) {
      console.warn('[ExploreHome] snooze failed', error)
      setFeedback({
        tone: 'error',
        message: t('today.pending.snoozeFailed'),
      })
    } finally {
      setBusyId(null)
    }
  }

  const showComposer = settings.showSessionComposer
  const showToday = settings.showTodaySection
  const bothOff = !showComposer && !showToday

  return (
    <main className="h-full w-full overflow-y-auto bg-foreground/[0.012]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-9 px-6 pb-16 pt-12 md:px-10 md:pt-16">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('explore.homeTitle')}</p>
            {(showComposer || showToday) && (
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {showComposer ? t('explore.promptTitle') : t('today.pending.title')}
              </h1>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate(routes.view.settings('explore'))}
            aria-label={t('settings.explore.title')}
            title={t('settings.explore.title')}
            className="flex size-7 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {showComposer && (
          <section aria-labelledby="explore-heading" className="flex flex-col gap-4">
            <h2 id="explore-heading" className="sr-only">{t('explore.promptTitle')}</h2>
            <form
              onSubmit={(event) => { event.preventDefault(); submit() }}
              className="group flex min-h-14 items-center gap-3 rounded-card border border-border/70 bg-background px-4 shadow-minimal transition-[border-color,box-shadow] focus-within:border-foreground/20 focus-within:shadow-middle"
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${t('browser.intentMode')}: ${selectedIntentLabel}`}
                    title={selectedIntentLabel}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 data-[state=open]:bg-foreground/[0.05] data-[state=open]:text-foreground"
                  >
                    {selectedIntent === 'navigate' && <Globe2 className="h-4 w-4" />}
                    {selectedIntent === 'search' && <Search className="h-4 w-4" />}
                    {selectedIntent === 'ask-ai' && <Sparkles className="h-4 w-4" />}
                  </button>
                </DropdownMenuTrigger>
                <StyledDropdownMenuContent align="start" sideOffset={8} minWidth="min-w-40">
                  {([
                    ['navigate', t('browser.navigateMode'), Globe2],
                    ['search', t('browser.searchMode'), Search],
                    ['ask-ai', t('browser.askAiMode'), Sparkles],
                  ] as const).map(([intent, label, Icon]) => (
                    <StyledDropdownMenuItem
                      key={intent}
                      onClick={() => setIntentOverride(intent)}
                      className="gap-2.5"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{label}</span>
                      {selectedIntent === intent && <Check className="h-3.5 w-3.5" />}
                    </StyledDropdownMenuItem>
                  ))}
                </StyledDropdownMenuContent>
              </DropdownMenu>
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={t('explore.inputPlaceholder')}
                className="min-w-0 flex-1 bg-transparent py-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/65"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label={t('explore.submit')}
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full transition-[background-color,color,opacity,transform,box-shadow] active:scale-95',
                  input.trim()
                    ? 'bg-accent text-white shadow-tinted hover:bg-accent/90'
                    : 'bg-foreground/[0.04] text-muted-foreground/30 shadow-none',
                )}
                style={input.trim() ? { '--shadow-color': 'var(--accent-rgb)' } as CSSProperties : undefined}
              >
                <ArrowUp className="h-[17px] w-[17px]" strokeWidth={2.25} />
              </button>
            </form>
          </section>
        )}

        {feedback && (
          <div
            role="status"
            className={cn(
              'rounded-[10px] border px-4 py-3 text-xs',
              feedback.tone === 'ok' && 'border-border/55 bg-background text-foreground',
              feedback.tone === 'partial' && 'border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200',
              feedback.tone === 'error' && 'border-destructive/30 bg-destructive/5 text-destructive',
            )}
          >
            {feedback.message}
          </div>
        )}

        {showToday && (
          <div className="flex flex-col gap-8">
            {lastActiveProject && (
              <ContinueProjectCard
                project={lastActiveProject}
                resumeSession={lastActiveResumeSession}
                onOpenProject={handleOpenLastProject}
                onContinue={lastActiveResumeSession ? handleContinueLastProject : undefined}
                continueDisabled={Boolean(lastActiveResumeSession?.isProcessing)}
              />
            )}
            <PendingQueueSection
              items={pendingItems}
              busyId={busyId}
              onContinue={handleContinue}
              onCompleteAndArchive={(item) => { void handleCompleteAndArchive(item) }}
              onSnooze={(item, preset) => { void handleSnooze(item, preset) }}
              onShowEvidence={setEvidenceItem}
            />
            {evidenceItem && (
              <PendingEvidencePanel item={evidenceItem} onClose={() => setEvidenceItem(null)} />
            )}
            <RecentRailSection
              sessions={recentSessionItems}
              tabs={recentTabItems}
              onOpenSession={onOpenSession}
              onOpenTab={onOpenTab}
            />
          </div>
        )}

        {bothOff && (
          <div className="rounded-[12px] border border-border/55 bg-background px-5 py-10 shadow-minimal">
            <p className="text-sm font-medium text-foreground">{t('explore.homeMinimalTitle')}</p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
              {t('explore.homeMinimalDescription')}
            </p>
            <button
              type="button"
              onClick={() => navigate(routes.view.settings('explore'))}
              className="mt-4 rounded-control bg-foreground/[0.05] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.08]"
            >
              {t('settings.explore.title')}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
