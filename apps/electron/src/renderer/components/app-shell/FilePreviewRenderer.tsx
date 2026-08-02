import {
  CodePreviewOverlay,
  DocumentFormattedMarkdownOverlay,
  ImagePreviewOverlay,
  JSONPreviewOverlay,
  PDFPreviewOverlay,
} from '@craft-agent/ui'
import type { FilePreviewState } from '@/hooks/useLinkInterceptor'

export interface FilePreviewRendererProps {
  state: FilePreviewState
  onClose: () => void
  loadDataUrl: (path: string) => Promise<string>
  loadPdfData: (path: string) => Promise<Uint8Array>
  isDark: boolean
  embedded?: boolean
}

/** Shared renderer used by both fullscreen previews and the docked review panel. */
export function FilePreviewRenderer({
  state,
  onClose,
  loadDataUrl,
  loadPdfData,
  isDark,
  embedded = false,
}: FilePreviewRendererProps) {
  const theme = isDark ? 'dark' : 'light' as const

  switch (state.type) {
    case 'image':
      return (
        <ImagePreviewOverlay
          isOpen
          onClose={onClose}
          filePath={state.filePath}
          loadDataUrl={loadDataUrl}
          theme={theme}
          embedded={embedded}
        />
      )

    case 'pdf':
      return (
        <PDFPreviewOverlay
          isOpen
          onClose={onClose}
          filePath={state.filePath}
          loadPdfData={loadPdfData}
          theme={theme}
          embedded={embedded}
        />
      )

    case 'code':
    case 'text':
      return (
        <CodePreviewOverlay
          isOpen
          onClose={onClose}
          filePath={state.filePath}
          content={state.content ?? ''}
          language={state.type === 'code' ? state.language : 'plaintext'}
          mode="read"
          theme={theme}
          error={state.error}
          embedded={embedded}
        />
      )

    case 'markdown': {
      const isPlanFile =
        (state.filePath.includes('/plans/') || state.filePath.startsWith('plans/')) &&
        state.filePath.endsWith('.md')
      return (
        <DocumentFormattedMarkdownOverlay
          isOpen
          onClose={onClose}
          content={state.content ?? ''}
          filePath={state.filePath}
          variant={isPlanFile ? 'plan' : 'response'}
          error={state.error}
          embedded={embedded}
        />
      )
    }

    case 'json': {
      let parsedData: unknown = null
      try {
        if (state.content) parsedData = JSON.parse(state.content)
      } catch {
        return (
          <CodePreviewOverlay
            isOpen
            onClose={onClose}
            filePath={state.filePath}
            content={state.content ?? ''}
            language="json"
            mode="read"
            theme={theme}
            error={state.error}
            embedded={embedded}
          />
        )
      }

      if ((!state.content || !state.content.trim()) && state.error) {
        return (
          <CodePreviewOverlay
            isOpen
            onClose={onClose}
            filePath={state.filePath}
            content={state.content ?? ''}
            language="json"
            mode="read"
            theme={theme}
            error={state.error}
            embedded={embedded}
          />
        )
      }

      return (
        <JSONPreviewOverlay
          isOpen
          onClose={onClose}
          filePath={state.filePath}
          title={state.filePath.split('/').pop() ?? 'JSON'}
          data={parsedData}
          theme={theme}
          error={state.error}
          embedded={embedded}
        />
      )
    }
  }
}
