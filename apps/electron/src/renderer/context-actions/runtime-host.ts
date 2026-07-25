/**
 * Runtime host for Context Action handlers that need React-bound capabilities
 * (sendMessage, library consent dialog). Bound by ContextSuggestionBadge while mounted
 * (v0.16.9+; previously ContextActionsBadge).
 */

export interface ContextActionRuntimeHost {
  sendMessage: (sessionId: string, message: string) => void
  startLibraryFromSession: (sessionId: string) => void | Promise<void>
}

let host: ContextActionRuntimeHost | null = null

export function bindContextActionHost(next: ContextActionRuntimeHost | null): void {
  host = next
}

export function getContextActionHost(): ContextActionRuntimeHost | null {
  return host
}

export function requireContextActionHost(): ContextActionRuntimeHost {
  if (!host) {
    throw new Error('ContextAction runtime host is not bound')
  }
  return host
}
