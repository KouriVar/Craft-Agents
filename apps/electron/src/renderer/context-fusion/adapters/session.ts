/**
 * Session adapter — read SessionMeta from the session map.
 */

import type { SessionMeta } from '@/atoms/sessions'

export function adaptSession(
  sessions: Map<string, SessionMeta> | Iterable<SessionMeta> | null | undefined,
  sessionId: string,
): SessionMeta | null {
  const id = sessionId.trim()
  if (!id || !sessions) return null

  if (sessions instanceof Map) {
    return sessions.get(id) ?? null
  }

  for (const meta of sessions) {
    if (meta.id === id) return meta
  }
  return null
}
