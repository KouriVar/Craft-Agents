/**
 * Browser page importance filter — reduce noise before Ledger append.
 */

export interface BrowserPageFilterInput {
  url: string
  title?: string
  boundSessionId?: string | null
  ownerType?: 'session' | 'manual'
  agentControlActive?: boolean
  workspaceId?: string | null
}

export interface BrowserPageParts {
  hostname: string
  pathname: string
  sanitizedUrl: string
}

export function parseBrowserPageParts(url: string): BrowserPageParts | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const hostname = parsed.hostname.toLowerCase()
    const pathname = parsed.pathname || '/'
    return {
      hostname,
      pathname,
      sanitizedUrl: `${parsed.protocol}//${parsed.host}${pathname}`,
    }
  } catch {
    return null
  }
}

export function isNoiseBrowserUrl(url: string): boolean {
  const lower = url.toLowerCase()
  if (!lower || lower === 'about:blank' || lower.startsWith('about:')) return true
  if (lower.startsWith('chrome:') || lower.startsWith('chrome-extension:')) return true
  if (lower.startsWith('devtools:')) return true
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'duckduckgo.com' && (parsed.pathname === '/' || parsed.pathname === '')) {
      return parsed.searchParams.has('q')
    }
  } catch {
    return true
  }
  return false
}

/**
 * Important pages only: session/agent context, or workspace-scoped research pages.
 */
export function shouldEmitBrowserPageOpened(input: BrowserPageFilterInput): boolean {
  if (isNoiseBrowserUrl(input.url)) return false
  if (!parseBrowserPageParts(input.url)) return false
  if (input.boundSessionId || input.ownerType === 'session' || input.agentControlActive) return true
  // Manual browse in a workspace: still allow https pages with a real title (research signal).
  if (input.workspaceId && (input.title?.trim().length ?? 0) >= 4) return true
  return false
}
