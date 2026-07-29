/**
 * v0.20 Knowledge vocabulary.  Markdown deliberately aliases the established
 * document schema so source-session links, versions and the recycle bin survive
 * the Library -> Knowledge migration unchanged.
 */
import type {
  DocumentMeta,
  LibraryDocumentDto,
  LibraryIndexEntry,
  LibraryDocumentStatus,
} from '../library/types.ts'

export type KnowledgeKind = 'markdown' | 'file' | 'mindmap'
export type KnowledgeScope = 'global' | 'project'
export type ExtractionStatus = 'pending' | 'extracted' | 'ocr_required' | 'unsupported' | 'failed'

export type KnowledgeMarkdownMeta = DocumentMeta & { kind: 'document' }
export type KnowledgeMarkdownDto = LibraryDocumentDto
export type KnowledgeIndexEntry = LibraryIndexEntry
export type KnowledgeStatus = LibraryDocumentStatus

/** Ordinary files retain their bytes separately from any derived text. */
export interface KnowledgeFileMeta {
  schemaVersion: 1
  id: string
  kind: 'file'
  workspaceId: string
  title: string
  projectId?: string
  scope: KnowledgeScope
  mimeType: string
  originalFilename: string
  originalPath: string
  extractedTextPath?: string
  extraction: { status: ExtractionStatus; updatedAt: number; error?: string }
  createdAt: number
  updatedAt: number
  status: KnowledgeStatus
  trashedAt?: number
  sourceSessionIds: string[]
  referencedBySessionIds: string[]
}

/** Kept deliberately separate from Markdown and file metadata. */
export interface MindMapDocument {
  schemaVersion: 1
  kind: 'mindmap'
  id: string
  workspaceId: string
  title: string
  projectId?: string
  scope: KnowledgeScope
  createdAt: number
  updatedAt: number
  status: KnowledgeStatus
  nodes: Array<{ id: string; text: string; x: number; y: number; parentId?: string }>
  edges: Array<{ id: string; from: string; to: string }>
  sourceSessionIds: string[]
  referencedBySessionIds: string[]
}
