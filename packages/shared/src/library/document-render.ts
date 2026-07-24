/**
 * Unified document renderer for preview/export (Markdown / HTML).
 * PDF is produced from the same HTML (Electron printToPDF).
 */

import { stripSectionAnchors } from './section-anchors.ts'

export interface DocumentRenderOptions {
  title?: string
  keepSourceMarkers?: boolean
  theme?: 'light' | 'dark'
}

/** Normalize markdown for user-facing surfaces. */
export function normalizeDocumentMarkdown(
  markdown: string,
  options: { keepSourceMarkers?: boolean } = {},
): string {
  const text = options.keepSourceMarkers ? markdown : stripSectionAnchors(markdown)
  return text.endsWith('\n') ? text : `${text}\n`
}

export function renderDocumentMarkdown(
  markdown: string,
  options: { keepSourceMarkers?: boolean } = {},
): string {
  return normalizeDocumentMarkdown(markdown, options)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, '&#39;')
}

function inlineFormat(text: string): string {
  let s = escapeHtml(text)
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
    const safeSrc = String(src).trim()
    // Block absolute local filesystem paths in exports
    if (/^(?:file:|\/Users\/|\/home\/|[A-Za-z]:\\)/i.test(safeSrc)) {
      return `<span class="img-omitted">[image]</span>`
    }
    return `<img src="${escapeAttr(safeSrc)}" alt="${escapeAttr(alt)}" />`
  })
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const h = String(href).trim()
    if (/^(?:file:|\/Users\/|\/home\/|[A-Za-z]:\\)/i.test(h)) {
      return escapeHtml(label)
    }
    return `<a href="${escapeAttr(h)}">${escapeHtml(label)}</a>`
  })
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  return s
}

function renderTable(rows: string[]): string {
  if (rows.length < 2) return `<pre>${escapeHtml(rows.join('\n'))}</pre>`
  const parseRow = (line: string) => line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())
  const header = parseRow(rows[0]!)
  const bodyRows = rows.slice(2).map(parseRow)
  const thead = `<thead><tr>${header.map((c) => `<th>${inlineFormat(c)}</th>`).join('')}</tr></thead>`
  const tbody = `<tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
  return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`
}

/** Convert markdown body to HTML fragment (no document shell). */
export function markdownToHtmlFragment(markdown: string): string {
  const md = normalizeDocumentMarkdown(markdown, { keepSourceMarkers: false })
  const lines = md.split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    const fence = line.match(/^(`{3,}|~{3,})(\w*)\s*$/)
    if (fence) {
      const marker = fence[1]![0]!
      const lang = fence[2] || ''
      const chunk: string[] = []
      i += 1
      while (i < lines.length && !new RegExp(`^${marker}{${fence[1]!.length},}\\s*$`).test(lines[i]!)) {
        chunk.push(lines[i]!)
        i += 1
      }
      if (i < lines.length) i += 1
      const code = escapeHtml(chunk.join('\n'))
      out.push(`<pre class="code-block" data-lang="${escapeAttr(lang)}"><code class="language-${escapeAttr(lang)}">${code}</code></pre>`)
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1]!) && lines[i + 1]!.includes('-')) {
      const rows = [line, lines[i + 1]!]
      i += 2
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') {
        rows.push(lines[i]!)
        i += 1
      }
      out.push(renderTable(rows))
      continue
    }

    if (/^\s*>/.test(line)) {
      const chunk: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i]!)) {
        chunk.push(lines[i]!.replace(/^\s*>\s?/, ''))
        i += 1
      }
      out.push(`<blockquote>${chunk.map((l) => `<p>${inlineFormat(l)}</p>`).join('')}</blockquote>`)
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*+]\s+/, ''))
        i += 1
      }
      out.push(`<ul>${items.map((it) => `<li>${inlineFormat(it)}</li>`).join('')}</ul>`)
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*\d+[.)]\s+/, ''))
        i += 1
      }
      out.push(`<ol>${items.map((it) => `<li>${inlineFormat(it)}</li>`).join('')}</ol>`)
      continue
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('<hr />')
      i += 1
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = heading[1]!.length
      out.push(`<h${level}>${inlineFormat(heading[2]!.trim())}</h${level}>`)
      i += 1
      continue
    }

    if (line.trim() === '') {
      i += 1
      continue
    }

    const para: string[] = [line]
    i += 1
    while (i < lines.length && lines[i]!.trim() !== '' && !/^#{1,6}\s|^\s*[-*+]|\s*\d+[.)]|^\s*>|^(`{3,}|~{3,})/.test(lines[i]!)) {
      if (lines[i]!.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1]!)) break
      para.push(lines[i]!)
      i += 1
    }
    out.push(`<p>${inlineFormat(para.join(' '))}</p>`)
  }

  return out.join('\n')
}

export function documentThemeCss(theme: 'light' | 'dark' = 'light'): string {
  const isDark = theme === 'dark'
  return `
:root {
  color-scheme: ${theme};
  --doc-fg: ${isDark ? '#e8e6e3' : '#1a1a1a'};
  --doc-bg: ${isDark ? '#141414' : '#fafafa'};
  --doc-muted: ${isDark ? '#a3a09a' : '#666'};
  --doc-border: ${isDark ? '#333' : '#e5e5e5'};
  --doc-code-bg: ${isDark ? '#1e1e1e' : '#f4f4f5'};
  --doc-quote-bg: ${isDark ? '#1c1c1c' : '#f7f7f5'};
  --doc-quote-border: ${isDark ? '#555' : '#ccc'};
  --doc-link: ${isDark ? '#7eb6ff' : '#0b57d0'};
  --doc-table-head: ${isDark ? '#222' : '#f0f0f0'};
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 2.5rem 1.25rem 3rem;
  font-family: "SF Pro Text", "PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif;
  font-size: 15px;
  line-height: 1.7;
  color: var(--doc-fg);
  background: var(--doc-bg);
}
.doc {
  max-width: 46rem;
  margin: 0 auto;
}
h1 { font-size: 1.75rem; line-height: 1.25; margin: 0 0 1.25rem; font-weight: 700; }
h2 { font-size: 1.35rem; margin: 2rem 0 0.75rem; font-weight: 650; }
h3 { font-size: 1.15rem; margin: 1.5rem 0 0.5rem; font-weight: 600; }
h4,h5,h6 { font-size: 1rem; margin: 1.25rem 0 0.5rem; font-weight: 600; }
p { margin: 0.75rem 0; }
ul, ol { margin: 0.75rem 0; padding-inline-start: 1.5rem; }
li { margin: 0.25rem 0; }
blockquote {
  margin: 1rem 0;
  padding: 0.5rem 1rem;
  border-left: 3px solid var(--doc-quote-border);
  background: var(--doc-quote-bg);
  color: var(--doc-muted);
}
blockquote p { margin: 0.35rem 0; }
a { color: var(--doc-link); text-decoration: underline; }
code {
  font-family: "SF Mono", "Menlo", "Consolas", "Noto Sans Mono", monospace;
  font-size: 0.9em;
  background: var(--doc-code-bg);
  padding: 0.1em 0.35em;
  border-radius: 4px;
}
pre.code-block {
  margin: 1rem 0;
  padding: 0.9rem 1rem;
  overflow-x: auto;
  background: var(--doc-code-bg);
  border: 1px solid var(--doc-border);
  border-radius: 8px;
  page-break-inside: auto;
}
pre.code-block code {
  background: transparent;
  padding: 0;
  font-size: 0.85rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
pre.code-block[data-lang]:not([data-lang=""])::before {
  content: attr(data-lang);
  display: block;
  font-size: 0.7rem;
  color: var(--doc-muted);
  margin-bottom: 0.4rem;
  text-transform: lowercase;
}
.table-wrap { overflow-x: auto; margin: 1rem 0; }
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.92rem;
}
th, td {
  border: 1px solid var(--doc-border);
  padding: 0.45rem 0.65rem;
  text-align: left;
  vertical-align: top;
}
th { background: var(--doc-table-head); font-weight: 600; }
img { max-width: 100%; height: auto; }
hr { border: none; border-top: 1px solid var(--doc-border); margin: 1.5rem 0; }
.img-omitted { color: var(--doc-muted); font-size: 0.85em; }
@media print {
  body { background: white; color: black; padding: 0; }
  .doc { max-width: none; }
  a { color: inherit; text-decoration: none; }
  pre.code-block { white-space: pre-wrap; }
}
`.trim()
}

/** Full standalone HTML document for export / PDF. */
export function renderDocumentHtml(
  markdown: string,
  options: DocumentRenderOptions = {},
): string {
  const theme = options.theme || 'light'
  const title = options.title || 'Document'
  const bodyHtml = markdownToHtmlFragment(
    options.keepSourceMarkers ? markdown : normalizeDocumentMarkdown(markdown),
  )
  // Always strip anchors for HTML body unless keepSourceMarkers (still strip visible placeholders)
  const safeBody = options.keepSourceMarkers
    ? bodyHtml
    : markdownToHtmlFragment(markdown)
  return `<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
${documentThemeCss(theme)}
  </style>
</head>
<body>
  <article class="doc">
${safeBody}
  </article>
</body>
</html>
`
}
