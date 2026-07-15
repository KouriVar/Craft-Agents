export type VisualizeHtmlWidgetDescriptor = {
  kind: 'visualize-html'
  id: string
  file: string
  source: 'codex-inline-vis' | 'craft'
  title?: string
  height?: number
}

export type CowartCanvasWidgetDescriptor = {
  kind: 'cowart-canvas'
  id: string
  projectDir: string
  pageId?: string
  source: 'cowart-tool' | 'craft'
  title?: string
}

export type WidgetDescriptor =
  | VisualizeHtmlWidgetDescriptor
  | CowartCanvasWidgetDescriptor

export type WidgetContentBlock =
  | { type: 'markdown'; id: string; content: string }
  | { type: 'widget'; id: string; descriptor: WidgetDescriptor }

export type { ReadWidgetFileRequest, ReadWidgetFileResult } from '@craft-agent/shared/protocol'
