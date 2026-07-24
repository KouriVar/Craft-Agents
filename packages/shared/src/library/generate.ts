/**
 * Session → library document generation helpers (Phase D.2).
 * Structured JSON from model; CA assembles Markdown + anchors + sources.
 */

import type {
  DocumentSourceReference,
  GeneratedDocumentResult,
  LibraryDocumentTemplateId,
  SessionContentBlock,
} from './types.ts'
import { DOCUMENT_LEVEL_SECTION_ID, makeSectionAnchor } from './types.ts'
import {
  blocksToMarkdown,
  extractSessionContentBlocks,
  type LibraryBlockMessage,
} from './content-blocks.ts'
import {
  runLibraryQualityGate,
  stripModelPreamble,
  type QualityGateResult,
} from './quality.ts'

export const LIBRARY_PROMPT_VERSION = 'd2.1'

export const LIBRARY_TEMPLATE_IDS: LibraryDocumentTemplateId[] = [
  'general',
  'product',
  'technical',
  'decision',
  'meeting',
  'research',
  'release',
]

export const LIBRARY_TEMPLATE_LABELS: Record<LibraryDocumentTemplateId, string> = {
  general: '通用文档',
  product: '产品方案',
  technical: '技术方案',
  decision: '决策记录',
  meeting: '会议纪要',
  research: '调研报告',
  release: '发布说明',
}

export const LIBRARY_TEMPLATE_HEADINGS: Record<LibraryDocumentTemplateId, string[]> = {
  general: ['概述', '主要内容', '下一步'],
  product: ['背景', '目标用户', '方案要点', '里程碑', '风险'],
  technical: ['背景', '架构', '实现要点', '测试', '风险'],
  decision: ['背景', '决策结论', '备选方案', '影响范围', '后续行动'],
  meeting: ['参会人', '议题', '结论', '待办'],
  research: ['问题', '发现', '结论', '参考'],
  release: ['版本亮点', '变更列表', '升级注意', '已知问题'],
}

/** Soft context budget for a single model call (chars). */
export const LIBRARY_CONTEXT_BUDGET_CHARS = 48_000
export const LIBRARY_MAX_MESSAGES_SOFT = 80

export type LibraryGenerationMode = 'ai' | 'excerpt_fallback' | 'preserve'

export interface LibraryGenerationMeta {
  mode: LibraryGenerationMode
  model?: string
  warning?: string
  errorCode?:
    | 'model_unavailable'
    | 'model_request_failed'
    | 'invalid_output'
    | 'permission_denied'
    | 'write_failed'
    | 'session_too_long'
  qualityStatus?: 'passed' | 'retried' | 'fallback'
}

export type LibraryGenerateMessage = LibraryBlockMessage

function newSectionId(): string {
  return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

export function buildLibraryGenerateSystemPrompt(locale: string): string {
  return [
    'You are Craft Agents\' document organizer.',
    'Reorganize authorized session content into a formal document.',
    'You MUST output a single JSON object only (no Markdown wrapper prose).',
    'Do not invent facts that were not discussed.',
    'If uncertain, mark it explicitly.',
    'Never emit craft-section markers, HTML comments, or ⟦CRAFT_SECTION⟧ placeholders.',
    'Never invent messageId or preservedBlockId values — only use ids from the input.',
    'Preserve tables, code fences, mermaid, blockquotes, lists, and images as Markdown — never flatten them into a single plain-text line.',
    'Do not copy the same body into multiple sections.',
    'You may place preserved blocks into sections via preservedBlockIds and optional {{block:ID}} placeholders in bodyMarkdown.',
    `Write in the user\'s language when possible (locale hint: ${locale || 'zh-Hans'}).`,
  ].join(' ')
}

export function buildLibraryGenerateUserPrompt(input: {
  templateId: LibraryDocumentTemplateId
  sessionTitle: string
  messages: LibraryGenerateMessage[]
  blocks: SessionContentBlock[]
  locale: string
}): string {
  const headings = LIBRARY_TEMPLATE_HEADINGS[input.templateId]
  const label = LIBRARY_TEMPLATE_LABELS[input.templateId]
  const preserveBlocks = input.blocks.filter((b) => b.preserve).map((b) => ({
    id: b.id,
    messageId: b.messageId,
    type: b.type,
    markdown: b.markdown,
  }))
  const messageBrief = input.messages.map((m) => ({
    id: m.id,
    role: m.role,
    // Keep structure — do not collapse whitespace inside fences/tables
    content: m.content.length > 6_000 ? `${m.content.slice(0, 6_000)}\n…` : m.content,
  }))
  const schema = {
    title: 'string',
    summary: 'string?',
    sections: [{
      heading: 'string',
      bodyMarkdown: 'string — Markdown body WITHOUT the ## heading line',
      sourceMessageIds: ['message ids actually used for this section'],
      preservedBlockIds: ['optional block ids embedded or referenced'],
    }],
  }
  const payload = {
    documentType: label,
    templateId: input.templateId,
    suggestedHeadings: headings,
    sessionTitle: input.sessionTitle,
    locale: input.locale,
    messages: messageBrief,
    preservedBlocks: preserveBlocks,
    outputSchema: schema,
    requirements: [
      `Prefer sections covering: ${headings.join(', ')}.`,
      'Only cite message ids from messages[].id.',
      'Only cite preservedBlockIds from preservedBlocks[].id.',
      'Do not bind every section to the full message list unless each section truly used all messages.',
      'Return JSON only.',
    ],
  }
  return [
    'Organize the following authorized session content into the JSON schema.',
    '',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ].join('\n')
}

/** Tolerant parse of model JSON → GeneratedDocumentResult. */
export function parseGeneratedDocumentJson(raw: string): {
  ok: true
  result: GeneratedDocumentResult
} | { ok: false; reason: string } {
  let text = (raw || '').trim()
  if (!text) return { ok: false, reason: 'empty_output' }

  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i)
  if (fence?.[1]) text = fence[1].trim()

  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'invalid_json' }
  }

  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'not_object' }
  const obj = parsed as Record<string, unknown>
  const title = typeof obj.title === 'string' ? obj.title.trim() : ''
  const sectionsRaw = Array.isArray(obj.sections) ? obj.sections : null
  if (!title || !sectionsRaw || sectionsRaw.length === 0) {
    return { ok: false, reason: 'missing_fields' }
  }

  const sections = sectionsRaw.map((s) => {
    const sec = (s && typeof s === 'object') ? s as Record<string, unknown> : {}
    const heading = typeof sec.heading === 'string' ? sec.heading.trim() : ''
    let bodyMarkdown = typeof sec.bodyMarkdown === 'string' ? sec.bodyMarkdown : (typeof sec.body === 'string' ? sec.body : '')
    bodyMarkdown = stripModelPreamble(bodyMarkdown)
    // Strip accidental heading line duplication
    bodyMarkdown = bodyMarkdown.replace(new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*\\n`, 'i'), '')
    const sourceMessageIds = Array.isArray(sec.sourceMessageIds)
      ? sec.sourceMessageIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
    const preservedBlockIds = Array.isArray(sec.preservedBlockIds)
      ? sec.preservedBlockIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : undefined
    return { heading, bodyMarkdown, sourceMessageIds, preservedBlockIds }
  }).filter((s) => s.heading)

  if (sections.length === 0) return { ok: false, reason: 'no_sections' }

  return {
    ok: true,
    result: {
      title: title.slice(0, 200),
      summary: typeof obj.summary === 'string' ? obj.summary : undefined,
      sections,
    },
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sb = new Set(b)
  return a.every((id) => sb.has(id))
}

/**
 * Restore {{block:id}} placeholders and append missing preserve blocks referenced by id.
 */
export function materializePreservedBlocks(
  bodyMarkdown: string,
  preservedBlockIds: string[] | undefined,
  blockMap: Map<string, SessionContentBlock>,
): string {
  let body = bodyMarkdown
  const used = new Set<string>()
  body = body.replace(/\{\{block:([A-Za-z0-9_-]+)\}\}/g, (_m, id: string) => {
    const block = blockMap.get(id)
    if (!block) return ''
    used.add(id)
    return block.markdown.trim()
  })
  for (const id of preservedBlockIds || []) {
    if (used.has(id)) continue
    const block = blockMap.get(id)
    if (!block) continue
    if (body.includes(block.markdown.trim())) {
      used.add(id)
      continue
    }
    body = `${body.trim()}\n\n${block.markdown.trim()}\n`
    used.add(id)
  }
  return body.trim()
}

export interface AssembleDocumentResult {
  title: string
  body: string
  sourceReferences: DocumentSourceReference[]
  sourceMode: 'section' | 'document'
}

/**
 * CA assembles final Markdown from structured result. Model never writes anchors.
 */
export function assembleDocumentFromStructuredResult(input: {
  result: GeneratedDocumentResult
  documentId: string
  sessionId: string
  authorizedMessageIds: string[]
  blocks: SessionContentBlock[]
}): AssembleDocumentResult {
  const allowed = new Set(input.authorizedMessageIds)
  const blockMap = new Map(input.blocks.map((b) => [b.id, b]))
  const parts: string[] = [`# ${input.result.title}`, '']
  if (input.result.summary?.trim()) {
    parts.push(input.result.summary.trim(), '')
  }

  const sectionRefs: DocumentSourceReference[] = []
  let anyValidSectionSources = false
  let allSectionsFullSession = input.result.sections.length > 0

  for (const section of input.result.sections) {
    const sectionId = newSectionId()
    const body = materializePreservedBlocks(
      section.bodyMarkdown,
      section.preservedBlockIds,
      blockMap,
    )
    parts.push(`## ${section.heading}`)
    parts.push(makeSectionAnchor(sectionId))
    parts.push('')
    parts.push(body || '_（待补充）_')
    parts.push('')

    const validIds = (section.sourceMessageIds || []).filter((id) => allowed.has(id))
    // Also include message ids from preserved blocks
    for (const bid of section.preservedBlockIds || []) {
      const blk = blockMap.get(bid)
      if (blk && allowed.has(blk.messageId) && !validIds.includes(blk.messageId)) {
        validIds.push(blk.messageId)
      }
    }

    if (validIds.length > 0) {
      anyValidSectionSources = true
      sectionRefs.push({
        schemaVersion: 1,
        documentId: input.documentId,
        sectionId,
        sessionId: input.sessionId,
        messageIds: validIds,
        headingSnapshot: section.heading.slice(0, 200),
      })
    } else {
      // Still create section anchor but no message binding yet — will rely on doc-level if needed
      sectionRefs.push({
        schemaVersion: 1,
        documentId: input.documentId,
        sectionId,
        sessionId: input.sessionId,
        messageIds: [],
        headingSnapshot: section.heading.slice(0, 200),
      })
    }

    if (!sameIdSet(validIds, input.authorizedMessageIds) || input.authorizedMessageIds.length < 2) {
      allSectionsFullSession = false
    }
  }

  const body = `${parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`

  // Collapse: no valid per-section sources OR every section wrongly bound to full session
  if (!anyValidSectionSources || allSectionsFullSession) {
    return {
      title: input.result.title,
      body,
      sourceReferences: [{
        schemaVersion: 1,
        documentId: input.documentId,
        sectionId: DOCUMENT_LEVEL_SECTION_ID,
        sessionId: input.sessionId,
        messageIds: input.authorizedMessageIds.filter((id) => allowed.has(id)),
        headingSnapshot: '全文来源',
        documentLevel: true,
      }],
      sourceMode: 'document',
    }
  }

  // Drop empty messageIds section refs from UI noise — keep only sections with real sources
  // But retain anchors in body. Orphan-friendly: keep refs with empty ids? Prefer only non-empty.
  return {
    title: input.result.title,
    body,
    sourceReferences: sectionRefs.filter((r) => r.messageIds.length > 0),
    sourceMode: 'section',
  }
}

/**
 * Insert craft-section anchors after each ## heading.
 * Prefer assembleDocumentFromStructuredResult for AI path.
 * When perSectionMessageIds omitted, uses document-level source (NOT full stamp per section).
 */
export function injectCraftSectionAnchors(input: {
  markdown: string
  documentId: string
  sessionId: string
  authorizedMessageIds: string[]
  /** Optional parallel list of message ids per ## heading (same order). */
  perSectionMessageIds?: string[][]
  forceDocumentLevelSources?: boolean
}): { body: string; sourceReferences: DocumentSourceReference[] } {
  const allowed = new Set(input.authorizedMessageIds.filter(Boolean))
  const safeIds = input.authorizedMessageIds.filter((id) => allowed.has(id))
  const lines = input.markdown.split('\n')
  const out: string[] = []
  const refs: DocumentSourceReference[] = []
  let sectionIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    out.push(line)
    const heading = line.match(/^##\s+(.+)$/)
    if (heading) {
      const sectionId = newSectionId()
      out.push(makeSectionAnchor(sectionId))
      const per = input.perSectionMessageIds?.[sectionIndex]
      const msgIds = (per || [])
        .filter((id) => allowed.has(id))
      refs.push({
        schemaVersion: 1,
        documentId: input.documentId,
        sectionId,
        sessionId: input.sessionId,
        messageIds: msgIds,
        headingSnapshot: heading[1]!.trim().slice(0, 200),
      })
      sectionIndex += 1
    }
  }

  if (refs.length === 0) {
    const sectionId = newSectionId()
    out.push('', '## 主要内容', makeSectionAnchor(sectionId), '')
    refs.push({
      schemaVersion: 1,
      documentId: input.documentId,
      sectionId,
      sessionId: input.sessionId,
      messageIds: [],
      headingSnapshot: '主要内容',
    })
  }

  const body = `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
  const useDocumentLevel = input.forceDocumentLevelSources
    || refs.every((r) => r.messageIds.length === 0)
    || (
      refs.length > 1
      && refs.every((r) => sameIdSet(r.messageIds, safeIds) && safeIds.length >= 2)
    )

  if (useDocumentLevel) {
    return {
      body,
      sourceReferences: [{
        schemaVersion: 1,
        documentId: input.documentId,
        sectionId: DOCUMENT_LEVEL_SECTION_ID,
        sessionId: input.sessionId,
        messageIds: safeIds,
        headingSnapshot: '全文来源',
        documentLevel: true,
      }],
    }
  }

  return {
    body,
    sourceReferences: refs.filter((r) => r.messageIds.length > 0),
  }
}

/** Legacy free-markdown sanitize — still used as last-resort before excerpt. */
export function sanitizeLibraryModelMarkdown(raw: string, fallbackTitle: string): {
  ok: true
  markdown: string
  title: string
} | { ok: false; reason: string } {
  let text = (raw || '').trim()
  if (!text) return { ok: false, reason: 'empty_output' }

  const fence = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i)
  if (fence?.[1]) text = fence[1].trim()
  text = text.replace(/^```(?:markdown|md)?\s*\n/i, '')
  text = text.replace(/\n```\s*$/i, '')
  text = stripModelPreamble(text)

  if (text.length > 80_000) {
    text = `${text.slice(0, 80_000)}\n\n_（内容过长，已截断）_\n`
  }

  const withoutTitle = text.replace(/^#\s+[^\n]+\n?/, '').trim()
  if (withoutTitle.length < 8 && !/^##\s+/m.test(text)) {
    return { ok: false, reason: 'insufficient_body' }
  }

  let title = fallbackTitle
  const titleMatch = text.match(/^#\s+(.+)$/m)
  if (titleMatch?.[1]) {
    title = titleMatch[1].trim().slice(0, 200)
  } else {
    text = `# ${fallbackTitle}\n\n${text}`
  }

  if (!/^##\s+/m.test(text)) {
    text = `${text.trim()}\n\n## 主要内容\n\n_（由系统补充章节）_\n`
  }

  return { ok: true, markdown: text.endsWith('\n') ? text : `${text}\n`, title }
}

/**
 * Preserve mode: keep message order + Markdown structure. No model call.
 */
export function buildPreserveDocument(input: {
  documentId: string
  sessionId: string
  sessionTitle: string
  messages: LibraryGenerateMessage[]
  blocks?: SessionContentBlock[]
}): AssembleDocumentResult {
  const title = (input.sessionTitle || '会话文档').slice(0, 200)
  const blocks = input.blocks ?? extractSessionContentBlocks(input.messages)
  const parts: string[] = [`# ${title}`, '']
  const messageIds = input.messages.map((m) => m.id)

  // Group blocks by message, emit ## per message for navigable sections
  let currentMessageId: string | null = null
  let sectionId = newSectionId()
  const refs: DocumentSourceReference[] = []

  for (const block of blocks) {
    if (block.messageId !== currentMessageId) {
      currentMessageId = block.messageId
      sectionId = newSectionId()
      const msg = input.messages.find((m) => m.id === block.messageId)
      const roleLabel = msg?.role === 'user' ? '用户' : msg?.role === 'system' ? '系统' : '助手'
      const heading = `${roleLabel}`
      parts.push(`## ${heading}`)
      parts.push(makeSectionAnchor(sectionId))
      parts.push('')
      refs.push({
        schemaVersion: 1,
        documentId: input.documentId,
        sectionId,
        sessionId: input.sessionId,
        messageIds: [block.messageId],
        headingSnapshot: heading,
      })
    }
    parts.push(block.markdown.replace(/\n+$/, ''))
    parts.push('')
  }

  if (refs.length === 0) {
    // Fallback: dump joined markdown under one section
    const sid = newSectionId()
    parts.push('## 会话内容', makeSectionAnchor(sid), '', blocksToMarkdown(blocks))
    refs.push({
      schemaVersion: 1,
      documentId: input.documentId,
      sectionId: sid,
      sessionId: input.sessionId,
      messageIds,
      headingSnapshot: '会话内容',
    })
  }

  return {
    title,
    body: `${parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`,
    sourceReferences: refs,
    sourceMode: 'section',
  }
}

/** Template + structured excerpt fallback (preserves rich blocks). */
export function buildExcerptFallbackDocument(input: {
  documentId: string
  sessionId: string
  sessionTitle: string
  templateId: LibraryDocumentTemplateId
  messages: LibraryGenerateMessage[]
  blocks?: SessionContentBlock[]
}): AssembleDocumentResult {
  const title = (input.sessionTitle || '会话文档').slice(0, 200)
  const headings = LIBRARY_TEMPLATE_HEADINGS[input.templateId]
  const messageIds = input.messages.map((m) => m.id)
  const blocks = input.blocks ?? extractSessionContentBlocks(input.messages)
  const preserve = blocks.filter((b) => b.preserve)
  const prose = blocks.filter((b) => !b.preserve && (b.type === 'paragraph' || b.type === 'heading'))

  const parts: string[] = [`# ${title}`, '']
  // Document-level source only — avoid stamping full session on every template heading
  const sourceReferences: DocumentSourceReference[] = [{
    schemaVersion: 1,
    documentId: input.documentId,
    sectionId: DOCUMENT_LEVEL_SECTION_ID,
    sessionId: input.sessionId,
    messageIds,
    headingSnapshot: '全文来源',
    documentLevel: true,
  }]

  for (let hi = 0; hi < headings.length; hi++) {
    const heading = headings[hi]!
    const sectionId = newSectionId()
    parts.push(`## ${heading}`)
    parts.push(makeSectionAnchor(sectionId))
    parts.push('')

    if (hi === 0) {
      // First section: short prose excerpts (keep markdown paragraphs)
      const excerpt = prose.slice(0, 4).map((b) => b.markdown.trim()).filter(Boolean).join('\n\n')
      parts.push(excerpt || '_（待补充）_')
    } else if (hi === 1 && preserve.length > 0) {
      parts.push(preserve.map((b) => b.markdown.trim()).join('\n\n'))
    } else if (hi === headings.length - 1) {
      const rest = prose.slice(4, 8).map((b) => b.markdown.trim()).filter(Boolean).join('\n\n')
      parts.push(rest || '_（待补充）_')
    } else {
      parts.push('_（待补充）_')
    }
    parts.push('')
  }

  // Ensure all preserve blocks appear at least once
  const bodySoFar = parts.join('\n')
  for (const block of preserve) {
    if (!bodySoFar.includes(block.markdown.trim())) {
      parts.push('## 附录：保留内容', makeSectionAnchor(newSectionId()), '', block.markdown.trim(), '')
    }
  }

  return {
    title,
    body: `${parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`,
    sourceReferences,
    sourceMode: 'document',
  }
}

export function estimateSessionChars(messages: LibraryGenerateMessage[]): number {
  return messages.reduce((n, m) => n + (m.content?.length || 0), 0)
}

export function analyzeSessionForLibrary(messages: LibraryGenerateMessage[]): {
  totalMessages: number
  usedMessages: number
  estimatedChars: number
  truncated: boolean
  preserveBlockCount: number
  blocks: SessionContentBlock[]
  exceedsBudget: boolean
} {
  const blocks = extractSessionContentBlocks(messages)
  const estimatedChars = estimateSessionChars(messages)
  const exceedsBudget = estimatedChars > LIBRARY_CONTEXT_BUDGET_CHARS
    || messages.length > LIBRARY_MAX_MESSAGES_SOFT
  return {
    totalMessages: messages.length,
    usedMessages: messages.length,
    estimatedChars,
    truncated: false,
    preserveBlockCount: blocks.filter((b) => b.preserve).length,
    blocks,
    exceedsBudget,
  }
}

/**
 * Chunk messages on boundaries without splitting preserve-rich messages mid-flight.
 * Each chunk is a list of whole messages.
 */
export function chunkMessagesForLibrary(
  messages: LibraryGenerateMessage[],
  budgetChars = LIBRARY_CONTEXT_BUDGET_CHARS,
): LibraryGenerateMessage[][] {
  if (estimateSessionChars(messages) <= budgetChars) return [messages]
  const chunks: LibraryGenerateMessage[][] = []
  let current: LibraryGenerateMessage[] = []
  let size = 0
  for (const msg of messages) {
    const len = msg.content?.length || 0
    if (current.length > 0 && size + len > budgetChars) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(msg)
    size += len
  }
  if (current.length) chunks.push(current)
  return chunks
}

export function qualityCheckStructured(
  result: GeneratedDocumentResult,
  authorizedMessageIds: string[],
  blocks: SessionContentBlock[],
  sourceMarkdown: string,
): QualityGateResult {
  return runLibraryQualityGate({ result, authorizedMessageIds, blocks, sourceMarkdown })
}
