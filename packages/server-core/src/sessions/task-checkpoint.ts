const NEXT_HEADING = /(?:下一步|接下来|待办|todo|next steps?|follow[ -]?ups?)/i
const BLOCKER_HEADING = /(?:阻塞|卡住|未解决|等待|风险|blockers?|blocked|unresolved|risks?)/i
const SUMMARY_HEADING = /(?:结果|完成|总结|进展|产出|result|summary|completed|outcome|progress)/i

function cleanLine(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/[*_~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sectionForHeading(line: string): 'summary' | 'next' | 'blockers' | 'other' {
  if (NEXT_HEADING.test(line)) return 'next'
  if (BLOCKER_HEADING.test(line)) return 'blockers'
  if (SUMMARY_HEADING.test(line)) return 'summary'
  return 'other'
}

function uniqueLimited(values: string[], limit: number): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = cleanLine(value).slice(0, 240)
    const key = normalized.toLocaleLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
    if (result.length >= limit) break
  }
  return result
}

export function extractCheckpointFiles(text: string): string[] {
  const candidates: string[] = []
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const value = match[1]?.trim()
    if (!value || value.length > 260) continue
    if (/(?:^|[/\\])[\w .@()+-]+\.[a-z0-9]{1,12}(?::\d+)?$/i.test(value) || /^[\w@()+-]+\.[a-z0-9]{1,12}(?::\d+)?$/i.test(value)) {
      candidates.push(value)
    }
  }
  return uniqueLimited(candidates, 10)
}

export interface TaskCheckpointContent {
  summary: string
  nextSteps?: string[]
  blockers?: string[]
  relatedFiles?: string[]
}

/**
 * Turn an agent's final response into a compact, durable resume point.
 * This intentionally stays deterministic: saving a checkpoint never performs
 * another model call, adds latency, or fails because a provider is unavailable.
 */
export function buildTaskCheckpointContent(text: string): TaskCheckpointContent {
  const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, ' ')
  const lines = withoutCodeBlocks.split(/\r?\n/)
  const summaryLines: string[] = []
  const fallbackLines: string[] = []
  const nextSteps: string[] = []
  const blockers: string[] = []
  let section: 'summary' | 'next' | 'blockers' | 'other' = 'other'

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/)?.[1]
      ?? (/^[^\n]{1,48}:$/.test(trimmed) ? trimmed.slice(0, -1) : undefined)
    if (heading) {
      section = sectionForHeading(heading)
      continue
    }

    const cleaned = cleanLine(trimmed)
    if (!cleaned) continue
    const listItem = trimmed.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/)?.[1]
    if (section === 'next' && listItem) nextSteps.push(listItem)
    else if (section === 'blockers' && listItem) blockers.push(listItem)
    else if (section === 'next' || section === 'blockers') {
      section = 'other'
      fallbackLines.push(cleaned)
    }
    else if (section === 'summary') summaryLines.push(cleaned)
    else fallbackLines.push(cleaned)
  }

  const preferred = uniqueLimited(summaryLines, 4)
  const fallback = uniqueLimited(fallbackLines, 5)
    .filter((line) => !NEXT_HEADING.test(line) && !BLOCKER_HEADING.test(line))
  const selected = preferred.length ? preferred : fallback
  let summary = selected.join(' ').trim()
  if (!summary) summary = cleanLine(withoutCodeBlocks)
  if (summary.length > 480) {
    const boundary = Math.max(summary.lastIndexOf('。', 460), summary.lastIndexOf('. ', 460))
    summary = `${summary.slice(0, boundary >= 180 ? boundary + 1 : 477).trim()}…`
  }

  const result: TaskCheckpointContent = { summary }
  const cleanNextSteps = uniqueLimited(nextSteps, 5)
  const cleanBlockers = uniqueLimited(blockers, 5)
  const relatedFiles = extractCheckpointFiles(text)
  if (cleanNextSteps.length) result.nextSteps = cleanNextSteps
  if (cleanBlockers.length) result.blockers = cleanBlockers
  if (relatedFiles.length) result.relatedFiles = relatedFiles
  return result
}
