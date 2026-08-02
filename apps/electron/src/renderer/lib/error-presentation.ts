import type { Message } from '../../shared/types'

/**
 * A provider can return a JSON envelope as the plain error message. Showing
 * that envelope verbatim makes the conversation feel broken and hides the
 * actionable part of the failure. Keep the raw payload for technical details,
 * but expose a short, stable message for the conversation surface.
 */
export interface ErrorPresentation {
  title?: string
  content: string
  details: string[]
  original?: string
}

interface ProviderErrorEnvelope {
  message?: unknown
  type?: unknown
  code?: unknown
  param?: unknown
  error?: unknown
}

function parseEnvelope(raw: string): ProviderErrorEnvelope | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null

  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object') return null

    if ('error' in parsed) {
      const nested = (parsed as { error?: unknown }).error
      if (typeof nested === 'string') return { message: nested }
      if (nested && typeof nested === 'object') return nested as ProviderErrorEnvelope
    }

    return parsed as ProviderErrorEnvelope
  } catch {
    return null
  }
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Return a user-facing error while preserving the original payload. */
export function getErrorPresentation(message: Pick<Message, 'content' | 'errorTitle' | 'errorDetails' | 'errorOriginal'>): ErrorPresentation {
  const rawContent = message.content?.trim() || 'An error occurred'
  const envelope = parseEnvelope(rawContent)
  const providerMessage = asText(envelope?.message)
  const providerType = asText(envelope?.type)
  const providerCode = asText(envelope?.code)
  const isStructured = Boolean(envelope && (providerMessage || providerType || providerCode))

  if (!isStructured) {
    return {
      title: message.errorTitle,
      content: rawContent,
      details: message.errorDetails ?? [],
      original: message.errorOriginal,
    }
  }

  const details = [...(message.errorDetails ?? [])]
  if (providerType && !details.includes(`Type: ${providerType}`)) details.push(`Type: ${providerType}`)
  if (providerCode && !details.includes(`Code: ${providerCode}`)) details.push(`Code: ${providerCode}`)
  if (!details.some((detail) => detail.startsWith('Raw error:'))) {
    details.push(`Raw error: ${rawContent.slice(0, 400)}${rawContent.length > 400 ? '...' : ''}`)
  }

  return {
    title: message.errorTitle,
    content: providerMessage ?? rawContent,
    details,
    original: message.errorOriginal ?? rawContent,
  }
}
