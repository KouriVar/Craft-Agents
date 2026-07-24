/**
 * Privacy / context-awareness policy types (v0.16.0 Phase B).
 *
 * Priority when resolving: privacyMode > workspace override > user prefs > defaults.
 */

import type { CognitionEventSource } from '../cognition/types.ts'

export const PRIVACY_POLICY_SCHEMA_VERSION = 1 as const
export const PRIVACY_ACCESS_LOG_SCHEMA_VERSION = 1 as const

export type Permission3 = 'deny' | 'ask' | 'allow'

export type PrivacyPolicyMode = 'background' | 'interactive' | 'local'

/** Aspect within a source family (maps PolicyInput.aspect). */
export type PrivacySourceAspect =
  | 'meta'
  | 'body'
  | 'attachments'
  | 'archived'
  | 'urlTitle'
  | 'pageContent'
  | 'history'
  | 'statusMeta'
  | 'diffContent'
  | 'mutate'
  | 'content'
  | 'metadata'
  | 'wechat'
  | 'lark'
  | 'default'

export interface PrivacyModeState {
  active: boolean
  activatedAt?: number
  /** Reserved for timed resume; unused in Phase B UI. */
  resumeAt?: number | null
  pauseAutomations: boolean
  persistAcrossRestart: boolean
}

export interface SessionSourcePermissions {
  meta: Permission3
  body: Permission3
  attachments: Permission3
  archived: Permission3
}

export interface BrowserSourcePermissions {
  urlTitle: Permission3
  pageContent: Permission3
  history: Permission3
}

export interface GitSourcePermissions {
  statusMeta: Permission3
  diffContent: Permission3
  mutate: Permission3
}

export interface FilesSourcePermissions {
  metadata: Permission3
  content: Permission3
  /** Authorized directory roots (empty = none authorized). */
  roots: string[]
}

export interface MessagingSourcePermissions {
  wechat: Permission3
  lark: Permission3
  allowlist?: string[]
}

export interface LibrarySourcePermissions {
  generateWithModel: Permission3
  autoDetectSync: boolean
}

export interface PrivacySources {
  session: SessionSourcePermissions
  browser: BrowserSourcePermissions
  git: GitSourcePermissions
  files: FilesSourcePermissions
  messaging: MessagingSourcePermissions
  automation: Permission3
  mcpPlugins: Permission3
  projectMemory: Permission3
  library: LibrarySourcePermissions
}

export interface PrivacyRetention {
  accessLogDays: number
  accessLogMaxEntries: number
  cognitionDays?: number | null
}

export interface PrivacyPolicy {
  schemaVersion: typeof PRIVACY_POLICY_SCHEMA_VERSION | number
  contextAwarenessEnabled: boolean
  today: {
    useContext: boolean
  }
  privacyMode: PrivacyModeState
  sources: PrivacySources
  retention: PrivacyRetention
  updatedAt: number
}

/** Immutable snapshot after merge; includes provenance of resolution. */
export interface ResolvedPrivacyPolicy extends PrivacyPolicy {
  resolvedFrom: Array<'privacy_mode' | 'workspace' | 'user' | 'default'>
  effectivePrivacyModeActive: boolean
  policyVersion: string
}

export type PolicyFeature =
  | 'cognition_ingest'
  | 'cognition_process'
  | 'cognition_read'
  | 'today_context'
  | 'manual_chat'
  | 'library_generate'
  | 'library_user_export'
  | 'privacy_cleanup'
  | string

export interface PolicyInput {
  feature: PolicyFeature
  /** Cognition event source family when applicable. */
  source?: CognitionEventSource | 'unknown' | 'files' | 'mcp' | 'project_memory' | 'library'
  aspect?: PrivacySourceAspect
  mode: PrivacyPolicyMode
  workspaceId?: string
  sessionId?: string
  /** Human-readable purpose for access log. */
  purpose?: string
  scope?: string
  sentToModel?: boolean
  connectionId?: string
  model?: string
}

export type PolicyDecisionCode =
  | 'allow'
  | 'deny'
  | 'ask'
  | 'blocked_by_privacy_mode'
  | 'blocked_by_master_off'
  | 'blocked_by_today_use_context_off'
  | 'blocked_by_source'
  | 'blocked_by_unknown_source'
  | 'blocked_ask_as_deny'

export interface PolicyDecision {
  decision: 'allow' | 'deny' | 'ask'
  code: PolicyDecisionCode
  reason: string
  /** Effective permission level consulted (if any). */
  permission?: Permission3
}

export interface PrivacyAccessLogEntry {
  schemaVersion: typeof PRIVACY_ACCESS_LOG_SCHEMA_VERSION | number
  id: string
  at: number
  feature: string
  sources: string[]
  scope: string
  purpose: string
  sentToModel: boolean
  connectionId?: string
  model?: string
  decision: 'allow' | 'deny' | 'ask' | 'blocked_by_privacy_mode'
  code: PolicyDecisionCode
  workspaceId: string
  policyVersion: string
}

/** Injected into CognitionEventStore — no preferences I/O inside the store. */
export interface PrivacyPolicyGate {
  decide(input: PolicyInput): PolicyDecision
}

export interface PrivacyClearTarget {
  cognition?: boolean
  accessLog?: boolean
  exploreBriefCache?: boolean
  browserCognitionEvents?: boolean
}

export interface PrivacyStorageUsage {
  workspaceId: string
  cognitionBytes: number
  accessLogBytes: number
  privacyDirBytes: number
  totalBytes: number
}

/** Fields that are never allow-able into cognition (hard-coded). */
export const PRIVACY_NEVER_COLLECT = [
  'cookie',
  'token',
  'password',
  'form_sensitive',
] as const

export type PrivacyNeverCollectKind = (typeof PRIVACY_NEVER_COLLECT)[number]
