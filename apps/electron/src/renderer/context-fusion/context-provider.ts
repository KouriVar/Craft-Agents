/**
 * Context Provider — assemble ContextFusionSnapshot from existing atoms / RPC results.
 *
 * Pure assembly over injected deps (testable). Never persists.
 * Git: callers inject already-fetched GitRepositoryStatus; adapter only transforms.
 */

import type { LoadedProject } from '@craft-agent/shared/projects/types'
import type { GitRepositoryStatus } from '@craft-agent/shared/protocol'
import type { BrowserWorkspaceTab } from '@/atoms/browser-workspace'
import type { SessionMeta } from '@/atoms/sessions'
import { isAllowCognitionDerived } from '@/context-actions/build-action-context'
import type { PrivacyPolicySnapshot } from '@/context-actions/types'
import { adaptBrowser, emptyFusionBrowserSlice } from './adapters/browser'
import {
  adaptCognition,
  emptyFusionCognitionSlice,
  type CognitionGuidanceSource,
  type CognitionLoopSource,
} from './adapters/cognition'
import { adaptGitFromFusionParts } from './adapters/git'
import { adaptProject } from './adapters/project'
import { adaptSession } from './adapters/session'
import type {
  ContextFusionProviderInput,
  ContextFusionSnapshot,
  FusionPrivacySlice,
} from './types'

export interface ContextFusionProviderDeps {
  sessions: Map<string, SessionMeta> | Iterable<SessionMeta> | null | undefined
  projects?: readonly LoadedProject[] | null
  browserTabs?: readonly BrowserWorkspaceTab[] | null
  privacy?: PrivacyPolicySnapshot | null
  guidance?: readonly CognitionGuidanceSource[] | null
  loops?: readonly CognitionLoopSource[] | null
  /**
   * Pre-fetched git status for the resolved cwd (session → project workingDirectory).
   * Omit / null → snapshot.git is null (legacy-compatible).
   */
  gitStatus?: GitRepositoryStatus | null
}

function adaptPrivacy(privacy: PrivacyPolicySnapshot | null | undefined): FusionPrivacySlice {
  const allowCognitionDerived = isAllowCognitionDerived(privacy)
  return {
    contextAwarenessEnabled: Boolean(privacy?.contextAwarenessEnabled),
    todayUseContext: Boolean(privacy?.today.useContext),
    privacyModeActive: Boolean(
      privacy?.effectivePrivacyModeActive || privacy?.privacyMode?.active,
    ),
    allowCognitionDerived,
    policy: privacy ?? null,
  }
}

/**
 * Build an ephemeral ContextFusionSnapshot from provider input + deps.
 * Callers supply atom values / already-fetched cognition lists / git status.
 */
export function buildContextFusionSnapshot(
  input: ContextFusionProviderInput,
  deps: ContextFusionProviderDeps,
): ContextFusionSnapshot {
  const workspaceId = input.workspaceId?.trim() ?? ''
  const sessionId = input.sessionId?.trim() ?? ''
  const session = adaptSession(deps.sessions, sessionId)
  const project = adaptProject(workspaceId, session, deps.projects)
  const privacy = adaptPrivacy(deps.privacy)
  const browser = project
    ? adaptBrowser({
        tabs: deps.browserTabs,
        sessions: deps.sessions,
        project,
      })
    : emptyFusionBrowserSlice()
  const cognition = adaptCognition({
    privacy: deps.privacy,
    guidance: deps.guidance,
    loops: deps.loops,
    sessionId,
  })
  const git = adaptGitFromFusionParts({
    session,
    project,
    status: deps.gitStatus,
  })

  return {
    workspaceId,
    sessionId,
    session,
    project,
    browser,
    cognition: privacy.allowCognitionDerived ? cognition : emptyFusionCognitionSlice(false),
    privacy,
    git,
  }
}
