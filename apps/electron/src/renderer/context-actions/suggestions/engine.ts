/**
 * Context Suggestion Engine (v0.16.5 + v0.16.6 fusion input).
 *
 * Rule-driven only — maps ContextFusionSnapshot signals to existing
 * ContextAction ids. Never scans message history; never auto-executes.
 */

import type { LoadedProject } from '@craft-agent/shared/projects/types'
import type { SessionMeta } from '@/atoms/sessions'
import type { ContextFusionSnapshot } from '@/context-fusion/types'
import { hasResumeData, isSessionCompleted } from '@/lib/project-resume'
import { buildActionContext } from '../build-action-context'
import { contextActionRegistry } from '../registry'
import type { ActionContext, ContextActionSuggestion } from '../types'

/** Default "long session" threshold for library.createFromSession. */
export const LONG_SESSION_MESSAGE_COUNT = 6

const ACTION_PRIORITY: Record<string, number> = {
  'session.continue': 100,
  'library.createFromSession': 80,
}

const CONTINUE_GUIDANCE_TYPES = new Set(['continue', 'resume', 'resolve_blocker'])
const UNRESOLVED_LOOP_STATUSES = new Set(['blocked', 'waiting'])

/** Confidence bump when session is bound to a named project with resume data. */
export const PROJECT_CONTINUE_CONFIDENCE_BOOST = 0.08
/** Confidence bump when project has related browser tabs + work context. */
export const BROWSER_CONTINUE_CONFIDENCE_BOOST = 0.05
/** Confidence bump when git working tree has dirty files (v0.16.7). */
export const GIT_DIRTY_CONTINUE_CONFIDENCE_BOOST = 0.06
/** Confidence bump when branch is ahead and/or behind upstream (v0.16.7). */
export const GIT_DIVERGENCE_CONTINUE_CONFIDENCE_BOOST = 0.04
/** Confidence bump when a git repo + branch is present (existence signal) (v0.16.7). */
export const GIT_REPO_CONTINUE_CONFIDENCE_BOOST = 0.03
const CONTINUE_CONFIDENCE_CAP = 0.98

/** @deprecated Use FusionGuidanceSignal via ContextFusionSnapshot. */
export interface SuggestionGuidanceSignal {
  type: string
  targetSessionId?: string
  score?: number
  confidence?: number
  title?: string
  reason?: string
}

/** @deprecated Use FusionLoopSignal via ContextFusionSnapshot. */
export interface SuggestionLoopSignal {
  sessionId?: string
  status?: string
  nextAction?: string
  blocker?: string
  waitingFor?: string
}

/**
 * Legacy parts input — kept so ContextSuggestionBadge can call resolve without
 * UI changes in v0.16.6 phase 1. Prefer ContextFusionSnapshot.
 */
export interface BuildContextActionSuggestionsInput {
  context: ActionContext
  session?: SessionMeta | null
  guidance?: readonly SuggestionGuidanceSignal[] | null
  loops?: readonly SuggestionLoopSignal[] | null
  hasLibraryDocument?: boolean
  longSessionMessageCount?: number
}

export interface SuggestionFromFusionOptions {
  hasLibraryDocument?: boolean
  longSessionMessageCount?: number
  documentId?: string | null
  sessions?: Iterable<SessionMeta> | Map<string, SessionMeta> | null
  projects?: readonly LoadedProject[] | null
}

function upsertSuggestion(
  byId: Map<string, ContextActionSuggestion>,
  suggestion: ContextActionSuggestion,
): void {
  const existing = byId.get(suggestion.actionId)
  if (!existing || (suggestion.confidence ?? 0) > (existing.confidence ?? 0)) {
    byId.set(suggestion.actionId, suggestion)
  }
}

function sessionSupportsContinue(session: SessionMeta | null | undefined): boolean {
  if (!session || isSessionCompleted(session)) return false
  if (!hasResumeData(session)) return false
  const latest = session.taskCheckpoints?.at(-1)
  if (latest?.nextSteps?.length || latest?.blockers?.length) return true
  if (session.taskGoal?.trim()) return true
  return (session.taskCheckpoints?.length ?? 0) > 0
}

/** Session belongs to a named project and has goal/checkpoint continuity. */
export function hasProjectContinueBoost(snapshot: ContextFusionSnapshot): boolean {
  const session = snapshot.session
  const project = snapshot.project
  if (!session || !project) return false
  if (!project.name?.trim()) return false
  if (session.projectId !== project.id) return false
  return hasResumeData(session)
}

/**
 * Lightweight "research / development context" heuristic — no LLM.
 * Resume data or goal/name/preview keywords count as active work context.
 */
export function sessionHasResearchOrDevContext(session: SessionMeta | null | undefined): boolean {
  if (!session || isSessionCompleted(session)) return false
  if (hasResumeData(session)) return true
  const text = `${session.taskGoal ?? ''} ${session.name ?? ''} ${session.preview ?? ''}`
  return /research|调研|研究|开发|implement|debug|design|设计|build|fix|refactor|分析/i.test(text)
}

/** Related project browser tabs + work context → ranking signal only (no new action). */
export function hasBrowserContinueBoost(snapshot: ContextFusionSnapshot): boolean {
  if (snapshot.browser.relatedTabCount <= 0 && !snapshot.browser.hasVisibleRelated) {
    return false
  }
  return sessionHasResearchOrDevContext(snapshot.session)
}

/** Dirty working tree → boost continue-related suggestions (no new action). */
export function hasGitDirtyContinueBoost(snapshot: ContextFusionSnapshot): boolean {
  const git = snapshot.git
  return Boolean(git?.isRepository && git.dirtyCount > 0)
}

/** Ahead/behind upstream → development-state ranking signal. */
export function hasGitDivergenceContinueBoost(snapshot: ContextFusionSnapshot): boolean {
  const git = snapshot.git
  if (!git?.isRepository) return false
  return git.ahead > 0 || git.behind > 0
}

/** Branch present on a real repo → repository-existence ranking signal. */
export function hasGitRepoContinueBoost(snapshot: ContextFusionSnapshot): boolean {
  const git = snapshot.git
  return Boolean(git?.isRepository && git.branch?.trim())
}

function applyContinueRankingBoosts(
  snapshot: ContextFusionSnapshot,
  baseConfidence: number,
): number {
  let confidence = baseConfidence
  if (hasProjectContinueBoost(snapshot)) {
    confidence += PROJECT_CONTINUE_CONFIDENCE_BOOST
  }
  if (hasBrowserContinueBoost(snapshot)) {
    confidence += BROWSER_CONTINUE_CONFIDENCE_BOOST
  }
  if (hasGitDirtyContinueBoost(snapshot)) {
    confidence += GIT_DIRTY_CONTINUE_CONFIDENCE_BOOST
  }
  if (hasGitDivergenceContinueBoost(snapshot)) {
    confidence += GIT_DIVERGENCE_CONTINUE_CONFIDENCE_BOOST
  }
  if (hasGitRepoContinueBoost(snapshot)) {
    confidence += GIT_REPO_CONTINUE_CONFIDENCE_BOOST
  }
  return Math.min(CONTINUE_CONFIDENCE_CAP, confidence)
}

/** Build ActionContext from a fusion snapshot (+ optional runtime extras). */
export function actionContextFromFusion(
  snapshot: ContextFusionSnapshot,
  options: SuggestionFromFusionOptions = {},
): ActionContext {
  return buildActionContext({
    workspaceId: snapshot.workspaceId,
    sessionId: snapshot.sessionId,
    session: snapshot.session,
    projectId: snapshot.project?.id,
    documentId: options.documentId,
    sessions: options.sessions,
    projects: options.projects,
    privacy: snapshot.privacy.policy,
  })
}

/**
 * Convert legacy Badge/parts input into a minimal ContextFusionSnapshot.
 * Browser/project slices are empty — full fusion goes through context-provider.
 */
export function snapshotFromSuggestionParts(
  input: BuildContextActionSuggestionsInput,
): ContextFusionSnapshot {
  const allow = input.context.flags.allowCognitionDerived
  return {
    workspaceId: input.context.workspaceId,
    sessionId: input.context.sessionId ?? '',
    session: input.session ?? null,
    project: input.context.projectId
      ? { id: input.context.projectId, name: input.context.projectId }
      : null,
    browser: {
      relatedTabs: [],
      relatedTabCount: 0,
      hasVisibleRelated: false,
    },
    cognition: {
      allowCognitionDerived: allow,
      guidance: allow ? [...(input.guidance ?? [])] : [],
      loops: allow ? [...(input.loops ?? [])] : [],
    },
    privacy: {
      contextAwarenessEnabled: allow,
      todayUseContext: allow,
      privacyModeActive: !allow,
      allowCognitionDerived: allow,
      policy: allow
        ? {
            contextAwarenessEnabled: true,
            today: { useContext: true },
            privacyMode: { active: false },
            effectivePrivacyModeActive: false,
          }
        : null,
    },
    git: null,
  }
}

/**
 * Build ranked suggestions from a ContextFusionSnapshot.
 * Cognition items require snapshot.cognition.allowCognitionDerived (adapter-gated).
 * Project / browser / git fusion signals boost ranking only — they do not add actions.
 */
export function buildContextActionSuggestions(
  snapshot: ContextFusionSnapshot,
  options: SuggestionFromFusionOptions = {},
): ContextActionSuggestion[] {
  const byId = new Map<string, ContextActionSuggestion>()
  const session = snapshot.session
  const sessionId = snapshot.sessionId
  const longThreshold = options.longSessionMessageCount ?? LONG_SESSION_MESSAGE_COUNT
  const allowCognition = snapshot.cognition.allowCognitionDerived
    && snapshot.privacy.allowCognitionDerived

  // Rule 1 — session continuity → session.continue
  if (sessionSupportsContinue(session)) {
    upsertSuggestion(byId, {
      actionId: 'session.continue',
      reason: 'contextSuggestions.reason.continue',
      confidence: 0.85,
    })
  }

  // Rule 3 — Guidance continue/resume/resolve_blocker → session.continue
  if (allowCognition && snapshot.cognition.guidance.length) {
    for (const item of snapshot.cognition.guidance) {
      if (!CONTINUE_GUIDANCE_TYPES.has(item.type)) continue
      if (sessionId && item.targetSessionId && item.targetSessionId !== sessionId) continue
      const confidence = Math.min(
        0.95,
        Math.max(0.5, (item.confidence ?? 0.7) + (typeof item.score === 'number' ? item.score / 2000 : 0)),
      )
      upsertSuggestion(byId, {
        actionId: 'session.continue',
        reason: item.reason || item.title || 'contextSuggestions.reason.continueGuidance',
        confidence,
      })
    }
  }

  // Fusion rule — Loop blocked/waiting → session.continue
  if (allowCognition && snapshot.cognition.loops.length) {
    for (const loop of snapshot.cognition.loops) {
      if (sessionId && loop.sessionId && loop.sessionId !== sessionId) continue
      const status = (loop.status ?? '').trim().toLowerCase()
      if (!UNRESOLVED_LOOP_STATUSES.has(status)) continue
      upsertSuggestion(byId, {
        actionId: 'session.continue',
        reason: 'contextSuggestions.reason.unresolvedWork',
        confidence: 0.88,
      })
    }
  }

  // Rule 2 — long session without Library document → library.createFromSession
  const messageCount = session?.messageCount ?? 0
  if (
    session
    && sessionId
    && !options.hasLibraryDocument
    && messageCount >= longThreshold
  ) {
    upsertSuggestion(byId, {
      actionId: 'library.createFromSession',
      reason: 'contextSuggestions.reason.library',
      confidence: 0.7,
    })
  }

  // Fusion ranking — project + browser boost continue confidence (no new actions).
  const continueSuggestion = byId.get('session.continue')
  if (continueSuggestion) {
    continueSuggestion.confidence = applyContinueRankingBoosts(
      snapshot,
      continueSuggestion.confidence ?? 0.85,
    )
  }

  return Array.from(byId.values()).sort((a, b) => {
    const pa = ACTION_PRIORITY[a.actionId] ?? 0
    const pb = ACTION_PRIORITY[b.actionId] ?? 0
    if (pb !== pa) return pb - pa
    return (b.confidence ?? 0) - (a.confidence ?? 0)
  })
}

/** Drop suggestions whose action is missing or currently unavailable. */
export function filterAvailableSuggestions(
  suggestions: readonly ContextActionSuggestion[],
  context: ActionContext,
  registry: Pick<typeof contextActionRegistry, 'get'> = contextActionRegistry,
): ContextActionSuggestion[] {
  return suggestions.filter((suggestion) => {
    const action = registry.get(suggestion.actionId)
    if (!action) return false
    return action.isAvailable(context)
  })
}

/** Primary entry: fusion snapshot → available suggestions. */
export function resolveSuggestionsFromFusion(
  snapshot: ContextFusionSnapshot,
  options: SuggestionFromFusionOptions = {},
  registry: Pick<typeof contextActionRegistry, 'get'> = contextActionRegistry,
): ContextActionSuggestion[] {
  const context = actionContextFromFusion(snapshot, options)
  return filterAvailableSuggestions(
    buildContextActionSuggestions(snapshot, options),
    context,
    registry,
  )
}

/**
 * Legacy entry used by ContextSuggestionBadge (no UI change in phase 1).
 * Converts parts → minimal snapshot, then runs the fusion engine path.
 */
export function resolveContextActionSuggestions(
  input: BuildContextActionSuggestionsInput,
  registry: Pick<typeof contextActionRegistry, 'get'> = contextActionRegistry,
): ContextActionSuggestion[] {
  const snapshot = snapshotFromSuggestionParts(input)
  return filterAvailableSuggestions(
    buildContextActionSuggestions(snapshot, {
      hasLibraryDocument: input.hasLibraryDocument,
      longSessionMessageCount: input.longSessionMessageCount,
    }),
    input.context,
    registry,
  )
}
