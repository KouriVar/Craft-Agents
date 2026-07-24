/**
 * Cognition Layer v1 — Event Ledger types (v0.15.0 Phase 2).
 *
 * Important naming:
 * - `workspaceDataRoot` is the Craft Agents–managed workspace data directory
 *   (e.g. `~/.craft-agent/workspaces/<id>/`), NOT the user's Git project cwd.
 * - Session long-running tasks are referenced via `subject: { kind: 'session_task', id: sessionId }`.
 *   Do NOT invent a generic `taskId` field that aliases sessionId.
 */

export const COGNITION_SCHEMA_VERSION = 2

export type CognitionEventSource =
  | 'session'
  | 'task'
  | 'git'
  | 'browser'
  | 'automation'
  | 'messaging'
  | 'system'

export type CognitionSubjectKind =
  | 'session_task'
  | 'session'
  | 'project'
  | 'automation'

export interface CognitionSubjectRef {
  kind: CognitionSubjectKind
  id: string
}

export type CognitionEvidenceRefType =
  | 'session'
  | 'message'
  | 'checkpoint'
  | 'file'
  | 'git_commit'
  | 'git_branch'
  | 'browser_tab'
  | 'automation'

export interface CognitionEvidenceRef {
  type: CognitionEvidenceRefType
  id?: string
  label: string
  path?: string
  url?: string
}

export interface CognitionEventBase<TType extends string, TPayload> {
  id: string
  sequence: number
  type: TType
  source: CognitionEventSource
  timestamp: number
  schemaVersion: number
  /** CA-managed workspace id (not filesystem path). */
  workspaceId?: string
  projectId?: string
  sessionId?: string
  subject?: CognitionSubjectRef
  correlationId?: string
  causationId?: string
  idempotencyKey?: string
  summary: string
  payload: TPayload
  evidenceRefs?: CognitionEvidenceRef[]
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface SessionCreatedPayload {
  name?: string
  projectId?: string
  parentSessionId?: string
  hasTaskGoal?: boolean
}

export interface SessionStartedPayload {
  turnId: string
  model?: string
  resumedFromInterrupt?: boolean
}

export type SessionStopReason =
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled'

export interface SessionStoppedPayload {
  reason: SessionStopReason
  turnId: string
  checkpointId?: string
  nextSteps?: string[]
  blockers?: string[]
  relatedFiles?: string[]
  errorCode?: string
  hasTaskGoal?: boolean
  /** Set only if a future phase auto-compensates an open start on startup. */
  recoveredOnStartup?: boolean
}

export interface SessionResumedPayload {
  turnId: string
  previousStopReason?: SessionStopReason
}

export interface SessionModelChangedPayload {
  model: string | null
  previousModel?: string | null
  connection?: string
}

export interface CheckpointCreatedPayload {
  checkpointId: string
  source: 'auto' | 'manual'
  outcome: 'completed' | 'interrupted' | 'failed'
  nextSteps?: string[]
  blockers?: string[]
  relatedFiles?: string[]
  messageId?: string
}

export interface TaskDetailsUpdatedPayload {
  fields: Array<'goal' | 'priority' | 'dueAt' | 'reminderAt' | 'acknowledgeReminder' | 'markReminderNotified'>
  hasTaskGoal?: boolean
  priority?: string
  dueAt?: number
  reminderAt?: number
}

/** Git signal payloads — metadata only; never include diffs or file contents. */
export type GitActionKind =
  | 'commit'
  | 'checkout'
  | 'createBranch'
  | 'pull'
  | 'push'
  | 'sync'
  | 'createPullRequest'
  | 'status'

export interface GitBranchSwitchedPayload {
  action: 'checkout' | 'createBranch'
  branch: string
  previousBranch?: string
  repoRootBasename: string
}

export interface GitCommittedPayload {
  action: 'commit'
  branch: string
  commitSha: string
  messageSummary: string
  repoRootBasename: string
}

export interface GitSyncSignalPayload {
  action: 'push' | 'pull' | 'sync'
  branch: string
  ahead?: number
  behind?: number
  commitSha?: string
  repoRootBasename: string
}

export interface GitPrCreatedPayload {
  action: 'createPullRequest'
  branch: string
  prUrl: string
  repoRootBasename: string
}

export interface GitFailedPayload {
  action: GitActionKind
  branch?: string
  errorCode: string
  repoRootBasename: string
}

export interface GitChangesPresentPayload {
  action: 'status'
  branch: string
  dirtyFileCount: number
  ahead: number
  behind: number
  repoRootBasename: string
}

/** Browser signal payloads — title + host/path only; never cookies/body/history dumps. */
export interface BrowserPageOpenedPayload {
  tabId: string
  hostname: string
  pathname: string
  title: string
  ownerType: 'session' | 'manual'
  boundSessionId?: string
  trigger: 'load' | 'spa' | 'agent_navigate'
}

export interface BrowserTabAttachedPayload {
  tabId: string
  hostname?: string
  pathname?: string
  title?: string
  boundSessionId: string
  ownerType: 'session' | 'manual'
}

export interface BrowserBookmarkCreatedPayload {
  bookmarkId: string
  hostname: string
  pathname: string
  title: string
}

export interface BrowserPageClosedPayload {
  tabId: string
  hostname?: string
  pathname?: string
  title?: string
  boundSessionId?: string
}

/** Reserved for later phases — automation builders only. */
export interface ReservedSourcePayload {
  note?: string
}

// ---------------------------------------------------------------------------
// Discriminated event union
// ---------------------------------------------------------------------------

export type SessionCreatedEvent = CognitionEventBase<'session.created', SessionCreatedPayload>
export type SessionStartedEvent = CognitionEventBase<'session.started', SessionStartedPayload>
export type SessionStoppedEvent = CognitionEventBase<'session.stopped', SessionStoppedPayload>
export type SessionResumedEvent = CognitionEventBase<'session.resumed', SessionResumedPayload>
export type SessionModelChangedEvent = CognitionEventBase<'session.model_changed', SessionModelChangedPayload>
export type CheckpointCreatedEvent = CognitionEventBase<'checkpoint.created', CheckpointCreatedPayload>
export type TaskDetailsUpdatedEvent = CognitionEventBase<'task.details_updated', TaskDetailsUpdatedPayload>
export type GitBranchSwitchedEvent = CognitionEventBase<'git.branch_switched', GitBranchSwitchedPayload>
export type GitCommittedEvent = CognitionEventBase<'git.committed', GitCommittedPayload>
export type GitPushedEvent = CognitionEventBase<'git.pushed', GitSyncSignalPayload>
export type GitSyncedEvent = CognitionEventBase<'git.synced', GitSyncSignalPayload>
export type GitPrCreatedEvent = CognitionEventBase<'git.pr_created', GitPrCreatedPayload>
export type GitFailedEvent = CognitionEventBase<'git.failed', GitFailedPayload>
export type GitChangesPresentEvent = CognitionEventBase<'git.changes_present', GitChangesPresentPayload>
export type BrowserPageOpenedEvent = CognitionEventBase<'browser.page_opened', BrowserPageOpenedPayload>
export type BrowserTabAttachedEvent = CognitionEventBase<'browser.tab_attached', BrowserTabAttachedPayload>
export type BrowserBookmarkCreatedEvent = CognitionEventBase<'browser.bookmark_created', BrowserBookmarkCreatedPayload>
export type BrowserPageClosedEvent = CognitionEventBase<'browser.page_closed', BrowserPageClosedPayload>

export type CognitionEvent =
  | SessionCreatedEvent
  | SessionStartedEvent
  | SessionStoppedEvent
  | SessionResumedEvent
  | SessionModelChangedEvent
  | CheckpointCreatedEvent
  | TaskDetailsUpdatedEvent
  | GitBranchSwitchedEvent
  | GitCommittedEvent
  | GitPushedEvent
  | GitSyncedEvent
  | GitPrCreatedEvent
  | GitFailedEvent
  | GitChangesPresentEvent
  | BrowserPageOpenedEvent
  | BrowserTabAttachedEvent
  | BrowserBookmarkCreatedEvent
  | BrowserPageClosedEvent

export type CognitionEventType = CognitionEvent['type']

export type CognitionEventInput = Omit<CognitionEvent, 'id' | 'sequence'>

// ---------------------------------------------------------------------------
// Manifest + query
// ---------------------------------------------------------------------------

/**
 * Processing cursor lives on the manifest — NOT on individual events.
 * Phase 2 does not consume events; lastProcessedSequence stays 0.
 */
export interface CognitionManifest {
  schemaVersion: number
  createdAt: number
  updatedAt: number
  nextSequence: number
  lastProcessedSequence: number
  lastProcessedEventId?: string
  migrationsApplied: string[]
  eventCount?: number
  lastEventAt?: number
  /** Soft diagnostic: last truncated/corrupt trailing line recovery. */
  lastRepairNote?: string
}

export interface CognitionEventQuery {
  afterSequence?: number
  beforeSequence?: number
  workspaceId?: string
  projectId?: string
  sessionId?: string
  subject?: CognitionSubjectRef
  types?: CognitionEventType[]
  fromTimestamp?: number
  toTimestamp?: number
  limit?: number
  /** Skip first N matching events (after filters, before limit). */
  offset?: number
}

export interface CognitionStoreStatus {
  schemaVersion: number
  eventCount: number
  nextSequence: number
  lastProcessedSequence: number
  lastEventAt?: number
  lastProcessedEventId?: string
  migrationsApplied: string[]
  lastRepairNote?: string
}

export type AppendCognitionEventResult =
  | { status: 'appended'; event: CognitionEvent }
  | { status: 'deduplicated'; event: CognitionEvent }

export interface CognitionModelRunner {
  isAvailable(workspaceId?: string): Promise<boolean>
  complete(prompt: string, options?: { model?: string }): Promise<string>
}

/** Limits enforced by sanitizer + store. */
export const COGNITION_LIMITS = {
  maxEventBytes: 32_768,
  maxSummaryLength: 480,
  maxItemLength: 240,
  maxArrayItems: 10,
  maxEvidenceRefs: 12,
  defaultQueryLimit: 100,
  maxQueryLimit: 500,
  maxUrlLength: 512,
  maxPathLength: 260,
} as const
