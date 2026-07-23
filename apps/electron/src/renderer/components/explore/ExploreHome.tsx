import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowUp, Check, ChevronRight, Globe2, RefreshCw, Search, Settings2, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ExploreBriefRecommendation, ExploreBriefResult } from '@craft-agent/shared/protocol'
import { cn } from '@/lib/utils'
import { getSessionTitle } from '@/utils/session'
import { classifyBrowserNewTabIntent, type BrowserNewTabIntent } from '../browser/new-tab-intent'
import { buildBrowserSearchUrl, resolveBrowserAddress } from '../browser/utils'
import { DEFAULT_EXPLORE_SETTINGS, getExploreSettings, type ExploreSettings } from '@/lib/explore-settings'
import { getOrGenerateExploreBrief } from '@/lib/explore-brief'
import { navigate, routes } from '@/lib/navigate'
import type { SessionMeta } from '@/atoms/sessions'
import type { BrowserWorkspaceTab } from '@/atoms/browser-workspace'
import { TodaySection } from './TodaySection'
import { GuidanceSection } from './GuidanceSection'
import { buildTodayTasks } from './task-today'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'

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

type BriefState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; brief: ExploreBriefResult }
  | { status: 'error'; message: string }

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
  const { t, i18n } = useTranslation()
  const [input, setInput] = useState('')
  const [intentOverride, setIntentOverride] = useState<BrowserNewTabIntent | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [settings, setSettings] = useState(DEFAULT_EXPLORE_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [briefState, setBriefState] = useState<BriefState>({ status: 'idle' })

  useEffect(() => {
    let active = true
    void getExploreSettings().then((value) => {
      if (!active) return
      setSettings(value)
      setSettingsLoaded(true)
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
  }, [])

  const request = useMemo(() => ({
    workspaceId,
    locale: i18n.resolvedLanguage ?? i18n.language ?? 'en',
    recommendationCount: settings.aiCount,
    sessions: recentSessions.map((session) => ({
      id: session.id,
      title: getSessionTitle(session),
      preview: session.preview,
      lastMessageAt: session.lastMessageAt,
      isProcessing: session.isProcessing,
      hasUnread: session.hasUnread,
      taskGoal: session.taskGoal,
      taskPriority: session.taskPriority,
      taskDueAt: session.taskDueAt,
      taskReminderAt: session.taskReminderAt,
      latestCheckpoint: session.taskCheckpoints?.at(-1)?.summary,
      nextSteps: session.taskCheckpoints?.at(-1)?.nextSteps,
    })),
    tabs: recentTabs
      .filter((tab) => tab.url !== 'about:blank')
      .map((tab) => ({ id: tab.id, title: tab.title, url: tab.url })),
  }), [i18n.language, i18n.resolvedLanguage, recentSessions, recentTabs, settings.aiCount, workspaceId])

  const generateBrief = useCallback(async (force = false) => {
    if (!settings.aiStatusEnabled || (!request.sessions.length && !request.tabs.length)) {
      setBriefState({ status: 'idle' })
      return
    }
    setBriefState({ status: 'loading' })
    try {
      const brief = await getOrGenerateExploreBrief(request, settings.aiFrequency, force)
      setBriefState({ status: 'ready', brief })
    } catch (error) {
      console.warn('[ExploreHome] Failed to generate work overview', error)
      setBriefState({
        status: 'error',
        message: t('explore.analysisError'),
      })
    }
  }, [request, settings.aiFrequency, settings.aiStatusEnabled, t])

  useEffect(() => {
    if (!settingsLoaded) return
    let stale = false
    if (!settings.aiStatusEnabled || (!request.sessions.length && !request.tabs.length)) {
      setBriefState({ status: 'idle' })
      return
    }
    setBriefState({ status: 'loading' })
    void getOrGenerateExploreBrief(request, settings.aiFrequency).then(
      (brief) => { if (!stale) setBriefState({ status: 'ready', brief }) },
      (error: unknown) => {
        console.warn('[ExploreHome] Failed to generate work overview', error)
        if (!stale) setBriefState({
          status: 'error',
          message: t('explore.analysisError'),
        })
      },
    )
    return () => { stale = true }
  }, [request, settings.aiFrequency, settings.aiStatusEnabled, settingsLoaded, t])

  const decision = useMemo(() => classifyBrowserNewTabIntent(input), [input])
  const selectedIntent = intentOverride ?? decision.intent
  const selectedIntentLabel = selectedIntent === 'navigate'
    ? t('browser.navigateMode')
    : selectedIntent === 'search'
      ? t('browser.searchMode')
      : t('browser.askAiMode')

  const fallbackRecommendations = useMemo<ExploreBriefRecommendation[]>(() => [
    ...recentSessions.map((session) => ({
      kind: 'session' as const,
      targetId: session.id,
      title: getSessionTitle(session),
      description: session.preview || t('explore.resumeSession'),
    })),
    ...recentTabs
      .filter((tab) => tab.url !== 'about:blank')
      .map((tab) => ({
        kind: 'tab' as const,
        targetId: tab.id,
        title: tab.title.trim() || tab.url,
        description: tab.url,
      })),
  ].slice(0, settings.aiCount), [recentSessions, recentTabs, settings.aiCount, t])

  const recommendations = briefState.status === 'ready'
    ? briefState.brief.recommendations
    : fallbackRecommendations
  const todayTaskItems = useMemo(
    () => (settings.proactiveSuggestionsEnabled ? buildTodayTasks(taskSessions).slice(0, 6) : []),
    [settings.proactiveSuggestionsEnabled, taskSessions],
  )
  const todaySessionIds = useMemo(
    () => new Set(todayTaskItems.map((item) => item.session.id)),
    [todayTaskItems],
  )
  const activeSessionIds = useMemo(() => taskSessions.map((s) => s.id), [taskSessions])
  const visibleRecommendations = useMemo(() => recommendations.filter((item) => (
    item.kind !== 'session' || !item.targetId || !todaySessionIds.has(item.targetId)
  )), [recommendations, todaySessionIds])

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

  const openRecommendation = (item: ExploreBriefRecommendation) => {
    if (item.kind === 'session' && item.targetId) onOpenSession(item.targetId)
    else if (item.kind === 'tab' && item.targetId) onOpenTab(item.targetId)
    else if (item.kind === 'prompt' && item.prompt) onNewSession(item.prompt)
  }

  const hasActivity = request.sessions.length > 0 || request.tabs.length > 0
  const generatedLabel = briefState.status === 'ready'
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { hour: '2-digit', minute: '2-digit' })
      .format(briefState.brief.generatedAt)
    : null

  return (
    <main className="h-full w-full overflow-y-auto bg-foreground/[0.012]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-9 px-6 pb-16 pt-12 md:px-10 md:pt-16">
        <section aria-labelledby="explore-heading" className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('explore.homeTitle')}</p>
            <h1 id="explore-heading" className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {t('explore.promptTitle')}
            </h1>
          </div>
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

        {(settings.proactiveSuggestionsEnabled || settings.cognitionGuidanceEnabled) && (
          <section aria-labelledby="continue-work-heading" className="flex flex-col gap-4">
            <div className="px-0.5">
              <h2 id="continue-work-heading" className="text-sm font-medium text-foreground">
                {t('today.continueWork', { defaultValue: '继续工作' })}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('today.continueWorkDesc', { defaultValue: '任务队列与可解释的下一步建议' })}
              </p>
            </div>
            {settings.proactiveSuggestionsEnabled && (
              <TodaySection sessions={taskSessions} onOpenSession={onOpenSession} />
            )}
            {settings.cognitionGuidanceEnabled && workspaceId && (
              <GuidanceSection
                workspaceId={workspaceId}
                activeSessionIds={activeSessionIds}
                scope={settings.cognitionGuidanceScope}
                autoRefresh={settings.cognitionGuidanceAutoRefresh}
                limit={5}
                onOpenSession={onOpenSession}
              />
            )}
          </section>
        )}

        <section aria-labelledby="brief-heading" className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="brief-heading" className="px-0.5 text-sm font-medium text-foreground">{t('explore.workBrief')}</h2>
            <div className="flex items-center gap-1">
              {settings.aiStatusEnabled && hasActivity && (
                <button
                  type="button"
                  onClick={() => { void generateBrief(true) }}
                  disabled={briefState.status === 'loading'}
                  aria-label={t('explore.refreshAnalysis')}
                  title={t('explore.refreshAnalysis')}
                  className="flex size-7 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', briefState.status === 'loading' && 'animate-spin')} />
                </button>
              )}
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
          </div>

          <div className="overflow-hidden rounded-[12px] border border-border/55 bg-background shadow-minimal">
            {briefState.status === 'loading' ? (
              <BriefLoading />
            ) : briefState.status === 'ready' ? (
              <div className="p-5 md:p-6">
                <div className="max-w-2xl">
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">{briefState.brief.headline}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{briefState.brief.summary}</p>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/70">
                  <span>{t('explore.usingDefaultModel')}</span>
                  {briefState.brief.model && <span className="font-mono">{briefState.brief.model}</span>}
                  {generatedLabel && <><span aria-hidden="true">·</span><span>{generatedLabel}</span></>}
                </div>
              </div>
            ) : briefState.status === 'error' ? (
              <div className="flex min-h-44 flex-col items-start justify-center p-6">
                <p className="text-sm font-medium text-foreground">{t('explore.analysisUnavailable')}</p>
                <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{briefState.message}</p>
                <button type="button" onClick={() => { void generateBrief(true) }} className="mt-4 rounded-control bg-foreground/[0.05] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.08]">
                  {t('explore.tryAgain')}
                </button>
              </div>
            ) : (
              <div className="flex min-h-44 flex-col items-start justify-center p-6">
                <p className="text-sm font-medium text-foreground">
                  {settings.aiStatusEnabled ? t('explore.noActivityTitle') : t('explore.analysisDisabled')}
                </p>
                <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                  {settings.aiStatusEnabled ? t('explore.noActivityDescription') : t('explore.analysisDisabledDescription')}
                </p>
              </div>
            )}
          </div>
        </section>

        {(briefState.status === 'loading' || visibleRecommendations.length > 0) && (
          <section aria-labelledby="next-steps-heading" className="flex flex-col gap-2.5">
            <h2 id="next-steps-heading" className="px-0.5 text-sm font-medium text-foreground">
              {t('explore.nextSteps')}
            </h2>
            {briefState.status === 'loading' ? (
              <RecommendationLoading count={settings.aiCount} />
            ) : (
              <div className="overflow-hidden rounded-[12px] border border-border/55 bg-background shadow-minimal">
                {visibleRecommendations.slice(0, settings.aiCount).map((item, index) => (
                  <button
                    key={`${item.kind}:${item.targetId ?? item.prompt ?? item.title}:${index}`}
                    type="button"
                    onClick={() => openRecommendation(item)}
                    className="group flex min-h-[64px] w-full items-center gap-3 border-t border-border/45 px-4 py-3 text-left transition-colors first:border-t-0 hover:bg-foreground/[0.025] focus-visible:bg-foreground/[0.025] focus-visible:outline-none md:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.description}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/25 opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}

function BriefLoading() {
  return (
    <div className="animate-pulse p-5 md:p-6">
      <div className="h-5 w-48 rounded-control bg-foreground/[0.07]" />
      <div className="mt-3 h-3 w-full max-w-xl rounded-control bg-foreground/[0.045]" />
      <div className="mt-2 h-3 w-4/5 max-w-lg rounded-control bg-foreground/[0.045]" />
      <div className="mt-5 h-3 w-28 rounded-control bg-foreground/[0.035]" />
    </div>
  )
}

function RecommendationLoading({ count }: { count: number }) {
  return (
    <div className="animate-pulse overflow-hidden rounded-[12px] border border-border/55 bg-background shadow-minimal">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex min-h-[64px] items-center border-t border-border/45 px-5 py-3 first:border-t-0">
          <div className="flex-1">
            <div className="h-3 w-2/5 rounded-control bg-foreground/[0.06]" />
            <div className="mt-2 h-2.5 w-3/5 rounded-control bg-foreground/[0.035]" />
          </div>
        </div>
      ))}
    </div>
  )
}
