/**
 * MessagingSettingsPage
 *
 * Configure messaging platform connections (Lark, WeChat) and view active
 * session bindings.
 *
 * Layout:
 *  - One SettingsCard per platform
 *  - Each card renders a PlatformRow: [brand logo] [name] [API · status]
 *    with a Connect button (disconnected) or three-dot menu (connected)
 *  - Bindings render as a flat list under their platform row.
 *  - Connected platforms also render a generic workspace-level access
 *    section (owners / pending senders) via `PlatformAccessSection`.
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ArrowUpRight,
  LockOpen,
  MoreHorizontal,
  Plus,
  PowerOff,
  RefreshCcw,
  Settings2,
  Trash2,
} from 'lucide-react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from '@/components/ui/styled-dropdown'
import { SettingsSection, SettingsCard } from '@/components/settings'
import { MessagingPlatformIcon } from '@/components/messaging/MessagingPlatformIcon'
import { LarkConnectDialog } from '@/components/messaging/LarkConnectDialog'
import { WeChatConnectDialog } from '@/components/messaging/WeChatConnectDialog'
import {
  PlatformAccessSection,
  type PlatformAccessMode,
} from '@/components/messaging/access'
import { useActiveWorkspace } from '@/context/AppShellContext'
import { useNavigation } from '@/contexts/NavigationContext'
import {
  messagingBindingsAtom,
  setMessagingBindingsAtom,
  type MessagingBinding,
} from '@/atoms/messaging'
import { sessionMetaMapAtom, type SessionMeta } from '@/atoms/sessions'
import { getSessionTitle } from '@/utils/session'
import type { DetailsPageMeta } from '@/lib/details-page-meta'
import type { MessagingPlatformRuntimeInfo } from '../../../shared/types'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'messaging',
}

export default function MessagingSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  const activeWorkspace = useActiveWorkspace()
  const setBindings = useSetAtom(setMessagingBindingsAtom)
  const workspaceId = activeWorkspace?.id

  // Single fetch + subscription at the page level so both PlatformRows read
  // from the already-populated atom instead of subscribing twice.
  React.useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    const load = async () => {
      try {
        const rows = await window.electronAPI.getMessagingBindings()
        if (!cancelled) setBindings(rows as MessagingBinding[])
      } catch {
        // Silent — a toast here would be noisy on first load.
      }
    }
    load()
    const off = window.electronAPI.onMessagingBindingChanged((wsId) => {
      if (wsId === workspaceId) load()
    })
    return () => {
      cancelled = true
      off()
    }
  }, [workspaceId, setBindings])

  if (!activeWorkspace) return null

  const body = (
          <SettingsSection title={t('settings.messaging.title')}>
            <SettingsCard>
              <PlatformRow platform="lark" workspaceId={activeWorkspace.id} />
            </SettingsCard>
            <SettingsCard>
              <PlatformRow platform="wechat" workspaceId={activeWorkspace.id} />
            </SettingsCard>
          </SettingsSection>
  )

  if (embedded) return body

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={t('settings.messaging.title')} />
      <ScrollArea className="h-full">
        <div className="space-y-6 px-5 py-7 max-w-3xl mx-auto">
          {body}
        </div>
      </ScrollArea>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Platform row
// ---------------------------------------------------------------------------

type Platform = 'lark' | 'wechat'

const PLATFORM_LABEL_KEYS: Record<Platform, string> = {
  lark: 'settings.messaging.lark.title',
  wechat: 'settings.messaging.wechat.title',
}

function PlatformRow({ platform, workspaceId }: { platform: Platform; workspaceId: string }) {
  const { t } = useTranslation()
  const allBindings = useAtomValue(messagingBindingsAtom)
  const sessionMetaMap = useAtomValue(sessionMetaMapAtom)
  const { navigateToSession } = useNavigation()
  const [runtime, setRuntime] = React.useState<MessagingPlatformRuntimeInfo>(() =>
    defaultRuntime(platform),
  )
  const [connectOpen, setConnectOpen] = React.useState(false)
  const [reconfigure, setReconfigure] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)

  // Workspace access mode. Lifted up so the dropdown can decide whether to
  // show "Unlock", and PlatformAccessSection receives it as a controlled prop.
  const [accessMode, setAccessMode] = React.useState<PlatformAccessMode>('open')

  const refreshAccessMode = React.useCallback(async () => {
    try {
      const mode = await window.electronAPI.getMessagingPlatformAccessMode(platform)
      setAccessMode(mode as PlatformAccessMode)
    } catch {
      // silent — default 'open' covers fresh / disconnected state
    }
  }, [platform])

  React.useEffect(() => {
    void refreshAccessMode()
    const off = window.electronAPI.onMessagingBindingChanged((wsId) => {
      if (wsId === workspaceId) void refreshAccessMode()
    })
    return () => off()
  }, [workspaceId, refreshAccessMode])

  const platformBindings = React.useMemo(
    () =>
      allBindings
        .filter((b) => b.platform === platform)
        .sort((a, b) => b.createdAt - a.createdAt),
    [allBindings, platform],
  )

  React.useEffect(() => {
    let cancelled = false
    window.electronAPI.getMessagingConfig().then((cfg) => {
      if (cancelled) return
      const next = cfg?.runtime?.[platform]
      setRuntime((next ?? defaultRuntime(platform)) as MessagingPlatformRuntimeInfo)
    })
    const off = window.electronAPI.onMessagingPlatformStatus((wsId, p, status) => {
      if (wsId !== workspaceId || p !== platform) return
      setRuntime(status)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [platform, workspaceId])

  // Mirror AI Settings pattern: close menu first, then fire the action on the
  // next frame — avoids a known menu/dialog teardown race.
  const runAfterMenuClose = React.useCallback((action: () => void) => {
    setMenuOpen(false)
    requestAnimationFrame(action)
  }, [])

  const handleConnect = () => {
    setReconfigure(false)
    setConnectOpen(true)
  }

  const handleReconfigure = () => {
    setReconfigure(true)
    setConnectOpen(true)
  }

  const handleUnlock = async () => {
    try {
      await window.electronAPI.setMessagingPlatformAccessMode(platform, 'open')
      toast.success(t('toast.messagingUnlocked'))
      setAccessMode('open')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    }
  }

  const handleDisconnect = async () => {
    try {
      await window.electronAPI.disconnectMessagingPlatform(platform)
      toast.success(
        t(`settings.messaging.${platform}.disconnected`, {
          defaultValue: 'Disconnected',
        }),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    }
  }

  const handleForget = async () => {
    try {
      await window.electronAPI.forgetMessagingPlatform(platform)
      toast.success(
        t(`settings.messaging.${platform}.disconnected`, {
          defaultValue: 'Disconnected',
        }),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    }
  }

  const handleUnbind = async (binding: MessagingBinding) => {
    try {
      await window.electronAPI.unbindMessagingBinding(binding.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    }
  }

  const description = buildDescription(platform, runtime, t)
  const label = t(PLATFORM_LABEL_KEYS[platform])

  return (
    <>
      <div>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <MessagingPlatformIcon platform={platform} size={22} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{label}</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {t(`settings.messaging.${platform}.apiType`)} · {description}
            </div>
          </div>

          {runtime.connected ? (
            <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className="rounded-md p-1.5 transition-colors hover:bg-foreground/[0.05] data-[state=open]:bg-foreground/[0.05]"
                  data-state={menuOpen ? 'open' : 'closed'}
                  aria-label={t('common.more')}
                >
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <StyledDropdownMenuContent align="end">
                <StyledDropdownMenuItem onClick={() => runAfterMenuClose(handleReconfigure)}>
                  <Settings2 className="h-3.5 w-3.5" />
                  <span>{t('common.reconfigure')}</span>
                </StyledDropdownMenuItem>
                <StyledDropdownMenuItem onClick={() => runAfterMenuClose(handleConnect)}>
                  <RefreshCcw className="h-3.5 w-3.5" />
                  <span>{t('common.reconnect')}</span>
                </StyledDropdownMenuItem>
                {accessMode === 'owner-only' && (
                  <StyledDropdownMenuItem onClick={() => runAfterMenuClose(handleUnlock)}>
                    <LockOpen className="h-3.5 w-3.5" />
                    <span>{t('settings.messaging.access.unlock')}</span>
                  </StyledDropdownMenuItem>
                )}
                <StyledDropdownMenuItem onClick={handleDisconnect}>
                  <PowerOff className="h-3.5 w-3.5" />
                  <span>{t('common.disable')}</span>
                </StyledDropdownMenuItem>
                <StyledDropdownMenuSeparator />
                <StyledDropdownMenuItem onClick={handleForget} variant="destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t('common.disconnect')}</span>
                </StyledDropdownMenuItem>
              </StyledDropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="outline" size="sm" onClick={handleConnect}>
              <Plus className="h-3.5 w-3.5" />
              {t('common.connect')}
            </Button>
          )}
        </div>

        {runtime.connected && (
          <PlatformAccessSection
            workspaceId={workspaceId}
            platform={platform}
            accessMode={accessMode}
            onAccessModeChange={setAccessMode}
          />
        )}

        {platformBindings.length > 0 && (
          <>
            <CardSeparator />
            <div className="divide-y divide-border/50">
              {platformBindings.map((binding) => (
                <FlatBindingRow
                  key={binding.id}
                  binding={binding}
                  sessionMetaMap={sessionMetaMap}
                  onOpen={() => navigateToSession(binding.sessionId)}
                  onUnbind={() => handleUnbind(binding)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {platform === 'lark' && (
        <LarkConnectDialog open={connectOpen} onOpenChange={setConnectOpen} reconfigure={reconfigure} />
      )}
      {platform === 'wechat' && (
        <WeChatConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
      )}
    </>
  )
}

function CardSeparator() {
  return <div className="mx-4 h-px bg-border/50" />
}

function FlatBindingRow({
  binding,
  sessionMetaMap,
  onOpen,
  onUnbind,
}: {
  binding: MessagingBinding
  sessionMetaMap: Map<string, SessionMeta>
  onOpen: () => void
  onUnbind: () => void
}) {
  const meta = sessionMetaMap.get(binding.sessionId)
  const sessionLabel = meta ? getSessionTitle(meta) : binding.channelName || binding.channelId
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 pl-[52px]">
      <div className="min-w-0 truncate text-sm">{sessionLabel}</div>
      <RowActions onOpen={onOpen} onUnbind={onUnbind} />
    </div>
  )
}

function RowActions({ onOpen, onUnbind }: { onOpen: () => void; onUnbind: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={onOpen}>
        <ArrowUpRight className="h-3.5 w-3.5" />
        {t('settings.messaging.bindings.openSession')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={onUnbind}
      >
        {t('common.disconnect')}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDescription(
  platform: Platform,
  runtime: MessagingPlatformRuntimeInfo,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (runtime.connected) {
    if (platform === 'lark' && runtime.identity) {
      return t('settings.messaging.lark.validBot', {
        username: runtime.identity,
        defaultValue: runtime.identity,
      })
    }
    return t(`settings.messaging.${platform}.connected`, { defaultValue: 'Connected' })
  }
  if (runtime.state === 'connecting') {
    return t('common.connecting', { defaultValue: 'Connecting…' })
  }
  if (runtime.state === 'error' && runtime.lastError) {
    return runtime.lastError
  }
  return t(`settings.messaging.${platform}.notConnected`, { defaultValue: 'Not connected' })
}

function defaultRuntime(platform: Platform): MessagingPlatformRuntimeInfo {
  return {
    platform,
    configured: false,
    connected: false,
    state: 'disconnected',
    updatedAt: Date.now(),
  }
}
