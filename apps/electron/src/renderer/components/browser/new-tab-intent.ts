import { looksLikeBrowserAddress } from './utils'

export type BrowserNewTabIntent = 'navigate' | 'search' | 'ask-ai'

export interface BrowserIntentCorrection {
  signature: string
  from: BrowserNewTabIntent
  to: BrowserNewTabIntent
  timestamp: number
}

export interface BrowserIntentDecision {
  intent: BrowserNewTabIntent
  confidence: 'high' | 'medium' | 'low'
  source: 'rule' | 'history'
}

const MAX_CORRECTIONS = 120
const BROWSER_INTENTS = new Set<BrowserNewTabIntent>(['navigate', 'search', 'ask-ai'])

const QUESTION_PATTERNS = [
  /(?:^|[\s，,。.!！?？])(为什么|为何|怎么|怎样|如何|什么|哪个|哪些|是否|能否|可不可以|有没有|多少|谁|哪里|何时|怎么办)/u,
  /(?:为什么|怎么回事|怎么样|是什么|怎么办|可以吗|行不行|好不好|对不对|是否)/u,
  /^(why|how|what|when|where|who|which|is|are|can|could|would|should|do|does)\b/i,
]

const TASK_PATTERNS = [
  /(?:^|[\s，,。.!！?？])(帮我|请|解释|分析|总结|归纳|比较|对比|写|生成|翻译|改写|润色|规划|设计|实现|修复|排查|调试|计算|告诉我|教我|列出|评价|建议)/u,
  /^(please\s+|help\s+me\b|explain\b|analyse\b|analyze\b|summarize\b|compare\b|write\b|create\b|translate\b|rewrite\b|plan\b|design\b|implement\b|fix\b|debug\b|calculate\b|tell\s+me\b)/i,
]

function matchesAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value))
}

function lengthBucket(length: number): string {
  if (length <= 8) return 'xs'
  if (length <= 18) return 'sm'
  if (length <= 40) return 'md'
  return 'lg'
}

/** A privacy-safe feature signature: it contains no part of the submitted text. */
export function getBrowserIntentSignature(value: string): string {
  const trimmed = value.trim()
  const hasQuestionMark = /[?？]/u.test(trimmed)
  const hasQuestionPhrase = matchesAny(trimmed, QUESTION_PATTERNS)
  const hasTaskPhrase = matchesAny(trimmed, TASK_PATTERNS)
  const tokenCount = trimmed.split(/\s+/u).filter(Boolean).length

  return [
    looksLikeBrowserAddress(trimmed) ? 'url' : 'text',
    hasQuestionMark ? 'question-mark' : 'no-question-mark',
    hasQuestionPhrase ? 'question-phrase' : 'no-question-phrase',
    hasTaskPhrase ? 'task-phrase' : 'no-task-phrase',
    lengthBucket(trimmed.length),
    tokenCount <= 2 ? 'few-tokens' : 'many-tokens',
    /[\u3400-\u9fff]/u.test(trimmed) ? 'cjk' : 'non-cjk',
  ].join(':')
}

function learnedIntent(
  signature: string,
  corrections: readonly BrowserIntentCorrection[],
): 'search' | 'ask-ai' | null {
  let search = 0
  let askAi = 0

  for (const correction of corrections) {
    if (correction.signature !== signature) continue
    if (correction.to === 'search') search += 1
    if (correction.to === 'ask-ai') askAi += 1
  }

  // Require repeated, consistent feedback before changing automatic behavior.
  if (askAi >= 2 && askAi - search >= 2) return 'ask-ai'
  if (search >= 2 && search - askAi >= 2) return 'search'
  return null
}

export function classifyBrowserNewTabIntent(
  value: string,
  corrections: readonly BrowserIntentCorrection[] = [],
): BrowserIntentDecision {
  const trimmed = value.trim()
  if (looksLikeBrowserAddress(trimmed)) {
    return { intent: 'navigate', confidence: 'high', source: 'rule' }
  }

  const signature = getBrowserIntentSignature(trimmed)
  const learned = learnedIntent(signature, corrections)
  if (learned) return { intent: learned, confidence: 'medium', source: 'history' }

  let askScore = 0
  if (/[?？]/u.test(trimmed)) askScore += 2
  if (matchesAny(trimmed, QUESTION_PATTERNS)) askScore += 2
  if (matchesAny(trimmed, TASK_PATTERNS)) askScore += 3
  if (trimmed.length >= 28) askScore += 1

  if (askScore >= 2) {
    return {
      intent: 'ask-ai',
      confidence: askScore >= 4 ? 'high' : 'medium',
      source: 'rule',
    }
  }

  return {
    intent: 'search',
    confidence: trimmed.length <= 24 ? 'medium' : 'low',
    source: 'rule',
  }
}

export function appendBrowserIntentCorrection(
  corrections: readonly BrowserIntentCorrection[],
  value: string,
  from: BrowserNewTabIntent,
  to: BrowserNewTabIntent,
  timestamp = Date.now(),
): BrowserIntentCorrection[] {
  if (from === to || !value.trim()) return [...corrections]

  return [
    ...corrections,
    { signature: getBrowserIntentSignature(value), from, to, timestamp },
  ].slice(-MAX_CORRECTIONS)
}

export function normalizeBrowserIntentCorrections(value: unknown): BrowserIntentCorrection[] {
  if (!Array.isArray(value)) return []

  return value.filter((entry): entry is BrowserIntentCorrection => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as Partial<BrowserIntentCorrection>
    return typeof candidate.signature === 'string'
      && BROWSER_INTENTS.has(candidate.from as BrowserNewTabIntent)
      && BROWSER_INTENTS.has(candidate.to as BrowserNewTabIntent)
      && typeof candidate.timestamp === 'number'
      && Number.isFinite(candidate.timestamp)
  }).slice(-MAX_CORRECTIONS)
}
