/**
 * Privacy / context-awareness public exports.
 */

export * from './types.ts'
export {
  createDefaultPrivacyPolicy,
  createDefaultPrivacyMode,
} from './defaults.ts'
export {
  deepMergePrivacyPartial,
  normalizePrivacyPolicy,
  resolvePrivacyPolicy,
  computePolicyVersion,
} from './policy-resolver.ts'
export type { ResolvePrivacyPolicyInput, PrivacyPolicyPatch } from './policy-resolver.ts'
export {
  PRIVACY_MIGRATION_D1_SESSION_BODY_ASK,
  isLegacyDefaultSessionBlock,
  migrateLegacySessionBodyDenyToAsk,
} from './migrations.ts'
export {
  decide,
  resolveSourcePermission,
  defaultAspectForEventSource,
  isEntityReadableByPolicy,
} from './decide.ts'
export {
  createAccessLogEntry,
  accessLogThrottleKey,
  pruneAccessLogEntries,
  shouldRetainAccessLogEntry,
  accessLogLooksSafe,
  DEFAULT_ACCESS_LOG_MAX_ENTRIES,
  DEFAULT_ACCESS_LOG_RETENTION_MS,
} from './access-log.ts'
export {
  provenanceFromEvent,
  mergeProvenance,
  normalizeProvenanceFields,
  uniqueStrings,
  uniqueSourceKinds,
} from './provenance.ts'
export type { CognitionProvenanceFields, CognitionSourceKind } from './provenance.ts'
export {
  PRIVACY_DIR,
  PRIVACY_POLICY_FILE,
  PRIVACY_ACCESS_LOG_FILE,
  PRIVACY_MODE_FILE,
  getPrivacyDir,
  ensurePrivacyDir,
  getPrivacyPolicyPath,
  getPrivacyAccessLogPath,
  getPrivacyModePath,
} from './storage.ts'
