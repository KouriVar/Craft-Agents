import * as React from 'react'
import { Brush } from 'lucide-react'
import type { WidgetDescriptor } from '../../../shared/widget-runtime'
import { InlineVisualizationBlock } from './InlineVisualizationBlock'
import { McpAppWidget } from './McpAppWidget'

export interface WidgetHostProps {
  descriptor: WidgetDescriptor
  sessionId: string
}

export function WidgetHost({ descriptor, sessionId }: WidgetHostProps) {
  switch (descriptor.kind) {
    case 'visualize-html':
      return <InlineVisualizationBlock descriptor={descriptor} sessionId={sessionId} />
    case 'cowart-canvas':
      return (
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-surface border bg-muted/10 px-3 py-3 text-left hover:bg-muted/30"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('craft:widget-open', {
              detail: { descriptor, sessionId },
            }))
          }}
        >
          <Brush className="h-4 w-4 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{descriptor.title || 'Cowart Canvas'}</span>
            {descriptor.pageId && <span className="block truncate text-xs text-muted-foreground">{descriptor.pageId}</span>}
          </span>
          <span className="text-xs text-muted-foreground">Open</span>
        </button>
      )
    case 'mcp-app':
      return <McpAppWidget descriptor={descriptor} sessionId={sessionId} />
  }
}
