export const COWART_FOLLOW_UP_MAX_LENGTH = 100_000

export interface CowartFollowUpRequest {
  prompt: string
}

export function normalizeCowartFollowUpRequest(value: unknown): CowartFollowUpRequest | null {
  if (!value || typeof value !== 'object') return null
  const prompt = typeof (value as { prompt?: unknown }).prompt === 'string'
    ? (value as { prompt: string }).prompt.trim()
    : ''
  if (!prompt || prompt.length > COWART_FOLLOW_UP_MAX_LENGTH) return null
  return { prompt }
}

export function isTrustedCowartRuntimeUrl(
  rawUrl: string,
  runtimeId: string | null,
  port: string,
): boolean {
  if (!runtimeId) return false
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'http:'
      && url.hostname === '127.0.0.1'
      && url.port === port
      && url.searchParams.get('runtime') === runtimeId
  } catch {
    return false
  }
}
