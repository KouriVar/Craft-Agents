import { normalizeMermaidSource } from './mermaid-source'

export type MermaidThemeSnapshot = {
  mode: 'light' | 'dark'
  background: string
  foreground: string
  accent: string
  muted: string
  border: string
  surface: string
}

let renderId = 0
let renderQueue: Promise<void> = Promise.resolve()

/**
 * Format a canvas pixel sample as CSS rgb/rgba.
 * A missing alpha channel is treated as fully opaque (255): getImageData always
 * writes four channels for a filled pixel, and inventing transparency would be wrong.
 */
export function formatSampledRgba(
  red: number,
  green: number,
  blue: number,
  alpha: number | undefined,
): string {
  const resolvedAlpha = alpha ?? 255
  return resolvedAlpha === 255
    ? `rgb(${red}, ${green}, ${blue})`
    : `rgba(${red}, ${green}, ${blue}, ${(resolvedAlpha / 255).toFixed(3)})`
}

function readCanvasColor(value: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return fallback

  try {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = value || fallback
    context.fillRect(0, 0, 1, 1)
    const data = context.getImageData(0, 0, 1, 1).data
    const red = data[0]
    const green = data[1]
    const blue = data[2]
    const alpha = data[3]
    if (red === undefined || green === undefined || blue === undefined) {
      return fallback
    }
    return formatSampledRgba(red, green, blue, alpha)
  } catch {
    return fallback
  }
}

export function readMermaidTheme(): MermaidThemeSnapshot {
  if (typeof document === 'undefined') {
    return {
      mode: 'light',
      background: '#fafafb',
      foreground: '#29282d',
      accent: '#7657c8',
      muted: '#74717b',
      border: '#dedde2',
      surface: '#f4f3f6',
    }
  }

  const root = document.documentElement
  const styles = getComputedStyle(root)
  const read = (token: string, fallback: string) => readCanvasColor(
    styles.getPropertyValue(token).trim(),
    fallback,
  )
  const dark = root.classList.contains('dark')

  return {
    mode: dark ? 'dark' : 'light',
    background: read('--background', dark ? '#25242a' : '#fafafb'),
    foreground: read('--foreground', dark ? '#f1f0f4' : '#29282d'),
    accent: read('--accent', dark ? '#a77bff' : '#7657c8'),
    muted: read('--muted-foreground', dark ? '#9b98a5' : '#74717b'),
    border: read('--foreground-20', dark ? '#504d57' : '#d7d5dc'),
    surface: read('--foreground-3', dark ? '#2c2b31' : '#f4f3f6'),
  }
}

export function getMermaidThemeKey(theme: MermaidThemeSnapshot): string {
  return Object.values(theme).join('|')
}

export async function renderOfficialMermaid(
  source: string,
  theme: MermaidThemeSnapshot,
): Promise<string> {
  let resolveResult!: (svg: string) => void
  let rejectResult!: (error: unknown) => void
  const result = new Promise<string>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  renderQueue = renderQueue.then(async () => {
    try {
      const { default: mermaid } = await import('mermaid')
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        deterministicIds: true,
        theme: 'base',
        themeVariables: {
          darkMode: theme.mode === 'dark',
          background: theme.background,
          primaryColor: theme.surface,
          primaryTextColor: theme.foreground,
          primaryBorderColor: theme.border,
          secondaryColor: theme.background,
          secondaryTextColor: theme.foreground,
          secondaryBorderColor: theme.border,
          tertiaryColor: theme.surface,
          tertiaryTextColor: theme.foreground,
          tertiaryBorderColor: theme.border,
          lineColor: theme.muted,
          textColor: theme.foreground,
          titleColor: theme.foreground,
          mainBkg: theme.surface,
          nodeBorder: theme.border,
          clusterBkg: theme.background,
          clusterBorder: theme.border,
          edgeLabelBackground: theme.background,
          noteBkgColor: theme.surface,
          noteTextColor: theme.foreground,
          noteBorderColor: theme.border,
          cScale0: theme.accent,
          pie1: theme.accent,
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        },
        flowchart: {
          htmlLabels: false,
          useMaxWidth: false,
        },
      })

      const id = `craft-mermaid-${++renderId}`
      const { svg } = await mermaid.render(id, normalizeMermaidSource(source))
      resolveResult(svg)
    } catch (error) {
      rejectResult(error)
    }
  }).catch(() => undefined)

  return result
}

export function parseMermaidSvgDimensions(svgString: string): { width: number; height: number } | null {
  const widthMatch = svgString.match(/\bwidth="(\d+(?:\.\d+)?)"/)
  const heightMatch = svgString.match(/\bheight="(\d+(?:\.\d+)?)"/)
  if (widthMatch?.[1] && heightMatch?.[1]) {
    return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) }
  }

  const viewBoxMatch = svgString.match(/\bviewBox="[^\"]*?(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"/i)
  if (!viewBoxMatch?.[3] || !viewBoxMatch[4]) return null
  return { width: Number(viewBoxMatch[3]), height: Number(viewBoxMatch[4]) }
}
