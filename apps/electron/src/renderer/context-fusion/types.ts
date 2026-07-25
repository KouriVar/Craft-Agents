/**
 * Context Fusion types (v0.16.6 + v0.16.7 git slice).
 *
 * Runtime-only ephemeral snapshot — never persisted, never a protocol DTO,
 * never written to storage / DB.
 */

import type { SessionMeta } from '@/atoms/sessions'
import type { PrivacyPolicySnapshot } from '@/context-actions/types'

/** Lightweight project slice for suggestion / fusion consumers. */
export interface FusionProjectSlice {
  id: string
  name: string
  slug?: string
  workingDirectory?: string
}

/** Browser tabs attributed to the resolved project (via session ownership). */
export interface FusionBrowserTabSlice {
  id: string
  title: string
  url: string
  hostname?: string
}

export interface FusionBrowserSlice {
  /** Tabs related to the resolved project (empty when no project). */
  relatedTabs: FusionBrowserTabSlice[]
  relatedTabCount: number
  hasVisibleRelated: boolean
}

/** Cognition signals already privacy-gated by the cognition adapter. */
export interface FusionGuidanceSignal {
  type: string
  targetSessionId?: string
  score?: number
  confidence?: number
  title?: string
  reason?: string
}

export interface FusionLoopSignal {
  sessionId?: string
  status?: string
  nextAction?: string
  blocker?: string
  waitingFor?: string
}

export interface FusionCognitionSlice {
  /** Mirrors privacy.allowCognitionDerived at build time. */
  allowCognitionDerived: boolean
  guidance: FusionGuidanceSignal[]
  loops: FusionLoopSignal[]
}

export interface FusionPrivacySlice {
  contextAwarenessEnabled: boolean
  todayUseContext: boolean
  privacyModeActive: boolean
  allowCognitionDerived: boolean
  /** Original snapshot shape for buildActionContext. */
  policy: PrivacyPolicySnapshot | null
}

/** Where the git working directory was resolved from (v0.16.7). */
export type FusionGitResolvedFrom = 'session' | 'project' | 'none'

/**
 * Ephemeral git live-status slice for Suggestion ranking.
 * Not a protocol DTO; never persisted. No commit/push/diff payloads.
 */
export interface FusionGitSlice {
  isRepository: boolean
  root?: string
  branch?: string
  dirtyCount: number
  stagedCount: number
  ahead: number
  behind: number
  hasPullRequest: boolean
  resolvedFrom: FusionGitResolvedFrom
}

/**
 * Unified ephemeral context for Suggestion Engine (and future consumers).
 * Built by Context Provider; discarded after use.
 */
export interface ContextFusionSnapshot {
  workspaceId: string
  sessionId: string
  session: SessionMeta | null
  project: FusionProjectSlice | null
  browser: FusionBrowserSlice
  cognition: FusionCognitionSlice
  privacy: FusionPrivacySlice
  /** Optional — absent/null keeps pre-v0.16.7 callers compatible. */
  git?: FusionGitSlice | null
}

export interface ContextFusionProviderInput {
  workspaceId: string
  sessionId: string
}
