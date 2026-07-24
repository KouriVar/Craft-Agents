/**
 * Library document generation quality gates (Phase D.2).
 */

import type { GeneratedDocumentResult, SessionContentBlock } from './types.ts'

export type QualityIssueCode =
  | 'empty'
  | 'duplicate_sections'
  | 'identical_bodies'
  | 'broken_table'
  | 'unclosed_fence'
  | 'anchor_leak'
  | 'fake_message_id'
  | 'fake_block_id'
  | 'mechanical_copy'
  | 'model_preamble'
  | 'template_only'
  | 'truncated'
  | 'all_sections_full_session'

export interface QualityIssue {
  code: QualityIssueCode
  detail?: string
}

export interface QualityGateResult {
  ok: boolean
  issues: QualityIssue[]
}

const PREAMBLE_RE = /^(?:以下是|下面是|这是|整理后的文档|Here is|Here's|I've organized|As requested)/i

function normalizeBody(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

function similarity(a: string, b: string): number {
  const na = normalizeBody(a)
  const nb = normalizeBody(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const shorter = na.length < nb.length ? na : nb
  const longer = na.length < nb.length ? nb : na
  if (longer.includes(shorter) && shorter.length > 40) return shorter.length / longer.length
  // rough token overlap
  const ta = new Set(na.split(' ').filter((w) => w.length > 1))
  const tb = new Set(nb.split(' ').filter((w) => w.length > 1))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  return (2 * inter) / (ta.size + tb.size)
}

export function detectBrokenMarkdown(markdown: string): QualityIssue[] {
  const issues: QualityIssue[] = []
  if (/⟦CRAFT_SECTION:|<!--\s*craft-section:/i.test(markdown)) {
    issues.push({ code: 'anchor_leak', detail: 'model emitted internal anchors' })
  }

  const fenceMatches = markdown.match(/^(`{3,}|~{3,})/gm) || []
  if (fenceMatches.length % 2 !== 0) {
    issues.push({ code: 'unclosed_fence' })
  }

  const lines = markdown.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.includes('|') && i + 1 < lines.length) {
      const next = lines[i + 1]!
      if (/^\s*\|?[\s:|-]+\|/.test(next) && next.includes('-')) {
        // header + sep — check at least one data row or accept empty table as broken
        const row = lines[i + 2]
        if (!row || !row.includes('|')) {
          issues.push({ code: 'broken_table', detail: `line ${i + 1}` })
        }
      }
    }
    // Flattened table smell: many pipes without newlines around separator
    if (/\|.*\|.*\|.*---/.test(line) && !line.trim().startsWith('|')) {
      issues.push({ code: 'broken_table', detail: 'flattened table row' })
    }
  }
  return issues
}

export function detectDuplicateSections(result: GeneratedDocumentResult): QualityIssue[] {
  const issues: QualityIssue[] = []
  const bodies = result.sections.map((s) => normalizeBody(s.bodyMarkdown))
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (!bodies[i] || !bodies[j]) continue
      if (bodies[i] === bodies[j] || similarity(result.sections[i]!.bodyMarkdown, result.sections[j]!.bodyMarkdown) >= 0.92) {
        issues.push({
          code: bodies[i] === bodies[j] ? 'identical_bodies' : 'duplicate_sections',
          detail: `${result.sections[i]!.heading} ↔ ${result.sections[j]!.heading}`,
        })
      }
    }
  }
  return issues
}

export function validateGeneratedIds(
  result: GeneratedDocumentResult,
  authorizedMessageIds: string[],
  blockIds: string[],
): QualityIssue[] {
  const issues: QualityIssue[] = []
  const allowedMsg = new Set(authorizedMessageIds)
  const allowedBlk = new Set(blockIds)
  for (const section of result.sections) {
    for (const id of section.sourceMessageIds || []) {
      if (!allowedMsg.has(id)) issues.push({ code: 'fake_message_id', detail: id })
    }
    for (const id of section.preservedBlockIds || []) {
      if (!allowedBlk.has(id)) issues.push({ code: 'fake_block_id', detail: id })
    }
  }
  return issues
}

export function detectMechanicalOrEmpty(
  result: GeneratedDocumentResult,
  sourceMarkdown: string,
): QualityIssue[] {
  const issues: QualityIssue[] = []
  if (!result.title?.trim() || result.sections.length === 0) {
    issues.push({ code: 'empty' })
    return issues
  }
  const joined = result.sections.map((s) => s.bodyMarkdown).join('\n')
  if (normalizeBody(joined).length < 12) {
    issues.push({ code: 'empty' })
  }
  if (PREAMBLE_RE.test(joined.trim()) || PREAMBLE_RE.test(result.title)) {
    issues.push({ code: 'model_preamble' })
  }
  // Template-only: headings with empty/placeholder bodies
  const placeholders = result.sections.filter((s) => {
    const b = s.bodyMarkdown.trim()
    return !b || /^[（(]?待补充[）)]?$/.test(b) || /^_?（待补充）_?$/.test(b)
  })
  if (placeholders.length === result.sections.length) {
    issues.push({ code: 'template_only' })
  }
  // Mechanical copy: entire source dumped identically into every section
  const src = normalizeBody(sourceMarkdown)
  if (src.length > 80) {
    const allCopy = result.sections.every((s) => {
      const b = normalizeBody(s.bodyMarkdown)
      return b.length > 40 && (b === src || src.includes(b) && b.length / src.length > 0.85)
    })
    if (allCopy && result.sections.length > 1) {
      issues.push({ code: 'mechanical_copy' })
    }
  }
  if (/…$|\.\.\.$|（内容过长，已截断）|_（内容过长/.test(joined)) {
    issues.push({ code: 'truncated' })
  }
  return issues
}

export function detectAllSectionsFullSession(
  result: GeneratedDocumentResult,
  authorizedMessageIds: string[],
): QualityIssue[] {
  if (result.sections.length < 2 || authorizedMessageIds.length < 2) return []
  const full = new Set(authorizedMessageIds)
  const allFull = result.sections.every((s) => {
    const ids = s.sourceMessageIds || []
    if (ids.length !== full.size) return false
    return ids.every((id) => full.has(id))
  })
  return allFull ? [{ code: 'all_sections_full_session' }] : []
}

/** Run full quality gate on structured AI result. */
export function runLibraryQualityGate(input: {
  result: GeneratedDocumentResult
  authorizedMessageIds: string[]
  blocks: SessionContentBlock[]
  sourceMarkdown: string
}): QualityGateResult {
  const issues: QualityIssue[] = [
    ...detectDuplicateSections(input.result),
    ...detectBrokenMarkdown(
      `# ${input.result.title}\n\n${input.result.sections.map((s) => `## ${s.heading}\n\n${s.bodyMarkdown}`).join('\n\n')}`,
    ),
    ...validateGeneratedIds(
      input.result,
      input.authorizedMessageIds,
      input.blocks.map((b) => b.id),
    ),
    ...detectMechanicalOrEmpty(input.result, input.sourceMarkdown),
    ...detectAllSectionsFullSession(input.result, input.authorizedMessageIds),
  ]
  // Fake IDs are hard failures; all_sections_full_session is a soft signal (assembled with doc-level sources)
  const hard = issues.filter((i) => i.code !== 'all_sections_full_session')
  return { ok: hard.length === 0, issues }
}

/** Strip model preamble lines from section bodies (auto-fix). */
export function stripModelPreamble(text: string): string {
  return text.replace(/^(?:以下是整理后的文档[：:。]?|Here is the (?:organized )?document[.:]?)\s*/i, '').trim()
}
