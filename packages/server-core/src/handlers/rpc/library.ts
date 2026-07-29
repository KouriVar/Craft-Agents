/**
 * Library RPC handlers — workspace document library (资源库).
 */

import { randomUUID } from 'crypto'
import { writeFileSync } from 'fs'
import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import {
  analyzeSessionForLibrary,
  buildPreserveDocument,
} from '@craft-agent/shared/library'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { getLibraryService } from '../../library/LibraryService'
import { KnowledgeAssetService } from '../../knowledge/KnowledgeAssetService'
import { prepareLibraryDocumentFromAi } from '../../library/library-generate-llm'
import {
  consumeLibraryConsentToken,
  issueLibraryConsentToken,
} from '../../library/consent-tokens'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.library.LIST,
  RPC_CHANNELS.library.GET,
  RPC_CHANNELS.library.CREATE,
  RPC_CHANNELS.library.CREATE_FROM_SESSION,
  RPC_CHANNELS.library.UPDATE,
  RPC_CHANNELS.library.ARCHIVE,
  RPC_CHANNELS.library.UNARCHIVE,
  RPC_CHANNELS.library.DELETE,
  RPC_CHANNELS.library.LIST_VERSIONS,
  RPC_CHANNELS.library.GET_VERSION,
  RPC_CHANNELS.library.RESTORE_VERSION,
  RPC_CHANNELS.library.EXPORT,
  RPC_CHANNELS.library.REPAIR,
  RPC_CHANNELS.library.UNLINK_SESSION,
  RPC_CHANNELS.library.IMPORT_FILE,
  RPC_CHANNELS.library.CREATE_MINDMAP,
  RPC_CHANNELS.library.UPDATE_MINDMAP,
  RPC_CHANNELS.library.LIST_MINDMAPS,
  RPC_CHANNELS.library.GET_MINDMAP,
] as const

function resolveWorkspace(workspaceId: string) {
  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
  return workspace
}

export function registerLibraryHandlers(server: RpcServer, deps: HandlerDeps): void {
  const { sessionManager, platform } = deps

  server.handle(RPC_CHANNELS.library.LIST, async (_ctx, query: import('@craft-agent/shared/protocol').LibraryListQuery) => {
    const ws = resolveWorkspace(query.workspaceId)
    return getLibraryService(ws.rootPath, ws.id).list(query)
  })

  server.handle(RPC_CHANNELS.library.GET, async (_ctx, request: import('@craft-agent/shared/protocol').LibraryGetRequest) => {
    const ws = resolveWorkspace(request.workspaceId)
    const service = getLibraryService(ws.rootPath, ws.id)
    const doc = service.get(request.documentId)
    if (!doc) return null
    await sessionManager.waitForInit()
    let changed = false
    for (const link of doc.meta.sessionLinks) {
      if (link.orphaned) continue
      const session = await sessionManager.getSession(link.sessionId)
      if (!session) {
        service.markSessionOrphaned(link.sessionId)
        changed = true
      }
    }
    return changed ? service.get(request.documentId) : doc
  })

  server.handle(RPC_CHANNELS.library.CREATE, async (_ctx, request: import('@craft-agent/shared/protocol').LibraryCreateBlankRequest) => {
    const ws = resolveWorkspace(request.workspaceId)
    return getLibraryService(ws.rootPath, ws.id).createBlank(request)
  })

  server.handle(
    RPC_CHANNELS.library.CREATE_FROM_SESSION,
    async (ctx, request: import('@craft-agent/shared/protocol').LibraryCreateFromSessionRequest) => {
      const ws = resolveWorkspace(request.workspaceId)
      const service = getLibraryService(ws.rootPath, ws.id)
      await sessionManager.waitForInit()
      const session = await sessionManager.getSession(request.sessionId)
      if (!session) {
        return { ok: false, error: 'session_not_found' }
      }

      const generateMode = request.generateMode ?? 'ai'
      const privacyProbe = service.evaluateGeneratePrivacy(Boolean(session.isArchived))
      if (privacyProbe.decision === 'deny') {
        // Never issue consent tokens for deny
        return {
          ok: false,
          privacy: privacyProbe,
          error: privacyProbe.reason,
          generation: { mode: 'excerpt_fallback', errorCode: 'permission_denied' },
        }
      }

      let privacyAuthorized = privacyProbe.decision === 'allow'
      if (privacyProbe.decision === 'ask') {
        // Ignore client consentGranted entirely — require one-time token
        const consumed = consumeLibraryConsentToken({
          token: request.consentToken,
          workspaceId: request.workspaceId,
          sessionId: request.sessionId,
          messageIds: request.messageIds,
        })
        if (!consumed.ok) {
          const issued = issueLibraryConsentToken({
            workspaceId: request.workspaceId,
            sessionId: request.sessionId,
            messageIds: request.messageIds,
            caller: ctx.clientId || 'local',
          })
          return {
            ok: false,
            privacy: privacyProbe,
            consentToken: issued.token,
            error: 'consent_required',
          }
        }
        privacyAuthorized = true
      }

      let allMessages: Array<{ id: string; role: string; content: string }> = (session.messages ?? [])
        .filter((m: { hidden?: boolean; content?: string }) => !m.hidden && typeof m.content === 'string' && m.content.trim())
        .map((m: { id: string; role: string; content?: string }) => ({ id: m.id, role: m.role, content: m.content || '' }))
      const totalMessageCount = allMessages.length

      let messages = allMessages
      let truncated = false
      if (request.messageIds?.length) {
        const allow = new Set(request.messageIds)
        messages = allMessages.filter((m) => allow.has(m.id))
      } else {
        const analysis = analyzeSessionForLibrary(allMessages)
        if (analysis.exceedsBudget && generateMode === 'ai') {
          // Do not silently truncate — require explicit range
          return {
            ok: false,
            error: 'session_too_long',
            needsMessageRange: true,
            privacy: { decision: 'allow', code: 'allow', reason: 'allowed' },
            sessionStats: {
              totalMessages: totalMessageCount,
              usedMessages: 0,
              estimatedChars: analysis.estimatedChars,
              truncated: true,
              preserveBlockCount: analysis.preserveBlockCount,
            },
          }
        }
      }

      // Re-validate token range hash already matched request.messageIds at consume time
      const templateId = request.templateId ?? 'general'
      const sessionTitle = session.name || session.preview || request.sessionId
      const documentId = `doc_${randomUUID().replace(/-/g, '').slice(0, 16)}`

      let prepared: {
        title: string
        body: string
        sourceReferences: import('@craft-agent/shared/library').DocumentSourceReference[]
        generation: import('@craft-agent/shared/library').DocumentGenerationMeta
        warning?: string
        errorCode?: string
      }

      if (generateMode === 'preserve') {
        const blocks = analyzeSessionForLibrary(messages).blocks
        // Preserve also refuses silent full-session when huge? Allow preserve with all messages —
        // user explicitly chose preserve; still show stats. Soft cap only for AI.
        const assembled = buildPreserveDocument({
          documentId,
          sessionId: request.sessionId,
          sessionTitle,
          messages,
          blocks,
        })
        prepared = {
          title: assembled.title,
          body: assembled.body,
          sourceReferences: assembled.sourceReferences,
          generation: {
            mode: 'preserve',
            generatedAt: Date.now(),
            promptVersion: 'd2.1',
            sourceMessageCount: messages.length,
            totalMessageCount,
            truncated,
            qualityStatus: 'passed',
          },
        }
      } else {
        prepared = await prepareLibraryDocumentFromAi({
          workspace: ws,
          platform,
          sessionConnectionSlug: session.llmConnection,
          sessionModel: session.model,
          documentId,
          sessionId: request.sessionId,
          templateId,
          sessionTitle,
          messages,
          totalMessageCount,
          truncated,
          locale: request.locale,
        })
      }

      // Service allocates its own documentId — rewrite prepared ids in body/refs is hard.
      // Instead pass prepared and let service use its id by remapping...
      // Simpler: pass prepared without fixed documentId — assembly used placeholder id.
      // Remap documentId in source refs after service creates? 
      // Actually buildPreserveDocument embeds documentId in refs. Service creates new id.
      // Fix: assemble inside service OR remap here after create.
      // Cleanest fix: createFromSessionContent accepts prepared and overwrites documentId in refs.

      return service.createFromSessionContent({
        sessionId: request.sessionId,
        sessionTitle,
        messages,
        templateId,
        projectId: session.projectId,
        archived: Boolean(session.isArchived),
        privacyAuthorized,
        generateMode,
        totalMessageCount,
        truncated,
        prepared: {
          ...prepared,
          // sourceReferences documentId will be rewritten by service
        },
      })
    },
  )

  server.handle(RPC_CHANNELS.library.UPDATE, async (_ctx, request: import('@craft-agent/shared/protocol').LibraryUpdateRequest) => {
    const ws = resolveWorkspace(request.workspaceId)
    return getLibraryService(ws.rootPath, ws.id).update(request)
  })

  server.handle(RPC_CHANNELS.library.ARCHIVE, async (_ctx, request: import('@craft-agent/shared/protocol').LibraryDocumentActionRequest) => {
    const ws = resolveWorkspace(request.workspaceId)
    return getLibraryService(ws.rootPath, ws.id).archive(request.documentId)
  })

  server.handle(RPC_CHANNELS.library.UNARCHIVE, async (_ctx, request: import('@craft-agent/shared/protocol').LibraryDocumentActionRequest) => {
    const ws = resolveWorkspace(request.workspaceId)
    return getLibraryService(ws.rootPath, ws.id).unarchive(request.documentId)
  })

  server.handle(RPC_CHANNELS.library.DELETE, async (_ctx, request: import('@craft-agent/shared/protocol').LibraryDocumentActionRequest) => {
    const ws = resolveWorkspace(request.workspaceId)
    return getLibraryService(ws.rootPath, ws.id).delete(request.documentId)
  })

  server.handle(RPC_CHANNELS.library.LIST_VERSIONS, async (_ctx, request: import('@craft-agent/shared/protocol').LibraryDocumentActionRequest) => {
    const ws = resolveWorkspace(request.workspaceId)
    return getLibraryService(ws.rootPath, ws.id).listVersions(request.documentId)
  })

  server.handle(RPC_CHANNELS.library.GET_VERSION, async (_ctx, request: import('@craft-agent/shared/protocol').LibraryGetVersionRequest) => {
    const ws = resolveWorkspace(request.workspaceId)
    return getLibraryService(ws.rootPath, ws.id).getVersion(request.documentId, request.versionId)
  })

  server.handle(RPC_CHANNELS.library.RESTORE_VERSION, async (_ctx, request: import('@craft-agent/shared/protocol').LibraryGetVersionRequest) => {
    const ws = resolveWorkspace(request.workspaceId)
    return getLibraryService(ws.rootPath, ws.id).restoreVersion(request.documentId, request.versionId)
  })

  server.handle(RPC_CHANNELS.library.EXPORT, async (_ctx, request: import('@craft-agent/shared/protocol').LibraryExportRequest) => {
    const ws = resolveWorkspace(request.workspaceId)
    const service = getLibraryService(ws.rootPath, ws.id)
    const result = service.exportDocument(request)
    if (request.format === 'pdf') {
      const html = result.html
      if (!html) return { ...result, error: 'html_missing' }
      if (!platform.htmlToPdf) {
        return { ...result, error: 'pdf_unavailable' }
      }
      try {
        const pdf = await platform.htmlToPdf(html)
        if (request.targetPath) {
          if (request.targetPath.includes('\0')) throw new Error('Invalid target path')
          writeFileSync(request.targetPath, pdf)
          return {
            format: 'pdf' as const,
            markdown: result.markdown,
            html,
            filePath: request.targetPath,
          }
        }
        return {
          format: 'pdf' as const,
          markdown: result.markdown,
          html,
          pdfBase64: pdf.toString('base64'),
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { format: 'pdf' as const, markdown: result.markdown, html, error: message.slice(0, 200) }
      }
    }
    return result
  })

  server.handle(RPC_CHANNELS.library.REPAIR, async (_ctx, workspaceId: string) => {
    const ws = resolveWorkspace(workspaceId)
    return getLibraryService(ws.rootPath, ws.id).repair()
  })

  server.handle(RPC_CHANNELS.library.UNLINK_SESSION, async (_ctx, request: import('@craft-agent/shared/protocol').LibraryUnlinkSessionRequest) => {
    const ws = resolveWorkspace(request.workspaceId)
    return getLibraryService(ws.rootPath, ws.id).unlinkSession(request.documentId, request.sessionId)
  })

  server.handle(RPC_CHANNELS.library.IMPORT_FILE, async (_ctx, input: { workspaceId: string; sourcePath: string; projectId?: string; mimeType?: string; sourceSessionId?: string }) => {
    const ws = resolveWorkspace(input.workspaceId)
    return new KnowledgeAssetService(ws.rootPath, ws.id).importFile(input)
  })

  server.handle(RPC_CHANNELS.library.CREATE_MINDMAP, async (_ctx, input: { workspaceId: string; title?: string; projectId?: string; sourceSessionId?: string }) => {
    const ws = resolveWorkspace(input.workspaceId)
    return new KnowledgeAssetService(ws.rootPath, ws.id).createMindMap(input)
  })

  server.handle(RPC_CHANNELS.library.UPDATE_MINDMAP, async (_ctx, input: import('@craft-agent/shared/knowledge').MindMapDocument) => {
    const ws = resolveWorkspace(input.workspaceId)
    return new KnowledgeAssetService(ws.rootPath, ws.id).updateMindMap(input)
  })
  server.handle(RPC_CHANNELS.library.LIST_MINDMAPS, async (_ctx, input: { workspaceId: string; projectId?: string }) => {
    const ws = resolveWorkspace(input.workspaceId); return new KnowledgeAssetService(ws.rootPath, ws.id).listMindMaps(input.projectId)
  })
  server.handle(RPC_CHANNELS.library.GET_MINDMAP, async (_ctx, input: { workspaceId: string; id: string }) => {
    const ws = resolveWorkspace(input.workspaceId); return new KnowledgeAssetService(ws.rootPath, ws.id).getMindMap(input.id)
  })
}
