import type { DiagnosticBundle } from '@craft-agent/shared/protocol'

const SENSITIVE_KEY = /authorization|cookie|token|secret|password|passphrase|api[_-]?key|credential|client[_-]?secret|private[_-]?key/i
const BEARER_VALUE = /\bbearer\s+[a-z0-9._~+/=-]+/gi
const JWT_VALUE = /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g
const API_KEY_VALUE = /\bsk-[a-zA-Z0-9_-]{8,}\b/g
const MAX_DEPTH = 8
const MAX_ARRAY_ITEMS = 100
const MAX_STRING_LENGTH = 2_000

export interface DiagnosticSource {
  generatedAt?: Date
  application: DiagnosticBundle['application']
  runtime: Omit<DiagnosticBundle['runtime'], 'uptimeSeconds'> & { uptimeSeconds: number }
  startup: DiagnosticBundle['startup']
  resources: DiagnosticBundle['resources']
  proxy?: {
    enabled: boolean
    httpProxy?: string
    httpsProxy?: string
    noProxy?: string
  }
  browserInstances?: Array<{
    isVisible?: boolean
    crashed?: boolean
    crashReason?: string | null
    crashRecoveryAttempts?: number
  }>
  update: DiagnosticBundle['update']
  plugins?: {
    installedCount: number
    mcpCheckedAt?: number
    mcpServers: Array<{ state?: string; errorType?: string }>
  }
  services: DiagnosticBundle['services']
}

function sanitizeString(value: string): string {
  const truncated = value.slice(0, MAX_STRING_LENGTH)
  const redacted = truncated
    .replace(BEARER_VALUE, 'Bearer [REDACTED]')
    .replace(JWT_VALUE, '[REDACTED_JWT]')
    .replace(API_KEY_VALUE, '[REDACTED_API_KEY]')

  try {
    const parsed = new URL(redacted)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin
    }
  } catch {
    // Non-URL strings continue unchanged after token redaction.
  }
  return redacted
}

/** Defense-in-depth sanitizer for any future diagnostic fields. */
export function redactDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED_DEPTH]'
  if (typeof value === 'string') return sanitizeString(value)
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map(item => redactDiagnosticValue(item, depth + 1))
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactDiagnosticValue(item, depth + 1),
  ]))
}

function incrementCount(target: Record<string, number>, key: string | undefined): void {
  const safeKey = key?.match(/^[a-z][a-z0-9-]{0,40}$/i)?.[0] ?? 'unknown'
  target[safeKey] = (target[safeKey] ?? 0) + 1
}

function sanitizeCrashReason(reason: string | null | undefined): string | null {
  if (!reason) return null
  return reason.match(/^[a-z][a-z0-9-]{0,40}$/i)?.[0] ?? 'unknown'
}

export function createDiagnosticBundle(source: DiagnosticSource): DiagnosticBundle {
  const browserInstances = source.browserInstances ?? []
  const mcpServers = source.plugins?.mcpServers ?? []
  const states: Record<string, number> = {}
  const errorTypes: Record<string, number> = {}
  for (const server of mcpServers) {
    incrementCount(states, server.state)
    if (server.errorType) incrementCount(errorTypes, server.errorType)
  }

  return {
    version: 2,
    generatedAt: (source.generatedAt ?? new Date()).toISOString(),
    application: source.application,
    runtime: {
      ...source.runtime,
      uptimeSeconds: Math.max(0, Math.round(source.runtime.uptimeSeconds)),
    },
    startup: source.startup,
    resources: source.resources,
    proxy: {
      mode: source.proxy?.enabled ? 'custom' : 'system',
      configuredProtocols: source.proxy?.enabled
        ? [source.proxy.httpProxy && 'http', source.proxy.httpsProxy && 'https'].filter((value): value is string => Boolean(value))
        : [],
      hasBypassRules: Boolean(source.proxy?.enabled && source.proxy.noProxy?.trim()),
    },
    browser: {
      totalTabs: browserInstances.length,
      visibleTabs: browserInstances.filter(instance => instance.isVisible).length,
      crashedTabs: browserInstances
        .filter(instance => instance.crashed)
        .map(instance => ({
          reason: sanitizeCrashReason(instance.crashReason),
          attempts: Math.max(0, Math.round(instance.crashRecoveryAttempts ?? 0)),
        })),
    },
    update: source.update,
    plugins: {
      installedCount: Math.max(0, source.plugins?.installedCount ?? 0),
      mcp: {
        checkedAt: source.plugins?.mcpCheckedAt
          ? new Date(source.plugins.mcpCheckedAt).toISOString()
          : null,
        total: mcpServers.length,
        states,
        errorTypes,
      },
    },
    services: source.services,
    privacy: {
      rawLogsIncluded: false,
      urlsIncluded: false,
      workspacePathsIncluded: false,
      processIdsIncluded: false,
      commandLinesIncluded: false,
      redactionVersion: 1,
    },
  }
}
