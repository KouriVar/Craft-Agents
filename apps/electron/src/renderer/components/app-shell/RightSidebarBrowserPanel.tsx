import { useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { BrowserWorkspacePage } from '@/components/browser/BrowserWorkspacePage'
import { requestBrowserWorkspaceTab } from '@/lib/browser-workspace-events'
import { browserWorkspaceTabsAtom } from '@/atoms/browser-workspace'

interface RightSidebarBrowserPanelProps {
  className?: string
  initialUrl?: string
  initialTitle?: string
  onTitleChange?: (title: string) => void
  onInstanceReady?: (instanceId: string) => void
  onInstanceClosed?: () => void
}

/**
 * A second viewport onto the single runtime-backed browser workspace.
 *
 * This deliberately does not own tabs, webviews, or a browser partition.  Those
 * used to live here and silently created a separate browser state from the main
 * Browser Workspace.  Creation is delegated to AppShell, the workspace owner.
 */
export function RightSidebarBrowserPanel({
  className = '',
  initialUrl,
  initialTitle,
  onTitleChange,
  onInstanceReady,
  onInstanceClosed,
}: RightSidebarBrowserPanelProps) {
  const { t } = useTranslation()
  const tabs = useAtomValue(browserWorkspaceTabsAtom)
  const [instanceId, setInstanceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const callbacksRef = useRef({ onInstanceReady, onTitleChange, initialTitle, t })
  callbacksRef.current = { onInstanceReady, onTitleChange, initialTitle, t }

  useEffect(() => {
    let cancelled = false
    void requestBrowserWorkspaceTab(initialUrl).then((id) => {
      if (cancelled) return
      if (!id) {
        setError(t('browser.openFailed', { defaultValue: '无法打开浏览器标签页' }))
        return
      }
      setInstanceId(id)
      callbacksRef.current.onInstanceReady?.(id)
      callbacksRef.current.onTitleChange?.(
        callbacksRef.current.initialTitle || callbacksRef.current.t('browser.newTab', { defaultValue: '新标签页' }),
      )
    }).catch(() => {
      if (!cancelled) setError(t('browser.openFailed', { defaultValue: '无法打开浏览器标签页' }))
    })
    return () => { cancelled = true }
  // A sidebar tool tab has one corresponding runtime tab for its lifetime.
  // Callback identities change with its parent render and must not create tabs.
  }, [initialUrl])

  useEffect(() => {
    if (!instanceId) return
    const tab = tabs.find((item) => item.id === instanceId)
    if (!tab) {
      onInstanceClosed?.()
      return
    }
    onTitleChange?.(tab.title || t('browser.newTab', { defaultValue: '新标签页' }))
  }, [instanceId, onInstanceClosed, onTitleChange, t, tabs])

  if (error) {
    return <div className={`flex h-full items-center justify-center p-6 text-center text-sm text-destructive ${className}`}>{error}</div>
  }

  if (!instanceId) {
    return <div className={`flex h-full items-center justify-center text-sm text-muted-foreground ${className}`}>{t('common.loading')}</div>
  }

  return <div className={`h-full min-h-0 ${className}`}><BrowserWorkspacePage activeTabId={instanceId} /></div>
}
