const MERMAID_DIAGRAM_PREFIXES = [
  'graph ',
  'flowchart ',
  'flowchart-elk',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'mindmap',
  'timeline',
  'gitGraph',
  'quadrantChart',
  'requirement',
  'requirementDiagram',
  'kanban',
  'sankey',
  'sankey-beta',
  'packet',
  'packet-beta',
  'block',
  'block-beta',
  'architecture',
  'architecture-beta',
  'treemap',
  'treemap-beta',
  'swimlane-beta',
  'radar-beta',
  'treeView-beta',
  'eventmodeling',
  'ishikawa',
  'ishikawa-beta',
  'venn-beta',
  'wardley-beta',
  'cynefin-beta',
  'railroad-beta',
  'railroad-ebnf-beta',
  'railroad-abnf-beta',
  'railroad-peg-beta',
  'C4Context',
  'C4Container',
  'C4Component',
  'C4Dynamic',
  'C4Deployment',
  'xychart',
  'xychart-beta',
]

/** Remove Mermaid YAML frontmatter (`--- ... ---`) from the start of a diagram. */
export function stripMermaidFrontmatter(code: string): string {
  const withoutBom = code.replace(/^\uFEFF/, '')
  const leadingWhitespace = withoutBom.match(/^\s*/)?.[0] ?? ''
  const candidate = withoutBom.slice(leadingWhitespace.length)
  const lines = candidate.split(/\r?\n/)

  if (lines[0]?.trim() !== '---') return code

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (endIndex === -1) return code

  return lines.slice(endIndex + 1).join('\n').trimStart()
}

/**
 * Normalize Mermaid before handing it to the official renderer.
 * Frontmatter is metadata, and leading comments/directives should not control
 * diagram-type detection for renderers that route by the first meaningful line.
 */
export function normalizeMermaidSource(code: string): string {
  const lines = stripMermaidFrontmatter(code).split(/\r?\n/)
  while (lines.length > 0) {
    const first = lines[0]?.trim() ?? ''
    if (first.length === 0 || first.startsWith('%%')) {
      lines.shift()
      continue
    }
    break
  }
  return lines.join('\n').trimStart()
}

export function getFirstMermaidDiagramLine(code: string): string | null {
  const first = normalizeMermaidSource(code).split(/\r?\n/)[0]?.trim()
  return first && first.length > 0 ? first : null
}

export function looksLikeMermaidSource(code: string): boolean {
  const firstMeaningful = getFirstMermaidDiagramLine(code)
  if (!firstMeaningful) return false
  return MERMAID_DIAGRAM_PREFIXES.some(prefix => firstMeaningful.startsWith(prefix))
}
