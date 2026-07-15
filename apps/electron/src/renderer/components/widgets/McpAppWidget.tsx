import * as React from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { readWidgetTheme, type WidgetThemeSnapshot } from '@/lib/widget-runtime/inline-host'
import {
  buildMcpAppDocument,
  MCP_APP_IFRAME_SANDBOX,
  MCP_APP_PROTOCOL_VERSION,
} from '@/lib/widget-runtime/mcp-app-host'
import type { McpAppWidgetDescriptor } from '../../../shared/widget-runtime'

type JsonRpcRequest = { jsonrpc: '2.0'; id?: string | number; method: string; params?: Record<string, unknown> }
type PendingToolCall = { message: JsonRpcRequest; name: string; arguments: Record<string, unknown>; destructive: boolean }
type PendingMessage = { message: JsonRpcRequest; prompt: string }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function promptFromParams(params: Record<string, unknown> | undefined): string {
  if (typeof params?.prompt === 'string') return params.prompt.trim()
  const content = Array.isArray(params?.content) ? params.content : []
  return content.map(item => record(item)?.text).filter((item): item is string => typeof item === 'string').join('\n\n').trim()
}

export interface McpAppWidgetProps {
  descriptor: McpAppWidgetDescriptor
  sessionId: string
  className?: string
  displayMode?: 'inline' | 'fullscreen' | 'pip'
}

export function McpAppWidget({ descriptor, sessionId, className, displayMode }: McpAppWidgetProps) {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const themeRef = React.useRef<WidgetThemeSnapshot>(readWidgetTheme())
  const initializedRef = React.useRef(false)
  const [documentHtml, setDocumentHtml] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [height, setHeight] = React.useState(520)
  const [pendingTool, setPendingTool] = React.useState<PendingToolCall | null>(null)
  const [pendingMessage, setPendingMessage] = React.useState<PendingMessage | null>(null)
  const [reloadVersion, setReloadVersion] = React.useState(0)
  const mode = displayMode ?? descriptor.displayMode ?? 'inline'

  const reportStatus = React.useCallback((status: 'loading' | 'ready' | 'error' | 'closed', statusError?: string) => {
    window.dispatchEvent(new CustomEvent('craft:widget-runtime-status', {
      detail: { descriptorId: descriptor.id, sessionId, status, error: statusError },
    }))
  }, [descriptor.id, sessionId])

  const post = React.useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*')
  }, [])

  const respond = React.useCallback((request: JsonRpcRequest, result?: unknown, responseError?: string) => {
    if (request.id === undefined) return
    post(responseError
      ? { jsonrpc: '2.0', id: request.id, error: { code: -32000, message: responseError } }
      : { jsonrpc: '2.0', id: request.id, result: result ?? {} })
  }, [post])

  const notifyToolResult = React.useCallback(() => {
    post({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params: {
        content: descriptor.resultContent ?? [],
        structuredContent: descriptor.structuredContent ?? {},
        _meta: descriptor.responseMeta ?? {},
      },
    })
    post({
      source: 'craft-mcp-app-host',
      type: 'openai-globals',
      globals: {
        toolInput: descriptor.toolInput,
        toolOutput: descriptor.structuredContent,
        toolResponseMetadata: descriptor.responseMeta,
        theme: themeRef.current.mode,
        displayMode: mode,
        locale: navigator.language,
      },
    })
  }, [descriptor, mode, post])

  React.useEffect(() => {
    let cancelled = false
    initializedRef.current = false
    setDocumentHtml(null)
    setError(null)
    reportStatus('loading')
    themeRef.current = readWidgetTheme()
    window.electronAPI.readMcpWidgetResource({
      sessionId,
      serverSlug: descriptor.serverSlug,
      uri: descriptor.resourceUri,
    }).then(result => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.error)
        reportStatus('error', result.error)
      } else {
        setDocumentHtml(buildMcpAppDocument(result.html, themeRef.current, result.resourceMeta))
      }
    }).catch(loadError => {
      if (!cancelled) {
        const message = loadError instanceof Error ? loadError.message : 'MCP app could not be loaded.'
        setError(message)
        reportStatus('error', message)
      }
    })
    return () => { cancelled = true }
  }, [descriptor.resourceUri, descriptor.serverSlug, reloadVersion, reportStatus, sessionId])

  React.useEffect(() => () => reportStatus('closed'), [reportStatus])

  React.useEffect(() => {
    const root = document.documentElement
    const sendContext = () => post({
      jsonrpc: '2.0',
      method: 'ui/notifications/host-context-changed',
      params: { theme: themeRef.current.mode },
    })
    const observer = new MutationObserver(() => {
      themeRef.current = readWidgetTheme(root)
      sendContext()
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    return () => observer.disconnect()
  }, [post])

  React.useEffect(() => {
    const element = containerRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (!initializedRef.current) return
      post({
        jsonrpc: '2.0',
        method: 'ui/notifications/host-context-changed',
        params: { containerDimensions: { width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) } },
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [post])

  const executeTool = React.useCallback(async (request: JsonRpcRequest, name: string, args: Record<string, unknown>, approved = false) => {
    const result = await window.electronAPI.callMcpWidgetTool({
      sessionId,
      serverSlug: descriptor.serverSlug,
      toolName: name,
      arguments: args,
      approved,
    })
    if (result.ok) {
      respond(request, {
        content: result.result.contentBlocks,
        structuredContent: result.result.structuredContent,
        _meta: result.result._meta,
        isError: result.result.isError,
      })
      return
    }
    if (result.code === 'permission-required' && !approved) {
      setPendingTool({ message: request, name, arguments: args, destructive: result.destructive === true })
      return
    }
    respond(request, undefined, result.error)
  }, [descriptor.serverSlug, respond, sessionId])

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const value = record(event.data)
      if (!value) return
      if (value.source === 'craft-mcp-app' && value.type === 'resize' && mode === 'inline') {
        const next = Number(value.height)
        if (Number.isFinite(next)) setHeight(Math.max(120, Math.min(20_000, Math.ceil(next))))
        return
      }
      if (value.jsonrpc !== '2.0' || typeof value.method !== 'string') return
      const request = value as unknown as JsonRpcRequest
      if (request.method === 'ui/initialize') {
        initializedRef.current = true
        const rect = containerRef.current?.getBoundingClientRect()
        respond(request, {
          protocolVersion: MCP_APP_PROTOCOL_VERSION,
          hostInfo: { name: 'craft-agent', version: '0.1.0' },
          hostCapabilities: { message: {}, tools: { call: {} } },
          hostContext: {
            theme: themeRef.current.mode,
            displayMode: mode,
            availableDisplayModes: ['inline', 'fullscreen'],
            containerDimensions: { width: Math.round(rect?.width ?? 0), height: Math.round(rect?.height ?? 0) },
            locale: navigator.language,
          },
        })
        return
      }
      if (request.method === 'ui/notifications/initialized') {
        notifyToolResult()
        reportStatus('ready')
        return
      }
      if (request.method === 'tools/call') {
        const name = typeof request.params?.name === 'string' ? request.params.name : ''
        const args = record(request.params?.arguments) ?? {}
        if (!name) respond(request, undefined, 'Tool name is required.')
        else void executeTool(request, name, args)
        return
      }
      if (request.method === 'ui/message') {
        const prompt = promptFromParams(request.params)
        if (!prompt) respond(request, undefined, 'Message content is required.')
        else setPendingMessage({ message: request, prompt })
        return
      }
      if (request.method === 'ui/request-display-mode') {
        const requested = request.params?.mode
        if (requested === 'fullscreen' && mode !== 'fullscreen') {
          window.dispatchEvent(new CustomEvent('craft:widget-open', { detail: { descriptor: { ...descriptor, displayMode: 'fullscreen' }, sessionId } }))
        }
        respond(request, { mode: requested === 'fullscreen' ? 'fullscreen' : mode })
        return
      }
      if (request.method === 'ui/update-model-context') {
        respond(request, {})
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [descriptor, executeTool, mode, notifyToolResult, reportStatus, respond, sessionId])

  const approveTool = React.useCallback(async () => {
    if (!pendingTool) return
    const request = pendingTool
    setPendingTool(null)
    await executeTool(request.message, request.name, request.arguments, true)
  }, [executeTool, pendingTool])

  const approveMessage = React.useCallback(async () => {
    if (!pendingMessage) return
    const request = pendingMessage
    setPendingMessage(null)
    try {
      await window.electronAPI.sendMessage(sessionId, request.prompt)
      respond(request.message, {})
    } catch (sendError) {
      respond(request.message, undefined, sendError instanceof Error ? sendError.message : 'Message could not be sent.')
    }
  }, [pendingMessage, respond, sessionId])

  return (
    <>
      <div ref={containerRef} className={className ?? 'relative w-full min-w-0 overflow-hidden'}>
        {documentHtml ? (
          <iframe
            ref={iframeRef}
            sandbox={MCP_APP_IFRAME_SANDBOX}
            referrerPolicy="no-referrer"
            srcDoc={documentHtml}
            title={descriptor.title || descriptor.toolName}
            className="block h-full w-full border-0 bg-background"
            style={mode === 'inline' ? { height } : undefined}
          />
        ) : error ? (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-3 px-5 text-center text-sm">
            <span className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </span>
            <Button size="sm" variant="outline" onClick={() => setReloadVersion(version => version + 1)}>
              <RotateCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex h-full min-h-32 items-center justify-center text-sm text-muted-foreground">Loading app...</div>
        )}
      </div>

      <Dialog open={Boolean(pendingTool)} onOpenChange={open => { if (!open && pendingTool) { respond(pendingTool.message, undefined, 'Tool call cancelled.'); setPendingTool(null) } }}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pendingTool?.destructive ? 'Confirm destructive action' : 'Allow app action'}</DialogTitle>
            <DialogDescription>The app wants to call `{pendingTool?.name}` in this session.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (pendingTool) respond(pendingTool.message, undefined, 'Tool call cancelled.'); setPendingTool(null) }}>Cancel</Button>
            <Button variant={pendingTool?.destructive ? 'destructive' : 'default'} onClick={() => { void approveTool() }}>Allow</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingMessage)} onOpenChange={open => { if (!open && pendingMessage) { respond(pendingMessage.message, undefined, 'Message cancelled.'); setPendingMessage(null) } }}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send follow-up</DialogTitle>
            <DialogDescription className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-left">{pendingMessage?.prompt}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (pendingMessage) respond(pendingMessage.message, undefined, 'Message cancelled.'); setPendingMessage(null) }}>Cancel</Button>
            <Button onClick={() => { void approveMessage() }}>Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
