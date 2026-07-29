/**
 * Library (资源库) types — v0.16 Phase D / D.2.
 * Independent of packages/shared/src/resources (ResourceBundle).
 */

export type LibraryDocumentStatus = 'active' | 'archived' | 'trashed'
export type LibrarySyncStatus = 'clean' | 'pending' | 'conflict'

export type LibraryDocumentTemplateId =
  | 'general'
  | 'product'
  | 'technical'
  | 'decision'
  | 'meeting'
  | 'research'
  | 'release'

export type LibraryVersionOp = 'create' | 'user_save' | 'restore' | 'ai_edit'

/** User-selected generation mode before create-from-session. */
export type LibraryGenerateMode = 'ai' | 'preserve'

export type LibraryExportFormat = 'markdown' | 'html' | 'pdf'

export interface LibraryManifest {
  schemaVersion: 1
  migrationsApplied: string[]
  updatedAt: number
}

export interface DocumentSessionLink {
  schemaVersion: 1
  id: string
  documentId: string
  sessionId: string
  linkedAt: number
  lastSyncedMessageId?: string
  lastSyncedAt?: number
  /** Reserved for v0.16.x — always 0 in v0.16.0 */
  pendingCount: number
  orphaned?: boolean
  /** Snapshot of session title at link time — used for search without live session lookup */
  sessionTitleSnapshot?: string
}

export interface DocumentSourceReference {
  schemaVersion: 1
  documentId: string
  sectionId: string
  sessionId: string
  messageIds: string[]
  headingSnapshot?: string
  orphaned?: boolean
  /** When true, this ref represents the whole document (not a section). */
  documentLevel?: boolean
}

/** Structured session content block extracted before AI / preserve assembly. */
export interface SessionContentBlock {
  id: string
  messageId: string
  role: 'user' | 'assistant' | 'system'
  type:
    | 'heading'
    | 'paragraph'
    | 'list'
    | 'table'
    | 'blockquote'
    | 'code'
    | 'mermaid'
    | 'image'
    | 'attachment'
    | 'divider'
  markdown: string
  order: number
  preserve: boolean
}

export interface GeneratedDocumentSection {
  heading: string
  bodyMarkdown: string
  sourceMessageIds: string[]
  preservedBlockIds?: string[]
}

/** Preferred structured AI output — CA validates IDs and assembles Markdown. */
export interface GeneratedDocumentResult {
  title: string
  summary?: string
  sections: GeneratedDocumentSection[]
}

export interface DocumentGenerationMeta {
  mode: 'ai' | 'excerpt_fallback' | 'preserve'
  modelId?: string
  generatedAt: number
  promptVersion: string
  sourceMessageCount: number
  totalMessageCount: number
  truncated: boolean
  qualityStatus: 'passed' | 'retried' | 'fallback'
}

export interface DocumentMeta {
  schemaVersion: 1
  id: string
  kind: 'document'
  title: string
  workspaceId: string
  projectId?: string
  createdAt: number
  updatedAt: number
  archivedAt?: number
  /** Set when the document is in the recoverable 30-day trash. */
  trashedAt?: number
  status: LibraryDocumentStatus
  bodyPath: string
  templateId?: LibraryDocumentTemplateId
  /** Reserved — always 'clean' in v0.16.0 */
  syncStatus: LibrarySyncStatus
  sessionLinks: DocumentSessionLink[]
  sourceReferences: DocumentSourceReference[]
  /** Present when created from a session (Phase D.2). */
  generation?: DocumentGenerationMeta
}

export interface DocumentVersionMeta {
  schemaVersion: 1
  id: string
  documentId: string
  createdAt: number
  op: LibraryVersionOp
  summary: string
  sourceSessionId?: string
  messageRange?: {
    fromId?: string
    toId?: string
  }
  snapshotPath: string
}

export interface LibraryIndexEntry {
  id: string
  kind: 'document'
  title: string
  status: LibraryDocumentStatus
  updatedAt: number
  createdAt: number
  projectId?: string
  sessionLinkCount: number
  templateId?: LibraryDocumentTemplateId
  syncStatus: LibrarySyncStatus
}

export interface LibraryResourcesIndex {
  schemaVersion: 1
  updatedAt: number
  items: LibraryIndexEntry[]
}

export interface LibraryListQuery {
  workspaceId: string
  filter?: 'all' | 'recent' | 'archived' | 'trash'
  search?: string
  /** Exact project-id filter. Omit/empty → no project filtering (back-compat). */
  projectId?: string
  limit?: number
  offset?: number
}

export interface LibraryDocumentDto {
  meta: DocumentMeta
  body: string
}

export interface LibraryCreateBlankRequest {
  workspaceId: string
  title?: string
  projectId?: string
}

export interface LibrarySessionStats {
  totalMessages: number
  usedMessages: number
  estimatedChars: number
  truncated: boolean
  preserveBlockCount: number
}

export interface LibraryCreateFromSessionRequest {
  workspaceId: string
  sessionId: string
  templateId?: LibraryDocumentTemplateId
  /** Optional message id range; omit = entire session (subject to long-session policy) */
  messageIds?: string[]
  /**
   * @deprecated Ignored by server — use consentToken. Kept for type compatibility.
   */
  consentGranted?: boolean
  /** One-time server-issued consent token (ask path). */
  consentToken?: string
  /** UI language hint for model output */
  locale?: string
  /** Phase D.2: AI organize vs verbatim preserve. Default 'ai'. */
  generateMode?: LibraryGenerateMode
}

export interface LibraryPrivacyGateResult {
  decision: 'allow' | 'ask' | 'deny'
  code: string
  reason: string
  blockedBy?: Array<{ source: string; aspect?: string; permission: string }>
}

export interface LibraryCreateFromSessionResponse {
  ok: boolean
  document?: LibraryDocumentDto
  privacy?: LibraryPrivacyGateResult
  error?: string
  /** Issued when privacy decision is ask and no valid token was presented. */
  consentToken?: string
  /** Session too long and range not selected — do not silently truncate. */
  needsMessageRange?: boolean
  sessionStats?: LibrarySessionStats
  /** How the document body was produced */
  generation?: {
    mode: 'ai' | 'excerpt_fallback' | 'preserve'
    model?: string
    warning?: string
    errorCode?: string
    qualityStatus?: DocumentGenerationMeta['qualityStatus']
  }
}

export interface LibraryUpdateRequest {
  workspaceId: string
  documentId: string
  title?: string
  body?: string
  projectId?: string | null
  /** When true, also create a user_save version snapshot */
  createVersion?: boolean
  versionSummary?: string
}

export interface LibraryExportRequest {
  workspaceId: string
  documentId: string
  format?: LibraryExportFormat
  theme?: 'light' | 'dark'
  /** Default false — strip craft-section comments for user export */
  keepSourceMarkers?: boolean
  /** Absolute path chosen by client save dialog; optional — returns content if omitted */
  targetPath?: string
}

export interface LibraryExportResult {
  format?: LibraryExportFormat
  markdown?: string
  html?: string
  /** PDF bytes as base64 when format=pdf and no targetPath write */
  pdfBase64?: string
  filePath?: string
  canceled?: boolean
  error?: string
}

export const DOCUMENT_LEVEL_SECTION_ID = 'doc_full'

export const CRAFT_SECTION_COMMENT_RE = /<!--\s*craft-section:([A-Za-z0-9_-]+)\s*-->/g

export function makeSectionAnchor(sectionId: string): string {
  return `<!-- craft-section:${sectionId} -->`
}
