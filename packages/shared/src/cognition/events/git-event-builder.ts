/**
 * Git cognition event builders — metadata only (no diffs / file lists).
 */

import { basename } from 'path'
import { truncateText } from './event-sanitizer.ts'
import {
  COGNITION_SCHEMA_VERSION,
  type CognitionEvidenceRef,
  type CognitionEventInput,
  type CognitionSubjectRef,
  type GitBranchSwitchedEvent,
  type GitChangesPresentEvent,
  type GitCommittedEvent,
  type GitFailedEvent,
  type GitPrCreatedEvent,
  type GitPushedEvent,
  type GitSyncedEvent,
  type GitActionKind,
} from '../types.ts'

function sessionTaskSubject(sessionId: string): CognitionSubjectRef {
  return { kind: 'session_task', id: sessionId }
}

export function repoRootBasename(repoRoot?: string): string {
  if (!repoRoot) return 'repo'
  try {
    return basename(repoRoot) || 'repo'
  } catch {
    return 'repo'
  }
}

type GitBaseFields = {
  workspaceId?: string
  projectId?: string
  sessionId?: string
  timestamp?: number
  correlationId?: string
  causationId?: string
  repoRoot?: string
}

function gitSubject(sessionId?: string, projectId?: string): CognitionSubjectRef | undefined {
  if (sessionId) return sessionTaskSubject(sessionId)
  if (projectId) return { kind: 'project', id: projectId }
  return undefined
}

function gitBase(
  fields: GitBaseFields,
  extras: { idempotencyKey: string; summary: string; evidenceRefs: CognitionEvidenceRef[] },
): Pick<
  CognitionEventInput,
  | 'workspaceId'
  | 'projectId'
  | 'sessionId'
  | 'subject'
  | 'timestamp'
  | 'schemaVersion'
  | 'correlationId'
  | 'causationId'
  | 'idempotencyKey'
  | 'summary'
  | 'evidenceRefs'
  | 'source'
> {
  return {
    source: 'git',
    workspaceId: fields.workspaceId,
    projectId: fields.projectId,
    sessionId: fields.sessionId,
    subject: gitSubject(fields.sessionId, fields.projectId),
    timestamp: fields.timestamp ?? Date.now(),
    schemaVersion: COGNITION_SCHEMA_VERSION,
    correlationId: fields.correlationId,
    causationId: fields.causationId,
    idempotencyKey: extras.idempotencyKey,
    summary: truncateText(extras.summary, 480),
    evidenceRefs: extras.evidenceRefs.slice(0, 12),
  }
}

function branchEvidence(branch: string, repoRoot?: string): CognitionEvidenceRef[] {
  const refs: CognitionEvidenceRef[] = [
    { type: 'git_branch', id: branch, label: branch },
  ]
  if (repoRoot) {
    refs.push({ type: 'file', label: 'Repository', path: basename(repoRoot) })
  }
  return refs
}

export function buildGitBranchSwitchedEvent(
  fields: GitBaseFields & {
    branch: string
    previousBranch?: string
    action: 'checkout' | 'createBranch'
  },
): Omit<GitBranchSwitchedEvent, 'id' | 'sequence'> {
  const rootName = repoRootBasename(fields.repoRoot)
  const previous = fields.previousBranch || 'unknown'
  return {
    type: 'git.branch_switched',
    ...gitBase(fields, {
      idempotencyKey: `git.branch_switched:${rootName}:${previous}:${fields.branch}`,
      summary: fields.action === 'createBranch'
        ? `Created and switched to branch ${fields.branch}`
        : `Switched branch to ${fields.branch}`,
      evidenceRefs: branchEvidence(fields.branch, fields.repoRoot),
    }),
    payload: {
      action: fields.action,
      branch: fields.branch,
      previousBranch: fields.previousBranch,
      repoRootBasename: rootName,
    },
  }
}

export function buildGitCommittedEvent(
  fields: GitBaseFields & {
    branch: string
    commitSha: string
    message: string
  },
): Omit<GitCommittedEvent, 'id' | 'sequence'> {
  const rootName = repoRootBasename(fields.repoRoot)
  const sha = fields.commitSha
  const messageSummary = truncateText(fields.message.trim() || 'commit', 80)
  return {
    type: 'git.committed',
    ...gitBase(fields, {
      idempotencyKey: `git.committed:${sha}`,
      summary: `Committed ${sha.slice(0, 7)} on ${fields.branch}: ${messageSummary}`,
      evidenceRefs: [
        { type: 'git_commit', id: sha, label: sha.slice(0, 7) },
        ...branchEvidence(fields.branch, fields.repoRoot),
      ],
    }),
    payload: {
      action: 'commit',
      branch: fields.branch,
      commitSha: sha,
      messageSummary,
      repoRootBasename: rootName,
    },
  }
}

export function buildGitPushedEvent(
  fields: GitBaseFields & {
    branch: string
    commitSha?: string
    ahead?: number
    behind?: number
  },
): Omit<GitPushedEvent, 'id' | 'sequence'> {
  const rootName = repoRootBasename(fields.repoRoot)
  const sha = fields.commitSha || 'HEAD'
  return {
    type: 'git.pushed',
    ...gitBase(fields, {
      idempotencyKey: `git.pushed:${rootName}:${fields.branch}:${sha}`,
      summary: `Pushed branch ${fields.branch}`,
      evidenceRefs: [
        ...(fields.commitSha
          ? [{ type: 'git_commit' as const, id: fields.commitSha, label: fields.commitSha.slice(0, 7) }]
          : []),
        ...branchEvidence(fields.branch, fields.repoRoot),
      ],
    }),
    payload: {
      action: 'push',
      branch: fields.branch,
      ahead: fields.ahead,
      behind: fields.behind,
      commitSha: fields.commitSha,
      repoRootBasename: rootName,
    },
  }
}

export function buildGitSyncedEvent(
  fields: GitBaseFields & {
    branch: string
    commitSha?: string
    ahead?: number
    behind?: number
  },
): Omit<GitSyncedEvent, 'id' | 'sequence'> {
  const rootName = repoRootBasename(fields.repoRoot)
  const sha = fields.commitSha || 'HEAD'
  return {
    type: 'git.synced',
    ...gitBase(fields, {
      idempotencyKey: `git.synced:${rootName}:${fields.branch}:${sha}`,
      summary: `Synced branch ${fields.branch}`,
      evidenceRefs: branchEvidence(fields.branch, fields.repoRoot),
    }),
    payload: {
      action: 'sync',
      branch: fields.branch,
      ahead: fields.ahead,
      behind: fields.behind,
      commitSha: fields.commitSha,
      repoRootBasename: rootName,
    },
  }
}

export function buildGitPrCreatedEvent(
  fields: GitBaseFields & {
    branch: string
    prUrl: string
  },
): Omit<GitPrCreatedEvent, 'id' | 'sequence'> {
  const rootName = repoRootBasename(fields.repoRoot)
  return {
    type: 'git.pr_created',
    ...gitBase(fields, {
      idempotencyKey: `git.pr_created:${fields.prUrl}`,
      summary: `Created pull request for ${fields.branch}`,
      evidenceRefs: branchEvidence(fields.branch, fields.repoRoot),
    }),
    payload: {
      action: 'createPullRequest',
      branch: fields.branch,
      prUrl: fields.prUrl,
      repoRootBasename: rootName,
    },
  }
}

export function buildGitFailedEvent(
  fields: GitBaseFields & {
    action: GitActionKind
    branch?: string
    errorCode: string
  },
): Omit<GitFailedEvent, 'id' | 'sequence'> {
  const rootName = repoRootBasename(fields.repoRoot)
  const bucket = Math.floor((fields.timestamp ?? Date.now()) / 60_000)
  return {
    type: 'git.failed',
    ...gitBase(fields, {
      idempotencyKey: `git.failed:${fields.action}:${rootName}:${fields.errorCode}:${bucket}`,
      summary: `Git ${fields.action} failed: ${fields.errorCode}`,
      evidenceRefs: fields.branch
        ? branchEvidence(fields.branch, fields.repoRoot)
        : [{ type: 'file', label: 'Repository', path: rootName }],
    }),
    payload: {
      action: fields.action,
      branch: fields.branch,
      errorCode: truncateText(fields.errorCode, 120),
      repoRootBasename: rootName,
    },
  }
}

export function buildGitChangesPresentEvent(
  fields: GitBaseFields & {
    branch: string
    dirtyFileCount: number
    ahead: number
    behind: number
    turnId?: string
  },
): Omit<GitChangesPresentEvent, 'id' | 'sequence'> {
  const rootName = repoRootBasename(fields.repoRoot)
  const key = fields.sessionId && fields.turnId
    ? `git.changes_present:${fields.sessionId}:${fields.turnId}`
    : `git.changes_present:${rootName}:${fields.branch}:${fields.dirtyFileCount}:${Math.floor((fields.timestamp ?? Date.now()) / 300_000)}`
  return {
    type: 'git.changes_present',
    ...gitBase(fields, {
      idempotencyKey: key,
      summary: `Uncommitted changes on ${fields.branch} (${fields.dirtyFileCount} files)`,
      evidenceRefs: branchEvidence(fields.branch, fields.repoRoot),
    }),
    payload: {
      action: 'status',
      branch: fields.branch,
      dirtyFileCount: fields.dirtyFileCount,
      ahead: fields.ahead,
      behind: fields.behind,
      repoRootBasename: rootName,
    },
  }
}
