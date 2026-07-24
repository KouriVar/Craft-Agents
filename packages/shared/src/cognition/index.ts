/**
 * Cognition Layer public exports (Event Ledger + Observation + Loop + Reflection + Guidance).
 */

export * from './types.ts'
export {
  sanitizeCognitionEventInput,
  sanitizeUrl,
  sanitizePath,
  sanitizeStringList,
  maskSecretsInText,
  truncateText,
  CognitionSanitizeError,
  CognitionPrivacyDeniedError,
} from './events/event-sanitizer.ts'
export {
  CognitionEventStore,
  generateCognitionEventId,
  findOpenSessionStarts,
} from './events/event-store.ts'
export type { CognitionEventStoreOptions } from './events/event-store.ts'
export {
  sessionTaskSubject,
  newCognitionTurnId,
  newCorrelationId,
  buildSessionCreatedEvent,
  buildSessionStartedEvent,
  buildSessionStoppedEvent,
  buildSessionResumedEvent,
  buildSessionModelChangedEvent,
  buildCheckpointCreatedEvent,
  buildTaskDetailsUpdatedEvent,
  buildGitBranchSwitchedEvent,
  buildGitCommittedEvent,
  buildGitPushedEvent,
  buildGitSyncedEvent,
  buildGitPrCreatedEvent,
  buildGitFailedEvent,
  buildGitChangesPresentEvent,
  buildBrowserPageOpenedEvent,
  buildBrowserTabAttachedEvent,
  buildBrowserBookmarkCreatedEvent,
  buildBrowserPageClosedEvent,
  shouldEmitBrowserPageOpened,
  isNoiseBrowserUrl,
  parseBrowserPageParts,
  buildReservedAutomationEventStub,
  mapProcessingReasonToStopReason,
} from './events/event-builder.ts'
export { buildEvidenceFingerprint, normalizeEvidenceTopic } from './evidence-fingerprint.ts'
export {
  COGNITION_DIR,
  COGNITION_MANIFEST_FILE,
  COGNITION_EVENTS_FILE,
  COGNITION_OBSERVATIONS_FILE,
  COGNITION_LOOPS_FILE,
  COGNITION_REFLECTIONS_FILE,
  COGNITION_GUIDANCE_FILE,
  getCognitionDir,
  getCognitionManifestPath,
  getCognitionEventsPath,
  getCognitionObservationsPath,
  getCognitionLoopsPath,
  getCognitionReflectionsPath,
  getCognitionGuidancePath,
  ensureCognitionDir,
  createEmptyManifest,
  loadManifest,
  saveManifest,
  rebuildManifestFromEvents,
} from './storage/cognition-storage.ts'
export { ensureCognitionMigrations } from './storage/migrations.ts'
export { backfillSourceKindsLimited } from './provenance-backfill.ts'
export type { BackfillSourceKindsOptions } from './provenance-backfill.ts'

export * from './observations/index.ts'
export * from './loops/index.ts'
export * from './reflections/index.ts'
export * from './guidance/index.ts'
