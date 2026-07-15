import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  buildWidgetDocument,
  clampWidgetHeight,
  readWidgetTheme,
  WIDGET_CSP,
  WIDGET_IFRAME_SANDBOX,
  type WidgetThemeSnapshot,
} from '@/lib/widget-runtime/inline-host'
import type { VisualizeHtmlWidgetDescriptor } from '../../../shared/widget-runtime'

export { WIDGET_CSP, WIDGET_IFRAME_SANDBOX }

type FollowUpRequest = {
  requestId: string
  prompt: string
  title?: string
}

const HOST_MESSAGE_SOURCE = 'craft-widget-host'

export interface InlineVisualizationBlockProps {
  descriptor: VisualizeHtmlWidgetDescriptor
  sessionId: string
}

export function InlineVisualizationBlock({ descriptor, sessionId }: InlineVisualizationBlockProps) {
  const { t } = useTranslation()
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
  const themeRef = React.useRef<WidgetThemeSnapshot>(readWidgetTheme())
  const [documentHtml, setDocumentHtml] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [height, setHeight] = React.useState(() => clampWidgetHeight(descriptor.height) ?? 180)
  const [followUpQueue, setFollowUpQueue] = React.useState<FollowUpRequest[]>([])
  const [isSendingFollowUp, setIsSendingFollowUp] = React.useState(false)
  const activeFollowUp = followUpQueue[0] ?? null

  const postToWidget = React.useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ source: HOST_MESSAGE_SOURCE, ...message }, '*')
  }, [])

  const sendTheme = React.useCallback(() => {
    postToWidget({ type: 'theme', theme: themeRef.current })
  }, [postToWidget])

  React.useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      themeRef.current = readWidgetTheme(root)
      sendTheme()
    })
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-font'],
    })
    return () => observer.disconnect()
  }, [sendTheme])

  React.useEffect(() => {
    let cancelled = false
    setDocumentHtml(null)
    setError(null)
    setHeight(clampWidgetHeight(descriptor.height) ?? 180)
    themeRef.current = readWidgetTheme()

    window.electronAPI.readWidgetFile({ sessionId, file: descriptor.file })
      .then((result) => {
        if (cancelled) return
        if (result.ok) {
          setDocumentHtml(buildWidgetDocument(result.html, themeRef.current))
        } else {
          setError(result.error)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Visualization file could not be loaded.')
      })

    return () => { cancelled = true }
  }, [descriptor.file, descriptor.height, sessionId])

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data
      if (!data || typeof data !== 'object' || data.source !== 'craft-widget') return

      if (data.type === 'ready') {
        sendTheme()
        return
      }

      if (data.type === 'resize') {
        const nextHeight = clampWidgetHeight(data.height)
        if (nextHeight !== null) setHeight(nextHeight)
        return
      }

      if (data.type === 'sendFollowUpMessage') {
        const requestId = typeof data.requestId === 'string' ? data.requestId : ''
        const prompt = typeof data.message?.prompt === 'string' ? data.message.prompt.trim() : ''
        const title = typeof data.message?.title === 'string'
          ? data.message.title.trim().slice(0, 250)
          : undefined
        if (!requestId || !prompt) return
        setFollowUpQueue((current) => current.some((item) => item.requestId === requestId)
          ? current
          : [...current, { requestId, prompt, title }])
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [sendTheme])

  const finishFollowUp = React.useCallback((request: FollowUpRequest, ok: boolean, errorMessage?: string) => {
    postToWidget({
      type: 'followUpResult',
      requestId: request.requestId,
      ok,
      error: errorMessage,
    })
    setFollowUpQueue((current) => current.filter((item) => item.requestId !== request.requestId))
  }, [postToWidget])

  const cancelFollowUp = React.useCallback(() => {
    if (!activeFollowUp || isSendingFollowUp) return
    finishFollowUp(activeFollowUp, false, 'cancelled')
  }, [activeFollowUp, finishFollowUp, isSendingFollowUp])

  const confirmFollowUp = React.useCallback(async () => {
    if (!activeFollowUp || isSendingFollowUp) return
    setIsSendingFollowUp(true)
    try {
      await window.electronAPI.sendMessage(sessionId, activeFollowUp.prompt)
      finishFollowUp(activeFollowUp, true)
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Message could not be sent.'
      finishFollowUp(activeFollowUp, false, message)
    } finally {
      setIsSendingFollowUp(false)
    }
  }, [activeFollowUp, finishFollowUp, isSendingFollowUp, sessionId])

  return (
    <>
      <div className="relative w-full min-w-0 overflow-hidden bg-transparent">
        {documentHtml ? (
          <iframe
            ref={iframeRef}
            sandbox={WIDGET_IFRAME_SANDBOX}
            referrerPolicy="no-referrer"
            srcDoc={documentHtml}
            title={descriptor.title || 'Interactive visualization'}
            className="block w-full border-0 bg-transparent"
            style={{ height }}
          />
        ) : error ? (
          <div className="flex min-h-28 items-center justify-center gap-2 rounded-[8px] bg-foreground/3 px-4 py-6 text-center text-[13px] text-destructive/80 shadow-minimal">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="flex min-h-28 items-center justify-center px-4 py-6 text-[13px] text-muted-foreground">
            {t('common.loading')}
          </div>
        )}
      </div>

      <Dialog open={Boolean(activeFollowUp)} onOpenChange={(open) => { if (!open) cancelFollowUp() }}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{activeFollowUp?.title || t('chat.followUp')}</DialogTitle>
            <DialogDescription className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-left">
              {activeFollowUp?.prompt}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelFollowUp} disabled={isSendingFollowUp}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => { void confirmFollowUp() }} disabled={isSendingFollowUp}>
              {t('shortcuts.sendMessage')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
