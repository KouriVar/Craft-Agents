/**
 * BrowserToolbar
 *
 * Electron-specific wrapper around the shared BrowserControls component.
 * Derives control state from BrowserInstanceInfo.
 */

import { BrowserControls } from '@craft-agent/ui'
import type { BrowserInstanceInfo } from '../../../shared/types'

interface BrowserToolbarProps {
  instanceInfo: BrowserInstanceInfo | null
  onNavigate: (url: string) => void
  onGoBack: () => void
  onGoForward: () => void
  onReload: () => void
  onStop: () => void
  compact?: boolean
  trailingContent?: React.ReactNode
}

export function BrowserToolbar({
  instanceInfo,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onStop,
  compact = false,
  trailingContent,
}: BrowserToolbarProps) {
  return (
    <BrowserControls
      url={instanceInfo?.url ?? ''}
      loading={instanceInfo?.isLoading ?? false}
      canGoBack={instanceInfo?.canGoBack ?? false}
      canGoForward={instanceInfo?.canGoForward ?? false}
      onNavigate={onNavigate}
      onGoBack={onGoBack}
      onGoForward={onGoForward}
      onReload={onReload}
      onStop={onStop}
      compact={compact}
      showProgressBar={!compact}
      borderlessAddressBar={compact}
      trailingContent={trailingContent}
      className={
        compact
          ? 'h-auto px-0 py-0 rounded-none bg-transparent shadow-none min-w-0'
          : 'h-auto px-2 py-1.5 border-b border-border bg-background/80'
      }
    />
  )
}
