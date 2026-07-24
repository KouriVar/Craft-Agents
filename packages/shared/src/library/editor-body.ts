/**
 * TipTap edit round-trip without visible CRAFT_SECTION placeholders.
 * Detach anchors for editing; reattach HTML comments on save by ## order.
 */

import { makeSectionAnchor, CRAFT_SECTION_COMMENT_RE } from './types.ts'
import { stripSectionAnchors } from './section-anchors.ts'

export interface DetachedSection {
  sectionId: string
  headingSnapshot: string
}

export interface DetachResult {
  content: string
  sections: DetachedSection[]
}

const PLACEHOLDER_RE = /⟦CRAFT_SECTION:([A-Za-z0-9_-]+)⟧/g

function newSectionId(): string {
  return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

/**
 * Remove all craft-section markers (comments + legacy placeholders) for the editor.
 * Captures section ids in document order (paired with following ## when possible).
 */
export function detachSectionAnchorsForEdit(body: string): DetachResult {
  const sections: DetachedSection[] = []
  const lines = (body || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const comment = /<!--\s*craft-section:([A-Za-z0-9_-]+)\s*-->/.exec(line.trim())
    const placeholder = /⟦CRAFT_SECTION:([A-Za-z0-9_-]+)⟧/.exec(line.trim())
    const sectionId = comment?.[1] || placeholder?.[1]
    if (sectionId && line.trim() === (comment?.[0] || placeholder?.[0])) {
      // Look backward for ## heading on previous non-empty line
      let heading = ''
      for (let j = out.length - 1; j >= 0; j--) {
        const prev = out[j]!.trim()
        if (!prev) continue
        const hm = /^##\s+(.+)$/.exec(prev)
        if (hm) heading = hm[1]!.trim()
        break
      }
      sections.push({ sectionId, headingSnapshot: heading })
      continue
    }
    // Strip inline markers if any
    out.push(
      line
        .replace(CRAFT_SECTION_COMMENT_RE, '')
        .replace(PLACEHOLDER_RE, ''),
    )
  }

  const content = `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
  // If we found comments not adjacent (already collected), also harvest any missed ids
  if (sections.length === 0) {
    const re = new RegExp(CRAFT_SECTION_COMMENT_RE.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(body)) !== null) {
      sections.push({ sectionId: m[1]!, headingSnapshot: '' })
    }
  }
  return { content: stripSectionAnchors(content), sections }
}

/**
 * Re-inject HTML comment anchors after each ## heading.
 * Preserves sectionIds by order from previousSections (title rename keeps id).
 */
export function reattachSectionAnchorsOnSave(
  content: string,
  previousSections: DetachedSection[],
): { body: string; sections: DetachedSection[]; orphanedSectionIds: string[] } {
  const clean = stripSectionAnchors(content)
  const lines = clean.split('\n')
  const out: string[] = []
  const used: DetachedSection[] = []
  let idx = 0

  for (const line of lines) {
    out.push(line)
    const heading = line.match(/^##\s+(.+)$/)
    if (heading) {
      const prev = previousSections[idx]
      const sectionId = prev?.sectionId || newSectionId()
      out.push(makeSectionAnchor(sectionId))
      used.push({ sectionId, headingSnapshot: heading[1]!.trim().slice(0, 200) })
      idx += 1
    }
  }

  const usedIds = new Set(used.map((s) => s.sectionId))
  const orphanedSectionIds = previousSections
    .map((s) => s.sectionId)
    .filter((id) => !usedIds.has(id))

  return {
    body: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`,
    sections: used,
    orphanedSectionIds,
  }
}
