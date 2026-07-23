/**
 * Cognition event sanitizer.
 *
 * All events MUST pass through `sanitizeCognitionEventInput` before the store.
 * This is a best-effort scrubber — it does not claim to detect every secret.
 */

import { basename, isAbsolute, normalize, relative, resolve, sep } from 'path'
import { homedir } from 'os'
import {
  COGNITION_LIMITS,
  COGNITION_SCHEMA_VERSION,
  type CognitionEventInput,
  type CognitionEvidenceRef,
  type CognitionSubjectRef,
} from '../types.ts'

const SENSITIVE_KEY_RE = /^(?:.*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth(?:orization)?|password|passwd|secret|cookie|set-cookie|private[_-]?key).*)$/i
const TOKENISH_RE = /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]{16,})\b/gi
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'diff',
  'patch',
  'fullDiff',
  'rawDiff',
  'env',
  'environment',
  'cookies',
  'cookie',
  'authorization',
  'password',
  'passwd',
  'apiKey',
  'api_key',
  'accessToken',
  'refreshToken',
  'chatMessages',
  'messages',
  'pageContent',
  'html',
  'body',
])

export class CognitionSanitizeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CognitionSanitizeError'
  }
}

export function truncateText(value: string, max: number = COGNITION_LIMITS.maxItemLength): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export function maskSecretsInText(value: string): string {
  return value.replace(TOKENISH_RE, '[REDACTED]')
}

/**
 * Strip credentials, hash, and query. Keep protocol + host + pathname only.
 */
export function sanitizeUrl(raw: string | undefined | null): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    url.username = ''
    url.password = ''
    url.hash = ''
    url.search = ''
    const cleaned = `${url.protocol}//${url.host}${url.pathname}`
    return truncateText(cleaned, COGNITION_LIMITS.maxUrlLength)
  } catch {
    // Non-parseable — keep a short masked fragment only
    return truncateText(maskSecretsInText(trimmed), Math.min(80, COGNITION_LIMITS.maxUrlLength))
  }
}

/**
 * Prefer workspace-relative paths. Absolute paths under home become basename.
 * Reject `..` escape attempts.
 */
export function sanitizePath(
  raw: string | undefined | null,
  workspaceDataRoot?: string,
): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  let value = raw.trim().replace(/\\/g, '/')
  if (!value) return undefined

  if (value.includes('\0')) {
    throw new CognitionSanitizeError('Path contains NUL')
  }

  // Reject obvious escape segments before normalize
  const parts = value.split(/[/\\]/).filter(Boolean)
  if (parts.includes('..')) {
    throw new CognitionSanitizeError('Path escape (..) is not allowed')
  }

  if (workspaceDataRoot) {
    const root = resolve(workspaceDataRoot)
    const candidate = isAbsolute(value) ? resolve(value) : resolve(root, value)
    const rel = relative(root, candidate)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      // Outside workspace data root — basename only
      return truncateText(basename(value), COGNITION_LIMITS.maxPathLength)
    }
    return truncateText(rel.split(sep).join('/'), COGNITION_LIMITS.maxPathLength)
  }

  if (isAbsolute(value)) {
    const home = homedir().replace(/\\/g, '/')
    const normalized = normalize(value).replace(/\\/g, '/')
    if (normalized === home || normalized.startsWith(`${home}/`)) {
      return truncateText(basename(normalized), COGNITION_LIMITS.maxPathLength)
    }
    return truncateText(basename(normalized), COGNITION_LIMITS.maxPathLength)
  }

  return truncateText(value, COGNITION_LIMITS.maxPathLength)
}

export function sanitizeStringList(
  values: string[] | undefined,
  maxItems = COGNITION_LIMITS.maxArrayItems,
  maxItem = COGNITION_LIMITS.maxItemLength,
): string[] | undefined {
  if (!values?.length) return undefined
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    if (typeof raw !== 'string') continue
    const cleaned = truncateText(maskSecretsInText(raw), maxItem)
    if (!cleaned) continue
    const key = cleaned.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
    if (out.length >= maxItems) break
  }
  return out.length ? out : undefined
}

function sanitizeEvidenceRefs(
  refs: CognitionEvidenceRef[] | undefined,
  workspaceDataRoot?: string,
): CognitionEvidenceRef[] | undefined {
  if (!refs?.length) return undefined
  const out: CognitionEvidenceRef[] = []
  for (const ref of refs.slice(0, COGNITION_LIMITS.maxEvidenceRefs)) {
    if (!ref || typeof ref.label !== 'string') continue
    const cleaned: CognitionEvidenceRef = {
      type: ref.type,
      label: truncateText(maskSecretsInText(ref.label), COGNITION_LIMITS.maxItemLength),
    }
    if (ref.id) cleaned.id = truncateText(String(ref.id), 120)
    if (ref.path) cleaned.path = sanitizePath(ref.path, workspaceDataRoot)
    if (ref.url) cleaned.url = sanitizeUrl(ref.url)
    if (cleaned.label) out.push(cleaned)
  }
  return out.length ? out : undefined
}

function sanitizeSubject(subject: CognitionSubjectRef | undefined): CognitionSubjectRef | undefined {
  if (!subject) return undefined
  if (!subject.kind || !subject.id) return undefined
  return {
    kind: subject.kind,
    id: truncateText(String(subject.id), 120),
  }
}

function scrubPayloadValue(key: string, value: unknown, workspaceDataRoot?: string, depth = 0): unknown {
  if (depth > 6) return undefined
  if (FORBIDDEN_PAYLOAD_KEYS.has(key) || SENSITIVE_KEY_RE.test(key)) {
    return undefined
  }
  if (value == null) return value
  if (typeof value === 'string') {
    if (/url$/i.test(key) || key === 'href' || key === 'uri') {
      return sanitizeUrl(value)
    }
    if (/path$/i.test(key) || key === 'file' || key === 'relatedFile') {
      return sanitizePath(value, workspaceDataRoot)
    }
    return truncateText(maskSecretsInText(value), COGNITION_LIMITS.maxItemLength)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) {
      return sanitizeStringList(value as string[])
    }
    return value
      .slice(0, COGNITION_LIMITS.maxArrayItems)
      .map((item, index) => scrubPayloadValue(String(index), item, workspaceDataRoot, depth + 1))
      .filter((item) => item !== undefined)
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    // Reject nested diff/patch blobs early
    if ('diff' in obj || 'patch' in obj || 'fullDiff' in obj) {
      throw new CognitionSanitizeError('Payload must not include git diff/patch content')
    }
    const out: Record<string, unknown> = {}
    for (const [childKey, childValue] of Object.entries(obj)) {
      const scrubbed = scrubPayloadValue(childKey, childValue, workspaceDataRoot, depth + 1)
      if (scrubbed !== undefined) out[childKey] = scrubbed
    }
    return out
  }
  return undefined
}

export interface SanitizeOptions {
  /** CA-managed workspace data root (not user project cwd). */
  workspaceDataRoot?: string
}

/**
 * Sanitize a caller-built event input. Throws CognitionSanitizeError on hard violations.
 */
export function sanitizeCognitionEventInput(
  input: CognitionEventInput,
  options: SanitizeOptions = {},
): CognitionEventInput {
  if (!input?.type || !input?.source || !input?.summary || input.payload == null) {
    throw new CognitionSanitizeError('Event is missing required fields')
  }
  if (!Number.isFinite(input.timestamp)) {
    throw new CognitionSanitizeError('Event timestamp must be a finite number')
  }

  // Reject obviously oversized inputs before scrubbing (truncation must not hide abuse).
  const rawBytes = Buffer.byteLength(JSON.stringify(input), 'utf8')
  if (rawBytes > COGNITION_LIMITS.maxEventBytes) {
    throw new CognitionSanitizeError(
      `Event exceeds max size of ${COGNITION_LIMITS.maxEventBytes} bytes`,
    )
  }

  const workspaceDataRoot = options.workspaceDataRoot
  const summary = truncateText(maskSecretsInText(input.summary), COGNITION_LIMITS.maxSummaryLength)
  if (!summary) throw new CognitionSanitizeError('Event summary is empty after sanitization')

  const payload = scrubPayloadValue('payload', input.payload, workspaceDataRoot, 0)
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CognitionSanitizeError('Event payload must be an object')
  }

  const sanitized: CognitionEventInput = {
    ...input,
    schemaVersion: COGNITION_SCHEMA_VERSION,
    summary,
    payload: payload as CognitionEventInput['payload'],
    subject: sanitizeSubject(input.subject),
    evidenceRefs: sanitizeEvidenceRefs(input.evidenceRefs, workspaceDataRoot),
  }

  if (sanitized.workspaceId) sanitized.workspaceId = truncateText(String(sanitized.workspaceId), 120)
  if (sanitized.projectId) sanitized.projectId = truncateText(String(sanitized.projectId), 120)
  if (sanitized.sessionId) sanitized.sessionId = truncateText(String(sanitized.sessionId), 120)
  if (sanitized.correlationId) sanitized.correlationId = truncateText(String(sanitized.correlationId), 160)
  if (sanitized.causationId) sanitized.causationId = truncateText(String(sanitized.causationId), 160)
  if (sanitized.idempotencyKey) sanitized.idempotencyKey = truncateText(String(sanitized.idempotencyKey), 200)

  const serialized = JSON.stringify(sanitized)
  if (Buffer.byteLength(serialized, 'utf8') > COGNITION_LIMITS.maxEventBytes) {
    throw new CognitionSanitizeError(
      `Event exceeds max size of ${COGNITION_LIMITS.maxEventBytes} bytes`,
    )
  }

  return sanitized
}
