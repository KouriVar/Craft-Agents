/**
 * LibraryService — workspace-scoped document library (资源库).
 * meta is authoritative; resources.index.json is a rebuildable cache.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'
import { atomicWriteFileSync, createLogger } from '@craft-agent/shared/utils'
import type {
  DocumentMeta,
  DocumentSessionLink,
  DocumentSourceReference,
  DocumentVersionMeta,
  LibraryCreateBlankRequest,
  LibraryCreateFromSessionRequest,
  LibraryCreateFromSessionResponse,
  LibraryDocumentDto,
  LibraryDocumentTemplateId,
  LibraryExportRequest,
  LibraryExportResult,
  LibraryIndexEntry,
  LibraryListQuery,
  LibraryManifest,
  LibraryPrivacyGateResult,
  LibraryResourcesIndex,
  LibraryUpdateRequest,
} from '@craft-agent/shared/library'
import {
  assertSafeDocumentId,
  assertSafeVersionId,
  buildExcerptFallbackDocument,
  buildPreserveDocument,
  documentBodyPath,
  documentMetaPath,
  extractSectionIds,
  extractSessionContentBlocks,
  indexPath,
  LIBRARY_PROMPT_VERSION,
  libraryRoot,
  manifestPath,
  relativeBodyPath,
  renderDocumentHtml,
  renderDocumentMarkdown,
  resolveLibraryRelativePath,
  VERSIONS_DIR,
  versionBodyPath,
  versionDir,
  versionMetaPath,
  type DocumentGenerationMeta,
} from '@craft-agent/shared/library'
import type { PolicyInput } from '@craft-agent/shared/privacy'
import { getPrivacyService } from '../privacy'

const log = createLogger('library')

function now(): number {
  return Date.now()
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`
}

function readJsonFile<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  atomicWriteFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function writeTextAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  atomicWriteFileSync(path, text.endsWith('\n') ? text : `${text}\n`)
}

function sanitizeExportFilename(title: string): string {
  const base = (title || 'document').trim().slice(0, 80)
  return base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ') || 'document'
}

export class LibraryService {
  constructor(
    readonly workspaceDataRoot: string,
    readonly workspaceId: string,
  ) {}

  ensureInitialized(): LibraryManifest {
    const root = libraryRoot(this.workspaceDataRoot)
    mkdirSync(join(root, 'documents'), { recursive: true })
    mkdirSync(join(root, 'versions'), { recursive: true })
    let manifest = readJsonFile<LibraryManifest>(manifestPath(this.workspaceDataRoot))
    if (!manifest) {
      manifest = { schemaVersion: 1, migrationsApplied: ['v0.16.0-init'], updatedAt: now() }
      writeJsonAtomic(manifestPath(this.workspaceDataRoot), manifest)
    }
    if (!existsSync(indexPath(this.workspaceDataRoot))) {
      // Rebuild without re-entering ensureInitialized (avoids recursion).
      this.rebuildIndexFromMetas()
    }
    return manifest
  }

  private ensureDirs(): void {
    const root = libraryRoot(this.workspaceDataRoot)
    mkdirSync(join(root, 'documents'), { recursive: true })
    mkdirSync(join(root, 'versions'), { recursive: true })
  }

  private readMeta(documentId: string): DocumentMeta | null {
    assertSafeDocumentId(documentId)
    const meta = readJsonFile<DocumentMeta>(documentMetaPath(this.workspaceDataRoot, documentId))
    if (!meta || meta.schemaVersion !== 1 || meta.id !== documentId) return null
    return meta
  }

  private writeMeta(meta: DocumentMeta): void {
    writeJsonAtomic(documentMetaPath(this.workspaceDataRoot, meta.id), meta)
  }

  private readBody(documentId: string): string {
    const path = documentBodyPath(this.workspaceDataRoot, documentId)
    if (!existsSync(path)) return ''
    return readFileSync(path, 'utf8')
  }

  private writeBody(documentId: string, body: string): void {
    writeTextAtomic(documentBodyPath(this.workspaceDataRoot, documentId), body)
  }

  private toIndexEntry(meta: DocumentMeta): LibraryIndexEntry {
    return {
      id: meta.id,
      kind: 'document',
      title: meta.title,
      status: meta.status,
      updatedAt: meta.updatedAt,
      createdAt: meta.createdAt,
      projectId: meta.projectId,
      sessionLinkCount: meta.sessionLinks.length,
      templateId: meta.templateId,
      syncStatus: meta.syncStatus,
    }
  }

  private upsertIndexEntry(meta: DocumentMeta): void {
    try {
      const index = this.readIndex()
      const nextItems = index.items.filter((item) => item.id !== meta.id)
      nextItems.push(this.toIndexEntry(meta))
      nextItems.sort((a, b) => b.updatedAt - a.updatedAt)
      const next: LibraryResourcesIndex = {
        schemaVersion: 1,
        updatedAt: now(),
        items: nextItems,
      }
      writeJsonAtomic(indexPath(this.workspaceDataRoot), next)
    } catch (err) {
      log.warn('index update failed (meta remains authoritative)', err)
    }
  }

  private removeIndexEntry(documentId: string): void {
    try {
      const index = this.readIndex()
      writeJsonAtomic(indexPath(this.workspaceDataRoot), {
        schemaVersion: 1,
        updatedAt: now(),
        items: index.items.filter((item) => item.id !== documentId),
      } satisfies LibraryResourcesIndex)
    } catch (err) {
      log.warn('index remove failed', err)
    }
  }

  readIndex(): LibraryResourcesIndex {
    const index = readJsonFile<LibraryResourcesIndex>(indexPath(this.workspaceDataRoot))
    if (index?.schemaVersion === 1 && Array.isArray(index.items)) return index
    return this.rebuildIndex()
  }

  /** Scan metas and write index. Does not call ensureInitialized. */
  private rebuildIndexFromMetas(): LibraryResourcesIndex {
    this.ensureDirs()
    const docsDir = join(libraryRoot(this.workspaceDataRoot), 'documents')
    const items: LibraryIndexEntry[] = []
    if (existsSync(docsDir)) {
      for (const name of readdirSync(docsDir)) {
        if (!name.endsWith('.meta.json')) continue
        const id = name.replace(/\.meta\.json$/, '')
        try {
          assertSafeDocumentId(id)
        } catch {
          continue
        }
        const meta = this.readMeta(id)
        if (meta) items.push(this.toIndexEntry(meta))
      }
    }
    items.sort((a, b) => b.updatedAt - a.updatedAt)
    const index: LibraryResourcesIndex = { schemaVersion: 1, updatedAt: now(), items }
    writeJsonAtomic(indexPath(this.workspaceDataRoot), index)
    return index
  }

  rebuildIndex(): LibraryResourcesIndex {
    this.ensureDirs()
    let manifest = readJsonFile<LibraryManifest>(manifestPath(this.workspaceDataRoot))
    if (!manifest) {
      manifest = { schemaVersion: 1, migrationsApplied: ['v0.16.0-init'], updatedAt: now() }
      writeJsonAtomic(manifestPath(this.workspaceDataRoot), manifest)
    }
    return this.rebuildIndexFromMetas()
  }

  repair(): { ok: boolean; rebuiltIndex: number; orphanBodies: string[]; missingBodies: string[] } {
    this.ensureInitialized()
    const docsDir = join(libraryRoot(this.workspaceDataRoot), 'documents')
    const orphanBodies: string[] = []
    const missingBodies: string[] = []
    if (existsSync(docsDir)) {
      const names = readdirSync(docsDir)
      for (const name of names) {
        if (name.endsWith('.md') && !name.endsWith('.meta.json')) {
          const id = name.replace(/\.md$/, '')
          if (!existsSync(documentMetaPath(this.workspaceDataRoot, id))) {
            orphanBodies.push(id)
          }
        }
        if (name.endsWith('.meta.json')) {
          const id = name.replace(/\.meta\.json$/, '')
          if (!existsSync(documentBodyPath(this.workspaceDataRoot, id))) {
            missingBodies.push(id)
          }
        }
        if (name.endsWith('.tmp') || name.endsWith('.bak')) {
          try {
            unlinkSync(join(docsDir, name))
          } catch {
            /* ignore */
          }
        }
      }
    }
    const index = this.rebuildIndex()
    return { ok: true, rebuiltIndex: index.items.length, orphanBodies, missingBodies }
  }

  list(query: LibraryListQuery): LibraryIndexEntry[] {
    this.ensureInitialized()
    let items = this.readIndex().items
    const filter = query.filter ?? 'all'
    if (filter === 'archived') {
      items = items.filter((item) => item.status === 'archived')
    } else {
      items = items.filter((item) => item.status === 'active')
    }
    if (filter === 'recent') {
      items = items.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, query.limit ?? 30)
    }
    const search = query.search?.trim().toLowerCase()
    if (search) {
      items = items.filter((item) => {
        if (item.title.toLowerCase().includes(search)) return true
        if (item.projectId?.toLowerCase().includes(search)) return true
        const meta = this.readMeta(item.id)
        if (!meta) return false
        return meta.sessionLinks.some((link) =>
          link.sessionId.toLowerCase().includes(search)
          || (link.sessionTitleSnapshot?.toLowerCase().includes(search) ?? false),
        )
      })
    }
    const offset = query.offset ?? 0
    const limit = query.limit ?? 200
    return items.slice(offset, offset + limit)
  }

  get(documentId: string): LibraryDocumentDto | null {
    this.ensureInitialized()
    const meta = this.readMeta(documentId)
    if (!meta) return null
    // Refresh orphan flags for missing sessions is caller's/session manager concern
    return { meta, body: this.readBody(documentId) }
  }

  private createVersion(
    documentId: string,
    body: string,
    op: DocumentVersionMeta['op'],
    summary: string,
    extra?: Partial<DocumentVersionMeta>,
  ): DocumentVersionMeta {
    const versionId = newId('ver')
    assertSafeVersionId(versionId)
    const snapshotRel = `${VERSIONS_DIR}/${documentId}/${versionId}.md`
    writeTextAtomic(versionBodyPath(this.workspaceDataRoot, documentId, versionId), body)
    const meta: DocumentVersionMeta = {
      schemaVersion: 1,
      id: versionId,
      documentId,
      createdAt: now(),
      op,
      summary,
      snapshotPath: snapshotRel,
      ...extra,
    }
    writeJsonAtomic(versionMetaPath(this.workspaceDataRoot, documentId, versionId), meta)
    return meta
  }

  createBlank(request: LibraryCreateBlankRequest): LibraryDocumentDto {
    this.ensureInitialized()
    const documentId = newId('doc')
    const ts = now()
    const title = (request.title?.trim() || '未命名文档').slice(0, 200)
    const body = `# ${title}\n\n`
    const meta: DocumentMeta = {
      schemaVersion: 1,
      id: documentId,
      kind: 'document',
      title,
      workspaceId: this.workspaceId,
      projectId: request.projectId,
      createdAt: ts,
      updatedAt: ts,
      status: 'active',
      bodyPath: relativeBodyPath(documentId),
      syncStatus: 'clean',
      sessionLinks: [],
      sourceReferences: [],
    }
    this.writeBody(documentId, body)
    this.writeMeta(meta)
    this.createVersion(documentId, body, 'create', '创建空白文档')
    this.upsertIndexEntry(meta)
    return { meta, body }
  }

  /**
   * Privacy gate for interactive session→document generation.
   * Does NOT permanently block when contextAwarenessEnabled=false.
   */
  evaluateGeneratePrivacy(sessionArchived: boolean): LibraryPrivacyGateResult {
    const privacy = getPrivacyService(this.workspaceDataRoot, this.workspaceId)
    const checks: PolicyInput[] = [
      { feature: 'library_generate', source: 'library', mode: 'interactive' },
      { feature: 'library_generate', source: 'session', aspect: 'meta', mode: 'interactive' },
      { feature: 'library_generate', source: 'session', aspect: 'body', mode: 'interactive' },
    ]
    if (sessionArchived) {
      checks.push({ feature: 'library_generate', source: 'session', aspect: 'archived', mode: 'interactive' })
    }

    let worst: LibraryPrivacyGateResult = { decision: 'allow', code: 'allow', reason: 'allowed' }
    for (const input of checks) {
      const decision = privacy.decide(input)
      if (decision.decision === 'deny') {
        return {
          decision: 'deny',
          code: decision.code,
          reason: decision.reason,
          blockedBy: [{
            source: String(input.source),
            aspect: input.aspect,
            permission: decision.permission ?? 'deny',
          }],
        }
      }
      if (decision.decision === 'ask') {
        worst = {
          decision: 'ask',
          code: decision.code,
          reason: decision.reason,
          blockedBy: [{
            source: String(input.source),
            aspect: input.aspect,
            permission: 'ask',
          }],
        }
      }
    }
    return worst
  }

  /**
   * Create a document from session content.
   * `privacyAuthorized` must be set by the RPC handler after consent-token validation
   * (or when policy is allow). Client `consentGranted` is never trusted.
   */
  createFromSessionContent(input: {
    sessionId: string
    sessionTitle: string
    messages: Array<{ id: string; role: string; content: string }>
    templateId?: LibraryDocumentTemplateId
    projectId?: string
    archived?: boolean
    /** Server-side only — set after consent token consume or policy allow. */
    privacyAuthorized?: boolean
    /** @deprecated Ignored — use privacyAuthorized. */
    consentGranted?: boolean
    generateMode?: 'ai' | 'preserve'
    /** Total messages in session before range filter (for generation meta). */
    totalMessageCount?: number
    truncated?: boolean
    /** Pre-assembled document from handler (AI / preserve / fallback). */
    prepared?: {
      title: string
      body: string
      sourceReferences: DocumentSourceReference[]
      generation: DocumentGenerationMeta
      warning?: string
      errorCode?: string
    }
  }): LibraryCreateFromSessionResponse {
    this.ensureInitialized()
    const privacy = this.evaluateGeneratePrivacy(Boolean(input.archived))
    if (privacy.decision === 'deny') {
      return { ok: false, privacy, error: privacy.reason, generation: { mode: 'excerpt_fallback', errorCode: 'permission_denied' } }
    }
    if (privacy.decision === 'ask' && !input.privacyAuthorized) {
      return { ok: false, privacy }
    }

    try {
      const svc = getPrivacyService(this.workspaceDataRoot, this.workspaceId)
      svc.decideAndLog({
        feature: 'library_generate',
        source: 'session',
        aspect: 'body',
        mode: 'interactive',
      })
    } catch {
      /* non-fatal */
    }

    const templateId = input.templateId ?? 'general'
    const generateMode = input.generateMode ?? 'ai'
    const documentId = newId('doc')
    const ts = now()
    const messageIds = input.messages.map((m) => m.id)
    const lastMessageId = messageIds.at(-1)
    const fallbackTitle = `${input.sessionTitle || '会话文档'}`.slice(0, 200)
    const blocks = extractSessionContentBlocks(input.messages)
    const totalMessageCount = input.totalMessageCount ?? messageIds.length

    let title = fallbackTitle
    let body = ''
    let sourceRefs: DocumentSourceReference[] = []
    let generationMeta: DocumentGenerationMeta
    let responseGeneration: LibraryCreateFromSessionResponse['generation']

    if (input.prepared) {
      title = input.prepared.title
      body = input.prepared.body
      sourceRefs = input.prepared.sourceReferences.map((ref) => ({
        ...ref,
        documentId,
      }))
      generationMeta = input.prepared.generation
      responseGeneration = {
        mode: generationMeta.mode,
        model: generationMeta.modelId,
        warning: input.prepared.warning,
        errorCode: input.prepared.errorCode,
        qualityStatus: generationMeta.qualityStatus,
      }
    } else if (generateMode === 'preserve') {
      const preserved = buildPreserveDocument({
        documentId,
        sessionId: input.sessionId,
        sessionTitle: fallbackTitle,
        messages: input.messages,
        blocks,
      })
      title = preserved.title
      body = preserved.body
      sourceRefs = preserved.sourceReferences
      generationMeta = {
        mode: 'preserve',
        generatedAt: ts,
        promptVersion: LIBRARY_PROMPT_VERSION,
        sourceMessageCount: messageIds.length,
        totalMessageCount,
        truncated: Boolean(input.truncated),
        qualityStatus: 'passed',
      }
      responseGeneration = { mode: 'preserve', qualityStatus: 'passed' }
    } else {
      const excerpt = buildExcerptFallbackDocument({
        documentId,
        sessionId: input.sessionId,
        sessionTitle: fallbackTitle,
        templateId,
        messages: input.messages,
        blocks,
      })
      title = excerpt.title
      body = excerpt.body
      sourceRefs = excerpt.sourceReferences
      generationMeta = {
        mode: 'excerpt_fallback',
        generatedAt: ts,
        promptVersion: LIBRARY_PROMPT_VERSION,
        sourceMessageCount: messageIds.length,
        totalMessageCount,
        truncated: Boolean(input.truncated),
        qualityStatus: 'fallback',
      }
      responseGeneration = {
        mode: 'excerpt_fallback',
        warning: 'AI 整理失败，已创建基础摘录文档',
        errorCode: 'model_unavailable',
        qualityStatus: 'fallback',
      }
    }

    const link: DocumentSessionLink = {
      schemaVersion: 1,
      id: newId('link'),
      documentId,
      sessionId: input.sessionId,
      linkedAt: ts,
      lastSyncedMessageId: lastMessageId,
      lastSyncedAt: ts,
      pendingCount: 0,
      sessionTitleSnapshot: input.sessionTitle || undefined,
    }
    const meta: DocumentMeta = {
      schemaVersion: 1,
      id: documentId,
      kind: 'document',
      title,
      workspaceId: this.workspaceId,
      projectId: input.projectId,
      createdAt: ts,
      updatedAt: ts,
      status: 'active',
      bodyPath: relativeBodyPath(documentId),
      templateId,
      syncStatus: 'clean',
      sessionLinks: [link],
      sourceReferences: sourceRefs,
      generation: generationMeta,
    }

    const versionSummary = generationMeta.mode === 'ai'
      ? 'AI 从会话整理成文档'
      : generationMeta.mode === 'preserve'
        ? '原样保存为文档'
        : '从会话整理成文档（摘录）'

    try {
      this.writeBody(documentId, body)
      this.writeMeta(meta)
      this.createVersion(documentId, body, 'create', versionSummary, {
        sourceSessionId: input.sessionId,
        messageRange: { fromId: messageIds[0], toId: lastMessageId },
      })
      this.upsertIndexEntry(meta)
    } catch (err) {
      log.error('createFromSession write failed — cleaning partial', err)
      try {
        this.delete(documentId)
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        privacy: { decision: 'allow', code: 'allow', reason: 'allowed' },
        error: 'write_failed',
        generation: { mode: 'excerpt_fallback', errorCode: 'write_failed', warning: '文档写入失败' },
      }
    }

    return {
      ok: true,
      document: { meta, body },
      privacy: { decision: 'allow', code: 'allow', reason: 'allowed' },
      generation: responseGeneration,
      sessionStats: {
        totalMessages: totalMessageCount,
        usedMessages: messageIds.length,
        estimatedChars: input.messages.reduce((n, m) => n + (m.content?.length || 0), 0),
        truncated: Boolean(input.truncated),
        preserveBlockCount: blocks.filter((b) => b.preserve).length,
      },
    }
  }

  update(request: LibraryUpdateRequest): LibraryDocumentDto | null {
    this.ensureInitialized()
    const meta = this.readMeta(request.documentId)
    if (!meta) return null
    let body = this.readBody(request.documentId)
    if (typeof request.title === 'string') {
      meta.title = request.title.trim().slice(0, 200) || meta.title
    }
    if (typeof request.body === 'string') {
      body = request.body
      // Mark source refs orphaned if their section anchors disappeared
      const present = new Set(extractSectionIds(body))
      meta.sourceReferences = meta.sourceReferences.map((ref) => (
        present.has(ref.sectionId) ? ref : { ...ref, orphaned: true }
      ))
    }
    if (request.projectId === null) delete meta.projectId
    else if (typeof request.projectId === 'string') meta.projectId = request.projectId

    meta.updatedAt = now()
    // Order: body then meta then index
    if (typeof request.body === 'string') this.writeBody(meta.id, body)
    this.writeMeta(meta)
    if (request.createVersion) {
      this.createVersion(meta.id, body, 'user_save', request.versionSummary?.trim() || '手动保存版本')
    }
    this.upsertIndexEntry(meta)
    return { meta, body }
  }

  archive(documentId: string): DocumentMeta | null {
    const meta = this.readMeta(documentId)
    if (!meta) return null
    meta.status = 'archived'
    meta.archivedAt = now()
    meta.updatedAt = now()
    this.writeMeta(meta)
    this.upsertIndexEntry(meta)
    return meta
  }

  unarchive(documentId: string): DocumentMeta | null {
    const meta = this.readMeta(documentId)
    if (!meta) return null
    meta.status = 'active'
    delete meta.archivedAt
    meta.updatedAt = now()
    this.writeMeta(meta)
    this.upsertIndexEntry(meta)
    return meta
  }

  delete(documentId: string): { ok: boolean } {
    assertSafeDocumentId(documentId)
    const metaPath = documentMetaPath(this.workspaceDataRoot, documentId)
    const bodyPath = documentBodyPath(this.workspaceDataRoot, documentId)
    const vdir = versionDir(this.workspaceDataRoot, documentId)
    try {
      if (existsSync(bodyPath)) unlinkSync(bodyPath)
      if (existsSync(metaPath)) unlinkSync(metaPath)
      if (existsSync(vdir)) rmSync(vdir, { recursive: true, force: true })
      this.removeIndexEntry(documentId)
      return { ok: true }
    } catch (err) {
      log.error('delete failed', err)
      return { ok: false }
    }
  }

  listVersions(documentId: string): DocumentVersionMeta[] {
    assertSafeDocumentId(documentId)
    const dir = versionDir(this.workspaceDataRoot, documentId)
    if (!existsSync(dir)) return []
    const versions: DocumentVersionMeta[] = []
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.meta.json')) continue
      const meta = readJsonFile<DocumentVersionMeta>(join(dir, name))
      if (meta?.schemaVersion === 1) versions.push(meta)
    }
    return versions.sort((a, b) => b.createdAt - a.createdAt)
  }

  getVersion(documentId: string, versionId: string): { meta: DocumentVersionMeta; body: string } | null {
    assertSafeDocumentId(documentId)
    assertSafeVersionId(versionId)
    const meta = readJsonFile<DocumentVersionMeta>(versionMetaPath(this.workspaceDataRoot, documentId, versionId))
    if (!meta) return null
    const path = resolveLibraryRelativePath(this.workspaceDataRoot, meta.snapshotPath)
    const body = existsSync(path) ? readFileSync(path, 'utf8') : ''
    return { meta, body }
  }

  restoreVersion(documentId: string, versionId: string): LibraryDocumentDto | null {
    const current = this.get(documentId)
    if (!current) return null
    const version = this.getVersion(documentId, versionId)
    if (!version) return null
    // Safety snapshot of current body first
    this.createVersion(documentId, current.body, 'user_save', '恢复前安全快照')
    current.meta.updatedAt = now()
    this.writeBody(documentId, version.body)
    this.writeMeta(current.meta)
    this.createVersion(documentId, version.body, 'restore', `恢复版本 ${versionId}`)
    this.upsertIndexEntry(current.meta)
    return { meta: current.meta, body: version.body }
  }

  exportMarkdown(request: LibraryExportRequest): LibraryExportResult {
    return this.exportDocument(request)
  }

  /** Unified Markdown / HTML export. PDF bytes are produced by Electron platform. */
  exportDocument(request: LibraryExportRequest): LibraryExportResult {
    const doc = this.get(request.documentId)
    if (!doc) throw new Error('Document not found')
    const format = request.format || 'markdown'
    const markdown = renderDocumentMarkdown(doc.body, {
      keepSourceMarkers: Boolean(request.keepSourceMarkers),
    })
    if (format === 'markdown') {
      if (request.targetPath) {
        if (request.targetPath.includes('\0')) throw new Error('Invalid target path')
        writeTextAtomic(request.targetPath, markdown)
        return { format, markdown, filePath: request.targetPath }
      }
      return { format, markdown }
    }

    const html = renderDocumentHtml(doc.body, {
      title: doc.meta.title,
      theme: request.theme || 'light',
      keepSourceMarkers: Boolean(request.keepSourceMarkers),
    })
    if (format === 'html') {
      if (request.targetPath) {
        if (request.targetPath.includes('\0')) throw new Error('Invalid target path')
        writeTextAtomic(request.targetPath, html)
        return { format, markdown, html, filePath: request.targetPath }
      }
      return { format, markdown, html }
    }

    // pdf: return html for platform printToPDF; optional targetPath written by handler
    return { format: 'pdf', markdown, html }
  }

  unlinkSession(documentId: string, sessionId: string): DocumentMeta | null {
    const meta = this.readMeta(documentId)
    if (!meta) return null
    meta.sessionLinks = meta.sessionLinks.filter((link) => link.sessionId !== sessionId)
    meta.sourceReferences = meta.sourceReferences.map((ref) => (
      ref.sessionId === sessionId ? { ...ref, orphaned: true } : ref
    ))
    meta.updatedAt = now()
    this.writeMeta(meta)
    this.upsertIndexEntry(meta)
    return meta
  }

  markSessionOrphaned(sessionId: string): number {
    let count = 0
    for (const entry of this.readIndex().items) {
      const meta = this.readMeta(entry.id)
      if (!meta) continue
      let changed = false
      meta.sessionLinks = meta.sessionLinks.map((link) => {
        if (link.sessionId === sessionId && !link.orphaned) {
          changed = true
          return { ...link, orphaned: true }
        }
        return link
      })
      meta.sourceReferences = meta.sourceReferences.map((ref) => {
        if (ref.sessionId === sessionId && !ref.orphaned) {
          changed = true
          return { ...ref, orphaned: true }
        }
        return ref
      })
      if (changed) {
        meta.updatedAt = now()
        this.writeMeta(meta)
        this.upsertIndexEntry(meta)
        count += 1
      }
    }
    return count
  }

  suggestedExportFilename(documentId: string): string {
    const meta = this.readMeta(documentId)
    return `${sanitizeExportFilename(meta?.title || documentId)}.md`
  }
}

const services = new Map<string, LibraryService>()

export function getLibraryService(workspaceDataRoot: string, workspaceId: string): LibraryService {
  const key = `${workspaceId}:${workspaceDataRoot}`
  let svc = services.get(key)
  if (!svc) {
    svc = new LibraryService(workspaceDataRoot, workspaceId)
    svc.ensureInitialized()
    services.set(key, svc)
  }
  return svc
}
