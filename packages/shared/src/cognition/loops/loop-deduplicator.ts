/**
 * Title normalization + similarity for Loop deduplication.
 */

export function normalizeLoopTitle(title: string): string {
  return title
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Strip common action verbs so "完成插件市场" ≈ "继续完善插件市场". */
export function coreLoopTopic(title: string): string {
  return normalizeLoopTitle(title)
    .replace(/\s+/g, '')
    .replace(/^(继续|恢复|处理|完成|排查并解决|打开会话并)/u, '')
    .replace(/(仍需继续|仍需推进)$/u, '')
}

function tokens(title: string): Set<string> {
  const spaced = normalizeLoopTitle(title)
  const parts = spaced.split(' ').filter((t) => t.length > 1)
  // For CJK-heavy titles without spaces, also emit character bigrams.
  const compact = spaced.replace(/\s+/g, '')
  if (parts.length <= 1 && compact.length >= 2) {
    const grams = new Set<string>()
    for (let i = 0; i < compact.length - 1; i++) grams.add(compact.slice(i, i + 2))
    return grams
  }
  return new Set(parts)
}

/** Jaccard similarity on word tokens / char bigrams. */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.size && !tb.size) return 1
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  const union = ta.size + tb.size - inter
  return union === 0 ? 0 : inter / union
}

export function isSimilarLoopTitle(a: string, b: string, threshold = 0.45): boolean {
  const na = normalizeLoopTitle(a)
  const nb = normalizeLoopTitle(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true

  const ca = coreLoopTopic(a)
  const cb = coreLoopTopic(b)
  if (ca && cb && (ca === cb || ca.includes(cb) || cb.includes(ca))) return true

  return titleSimilarity(a, b) >= threshold
}
