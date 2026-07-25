/**
 * Git adapter (v0.16.7) — map injected GitRepositoryStatus into FusionGitSlice.
 *
 * Does not call git / IPC. cwd resolution only:
 *   1. session.workingDirectory
 *   2. project.workingDirectory
 *   3. null
 * Does not reuse message folder-badge candidates from the Git UI.
 */

import type { GitRepositoryStatus } from '@craft-agent/shared/protocol'
import type { SessionMeta } from '@/atoms/sessions'
import type { FusionGitResolvedFrom, FusionGitSlice, FusionProjectSlice } from '../types'

export interface AdaptGitInput {
  session?: SessionMeta | null
  /** Project bound working directory (from FusionProjectSlice / ProjectConfig). */
  projectWorkingDirectory?: string | null
  /** Already-fetched status for the resolved cwd — provider must not fetch here. */
  status?: GitRepositoryStatus | null
}

export interface ResolvedGitWorkingDirectory {
  cwd: string | null
  resolvedFrom: FusionGitResolvedFrom
}

/** Resolve cwd without scanning messages or Craft project folderPath. */
export function resolveGitWorkingDirectory(
  session: SessionMeta | null | undefined,
  projectWorkingDirectory?: string | null,
): ResolvedGitWorkingDirectory {
  const sessionCwd = session?.workingDirectory?.trim()
  if (sessionCwd) {
    return { cwd: sessionCwd, resolvedFrom: 'session' }
  }
  const projectCwd = projectWorkingDirectory?.trim()
  if (projectCwd) {
    return { cwd: projectCwd, resolvedFrom: 'project' }
  }
  return { cwd: null, resolvedFrom: 'none' }
}

function countStaged(status: GitRepositoryStatus): number {
  return status.files.reduce((n, file) => n + (file.staged ? 1 : 0), 0)
}

/**
 * Convert injected git status + cwd resolution into an ephemeral slice.
 * Returns null when there is no cwd or no status to adapt.
 */
export function adaptGit(input: AdaptGitInput): FusionGitSlice | null {
  const { cwd, resolvedFrom } = resolveGitWorkingDirectory(
    input.session,
    input.projectWorkingDirectory ?? null,
  )
  if (!cwd || resolvedFrom === 'none') return null

  const status = input.status
  if (!status) return null

  if (!status.isRepository) {
    return {
      isRepository: false,
      dirtyCount: 0,
      stagedCount: 0,
      ahead: 0,
      behind: 0,
      hasPullRequest: false,
      resolvedFrom,
    }
  }

  const dirtyCount = status.files.length
  return {
    isRepository: true,
    root: status.root,
    branch: status.branch,
    dirtyCount,
    stagedCount: countStaged(status),
    ahead: status.ahead ?? 0,
    behind: status.behind ?? 0,
    hasPullRequest: Boolean(status.pullRequest?.url),
    resolvedFrom,
  }
}

/** Convenience: adapt from session + project slice + status. */
export function adaptGitFromFusionParts(input: {
  session: SessionMeta | null
  project: FusionProjectSlice | null
  status?: GitRepositoryStatus | null
}): FusionGitSlice | null {
  return adaptGit({
    session: input.session,
    projectWorkingDirectory: input.project?.workingDirectory,
    status: input.status,
  })
}
