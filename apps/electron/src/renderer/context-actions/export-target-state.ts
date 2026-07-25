/**
 * Stable export-target resolution for Context Action surfaces (Suggestion / Actions).
 * Keeps library.export from flashing while async lookup is in flight.
 */

export type ExportTargetStatus = 'idle' | 'resolving' | 'resolved'

export interface ExportTargetState {
  status: ExportTargetStatus
  /** Set only when status === 'resolved' and a document was found. */
  documentId?: string
  /** Context key used to ignore stale async responses. */
  requestKey: string
}

export function exportTargetRequestKey(input: {
  workspaceId?: string | null
  sessionId?: string | null
  projectId?: string | null
}): string {
  return [
    input.workspaceId?.trim() || '',
    input.sessionId?.trim() || '',
    input.projectId?.trim() || '',
  ].join('\0')
}

export function initialExportTargetState(): ExportTargetState {
  return { status: 'idle', documentId: undefined, requestKey: '' }
}

/** Begin a new resolve — clears any previous documentId immediately. */
export function beginExportTargetResolve(requestKey: string): ExportTargetState {
  return { status: 'resolving', documentId: undefined, requestKey }
}

/**
 * Apply an async result only when it still matches the in-flight requestKey.
 * Returns previous state unchanged when the response is stale.
 */
export function completeExportTargetResolve(
  previous: ExportTargetState,
  requestKey: string,
  documentId: string | undefined,
): ExportTargetState {
  if (previous.requestKey !== requestKey || previous.status !== 'resolving') {
    return previous
  }
  return {
    status: 'resolved',
    documentId: documentId?.trim() || undefined,
    requestKey,
  }
}

/** documentId is only exposed to ActionContext after resolve completes. */
export function documentIdForActionContext(state: ExportTargetState): string | undefined {
  if (state.status !== 'resolved') return undefined
  return state.documentId
}
