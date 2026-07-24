/**
 * Field-level deep merge for privacy policies + resolution priority.
 *
 * Priority: privacyMode (runtime) > workspace > user > default
 */

import { createDefaultPrivacyPolicy } from './defaults.ts'
import type {
  PrivacyModeState,
  PrivacyPolicy,
  ResolvedPrivacyPolicy,
} from './types.ts'
import { PRIVACY_POLICY_SCHEMA_VERSION } from './types.ts'

/** Deep partial for nested privacy policy patches (user / workspace overrides). */
export type PrivacyPolicyPatch = {
  [K in keyof PrivacyPolicy]?: PrivacyPolicy[K] extends readonly (infer _)[]
    ? PrivacyPolicy[K]
    : PrivacyPolicy[K] extends object
      ? { [P in keyof PrivacyPolicy[K]]?: PrivacyPolicy[K][P] extends object
          ? Partial<PrivacyPolicy[K][P]>
          : PrivacyPolicy[K][P]
        }
      : PrivacyPolicy[K]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Deep-merge `override` onto `base`. Arrays (e.g. roots) are replaced when present.
 * `undefined` fields in override are skipped.
 */
export function deepMergePrivacyPartial<T extends Record<string, unknown>>(
  base: T,
  override: Partial<T> | Record<string, unknown> | null | undefined,
): T {
  if (!override || typeof override !== 'object') return { ...base }
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    const prev = out[key]
    if (Array.isArray(value)) {
      out[key] = [...value]
    } else if (isPlainObject(value) && isPlainObject(prev)) {
      out[key] = deepMergePrivacyPartial(prev, value)
    } else {
      out[key] = value
    }
  }
  return out as T
}

export function normalizePrivacyPolicy(raw: Partial<PrivacyPolicy> | null | undefined): PrivacyPolicy {
  const defaults = createDefaultPrivacyPolicy()
  if (!raw || typeof raw !== 'object') return defaults
  const merged = deepMergePrivacyPartial(
    defaults as unknown as Record<string, unknown>,
    raw as unknown as Record<string, unknown>,
  ) as unknown as PrivacyPolicy
  merged.schemaVersion =
    typeof raw.schemaVersion === 'number' ? raw.schemaVersion : PRIVACY_POLICY_SCHEMA_VERSION
  if (!merged.privacyMode) merged.privacyMode = defaults.privacyMode
  if (!merged.today) merged.today = defaults.today
  if (!merged.sources) merged.sources = defaults.sources
  if (!merged.retention) merged.retention = defaults.retention
  return merged
}

export interface ResolvePrivacyPolicyInput {
  user?: PrivacyPolicyPatch | null
  workspace?: PrivacyPolicyPatch | null
  /** Runtime privacy mode overlay (may differ from persisted user.privacyMode). */
  runtimePrivacyMode?: PrivacyModeState | null
  now?: number
}

export function computePolicyVersion(policy: PrivacyPolicy, effectivePrivacyModeActive: boolean): string {
  return `v${policy.schemaVersion}:${policy.updatedAt}:${effectivePrivacyModeActive ? 'pm1' : 'pm0'}:${policy.contextAwarenessEnabled ? 'a1' : 'a0'}`
}

/**
 * Merge defaults ← user ← workspace, then apply runtime privacy mode flag.
 * Does not mutate inputs.
 */
export function resolvePrivacyPolicy(input: ResolvePrivacyPolicyInput): ResolvedPrivacyPolicy {
  const resolvedFrom: ResolvedPrivacyPolicy['resolvedFrom'] = ['default']
  let policy = createDefaultPrivacyPolicy(input.now)

  if (input.user && Object.keys(input.user).length > 0) {
    policy = normalizePrivacyPolicy(
      deepMergePrivacyPartial(
        policy as unknown as Record<string, unknown>,
        input.user as unknown as Record<string, unknown>,
      ) as unknown as PrivacyPolicy,
    )
    resolvedFrom.push('user')
  }

  if (input.workspace && Object.keys(input.workspace).length > 0) {
    policy = normalizePrivacyPolicy(
      deepMergePrivacyPartial(
        policy as unknown as Record<string, unknown>,
        input.workspace as unknown as Record<string, unknown>,
      ) as unknown as PrivacyPolicy,
    )
    resolvedFrom.push('workspace')
  }

  const runtimeMode = input.runtimePrivacyMode
  let effectivePrivacyModeActive = Boolean(policy.privacyMode?.active)
  if (runtimeMode) {
    policy = {
      ...policy,
      privacyMode: {
        ...policy.privacyMode,
        ...runtimeMode,
      },
    }
    effectivePrivacyModeActive = Boolean(runtimeMode.active)
    if (runtimeMode.active) resolvedFrom.push('privacy_mode')
  } else if (policy.privacyMode?.active) {
    resolvedFrom.push('privacy_mode')
  }

  return {
    ...policy,
    resolvedFrom,
    effectivePrivacyModeActive,
    policyVersion: computePolicyVersion(policy, effectivePrivacyModeActive),
  }
}
