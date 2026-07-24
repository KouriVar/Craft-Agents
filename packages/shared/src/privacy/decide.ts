/**
 * Privacy decide() — pure function over ResolvedPrivacyPolicy + PolicyInput.
 */

import type { CognitionEventSource } from '../cognition/types.ts'
import type {
  Permission3,
  PolicyDecision,
  PolicyInput,
  PrivacySourceAspect,
  ResolvedPrivacyPolicy,
} from './types.ts'

function deny(code: PolicyDecision['code'], reason: string, permission?: Permission3): PolicyDecision {
  return { decision: 'deny', code, reason, permission }
}

function allow(permission?: Permission3): PolicyDecision {
  return { decision: 'allow', code: 'allow', reason: 'allowed', permission }
}

function ask(permission: Permission3 = 'ask'): PolicyDecision {
  return { decision: 'ask', code: 'ask', reason: 'requires_user_confirmation', permission }
}

/**
 * Map cognition / policy source + aspect → Permission3.
 * Unmapped / never-collect aspects → deny.
 */
export function resolveSourcePermission(
  policy: ResolvedPrivacyPolicy,
  source: PolicyInput['source'] | undefined,
  aspect: PrivacySourceAspect | undefined,
): Permission3 {
  if (!source || source === 'unknown') return 'deny'

  switch (source) {
    case 'session': {
      const a = aspect ?? 'meta'
      if (a === 'body') return policy.sources.session.body
      if (a === 'attachments') return policy.sources.session.attachments
      if (a === 'archived') return policy.sources.session.archived
      return policy.sources.session.meta
    }
    case 'task':
      // Task/checkpoint long-running session task metadata
      return policy.sources.session.meta
    case 'git': {
      const a = aspect ?? 'statusMeta'
      if (a === 'diffContent') return policy.sources.git.diffContent
      if (a === 'mutate') return policy.sources.git.mutate
      return policy.sources.git.statusMeta
    }
    case 'browser': {
      const a = aspect ?? 'urlTitle'
      if (a === 'pageContent') return policy.sources.browser.pageContent
      if (a === 'history') return policy.sources.browser.history
      return policy.sources.browser.urlTitle
    }
    case 'automation':
      return policy.sources.automation
    case 'messaging': {
      // Phase B technical debt: messaging events cannot yet distinguish WeChat vs Lark.
      // Until providers emit aspect=wechat|lark, map undifferentiated messaging → fail-closed
      // (deny if either platform is deny). Never default-allow.
      // Prefer deny if either platform is deny (conservative).
      const a = aspect
      if (a === 'wechat') return policy.sources.messaging.wechat
      if (a === 'lark') return policy.sources.messaging.lark
      if (
        policy.sources.messaging.wechat === 'deny' ||
        policy.sources.messaging.lark === 'deny'
      ) {
        return 'deny'
      }
      if (
        policy.sources.messaging.wechat === 'ask' ||
        policy.sources.messaging.lark === 'ask'
      ) {
        return 'ask'
      }
      return 'allow'
    }
    case 'system':
      // Safe system metadata only — allowed when context awareness is on (caller still checks master).
      return 'allow'
    case 'files': {
      const a = aspect ?? 'metadata'
      if (a === 'content') return policy.sources.files.content
      return policy.sources.files.metadata
    }
    case 'mcp':
      return policy.sources.mcpPlugins
    case 'project_memory':
      return policy.sources.projectMemory
    case 'library':
      return policy.sources.library.generateWithModel
    default:
      return 'deny'
  }
}

/** Default aspect for a cognition event source when ingesting. */
export function defaultAspectForEventSource(
  source: CognitionEventSource,
): PrivacySourceAspect {
  switch (source) {
    case 'session':
    case 'task':
      return 'meta'
    case 'git':
      return 'statusMeta'
    case 'browser':
      return 'urlTitle'
    case 'automation':
    case 'messaging':
    case 'system':
    default:
      return 'default'
  }
}

export function decide(input: PolicyInput, policy: ResolvedPrivacyPolicy): PolicyDecision {
  // Local-only / manual chat / export paths that must remain usable
  if (input.feature === 'manual_chat') {
    return allow()
  }
  if (input.feature === 'library_user_export' && input.mode === 'local') {
    return allow()
  }
  if (input.feature === 'privacy_cleanup' && input.mode === 'local') {
    return allow()
  }

  if (policy.effectivePrivacyModeActive) {
    // Interactive library generate is reserved for future; Phase B still denies under privacy mode
    // unless explicitly local. Keep model expressive for later.
    if (input.mode === 'local' && input.feature === 'library_user_export') {
      return allow()
    }
    return deny('blocked_by_privacy_mode', 'privacy_mode_active')
  }

  if (!policy.contextAwarenessEnabled) {
    // Master off blocks background cognition; interactive/local library reserved for future.
    if (input.mode === 'background' || input.feature.startsWith('cognition_')) {
      return deny('blocked_by_master_off', 'context_awareness_disabled')
    }
    if (input.feature === 'today_context') {
      return deny('blocked_by_master_off', 'context_awareness_disabled')
    }
    // interactive library_generate left as source check below (still typically ask/deny)
  }

  if (input.feature === 'today_context' && !policy.today.useContext) {
    return deny('blocked_by_today_use_context_off', 'today_use_context_disabled')
  }

  if (input.source === 'unknown') {
    return deny('blocked_by_unknown_source', 'unknown_source_fail_closed')
  }

  // Features that don't need a source (e.g. cognition_process master already checked)
  if (!input.source && (input.feature === 'cognition_process' || input.feature === 'cognition_read')) {
    return allow()
  }

  if (!input.source) {
    return allow()
  }

  const permission = resolveSourcePermission(policy, input.source, input.aspect)
  if (permission === 'deny') {
    return deny('blocked_by_source', `source_${input.source}_denied`, permission)
  }
  if (permission === 'ask') {
    if (input.mode === 'background') {
      return deny('blocked_ask_as_deny', 'ask_treated_as_deny_for_background', permission)
    }
    if (input.mode === 'interactive') {
      return ask(permission)
    }
    // local + ask → allow local metadata ops without sending to model
    return allow(permission)
  }
  return allow(permission)
}

/**
 * Whether a derived cognition entity is readable on product paths given its sourceKinds.
 * Mixed sources: any denied kind → hide entire entity (conservative).
 */
export function isEntityReadableByPolicy(
  entity: { sourceKinds?: Array<string | CognitionEventSource> },
  policy: ResolvedPrivacyPolicy,
  options: { forToday?: boolean } = {},
): boolean {
  if (policy.effectivePrivacyModeActive) return false
  if (!policy.contextAwarenessEnabled) return false
  if (options.forToday && !policy.today.useContext) return false

  const kinds = entity.sourceKinds?.length ? entity.sourceKinds : ['unknown']
  for (const kind of kinds) {
    if (kind === 'unknown') return false
    const decision = decide(
      {
        feature: options.forToday ? 'today_context' : 'cognition_read',
        source: kind as PolicyInput['source'],
        aspect: defaultAspectForEventSource(
          kind === 'session' || kind === 'task' || kind === 'git' || kind === 'browser' ||
          kind === 'automation' || kind === 'messaging' || kind === 'system'
            ? kind
            : 'system',
        ),
        mode: 'background',
      },
      policy,
    )
    if (decision.decision !== 'allow') return false
  }
  return true
}
