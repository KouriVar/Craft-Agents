/**
 * Display-only helpers for Privacy access-log entries.
 *
 * Maps metadata fields to i18n keys. Never surfaces raw bodies, URLs with
 * secrets, diffs, tokens, or cookies — the log itself is metadata-only.
 */

export type AccessLogDisplayInput = {
  feature: string
  sources: string[]
  purpose: string
  decision: string
}

export type AccessLogDisplayKeys = {
  sourceKey: string
  purposeKey: string
  decisionKey: string
}

function primarySource(sources: string[]): string {
  return (sources[0] ?? '').trim().toLowerCase()
}

/** Map cognition/policy source family → user-facing source label key. */
export function resolveAccessLogSourceKey(sources: string[]): string {
  switch (primarySource(sources)) {
    case 'session':
    case 'task':
      return 'settings.privacy.logSource.session'
    case 'browser':
      return 'settings.privacy.logSource.browser'
    case 'git':
      return 'settings.privacy.logSource.project'
    case 'library':
      return 'settings.privacy.logSource.library'
    case 'system':
      return 'settings.privacy.logSource.system'
    case 'messaging':
      return 'settings.privacy.logSource.messaging'
    case 'automation':
      return 'settings.privacy.logSource.automation'
    case 'files':
      return 'settings.privacy.logSource.files'
    case 'mcp':
      return 'settings.privacy.logSource.mcp'
    case 'project_memory':
      return 'settings.privacy.logSource.projectMemory'
    case '':
    case 'unknown':
      return 'settings.privacy.logSource.unknown'
    default:
      return 'settings.privacy.logSource.other'
  }
}

/** Map feature/purpose → user-facing purpose label key (no raw ingest strings). */
export function resolveAccessLogPurposeKey(feature: string, purpose: string): string {
  const f = feature.trim().toLowerCase()
  const p = purpose.trim().toLowerCase()

  if (f === 'library_generate' || p === 'library_generate') {
    return 'settings.privacy.logPurpose.libraryGenerate'
  }
  if (f === 'today_context') {
    return 'settings.privacy.logPurpose.today'
  }
  if (f === 'cognition_read') {
    return 'settings.privacy.logPurpose.readContext'
  }
  if (f === 'cognition_process') {
    return 'settings.privacy.logPurpose.processContext'
  }
  if (f === 'cognition_ingest' || p.startsWith('ingest:')) {
    return 'settings.privacy.logPurpose.formContext'
  }
  if (f === 'manual_chat') {
    return 'settings.privacy.logPurpose.manualChat'
  }
  if (f === 'privacy_cleanup') {
    return 'settings.privacy.logPurpose.cleanup'
  }
  return 'settings.privacy.logPurpose.generic'
}

/** Map stored decision → user-facing result label key. */
export function resolveAccessLogDecisionKey(decision: string): string {
  switch (decision) {
    case 'allow':
      return 'settings.privacy.logDecision.allow'
    case 'ask':
      return 'settings.privacy.logDecision.ask'
    case 'blocked_by_privacy_mode':
      return 'settings.privacy.logDecision.privacyMode'
    case 'deny':
      return 'settings.privacy.logDecision.deny'
    default:
      return 'settings.privacy.logDecision.deny'
  }
}

export function resolveAccessLogDisplay(entry: AccessLogDisplayInput): AccessLogDisplayKeys {
  return {
    sourceKey: resolveAccessLogSourceKey(entry.sources),
    purposeKey: resolveAccessLogPurposeKey(entry.feature, entry.purpose),
    decisionKey: resolveAccessLogDecisionKey(entry.decision),
  }
}
