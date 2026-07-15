import * as React from 'react'
import { Markdown, type RenderMode } from '@/components/markdown'
import { parseWidgetContent } from '@/lib/widget-runtime/parser'
import { WidgetHost } from './WidgetHost'

export interface WidgetMessageContentProps {
  content: string
  sessionId: string
  mode?: RenderMode
  onOpenFile?: (path: string) => void
  onOpenUrl?: (url: string) => void
  collapsible?: boolean
  markdownId?: string
}

export function WidgetMessageContent({
  content,
  sessionId,
  mode = 'minimal',
  onOpenFile,
  onOpenUrl,
  collapsible,
  markdownId,
}: WidgetMessageContentProps) {
  const blocks = React.useMemo(() => parseWidgetContent(content), [content])

  return (
    <div className="space-y-3">
      {blocks.map((block) => block.type === 'markdown' ? (
        block.content.trim() ? (
          <Markdown
            key={block.id}
            mode={mode}
            onUrlClick={onOpenUrl}
            onFileClick={onOpenFile}
            id={markdownId ? `${markdownId}-${block.id}` : undefined}
            className="text-sm"
            collapsible={collapsible}
          >
            {block.content}
          </Markdown>
        ) : null
      ) : (
        <WidgetHost key={block.id} descriptor={block.descriptor} sessionId={sessionId} />
      ))}
    </div>
  )
}
