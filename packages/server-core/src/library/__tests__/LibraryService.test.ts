import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { LibraryService } from '../LibraryService'
import {
  getPrivacyService,
  _resetPrivacyServiceRegistryForTests,
  createDefaultPrivacyPolicy,
} from '../../privacy'
import {
  documentBodyPath,
  documentMetaPath,
  indexPath,
  protectSectionAnchors,
  resolveLibraryRelativePath,
  restoreSectionAnchors,
  stripSectionAnchors,
} from '@craft-agent/shared/library'

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'library-svc-'))
}

/** Default session.body is deny — allow interactive generation for success-path tests. */
function allowSessionBodyForGenerate(root: string, workspaceId: string): void {
  const defaults = createDefaultPrivacyPolicy()
  getPrivacyService(root, workspaceId).setWorkspacePolicy({
    sources: {
      ...defaults.sources,
      session: { ...defaults.sources.session, body: 'ask', attachments: 'deny', archived: 'ask' },
      library: { generateWithModel: 'ask', autoDetectSync: false },
    },
  })
}

afterEach(() => {
  _resetPrivacyServiceRegistryForTests()
})

describe('LibraryService', () => {
  it('creates blank document with create version and no session links', () => {
    const root = makeRoot()
    try {
      const svc = new LibraryService(root, 'ws_a')
      const doc = svc.createBlank({ workspaceId: 'ws_a', title: '未命名文档' })
      expect(doc.meta.sessionLinks).toEqual([])
      expect(doc.meta.syncStatus).toBe('clean')
      expect(existsSync(documentBodyPath(root, doc.meta.id))).toBe(true)
      expect(existsSync(documentMetaPath(root, doc.meta.id))).toBe(true)
      expect(svc.listVersions(doc.meta.id)[0]?.op).toBe('create')
      expect(svc.list({ workspaceId: 'ws_a' }).some((i) => i.id === doc.meta.id)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('creates session document with links, anchors, and lastSyncedMessageId', () => {
    const root = makeRoot()
    try {
      allowSessionBodyForGenerate(root, 'ws_a')
      const svc = new LibraryService(root, 'ws_a')
      const result = svc.createFromSessionContent({
        sessionId: 'sess_1',
        sessionTitle: '长期任务讨论',
        messages: [
          { id: 'm1', role: 'user', content: '我们需要做资源库' },
          { id: 'm2', role: 'assistant', content: '好的，先做基础存储' },
        ],
        templateId: 'decision',
        privacyAuthorized: true,
      })
      expect(result.ok).toBe(true)
      const doc = result.document!
      expect(doc.meta.sessionLinks).toHaveLength(1)
      expect(doc.meta.sessionLinks[0]!.lastSyncedMessageId).toBe('m2')
      expect(doc.meta.sessionLinks[0]!.pendingCount).toBe(0)
      expect(doc.meta.sessionLinks[0]!.sessionTitleSnapshot).toBe('长期任务讨论')
      expect(doc.body).toContain('<!-- craft-section:')
      expect(doc.meta.sourceReferences.length).toBeGreaterThan(0)
      expect(svc.list({ workspaceId: 'ws_a', search: '长期任务' }).length).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('treats meta as authoritative and rebuilds corrupted or missing index', () => {
    const root = makeRoot()
    try {
      const svc = new LibraryService(root, 'ws_a')
      const doc = svc.createBlank({ workspaceId: 'ws_a', title: '权威文档' })
      unlinkSync(indexPath(root))
      expect(svc.list({ workspaceId: 'ws_a' }).some((i) => i.id === doc.meta.id)).toBe(true)

      writeFileSync(indexPath(root), '{not-json', 'utf8')
      expect(svc.readIndex().items.some((i) => i.id === doc.meta.id)).toBe(true)

      writeFileSync(indexPath(root), JSON.stringify({
        schemaVersion: 1,
        updatedAt: Date.now(),
        items: [{
          id: 'doc_ghost_zzzzzzzz',
          kind: 'document',
          title: 'ghost',
          status: 'active',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          sessionLinkCount: 0,
          syncStatus: 'clean',
        }],
      }), 'utf8')
      const repaired = svc.repair()
      expect(repaired.ok).toBe(true)
      expect(svc.list({ workspaceId: 'ws_a' }).every((i) => i.id !== 'doc_ghost_zzzzzzzz')).toBe(true)
      expect(svc.list({ workspaceId: 'ws_a' }).some((i) => i.id === doc.meta.id)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not delete orphan body on repair and marks missing bodies', () => {
    const root = makeRoot()
    try {
      const svc = new LibraryService(root, 'ws_a')
      const doc = svc.createBlank({ workspaceId: 'ws_a', title: '有正文' })
      const orphanId = 'doc_orphanbody1234'
      writeFileSync(documentBodyPath(root, orphanId), '# orphan\n', 'utf8')
      unlinkSync(documentBodyPath(root, doc.meta.id))
      const result = svc.repair()
      expect(result.orphanBodies).toContain(orphanId)
      expect(result.missingBodies).toContain(doc.meta.id)
      expect(existsSync(documentBodyPath(root, orphanId))).toBe(true)
      expect(existsSync(documentMetaPath(root, doc.meta.id))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects path traversal for relative library paths', () => {
    const root = makeRoot()
    try {
      const svc = new LibraryService(root, 'ws_a')
      svc.ensureInitialized()
      expect(() => resolveLibraryRelativePath(root, '../outside.md')).toThrow()
      expect(() => svc.get('../evil')).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('supports Chinese workspace paths', () => {
    const parent = makeRoot()
    const root = join(parent, '中文工作区')
    try {
      mkdirSync(root, { recursive: true })
      const svc = new LibraryService(root, 'ws_cn')
      const doc = svc.createBlank({ workspaceId: 'ws_cn', title: '中文标题' })
      expect(svc.get(doc.meta.id)?.meta.title).toBe('中文标题')
      expect(existsSync(documentBodyPath(root, doc.meta.id))).toBe(true)
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  it('isolates documents across workspaces', () => {
    const rootA = makeRoot()
    const rootB = makeRoot()
    try {
      const a = new LibraryService(rootA, 'ws_a')
      const b = new LibraryService(rootB, 'ws_b')
      const docA = a.createBlank({ workspaceId: 'ws_a', title: 'A 文档' })
      expect(b.get(docA.meta.id)).toBeNull()
      expect(b.list({ workspaceId: 'ws_b' })).toHaveLength(0)
    } finally {
      rmSync(rootA, { recursive: true, force: true })
      rmSync(rootB, { recursive: true, force: true })
    }
  })

  it('archives, unarchives, deletes, and searches', () => {
    const root = makeRoot()
    try {
      const svc = new LibraryService(root, 'ws_a')
      const doc = svc.createBlank({ workspaceId: 'ws_a', title: '可归档文档' })
      svc.archive(doc.meta.id)
      expect(svc.list({ workspaceId: 'ws_a', filter: 'all' })).toHaveLength(0)
      expect(svc.list({ workspaceId: 'ws_a', filter: 'archived' })).toHaveLength(1)
      svc.unarchive(doc.meta.id)
      expect(svc.list({ workspaceId: 'ws_a', filter: 'all' })).toHaveLength(1)
      expect(svc.list({ workspaceId: 'ws_a', search: '可归档' })).toHaveLength(1)
      expect(svc.delete(doc.meta.id).ok).toBe(true)
      expect(svc.get(doc.meta.id)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('filters documents by exact projectId and stays back-compatible when omitted', () => {
    const root = makeRoot()
    try {
      const svc = new LibraryService(root, 'ws_a')
      const docA = svc.createBlank({ workspaceId: 'ws_a', title: 'A', projectId: 'proj_a' })
      const docB = svc.createBlank({ workspaceId: 'ws_a', title: 'B', projectId: 'proj_b' })
      const docC = svc.createBlank({ workspaceId: 'ws_a', title: 'C' }) // no project binding

      // Exact projectId filter returns only matching docs.
      expect(svc.list({ workspaceId: 'ws_a', projectId: 'proj_a' }).map((i) => i.id)).toEqual([docA.meta.id])
      expect(svc.list({ workspaceId: 'ws_a', projectId: 'proj_b' }).map((i) => i.id)).toEqual([docB.meta.id])

      // Omitted projectId → no project filtering (back-compat): all active docs.
      const all = svc.list({ workspaceId: 'ws_a' }).map((i) => i.id)
      expect(all).toHaveLength(3)

      // Composes with recent filter — returns most recent for the project.
      const recentA = svc.list({ workspaceId: 'ws_a', projectId: 'proj_a', filter: 'recent', limit: 5 })
      expect(recentA.map((i) => i.id)).toEqual([docA.meta.id])

      // Composes with search — projectId narrows before search.
      expect(svc.list({ workspaceId: 'ws_a', projectId: 'proj_a', search: 'a' })).toHaveLength(1)
      expect(svc.list({ workspaceId: 'ws_a', projectId: 'proj_b', search: 'a' })).toHaveLength(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('marks source refs orphaned when section anchors are removed', () => {
    const root = makeRoot()
    try {
      allowSessionBodyForGenerate(root, 'ws_a')
      const svc = new LibraryService(root, 'ws_a')
      const created = svc.createFromSessionContent({
        sessionId: 'sess_2',
        sessionTitle: '锚点测试',
        messages: [{ id: 'm1', role: 'user', content: 'hello' }],
        privacyAuthorized: true,
      })
      const doc = created.document!
      const sectionId = doc.meta.sourceReferences[0]!.sectionId
      const stripped = doc.body.replace(`<!-- craft-section:${sectionId} -->`, '')
      const updated = svc.update({
        workspaceId: 'ws_a',
        documentId: doc.meta.id,
        body: stripped,
      })!
      expect(updated.meta.sourceReferences.find((r) => r.sectionId === sectionId)?.orphaned).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('creates manual version and restores with safety snapshot', () => {
    const root = makeRoot()
    try {
      const svc = new LibraryService(root, 'ws_a')
      const doc = svc.createBlank({ workspaceId: 'ws_a', title: '版本文档' })
      const v1 = svc.update({
        workspaceId: 'ws_a',
        documentId: doc.meta.id,
        body: '# v1\n\nfirst\n',
        createVersion: true,
        versionSummary: '手动保存',
      })!
      const versionId = svc.listVersions(doc.meta.id).find((v) => v.op === 'user_save')!.id
      svc.update({
        workspaceId: 'ws_a',
        documentId: doc.meta.id,
        body: '# current\n\nlater\n',
      })
      const restored = svc.restoreVersion(doc.meta.id, versionId)!
      expect(restored.body).toContain('first')
      const ops = svc.listVersions(doc.meta.id).map((v) => v.op)
      expect(ops).toContain('restore')
      expect(ops.filter((op) => op === 'user_save').length).toBeGreaterThanOrEqual(2)
      expect(v1.body).toContain('first')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('exports markdown stripped of craft-section markers by default', () => {
    const root = makeRoot()
    try {
      allowSessionBodyForGenerate(root, 'ws_a')
      const svc = new LibraryService(root, 'ws_a')
      const created = svc.createFromSessionContent({
        sessionId: 'sess_3',
        sessionTitle: '导出测试',
        messages: [{ id: 'm1', role: 'user', content: 'body' }],
        privacyAuthorized: true,
      })
      const doc = created.document!
      const exported = svc.exportMarkdown({
        workspaceId: 'ws_a',
        documentId: doc.meta.id,
        keepSourceMarkers: false,
      })
      expect(exported.markdown).not.toContain('craft-section')
      const html = svc.exportDocument({
        workspaceId: 'ws_a',
        documentId: doc.meta.id,
        format: 'html',
        keepSourceMarkers: false,
      })
      expect(html.html).toContain('<!doctype html>')
      expect(html.html).not.toContain('craft-section')
      expect(html.html).not.toContain('CRAFT_SECTION')
      const kept = svc.exportMarkdown({
        workspaceId: 'ws_a',
        documentId: doc.meta.id,
        keepSourceMarkers: true,
      })
      expect(kept.markdown).toContain('craft-section')
      expect(readFileSync(documentBodyPath(root, doc.meta.id), 'utf8')).toContain('craft-section')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('marks session links orphaned without deleting documents', () => {
    const root = makeRoot()
    try {
      allowSessionBodyForGenerate(root, 'ws_a')
      const svc = new LibraryService(root, 'ws_a')
      const created = svc.createFromSessionContent({
        sessionId: 'sess_gone',
        sessionTitle: '将删除的会话',
        messages: [{ id: 'm1', role: 'user', content: 'x' }],
        privacyAuthorized: true,
      })
      const id = created.document!.meta.id
      expect(svc.markSessionOrphaned('sess_gone')).toBe(1)
      const doc = svc.get(id)!
      expect(doc.meta.sessionLinks[0]!.orphaned).toBe(true)
      expect(doc.body.length).toBeGreaterThan(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('session.body=deny blocks generation even with consent', () => {
    const root = makeRoot()
    try {
      const defaults = createDefaultPrivacyPolicy()
      getPrivacyService(root, 'ws_a').setWorkspacePolicy({
        sources: {
          ...defaults.sources,
          session: { ...defaults.sources.session, body: 'deny' },
          library: { generateWithModel: 'ask', autoDetectSync: false },
        },
      })
      const svc = new LibraryService(root, 'ws_a')
      const denied = svc.createFromSessionContent({
        sessionId: 'sess_deny',
        sessionTitle: '拒绝',
        messages: [{ id: 'm1', role: 'user', content: 'secret' }],
        privacyAuthorized: true,
      })
      expect(denied.ok).toBe(false)
      expect(denied.privacy?.decision).toBe('deny')
      expect(denied.privacy?.blockedBy?.[0]?.aspect).toBe('body')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('library.generateWithModel=deny blocks model generation', () => {
    const root = makeRoot()
    try {
      const defaults = createDefaultPrivacyPolicy()
      getPrivacyService(root, 'ws_a').setWorkspacePolicy({
        sources: {
          ...defaults.sources,
          session: { ...defaults.sources.session, body: 'allow' },
          library: { generateWithModel: 'deny', autoDetectSync: false },
        },
      })
      const svc = new LibraryService(root, 'ws_a')
      const denied = svc.createFromSessionContent({
        sessionId: 'sess_lib_deny',
        sessionTitle: '库拒绝',
        messages: [{ id: 'm1', role: 'user', content: 'x' }],
        privacyAuthorized: true,
      })
      expect(denied.ok).toBe(false)
      expect(denied.privacy?.decision).toBe('deny')
      expect(denied.privacy?.blockedBy?.[0]?.source).toBe('library')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('ask+interactive requires consent before generating', () => {
    const root = makeRoot()
    try {
      allowSessionBodyForGenerate(root, 'ws_a')
      const svc = new LibraryService(root, 'ws_a')
      const ask = svc.createFromSessionContent({
        sessionId: 'sess_ask',
        sessionTitle: '需授权',
        messages: [{ id: 'm1', role: 'user', content: 'secret' }],
        privacyAuthorized: false,
      })
      expect(ask.ok).toBe(false)
      expect(ask.privacy?.decision).toBe('ask')
      const allowed = svc.createFromSessionContent({
        sessionId: 'sess_ask',
        sessionTitle: '需授权',
        messages: [{ id: 'm1', role: 'user', content: 'secret' }],
        privacyAuthorized: true,
        prepared: {
          title: 'AI 文档',
          body: '# AI 文档\n\n## 概述\n<!-- craft-section:sec_test1 -->\n\n这是模型整理后的结构化正文，明显不是机械拼接。\n',
          sourceReferences: [{
            schemaVersion: 1,
            documentId: 'pending',
            sectionId: 'sec_test1',
            sessionId: 'sess_ask',
            messageIds: ['m1'],
            headingSnapshot: '概述',
          }],
          generation: {
            mode: 'ai',
            modelId: 'test-model',
            generatedAt: Date.now(),
            promptVersion: 'd2.1',
            sourceMessageCount: 1,
            totalMessageCount: 1,
            truncated: false,
            qualityStatus: 'passed',
          },
        },
      })
      expect(allowed.ok).toBe(true)
      expect(allowed.generation?.mode).toBe('ai')
      expect(allowed.document?.body).toContain('<!-- craft-section:')
      expect(allowed.document?.body).toContain('结构化正文')
      expect(allowed.document?.meta.generation?.mode).toBe('ai')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('falls back to excerpt when AI markdown is invalid and surfaces warning', () => {
    const root = makeRoot()
    try {
      allowSessionBodyForGenerate(root, 'ws_a')
      const svc = new LibraryService(root, 'ws_a')
      const result = svc.createFromSessionContent({
        sessionId: 'sess_fb',
        sessionTitle: '降级',
        messages: [{ id: 'm1', role: 'user', content: 'hello world content' }],
        privacyAuthorized: true,
        generateMode: 'ai',
      })
      expect(result.ok).toBe(true)
      expect(result.generation?.mode).toBe('excerpt_fallback')
      expect(result.document?.meta.generation?.mode).toBe('excerpt_fallback')
      expect(result.document?.body).toContain('<!-- craft-section:')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not leave half-created docs when write path is exercised with AI body', () => {
    const root = makeRoot()
    try {
      allowSessionBodyForGenerate(root, 'ws_a')
      const svc = new LibraryService(root, 'ws_a')
      const result = svc.createFromSessionContent({
        sessionId: 'sess_ok',
        sessionTitle: '完整',
        messages: [{ id: 'm1', role: 'user', content: 'x' }],
        privacyAuthorized: true,
        generateMode: 'preserve',
      })
      expect(result.ok).toBe(true)
      expect(result.generation?.mode).toBe('preserve')
      const id = result.document!.meta.id
      expect(svc.get(id)?.body.length).toBeGreaterThan(10)
      expect(svc.list({ workspaceId: 'ws_a' }).some((i) => i.id === id)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('section anchors', () => {
  it('protect/restore round-trip keeps craft-section comments', () => {
    const sectionId = 'sec_abc1234567890'
    const original = `## 决策结论\n<!-- craft-section:${sectionId} -->\n\n正文\n`
    const protectedMd = protectSectionAnchors(original)
    expect(protectedMd).not.toContain('<!-- craft-section:')
    expect(protectedMd).toContain(`⟦CRAFT_SECTION:${sectionId}⟧`)
    const restored = restoreSectionAnchors(protectedMd)
    expect(restored).toContain(`<!-- craft-section:${sectionId} -->`)
    const stripped = stripSectionAnchors(restored)
    expect(stripped).not.toContain('craft-section')
    expect(stripped).toContain('决策结论')
  })
})
