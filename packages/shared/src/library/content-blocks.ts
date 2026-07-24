/**
 * Extract structured SessionContentBlock[] from session messages.
 * Never flatten rich Markdown into a single plain-text line.
 */

import type { SessionContentBlock } from './types.ts'

export interface LibraryBlockMessage {
  id: string
  role: string
  content: string
}

const PRESERVE_TYPES = new Set<SessionContentBlock['type']>([
  'table',
  'code',
  'mermaid',
  'image',
  'attachment',
  'blockquote',
  'list',
])

function normalizeRole(role: string): SessionContentBlock['role'] {
  if (role === 'user' || role === 'assistant' || role === 'system') return role
  if (role === 'plan') return 'assistant'
  return 'assistant'
}

function newBlockId(messageId: string, order: number): string {
  return `blk_${messageId}_${order}`
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-|]*\|?\s*$/.test(line) && line.includes('-')
}

function isTableRow(line: string): boolean {
  const t = line.trim()
  return t.includes('|') && !t.startsWith('```')
}

function isListLine(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+/.test(line)
}

function isBlockquoteLine(line: string): boolean {
  return /^\s*>/.test(line)
}

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+\S/.test(line.trim())
}

function isImageLine(line: string): boolean {
  return /!\[[^\]]*\]\([^)]+\)/.test(line)
}

function isAttachmentLine(line: string): boolean {
  // File-like markdown links or bare paths commonly used for attachments
  return /\[[^\]]+\]\((?:file:|attachment:|\/|[A-Za-z]:\\|[^)]+\.(?:pdf|docx?|xlsx?|pptx?|zip|csv|json|txt|md)(?:\?[^)]*)?)\)/i.test(line)
    || /^\s*\[attachment:[^\]]+\]/i.test(line)
}

/**
 * Parse one message body into ordered content blocks, preserving Markdown structure.
 */
export function extractBlocksFromMarkdown(
  markdown: string,
  messageId: string,
  role: string,
  startOrder = 0,
): SessionContentBlock[] {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n')
  const blocks: SessionContentBlock[] = []
  let order = startOrder
  let i = 0
  const push = (type: SessionContentBlock['type'], md: string) => {
    const text = md.replace(/\n+$/, '')
    if (!text.trim()) return
    blocks.push({
      id: newBlockId(messageId, order),
      messageId,
      role: normalizeRole(role),
      type,
      markdown: text.endsWith('\n') ? text : `${text}\n`,
      order,
      preserve: PRESERVE_TYPES.has(type),
    })
    order += 1
  }

  while (i < lines.length) {
    const line = lines[i]!

    // Fence code / mermaid
    const fenceOpen = line.match(/^(\s*)(`{3,}|~{3,})(\w*)\s*$/)
    if (fenceOpen) {
      const marker = fenceOpen[2]!
      const lang = (fenceOpen[3] || '').toLowerCase()
      const chunk = [line]
      i += 1
      let closed = false
      while (i < lines.length) {
        chunk.push(lines[i]!)
        if (new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`).test(lines[i]!)) {
          closed = true
          i += 1
          break
        }
        i += 1
      }
      const md = `${chunk.join('\n')}${closed ? '' : `\n${marker}`}\n`
      push(lang === 'mermaid' ? 'mermaid' : 'code', md)
      continue
    }

    // Table: header + separator + rows
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
      const chunk = [line, lines[i + 1]!]
      i += 2
      while (i < lines.length && isTableRow(lines[i]!) && lines[i]!.trim() !== '') {
        chunk.push(lines[i]!)
        i += 1
      }
      push('table', `${chunk.join('\n')}\n`)
      continue
    }

    // Blockquote run
    if (isBlockquoteLine(line)) {
      const chunk = [line]
      i += 1
      while (i < lines.length && (isBlockquoteLine(lines[i]!) || lines[i]!.trim() === '')) {
        if (lines[i]!.trim() === '' && (i + 1 >= lines.length || !isBlockquoteLine(lines[i + 1]!))) break
        chunk.push(lines[i]!)
        i += 1
      }
      push('blockquote', `${chunk.join('\n')}\n`)
      continue
    }

    // List run
    if (isListLine(line)) {
      const chunk = [line]
      i += 1
      while (i < lines.length) {
        const next = lines[i]!
        if (isListLine(next) || (/^\s{2,}\S/.test(next) && next.trim() !== '')) {
          chunk.push(next)
          i += 1
          continue
        }
        if (next.trim() === '' && i + 1 < lines.length && isListLine(lines[i + 1]!)) {
          chunk.push(next)
          i += 1
          continue
        }
        break
      }
      push('list', `${chunk.join('\n')}\n`)
      continue
    }

    // Divider
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      push('divider', `${line.trim()}\n`)
      i += 1
      continue
    }

    // Heading
    if (isHeadingLine(line)) {
      push('heading', `${line.trim()}\n`)
      i += 1
      continue
    }

    // Blank
    if (line.trim() === '') {
      i += 1
      continue
    }

    // Image / attachment / paragraph (may span until blank)
    const chunk = [line]
    i += 1
    while (i < lines.length && lines[i]!.trim() !== '') {
      const next = lines[i]!
      if (
        (isTableRow(next) && i + 1 < lines.length && isTableSeparator(lines[i + 1]!))
        || isBlockquoteLine(next)
        || isListLine(next)
        || isHeadingLine(next)
        || /^\s*(`{3,}|~{3,})/.test(next)
      ) {
        break
      }
      chunk.push(next)
      i += 1
    }
    const joined = chunk.join('\n')
    if (chunk.length === 1 && isImageLine(line) && !joined.replace(line, '').trim()) {
      push('image', `${joined}\n`)
    } else if (isAttachmentLine(joined) && !isImageLine(joined)) {
      push('attachment', `${joined}\n`)
    } else if (isImageLine(joined) && chunk.every((l) => isImageLine(l) || l.trim() === '')) {
      push('image', `${joined}\n`)
    } else {
      push('paragraph', `${joined}\n`)
    }
  }

  return blocks
}

/** Extract blocks from a list of session messages in order. */
export function extractSessionContentBlocks(messages: LibraryBlockMessage[]): SessionContentBlock[] {
  const out: SessionContentBlock[] = []
  let order = 0
  for (const msg of messages) {
    const role = normalizeRole(msg.role)
    // Skip pure system noise if empty
    const content = (msg.content || '').trim()
    if (!content) continue
    const blocks = extractBlocksFromMarkdown(content, msg.id, role, order)
    for (const b of blocks) {
      out.push({ ...b, order })
      order += 1
    }
  }
  return out
}

export function estimateBlocksChars(blocks: SessionContentBlock[]): number {
  return blocks.reduce((n, b) => n + b.markdown.length, 0)
}

export function countPreserveBlocks(blocks: SessionContentBlock[]): number {
  return blocks.filter((b) => b.preserve).length
}

/** Join blocks back to Markdown preserving structure (used by preserve mode). */
export function blocksToMarkdown(blocks: SessionContentBlock[]): string {
  return `${blocks.map((b) => b.markdown.replace(/\n+$/, '')).join('\n\n').trim()}\n`
}
