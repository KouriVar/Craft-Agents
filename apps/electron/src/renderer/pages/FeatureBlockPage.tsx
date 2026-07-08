import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Globe, RefreshCw, Settings } from 'lucide-react'

import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { HeaderIconButton } from '@/components/ui/HeaderIconButton'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { Button } from '@/components/ui/button'
import { navigate, routes } from '@/lib/navigate'
import type { FeatureBlock } from '../../shared/feature-blocks'
import { sanitizeEmbeddedBrowserUserAgent } from '../../shared/browser-user-agent'

const FEATURE_BLOCK_WEBVIEW_PARTITION = 'persist:browser-pane'

type FeatureBlockWebviewElement = HTMLWebViewElement & {
  reload: () => void
}

interface FeatureBlockWebviewEvent extends Event {
  readonly message?: string
  readonly level?: number
  readonly errorCode?: number
  readonly errorDescription?: string
  readonly validatedURL?: string
  readonly url?: string
  readonly isMainFrame?: boolean
}

interface FeatureBlockPageProps {
  blockId: string
}

function normalizeFeatureBlockUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'about:blank'
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function getEmbeddedBrowserUserAgent(): string | undefined {
  if (typeof navigator === 'undefined') return undefined
  const sanitized = sanitizeEmbeddedBrowserUserAgent(navigator.userAgent)
  return sanitized && sanitized !== navigator.userAgent ? sanitized : undefined
}

export default function FeatureBlockPage({ blockId }: FeatureBlockPageProps) {
  const { t } = useTranslation()
  const [blocks, setBlocks] = React.useState<readonly FeatureBlock[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const webviewRef = React.useRef<FeatureBlockWebviewElement | null>(null)

  const loadBlocks = React.useCallback(async () => {
    try {
      const config = await window.electronAPI.getFeatureBlocksConfig()
      setBlocks(config.blocks)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadBlocks()
    const handleChanged = () => {
      void loadBlocks()
    }
    window.addEventListener('feature-blocks-changed', handleChanged)
    return () => window.removeEventListener('feature-blocks-changed', handleChanged)
  }, [loadBlocks])

  const block = React.useMemo(
    () => blocks.find((candidate) => candidate.id === blockId) ?? null,
    [blocks, blockId],
  )
  const url = block ? normalizeFeatureBlockUrl(block.url) : 'about:blank'
  const embeddedBrowserUserAgent = React.useMemo(() => getEmbeddedBrowserUserAgent(), [])

  React.useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleConsoleMessage = (event: FeatureBlockWebviewEvent) => {
      const level = event.level ?? 0
      const message = event.message ?? ''
      if (level >= 2 || message.toLowerCase().includes('error')) {
        console.warn(`[FeatureBlockPage] webview console block=${blockId} level=${level}: ${message}`)
      }
    }

    const handleFailLoad = (event: FeatureBlockWebviewEvent) => {
      console.warn(
        `[FeatureBlockPage] webview did-fail-load block=${blockId} code=${event.errorCode ?? 'unknown'} url=${event.validatedURL ?? event.url ?? 'unknown'} error=${event.errorDescription ?? 'unknown'} mainFrame=${event.isMainFrame ?? 'unknown'}`,
      )
    }

    const handleRenderGone = (event: FeatureBlockWebviewEvent) => {
      console.warn(`[FeatureBlockPage] webview render-process-gone block=${blockId}: ${event.message ?? 'unknown'}`)
    }

    webview.addEventListener('console-message', handleConsoleMessage)
    webview.addEventListener('did-fail-load', handleFailLoad)
    webview.addEventListener('render-process-gone', handleRenderGone)
    return () => {
      webview.removeEventListener('console-message', handleConsoleMessage)
      webview.removeEventListener('did-fail-load', handleFailLoad)
      webview.removeEventListener('render-process-gone', handleRenderGone)
    }
  }, [blockId, url])

  const actions = (
    <div className="flex items-center gap-1">
      {block && (
        <>
          <HeaderIconButton
            icon={<RefreshCw className="h-4 w-4" />}
            tooltip={t('common.refresh', '刷新')}
            onClick={() => webviewRef.current?.reload?.()}
          />
          <HeaderIconButton
            icon={<ExternalLink className="h-4 w-4" />}
            tooltip={t('common.openExternal', '外部打开')}
            onClick={() => window.electronAPI.openUrl(url)}
          />
        </>
      )}
      <HeaderIconButton
        icon={<Settings className="h-4 w-4" />}
        tooltip={t('settings.featureBlocks.title', '功能块')}
        onClick={() => navigate(routes.view.settings('featureBlocks'))}
      />
      <HeaderMenu route={routes.view.featureBlock(blockId)} />
    </div>
  )

  if (!block) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader
          title={t('settings.featureBlocks.title', '功能块')}
          actions={actions}
        />
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="max-w-sm space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-border/70 bg-muted/30">
              <Globe className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-foreground">
                {isLoading ? t('common.loading', '加载中') : t('settings.featureBlocks.notFound', '功能块不存在')}
              </h2>
              {!isLoading && (
                <p className="text-sm text-muted-foreground">
                  {t('settings.featureBlocks.notFoundDescription', '可以在设置里重新添加或固定这个入口。')}
                </p>
              )}
            </div>
            {!isLoading && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(routes.view.settings('featureBlocks'))}
              >
                <Settings className="h-3.5 w-3.5" />
                {t('settings.featureBlocks.title', '功能块')}
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <PanelHeader title={block.title} actions={actions} />
      <div className="min-h-0 flex-1 overflow-hidden bg-background">
        <webview
          ref={webviewRef}
          key={block.id}
          src={url}
          partition={FEATURE_BLOCK_WEBVIEW_PARTITION}
          useragent={embeddedBrowserUserAgent}
          allowpopups={true}
          className="h-full w-full bg-background"
        />
      </div>
    </div>
  )
}
