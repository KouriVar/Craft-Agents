/**
 * Typed builders for Cognition Events.
 * Browser / automation builders remain stubs for later phases.
 */

import { randomUUID } from 'crypto'
import {
  COGNITION_SCHEMA_VERSION,
  type CheckpointCreatedEvent,
  type CognitionEventInput,
  type CognitionSubjectRef,
  type SessionCreatedEvent,
  type SessionModelChangedEvent,
  type SessionResumedEvent,
  type SessionStartedEvent,
  type SessionStoppedEvent,
  type SessionStopReason,
  type TaskDetailsUpdatedEvent,
} from '../types.ts'

export function sessionTaskSubject(sessionId: string): CognitionSubjectRef {
  return { kind: 'session_task', id: sessionId }
}

export function newCognitionTurnId(): string {
  return `turn_${randomUUID().slice(0, 12)}`
}

export function newCorrelationId(sessionId: string, turnId: string): string {
  return `corr:${sessionId}:${turnId}`
}

type BaseFields = {
  workspaceId?: string
  projectId?: string
  sessionId: string
  timestamp?: number
  correlationId?: string
  causationId?: string
}

function base(
  fields: BaseFields,
  extras: { idempotencyKey: string; summary: string },
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
> {
  return {
    workspaceId: fields.workspaceId,
    projectId: fields.projectId,
    sessionId: fields.sessionId,
    subject: sessionTaskSubject(fields.sessionId),
    timestamp: fields.timestamp ?? Date.now(),
    schemaVersion: COGNITION_SCHEMA_VERSION,
    correlationId: fields.correlationId,
    causationId: fields.causationId,
    idempotencyKey: extras.idempotencyKey,
    summary: extras.summary,
  }
}

export function buildSessionCreatedEvent(
  fields: BaseFields & {
    name?: string
    parentSessionId?: string
    hasTaskGoal?: boolean
  },
): Omit<SessionCreatedEvent, 'id' | 'sequence'> {
  return {
    type: 'session.created',
    source: 'session',
    ...base(fields, {
      idempotencyKey: `session.created:${fields.sessionId}`,
      summary: fields.name ? `Session created: ${fields.name}` : 'Session created',
    }),
    payload: {
      name: fields.name,
      projectId: fields.projectId,
      parentSessionId: fields.parentSessionId,
      hasTaskGoal: fields.hasTaskGoal,
    },
    evidenceRefs: [{ type: 'session', id: fields.sessionId, label: 'Session' }],
  }
}

export function buildSessionStartedEvent(
  fields: BaseFields & { turnId: string; model?: string; resumedFromInterrupt?: boolean },
): Omit<SessionStartedEvent, 'id' | 'sequence'> {
  return {
    type: 'session.started',
    source: 'session',
    ...base(fields, {
      idempotencyKey: `session.started:${fields.sessionId}:${fields.turnId}`,
      summary: 'Session turn started',
    }),
    correlationId: fields.correlationId ?? newCorrelationId(fields.sessionId, fields.turnId),
    payload: {
      turnId: fields.turnId,
      model: fields.model,
      resumedFromInterrupt: fields.resumedFromInterrupt,
    },
    evidenceRefs: [{ type: 'session', id: fields.sessionId, label: 'Session' }],
  }
}

export function buildSessionStoppedEvent(
  fields: BaseFields & {
    turnId: string
    reason: SessionStopReason
    checkpointId?: string
    nextSteps?: string[]
    blockers?: string[]
    relatedFiles?: string[]
    errorCode?: string
    hasTaskGoal?: boolean
    recoveredOnStartup?: boolean
  },
): Omit<SessionStoppedEvent, 'id' | 'sequence'> {
  return {
    type: 'session.stopped',
    source: 'session',
    ...base(fields, {
      idempotencyKey: `session.stopped:${fields.sessionId}:${fields.turnId}`,
      summary: `Session turn stopped (${fields.reason})`,
    }),
    correlationId: fields.correlationId ?? newCorrelationId(fields.sessionId, fields.turnId),
    payload: {
      reason: fields.reason,
      turnId: fields.turnId,
      checkpointId: fields.checkpointId,
      nextSteps: fields.nextSteps,
      blockers: fields.blockers,
      relatedFiles: fields.relatedFiles,
      errorCode: fields.errorCode,
      hasTaskGoal: fields.hasTaskGoal,
      recoveredOnStartup: fields.recoveredOnStartup,
    },
    evidenceRefs: [
      { type: 'session', id: fields.sessionId, label: 'Session' },
      ...(fields.checkpointId
        ? [{ type: 'checkpoint' as const, id: fields.checkpointId, label: 'Checkpoint' }]
        : []),
    ],
  }
}

export function buildSessionResumedEvent(
  fields: BaseFields & { turnId: string; previousStopReason?: SessionStopReason },
): Omit<SessionResumedEvent, 'id' | 'sequence'> {
  return {
    type: 'session.resumed',
    source: 'session',
    ...base(fields, {
      idempotencyKey: `session.resumed:${fields.sessionId}:${fields.turnId}`,
      summary: 'Session resumed after interrupt',
    }),
    correlationId: fields.correlationId ?? newCorrelationId(fields.sessionId, fields.turnId),
    payload: {
      turnId: fields.turnId,
      previousStopReason: fields.previousStopReason,
    },
  }
}

export function buildSessionModelChangedEvent(
  fields: BaseFields & {
    model: string | null
    previousModel?: string | null
    connection?: string
    revision?: string | number
  },
): Omit<SessionModelChangedEvent, 'id' | 'sequence'> {
  const revision = fields.revision ?? fields.timestamp ?? Date.now()
  const modelKey = fields.model ?? 'null'
  return {
    type: 'session.model_changed',
    source: 'session',
    ...base(fields, {
      idempotencyKey: `session.model_changed:${fields.sessionId}:${modelKey}:${revision}`,
      summary: fields.model ? `Model changed to ${fields.model}` : 'Session model cleared',
    }),
    payload: {
      model: fields.model,
      previousModel: fields.previousModel,
      connection: fields.connection,
    },
  }
}

export function buildCheckpointCreatedEvent(
  fields: BaseFields & {
    checkpointId: string
    source: 'auto' | 'manual'
    outcome: 'completed' | 'interrupted' | 'failed'
    nextSteps?: string[]
    blockers?: string[]
    relatedFiles?: string[]
    messageId?: string
    turnId?: string
  },
): Omit<CheckpointCreatedEvent, 'id' | 'sequence'> {
  return {
    type: 'checkpoint.created',
    source: 'session',
    ...base(fields, {
      idempotencyKey: `checkpoint.${fields.source}:${fields.sessionId}:${fields.checkpointId}`,
      summary: fields.source === 'auto' ? 'Automatic checkpoint saved' : 'Manual checkpoint saved',
    }),
    correlationId:
      fields.correlationId ??
      (fields.turnId ? newCorrelationId(fields.sessionId, fields.turnId) : undefined),
    payload: {
      checkpointId: fields.checkpointId,
      source: fields.source,
      outcome: fields.outcome,
      nextSteps: fields.nextSteps,
      blockers: fields.blockers,
      relatedFiles: fields.relatedFiles,
      messageId: fields.messageId,
    },
    evidenceRefs: [
      { type: 'session', id: fields.sessionId, label: 'Session' },
      { type: 'checkpoint', id: fields.checkpointId, label: 'Checkpoint' },
    ],
  }
}

export function buildTaskDetailsUpdatedEvent(
  fields: BaseFields & {
    updatedFields: TaskDetailsUpdatedEvent['payload']['fields']
    hasTaskGoal?: boolean
    priority?: string
    dueAt?: number
    reminderAt?: number
    revision?: string | number
  },
): Omit<TaskDetailsUpdatedEvent, 'id' | 'sequence'> {
  const revision = fields.revision ?? Date.now()
  return {
    type: 'task.details_updated',
    source: 'task',
    ...base(fields, {
      idempotencyKey: `task.details_updated:${fields.sessionId}:${fields.updatedFields.join(',')}:${revision}`,
      summary: `Task details updated (${fields.updatedFields.join(', ')})`,
    }),
    payload: {
      fields: fields.updatedFields,
      hasTaskGoal: fields.hasTaskGoal,
      priority: fields.priority,
      dueAt: fields.dueAt,
      reminderAt: fields.reminderAt,
    },
  }
}

/** Git builders live in git-event-builder.ts. */
export {
  buildGitBranchSwitchedEvent,
  buildGitCommittedEvent,
  buildGitPushedEvent,
  buildGitSyncedEvent,
  buildGitPrCreatedEvent,
  buildGitFailedEvent,
  buildGitChangesPresentEvent,
  repoRootBasename,
} from './git-event-builder.ts'

/** Browser builders (v0.15.0 Phase 6). */
export {
  buildBrowserPageOpenedEvent,
  buildBrowserTabAttachedEvent,
  buildBrowserBookmarkCreatedEvent,
  buildBrowserPageClosedEvent,
} from './browser-event-builder.ts'
export {
  shouldEmitBrowserPageOpened,
  isNoiseBrowserUrl,
  parseBrowserPageParts,
} from './browser-page-filter.ts'

export function buildReservedAutomationEventStub(): never {
  throw new Error('Automation cognition events are reserved for a later phase')
}

export function mapProcessingReasonToStopReason(
  reason: 'complete' | 'interrupted' | 'error' | 'timeout',
): SessionStopReason {
  switch (reason) {
    case 'complete':
      return 'completed'
    case 'interrupted':
      return 'interrupted'
    case 'timeout':
      return 'cancelled'
    case 'error':
    default:
      return 'failed'
  }
}
