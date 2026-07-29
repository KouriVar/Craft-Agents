import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { KnowledgeAssetService } from '../KnowledgeAssetService'
import { searchLocalIndex } from '@craft-agent/shared/search-index'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
describe('KnowledgeAssetService', () => {
  it('keeps ordinary originals and indexes only extracted text', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-file-')); roots.push(root)
    const source = join(root, 'note.txt'); writeFileSync(source, 'project-only searchable text')
    const service = new KnowledgeAssetService(root, 'ws')
    const file = await service.importFile({ sourcePath: source, projectId: 'p1', mimeType: 'text/plain' })
    expect(file.extraction.status).toBe('extracted'); expect(existsSync(file.originalPath)).toBe(true)
    expect(searchLocalIndex(root, { query: 'searchable', workspaceId: 'ws', projectId: 'p1' }).map(x => x.id)).toContain(`file:${file.id}`)
  })
  it('makes an OCR requirement explicit instead of claiming extraction', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-image-')); roots.push(root)
    const source = join(root, 'scan.png'); writeFileSync(source, 'not actually read')
    expect((await new KnowledgeAssetService(root, 'ws').importFile({ sourcePath: source, mimeType: 'image/png' })).extraction.status).toBe('ocr_required')
  })
  it('detects image MIME types for UI imports that omit mimeType', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-infer-')); roots.push(root)
    const source = join(root, 'scan.png'); writeFileSync(source, 'not actually read')
    expect((await new KnowledgeAssetService(root, 'ws').importFile({ sourcePath: source })).extraction.status).toBe('ocr_required')
  })
  it('uses an independent mind-map schema', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-map-')); roots.push(root)
    const map = new KnowledgeAssetService(root, 'ws').createMindMap({ title: 'Architecture', projectId: 'p1' })
    expect(map.kind).toBe('mindmap'); expect(map.nodes).toHaveLength(1); expect(map).not.toHaveProperty('body')
  })
  it('lists and reopens persisted mind maps in the same workspace only', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-map-list-')); roots.push(root)
    const service = new KnowledgeAssetService(root, 'ws'); const map = service.createMindMap({ title: 'Keep me', projectId: 'p1' })
    expect(service.listMindMaps('p1').map(item => item.id)).toEqual([map.id]); expect(service.getMindMap(map.id)?.title).toBe('Keep me')
  })
})
