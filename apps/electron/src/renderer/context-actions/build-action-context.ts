/**
 * buildActionContext — assemble ActionContext from existing renderer state.
 *
 * Pure function: callers pass SessionMeta / projects / privacy snapshots
 * (typically from sessionMetaMapAtom, projectsAtom, getPrivacyPolicy,
 * last-active-project). No new storage.
 */

import type { LoadedProject } from '@craft-agent/shared/projects/types'
import type { SessionMeta } from '@/atoms/sessions'
import { resolveLastActiveProject } from '@/lib/last-active-project'
import {
  findProjectResumeSession,
  hasResumeData,
  isSessionCompleted,
} from '@/lib/project-resume'
import type { ActionContext, PrivacyPolicySnapshot } from './types'

export interface BuildActionContextInput {
  workspaceId: string
  sessionId?: string | null
  documentId?: string | null
  /** Explicit project override; otherwise session → last-active. */
  projectId?: string | null
  /** Current session meta (from sessionMetaMapAtom). */
  session?: SessionMeta | null
  /**
   * Session metas for resume / continue lookup.
   * Accepts Map values, array, or any iterable of SessionMeta.
   */
  sessions?: Iterable<SessionMeta> | Map<string, SessionMeta> | null
  /** Workspace projects (from projectsAtom). */
  projects?: readonly LoadedProject[] | null
  /**
   * Privacy policy snapshot (from getPrivacyPolicy).
   * Null / undefined → cognition-derived surfaces disabled.
   */
  privacy?: PrivacyPolicySnapshot | null
}

function asSessionIterable(
  sessions: BuildActionContextInput['sessions'],
): Iterable<SessionMeta> {
  if (!sessions) return []
  if (sessions instanceof Map) return sessions.values()
  return sessions
}

/**
 * Same gate Explore Today uses for cognition-derived surfaces.
 */
export function isAllowCognitionDerived(privacy: PrivacyPolicySnapshot | null | undefined): boolean {
  if (!privacy) return false
  return Boolean(
    privacy.contextAwarenessEnabled
    && privacy.today.useContext
    && !privacy.effectivePrivacyModeActive
    && !privacy.privacyMode?.active,
  )
}

function resolveProjectId(input: BuildActionContextInput): string | undefined {
  if (typeof input.projectId === 'string' && input.projectId.trim()) {
    return input.projectId
  }
  if (input.session?.projectId?.trim()) {
    return input.session.projectId
  }
  const projects = input.projects ?? []
  if (input.workspaceId && projects.length > 0) {
    const last = resolveLastActiveProject(input.workspaceId, projects)
    if (last?.config.id) return last.config.id
  }
  return undefined
}

function resolveCanContinue(
  session: SessionMeta | null | undefined,
  projectId: string | undefined,
  sessions: Iterable<SessionMeta>,
): boolean {
  if (session && !isSessionCompleted(session) && hasResumeData(session)) {
    return true
  }
  if (projectId && findProjectResumeSession(sessions, projectId)) {
    return true
  }
  return false
}

export function buildActionContext(input: BuildActionContextInput): ActionContext {
  const workspaceId = input.workspaceId?.trim() ?? ''
  const sessionId = input.sessionId?.trim() || undefined
  const documentId = input.documentId?.trim() || undefined
  const session = input.session ?? null
  const sessions = asSessionIterable(input.sessions)
  const projectId = resolveProjectId(input)

  const hasSession = Boolean(sessionId && session && session.id === sessionId)

  return {
    workspaceId,
    sessionId,
    projectId,
    documentId,
    flags: {
      canContinue: resolveCanContinue(hasSession ? session : null, projectId, sessions),
      canArchive: Boolean(hasSession && session && !session.isArchived),
      canCreateLibraryFromSession: hasSession,
      allowCognitionDerived: isAllowCognitionDerived(input.privacy),
    },
  }
}
