import type {
  CowartCanvasWidgetDescriptor,
  WidgetContentBlock,
  WidgetDescriptor,
} from '../../../shared/widget-runtime'

const WIDGET_DIRECTIVE_LINE = /^ {0,3}::(codex-inline-vis|craft-widget)\{(.*)\}[\t ]*$/
const ATTRIBUTE_PATTERN = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))/g
export const CRAFT_WIDGET_RESULT_PREFIX = '__CRAFT_WIDGET_DESCRIPTOR__'

function stableId(prefix: string, value: string, index: number): string {
  let hash = 2166136261
  const input = `${value}:${index}`
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

export function parseWidgetContent(content: string): WidgetContentBlock[] {
  const blocks: WidgetContentBlock[] = []
  let cursor = 0
  let offset = 0
  let fence: { marker: '`' | '~'; length: number } | null = null

  for (const lineWithNewline of content.match(/.*(?:\r?\n|$)/g) ?? []) {
    if (!lineWithNewline) continue
    const line = lineWithNewline.replace(/\r?\n$/, '')
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as '`' | '~'
      if (!fence) {
        fence = { marker, length: fenceMatch[1].length }
      } else if (fence.marker === marker && fenceMatch[1].length >= fence.length) {
        fence = null
      }
      offset += lineWithNewline.length
      continue
    }

    const match = fence ? null : line.match(WIDGET_DIRECTIVE_LINE)
    if (!match) {
      offset += lineWithNewline.length
      continue
    }

    const descriptor = widgetDescriptorFromDirective(match[1], match[2], offset)
    if (!descriptor) {
      offset += lineWithNewline.length
      continue
    }

    if (offset > cursor) {
      blocks.push({
        type: 'markdown',
        id: stableId('markdown', content.slice(cursor, offset), cursor),
        content: content.slice(cursor, offset),
      })
    }

    blocks.push({ type: 'widget', id: descriptor.id, descriptor })
    cursor = offset + lineWithNewline.length
    offset += lineWithNewline.length
  }

  if (cursor < content.length || blocks.length === 0) {
    blocks.push({
      type: 'markdown',
      id: stableId('markdown', content.slice(cursor), cursor),
      content: content.slice(cursor),
    })
  }

  return blocks
}

function parseDirectiveAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  ATTRIBUTE_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ATTRIBUTE_PATTERN.exec(input)) !== null) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attrs
}

function boundedHeight(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(180, Math.min(1200, parsed))
}

function widgetDescriptorFromDirective(kind: string, rawAttributes: string, index: number): WidgetDescriptor | null {
  const attrs = parseDirectiveAttributes(rawAttributes)

  if (kind === 'codex-inline-vis') {
    const file = attrs.file?.trim()
    if (!file) return null
    return {
      kind: 'visualize-html',
      id: stableId('visualize', `${file}:${attrs.title ?? ''}`, index),
      file,
      source: 'codex-inline-vis',
      title: attrs.title?.trim() || undefined,
      height: boundedHeight(attrs.height),
    }
  }

  if (kind === 'craft-widget') {
    const widgetKind = attrs.kind?.trim()
    if (widgetKind === 'visualize-html') {
      const file = attrs.file?.trim()
      if (!file) return null
      return {
        kind: 'visualize-html',
        id: attrs.id?.trim() || stableId('visualize', `${file}:${attrs.title ?? ''}`, index),
        file,
        source: 'craft',
        title: attrs.title?.trim() || undefined,
        height: boundedHeight(attrs.height),
      }
    }

    if (widgetKind === 'cowart-canvas') {
      const projectDir = attrs.projectDir?.trim()
      if (!projectDir) return null
      return {
        kind: 'cowart-canvas',
        id: attrs.id?.trim() || stableId('cowart', `${projectDir}:${attrs.pageId ?? ''}`, index),
        projectDir,
        pageId: attrs.pageId?.trim() || undefined,
        source: 'craft',
        title: attrs.title?.trim() || undefined,
      }
    }
  }

  return null
}

/** Adapter reserved for structured Cowart tool results. Tool wiring can call this later. */
export function widgetDescriptorFromToolResult(result: unknown): CowartCanvasWidgetDescriptor | null {
  if (!result || typeof result !== 'object') return null
  const value = result as Record<string, unknown>
  if (value.widget && typeof value.widget === 'object') {
    return widgetDescriptorFromToolResult(value.widget)
  }
  if (value.kind !== 'cowart-canvas' || typeof value.projectDir !== 'string') return null

  const pageId = typeof value.pageId === 'string' ? value.pageId : undefined
  return {
    kind: 'cowart-canvas',
    id: typeof value.id === 'string'
      ? value.id
      : stableId('cowart', `${value.projectDir}:${pageId ?? ''}`, 0),
    projectDir: value.projectDir,
    pageId,
    source: value.source === 'craft' ? 'craft' : 'cowart-tool',
    title: typeof value.title === 'string' ? value.title : undefined,
  }
}

export function widgetDescriptorFromToolResultText(result: string): CowartCanvasWidgetDescriptor | null {
  if (!result.startsWith(CRAFT_WIDGET_RESULT_PREFIX)) return null
  try {
    return widgetDescriptorFromToolResult(JSON.parse(result.slice(CRAFT_WIDGET_RESULT_PREFIX.length)))
  } catch {
    return null
  }
}
