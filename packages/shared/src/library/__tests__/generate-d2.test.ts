import { describe, expect, it } from 'bun:test'
import { extractBlocksFromMarkdown, extractSessionContentBlocks } from '../content-blocks.ts'
import {
  assembleDocumentFromStructuredResult,
  buildPreserveDocument,
  injectCraftSectionAnchors,
  parseGeneratedDocumentJson,
} from '../generate.ts'
import { runLibraryQualityGate } from '../quality.ts'
import { detachSectionAnchorsForEdit, reattachSectionAnchorsOnSave } from '../editor-body.ts'
import { renderDocumentHtml, renderDocumentMarkdown } from '../document-render.ts'
import { stripSectionAnchors } from '../section-anchors.ts'
import { DOCUMENT_LEVEL_SECTION_ID } from '../types.ts'

const TABLE = `| 维度 | 6号 | 8号 |
|---|---:|---:|
| 酒精度 | 7.5% | 9.2% |
`

describe('content blocks', () => {
  it('keeps markdown tables as preserve blocks', () => {
    const blocks = extractBlocksFromMarkdown(`前言\n\n${TABLE}\n后记`, 'm1', 'assistant')
    const table = blocks.find((b) => b.type === 'table')
    expect(table?.preserve).toBe(true)
    expect(table?.markdown).toContain('| 酒精度 |')
    expect(table?.markdown).not.toMatch(/维度 \| 6号 \| 8号 \|---/)
  })

  it('keeps code fences and mermaid', () => {
    const md = '```ts\nconst x = 1\n```\n\n```mermaid\ngraph TD; A-->B\n```'
    const blocks = extractBlocksFromMarkdown(md, 'm2', 'assistant')
    expect(blocks.some((b) => b.type === 'code')).toBe(true)
    expect(blocks.some((b) => b.type === 'mermaid')).toBe(true)
  })
})

describe('structured AI parse + assemble', () => {
  it('parses JSON and validates sources without stamping full session on every section', () => {
    const raw = JSON.stringify({
      title: '方案',
      sections: [
        { heading: '背景', bodyMarkdown: '讨论了资源库', sourceMessageIds: ['m1'] },
        { heading: '结论', bodyMarkdown: `${TABLE}`, sourceMessageIds: ['m2'], preservedBlockIds: [] },
      ],
    })
    const parsed = parseGeneratedDocumentJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const blocks = extractSessionContentBlocks([
      { id: 'm1', role: 'user', content: '我们做资源库' },
      { id: 'm2', role: 'assistant', content: TABLE },
    ])
    const assembled = assembleDocumentFromStructuredResult({
      result: parsed.result,
      documentId: 'doc_1',
      sessionId: 'sess_1',
      authorizedMessageIds: ['m1', 'm2'],
      blocks,
    })
    expect(assembled.sourceMode).toBe('section')
    expect(assembled.sourceReferences).toHaveLength(2)
    expect(assembled.sourceReferences[0]!.messageIds).toEqual(['m1'])
    expect(assembled.body).toContain('| 酒精度 |')
    expect(assembled.body).toContain('<!-- craft-section:')
  })

  it('collapses to document-level when every section lists all messages', () => {
    const result = {
      title: 'T',
      sections: [
        { heading: 'A', bodyMarkdown: 'one body aaa', sourceMessageIds: ['m1', 'm2'] },
        { heading: 'B', bodyMarkdown: 'two body bbb', sourceMessageIds: ['m1', 'm2'] },
      ],
    }
    const assembled = assembleDocumentFromStructuredResult({
      result,
      documentId: 'doc_1',
      sessionId: 'sess_1',
      authorizedMessageIds: ['m1', 'm2'],
      blocks: [],
    })
    expect(assembled.sourceMode).toBe('document')
    expect(assembled.sourceReferences).toHaveLength(1)
    expect(assembled.sourceReferences[0]!.sectionId).toBe(DOCUMENT_LEVEL_SECTION_ID)
  })

  it('rejects fake message ids in quality gate', () => {
    const result = {
      title: 'T',
      sections: [
        { heading: 'A', bodyMarkdown: 'enough content here for body', sourceMessageIds: ['fake'] },
      ],
    }
    const gate = runLibraryQualityGate({
      result,
      authorizedMessageIds: ['m1'],
      blocks: [],
      sourceMarkdown: 'hello',
    })
    expect(gate.ok).toBe(false)
    expect(gate.issues.some((i) => i.code === 'fake_message_id')).toBe(true)
  })
})

describe('preserve mode', () => {
  it('keeps table structure and does not invent AI mode', () => {
    const doc = buildPreserveDocument({
      documentId: 'doc_p',
      sessionId: 'sess_1',
      sessionTitle: '归档',
      messages: [
        { id: 'm1', role: 'user', content: '请看表格' },
        { id: 'm2', role: 'assistant', content: TABLE },
      ],
    })
    expect(doc.body).toContain('| 酒精度 |')
    expect(doc.body).toContain('<!-- craft-section:')
    expect(doc.sourceReferences.every((r) => r.messageIds.length > 0)).toBe(true)
  })
})

describe('injectCraftSectionAnchors source rules', () => {
  it('uses document-level sources when per-section ids omitted', () => {
    const md = '# T\n\n## A\n\nbody\n\n## B\n\nmore\n'
    const { sourceReferences } = injectCraftSectionAnchors({
      markdown: md,
      documentId: 'doc_aaaaaaaaaaaaaaa1',
      sessionId: 'sess_1',
      authorizedMessageIds: ['m1', 'm2'],
    })
    expect(sourceReferences).toHaveLength(1)
    expect(sourceReferences[0]!.documentLevel).toBe(true)
  })
})

describe('editor body anchors', () => {
  it('hides anchors in edit content and restores on save; rename keeps section id', () => {
    const original = `# T\n\n## 背景\n<!-- craft-section:sec_abc -->\n\nhello\n`
    const detached = detachSectionAnchorsForEdit(original)
    expect(detached.content).not.toContain('CRAFT_SECTION')
    expect(detached.content).not.toContain('craft-section')
    expect(detached.sections[0]?.sectionId).toBe('sec_abc')

    const renamed = detached.content.replace('## 背景', '## 背景（更新）')
    const saved = reattachSectionAnchorsOnSave(renamed, detached.sections)
    expect(saved.body).toContain('<!-- craft-section:sec_abc -->')
    expect(saved.body).toContain('## 背景（更新）')
    expect(stripSectionAnchors(saved.body)).not.toContain('craft-section')
  })
})

describe('document render', () => {
  it('strips anchors and embeds styles for HTML export', () => {
    const md = `# 标题\n\n## 节\n<!-- craft-section:sec_x -->\n\n${TABLE}\n`
    const html = renderDocumentHtml(md, { title: '标题' })
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<table>')
    expect(html).toContain('酒精度')
    expect(html).not.toContain('craft-section')
    expect(html).not.toContain('CRAFT_SECTION')
    expect(html).toContain('max-width: 46rem')
    const plain = renderDocumentMarkdown(md)
    expect(plain).not.toContain('craft-section')
  })
})
