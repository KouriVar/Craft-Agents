/**
 * craft-section HTML comment anchors — TipTap-safe protect/restore.
 *
 * Phase D.2: Library UI should prefer editor-body detach/reattach so
 * placeholders never appear in the editor. protect/restore remain for
 * legacy round-trips and tests.
 */

import { CRAFT_SECTION_COMMENT_RE, makeSectionAnchor } from './types.ts'

const PLACEHOLDER_PREFIX = '⟦CRAFT_SECTION:'
const PLACEHOLDER_SUFFIX = '⟧'

/**
 * Protect HTML comment anchors before TipTap parse so they survive the round-trip.
 * Uses a plain-text placeholder line TipTap will keep as a paragraph.
 * @deprecated Prefer detachSectionAnchorsForEdit for Library UI (invisible).
 */
export function protectSectionAnchors(markdown: string): string {
  return markdown.replace(CRAFT_SECTION_COMMENT_RE, (_m, sectionId: string) => {
    return `\n\n${PLACEHOLDER_PREFIX}${sectionId}${PLACEHOLDER_SUFFIX}\n\n`
  })
}

/** Restore placeholders back to HTML comments after TipTap serialize. */
export function restoreSectionAnchors(markdown: string): string {
  const re = new RegExp(
    `${escapeRegExp(PLACEHOLDER_PREFIX)}([A-Za-z0-9_-]+)${escapeRegExp(PLACEHOLDER_SUFFIX)}`,
    'g',
  )
  return markdown
    .replace(re, (_m, sectionId: string) => makeSectionAnchor(sectionId))
    .replace(/\n{3,}/g, '\n\n')
}

/** Strip craft-section comments and legacy placeholders for user-facing surfaces. */
export function stripSectionAnchors(markdown: string): string {
  return markdown
    .replace(CRAFT_SECTION_COMMENT_RE, '')
    .replace(new RegExp(`${escapeRegExp(PLACEHOLDER_PREFIX)}[A-Za-z0-9_-]+${escapeRegExp(PLACEHOLDER_SUFFIX)}`, 'g'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n'
}

export function extractSectionIds(markdown: string): string[] {
  const ids: string[] = []
  const re = new RegExp(CRAFT_SECTION_COMMENT_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(markdown)) !== null) {
    ids.push(match[1]!)
  }
  // Also collect legacy placeholders
  const pre = new RegExp(`${escapeRegExp(PLACEHOLDER_PREFIX)}([A-Za-z0-9_-]+)${escapeRegExp(PLACEHOLDER_SUFFIX)}`, 'g')
  while ((match = pre.exec(markdown)) !== null) {
    ids.push(match[1]!)
  }
  return ids
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
