/**
 * One-time privacy migrations (Phase D.1+).
 * Never overrides an intentional user deny that diverges from the old factory default.
 */

import type { PrivacyPolicy } from './types.ts'

export const PRIVACY_MIGRATION_D1_SESSION_BODY_ASK = 'd1-session-body-ask'

/** Exact Phase B factory session block (body was deny). */
export function isLegacyDefaultSessionBlock(session: PrivacyPolicy['sources']['session'] | undefined): boolean {
  if (!session) return false
  return (
    session.meta === 'allow'
    && session.body === 'deny'
    && session.attachments === 'deny'
    && session.archived === 'ask'
  )
}

/**
 * If stored session block matches the old factory default, upgrade body deny → ask.
 * Returns whether the policy object was mutated.
 */
export function migrateLegacySessionBodyDenyToAsk(policy: Partial<PrivacyPolicy>): boolean {
  const session = policy.sources?.session
  if (!isLegacyDefaultSessionBlock(session)) return false
  policy.sources = {
    ...(policy.sources as PrivacyPolicy['sources']),
    session: {
      ...session!,
      body: 'ask',
    },
  }
  policy.updatedAt = Date.now()
  return true
}
