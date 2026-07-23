/**
 * GitEventProvider — emit git.* cognition events after successful (or failed) actions.
 * Fail-soft: never throw into the git RPC path.
 */

import { createHash } from 'crypto'
import { basename } from 'path'
import {
  buildGitBranchSwitchedEvent,
  buildGitChangesPresentEvent,
  buildGitCommittedEvent,
  buildGitFailedEvent,
  buildGitPrCreatedEvent,
  buildGitPushedEvent,
  buildGitSyncedEvent,
  type CognitionEventInput,
  type GitActionKind,
} from '@craft-agent/shared/cognition'
import type { GitAction, GitActionResult, GitRepositoryStatus } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import { createLogger } from '@craft-agent/shared/utils'
import { getGitRepositoryStatus } from '../services/git.ts'
import { getCognitionService } from './CognitionService.ts'

const log = createLogger('git-event-provider')

export interface GitEmitAfterActionInput {
  workspaceId?: string
  dirPath: string
  action: GitAction
  result: GitActionResult
  beforeStatus?: GitRepositoryStatus | null
  sessionId?: string
  projectId?: string
}

function errorCodeFromMessage(message?: string): string {
  const raw = (message || 'git_error').replace(/\s+/g, ' ').trim().slice(0, 80)
  const hash = createHash('sha1').update(raw).digest('hex').slice(0, 8)
  const token = raw.split(/[:\n]/)[0]?.slice(0, 40) || 'git_error'
  return `${token}:${hash}`
}

function mapActionKind(action: GitAction): GitActionKind | null {
  switch (action.type) {
    case 'commit':
    case 'checkout':
    case 'createBranch':
    case 'pull':
    case 'push':
    case 'sync':
    case 'createPullRequest':
      return action.type
    default:
      return null
  }
}

async function resolveHeadSha(dirPath: string): Promise<string | undefined> {
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execFileAsync = promisify(execFile)
    const result = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: dirPath,
      encoding: 'utf8',
      timeout: 5_000,
    })
    const sha = `${result.stdout ?? ''}`.trim()
    return /^[0-9a-f]{7,40}$/i.test(sha) ? sha : undefined
  } catch {
    return undefined
  }
}

function appendSafe(
  workspaceDataRoot: string,
  workspaceId: string | undefined,
  input: CognitionEventInput,
): void {
  try {
    getCognitionService(workspaceDataRoot, workspaceId).appendEventSafe(input)
  } catch (error) {
    log.warn('Git cognition append failed (non-fatal)', {
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * After git:runAction — write Ledger events. Skips stage/unstage/diff noise.
 */
export async function emitGitEventsAfterAction(input: GitEmitAfterActionInput): Promise<void> {
  const kind = mapActionKind(input.action)
  if (!kind) return

  const workspace = input.workspaceId ? getWorkspaceByNameOrId(input.workspaceId) : null
  if (!workspace?.rootPath) {
    log.warn('Git cognition skipped — workspaceDataRoot unavailable', {
      workspaceId: input.workspaceId,
      action: kind,
    })
    return
  }

  const afterStatus = await getGitRepositoryStatus(input.dirPath).catch(() => null)
  const repoRoot = afterStatus?.root || input.beforeStatus?.root || input.dirPath
  const branch = afterStatus?.branch || input.beforeStatus?.branch || 'HEAD'
  const base = {
    workspaceId: workspace.id,
    projectId: input.projectId,
    sessionId: input.sessionId,
    repoRoot,
  }

  try {
    if (!input.result.ok) {
      appendSafe(
        workspace.rootPath,
        workspace.id,
        buildGitFailedEvent({
          ...base,
          action: kind,
          branch,
          errorCode: errorCodeFromMessage(input.result.error),
        }),
      )
      return
    }

    switch (input.action.type) {
      case 'checkout':
      case 'createBranch':
        appendSafe(
          workspace.rootPath,
          workspace.id,
          buildGitBranchSwitchedEvent({
            ...base,
            action: input.action.type,
            branch: input.action.branch,
            previousBranch: input.beforeStatus?.branch,
          }),
        )
        break
      case 'commit': {
        const sha = await resolveHeadSha(input.dirPath)
        if (!sha) break
        appendSafe(
          workspace.rootPath,
          workspace.id,
          buildGitCommittedEvent({
            ...base,
            branch,
            commitSha: sha,
            message: input.action.message,
          }),
        )
        break
      }
      case 'push': {
        const sha = await resolveHeadSha(input.dirPath)
        appendSafe(
          workspace.rootPath,
          workspace.id,
          buildGitPushedEvent({
            ...base,
            branch,
            commitSha: sha,
            ahead: afterStatus?.ahead,
            behind: afterStatus?.behind,
          }),
        )
        break
      }
      case 'pull':
      case 'sync': {
        const sha = await resolveHeadSha(input.dirPath)
        appendSafe(
          workspace.rootPath,
          workspace.id,
          buildGitSyncedEvent({
            ...base,
            branch,
            commitSha: sha,
            ahead: afterStatus?.ahead,
            behind: afterStatus?.behind,
          }),
        )
        break
      }
      case 'createPullRequest': {
        const url = input.result.url || input.result.output?.match(/https?:\/\/\S+/)?.[0]
        if (!url) break
        appendSafe(
          workspace.rootPath,
          workspace.id,
          buildGitPrCreatedEvent({
            ...base,
            branch,
            prUrl: url,
          }),
        )
        break
      }
      default:
        break
    }
  } catch (error) {
    log.warn('Git cognition emit failed (non-fatal)', {
      action: kind,
      repo: basename(repoRoot),
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Optional turn-end dirty signal — at most once per session/turn via idempotency.
 */
export async function maybeEmitGitChangesPresent(input: {
  workspaceId?: string
  workspaceDataRoot: string
  sessionId: string
  projectId?: string
  workingDirectory?: string | null
  turnId: string
}): Promise<void> {
  if (!input.workingDirectory) return
  try {
    const status = await getGitRepositoryStatus(input.workingDirectory)
    if (!status.isRepository || status.files.length === 0) return
    appendSafe(
      input.workspaceDataRoot,
      input.workspaceId,
      buildGitChangesPresentEvent({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        repoRoot: status.root,
        branch: status.branch || 'HEAD',
        dirtyFileCount: status.files.length,
        ahead: status.ahead,
        behind: status.behind,
        turnId: input.turnId,
      }),
    )
  } catch (error) {
    log.warn('Git dirty signal failed (non-fatal)', {
      sessionId: input.sessionId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
