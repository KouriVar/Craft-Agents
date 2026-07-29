/** v0.20 non-Markdown Knowledge storage.  It never shares a business schema
 * with Markdown documents: files preserve originals and mind maps own a canvas
 * document schema. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { basename, dirname, extname, join } from 'path'
import { randomUUID } from 'crypto'
import type { KnowledgeFileMeta, MindMapDocument } from '@craft-agent/shared/knowledge'
import { atomicWriteFileSync } from '@craft-agent/shared/utils'
import { upsertSearchEntry } from '@craft-agent/shared/search-index'
import { MarkItDown } from 'markitdown-js'

const id = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`
const rootFor = (workspaceRoot: string) => join(workspaceRoot, 'knowledge')
const filesDir = (workspaceRoot: string) => join(rootFor(workspaceRoot), 'files')
const mapsDir = (workspaceRoot: string) => join(rootFor(workspaceRoot), 'mindmaps')
const now = () => Date.now()
const writeJson = (path: string, value: unknown) => { mkdirSync(dirname(path), { recursive: true }); atomicWriteFileSync(path, `${JSON.stringify(value, null, 2)}\n`) }
function inferMimeType(path: string): string {
  const extension = extname(path).toLowerCase()
  return ({ '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv' } as Record<string, string>)[extension] ?? 'text/plain'
}

async function extractText(source: string, mimeType: string): Promise<{ status: KnowledgeFileMeta['extraction']['status']; text?: string; error?: string }> {
  const binary = /^(application\/(pdf|zip|octet-stream)|image\/)/.test(mimeType)
  if (mimeType.startsWith('image/')) return { status: 'ocr_required', error: 'OCR is not configured' }
  if (binary) return { status: 'unsupported', error: 'No safe local text extractor for this format' }
  try {
    if (mimeType === 'application/pdf' || mimeType.includes('officedocument') || mimeType.includes('msword') || mimeType.includes('spreadsheet')) {
      const result = await new MarkItDown().convert(source)
      if (!result?.textContent?.trim()) return { status: 'failed', error: 'Document conversion returned no text' }
      return { status: 'extracted', text: result.textContent }
    }
    return { status: 'extracted', text: readFileSync(source, 'utf8') }
  } catch { return { status: 'failed', error: 'Text extraction failed' } }
}

export class KnowledgeAssetService {
  constructor(private readonly workspaceRoot: string, private readonly workspaceId: string) {}

  async importFile(input: { sourcePath: string; projectId?: string; mimeType?: string; sourceSessionId?: string }): Promise<KnowledgeFileMeta> {
    if (!existsSync(input.sourcePath)) throw new Error('Knowledge file source does not exist')
    const fileId = id('file'); const sourceName = basename(input.sourcePath); const ts = now(); const mimeType = input.mimeType || inferMimeType(input.sourcePath)
    const originalPath = join(filesDir(this.workspaceRoot), `${fileId}${extname(sourceName)}`)
    mkdirSync(filesDir(this.workspaceRoot), { recursive: true }); copyFileSync(input.sourcePath, originalPath)
    const extraction = await extractText(originalPath, mimeType)
    const extractedTextPath = extraction.text === undefined ? undefined : join(filesDir(this.workspaceRoot), `${fileId}.extracted.txt`)
    if (extractedTextPath) writeFileSync(extractedTextPath, extraction.text!, 'utf8')
    const meta: KnowledgeFileMeta = { schemaVersion: 1, id: fileId, kind: 'file', workspaceId: this.workspaceId, title: sourceName, projectId: input.projectId, scope: input.projectId ? 'project' : 'global', mimeType, originalFilename: sourceName, originalPath, extractedTextPath, extraction: { status: extraction.status, updatedAt: ts, error: extraction.error }, createdAt: ts, updatedAt: ts, status: 'active', sourceSessionIds: input.sourceSessionId ? [input.sourceSessionId] : [], referencedBySessionIds: [] }
    writeJson(join(filesDir(this.workspaceRoot), `${fileId}.meta.json`), meta)
    if (extraction.text !== undefined) upsertSearchEntry(this.workspaceRoot, { id: `file:${fileId}`, kind: 'file', title: sourceName, text: extraction.text, updatedAt: ts, workspaceId: this.workspaceId, projectId: input.projectId })
    return meta
  }

  createMindMap(input: { title?: string; projectId?: string; sourceSessionId?: string }): MindMapDocument {
    const mapId = id('map'); const ts = now(); const title = input.title?.trim() || '未命名思维导图'
    const map: MindMapDocument = { schemaVersion: 1, kind: 'mindmap', id: mapId, workspaceId: this.workspaceId, title, projectId: input.projectId, scope: input.projectId ? 'project' : 'global', createdAt: ts, updatedAt: ts, status: 'active', nodes: [{ id: 'root', text: title, x: 0, y: 0 }], edges: [], sourceSessionIds: input.sourceSessionId ? [input.sourceSessionId] : [], referencedBySessionIds: [] }
    writeJson(join(mapsDir(this.workspaceRoot), `${mapId}.json`), map)
    upsertSearchEntry(this.workspaceRoot, { id: `knowledge:${mapId}`, kind: 'knowledge', title, text: title, updatedAt: ts, workspaceId: this.workspaceId, projectId: input.projectId })
    return map
  }

  updateMindMap(map: MindMapDocument): MindMapDocument {
    if (map.kind !== 'mindmap' || map.workspaceId !== this.workspaceId) throw new Error('Invalid mind map')
    const next = { ...map, updatedAt: now() }; writeJson(join(mapsDir(this.workspaceRoot), `${map.id}.json`), next)
    upsertSearchEntry(this.workspaceRoot, { id: `knowledge:${next.id}`, kind: 'knowledge', title: next.title, text: next.nodes.map(node => node.text).join('\n'), updatedAt: next.updatedAt, workspaceId: this.workspaceId, projectId: next.projectId })
    return next
  }

  listMindMaps(projectId?: string): MindMapDocument[] {
    const dir = mapsDir(this.workspaceRoot)
    if (!existsSync(dir)) return []
    return readdirSync(dir).filter(name => name.endsWith('.json')).flatMap(name => {
      try { const map = JSON.parse(readFileSync(join(dir, name), 'utf8')) as MindMapDocument; return map.workspaceId === this.workspaceId && map.status !== 'trashed' && (!projectId || map.projectId === projectId) ? [map] : [] } catch { return [] }
    }).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  getMindMap(id: string): MindMapDocument | null {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) return null
    try { const map = JSON.parse(readFileSync(join(mapsDir(this.workspaceRoot), `${id}.json`), 'utf8')) as MindMapDocument; return map.workspaceId === this.workspaceId && map.status !== 'trashed' ? map : null } catch { return null }
  }
}
