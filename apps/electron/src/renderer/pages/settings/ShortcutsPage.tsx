/**
 * ShortcutsPage
 *
 * Displays keyboard shortcuts reference from the centralized action registry.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SettingsSection, SettingsCard, SettingsRow, SettingsToggle } from '@/components/settings'
import type { DetailsPageMeta } from '@/lib/details-page-meta'
import { isMac, isWindows } from '@/lib/platform'
import { actionsByCategory, useActionLabel, type ActionId } from '@/actions'
import { Button } from '@/components/ui/button'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'shortcuts',
}

interface ShortcutItem {
  keys: string[]
  description: string
}

interface ShortcutSection {
  title: string
  shortcuts: ShortcutItem[]
}

// Component-specific shortcuts that aren't in the centralized registry
function useComponentSpecificSections(): ShortcutSection[] {
  const { t } = useTranslation()
  return [
    {
      title: t('shortcuts.listNavigation'),
      shortcuts: [
        { keys: ['↑', '↓'], description: t('shortcuts.navigateItems') },
        { keys: ['Home'], description: t('shortcuts.goToFirst') },
        { keys: ['End'], description: t('shortcuts.goToLast') },
      ],
    },
    {
      title: t('shortcuts.sessionList'),
      shortcuts: [
        { keys: ['Enter'], description: t('shortcuts.focusChatInput') },
        { keys: ['Right-click'], description: t('shortcuts.openContextMenu') },
        { keys: [isMac ? '⌥' : 'Alt', 'Click'], description: t('shortcuts.addFilterExcluded') },
      ],
    },
    {
      title: t('shortcuts.chatInput'),
      shortcuts: [
        { keys: ['Enter'], description: t('shortcuts.sendMessage') },
        { keys: ['Shift', 'Enter'], description: t('shortcuts.newLine') },
        { keys: ['Esc'], description: t('shortcuts.closeDialogBlur') },
      ],
    },
  ]
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium font-sans bg-muted border border-border rounded">
      {children}
    </kbd>
  )
}

/**
 * Renders a shortcut row for an action from the registry
 */
// Map action IDs to i18n keys for translated labels
const ACTION_LABEL_KEYS: Partial<Record<ActionId, string>> = {
  'app.newChat': 'shortcuts.action.newChat',
  'app.newChatInPanel': 'shortcuts.action.newChatInPanel',
  'app.settings': 'shortcuts.action.settings',
  'app.toggleTheme': 'shortcuts.action.toggleTheme',
  'app.search': 'shortcuts.action.search',
  'app.keyboardShortcuts': 'shortcuts.action.keyboardShortcuts',
  'app.newWindow': 'shortcuts.action.newWindow',
  'app.quit': 'shortcuts.action.quit',
  'nav.focusSidebar': 'shortcuts.action.focusSidebar',
  'nav.focusNavigator': 'shortcuts.action.focusNavigator',
  'nav.focusChat': 'shortcuts.action.focusChat',
  'nav.nextZone': 'shortcuts.action.focusNextZone',
  'nav.goBack': 'shortcuts.action.goBack',
  'nav.goForward': 'shortcuts.action.goForward',
  'nav.goBackAlt': 'shortcuts.action.goBack',
  'nav.goForwardAlt': 'shortcuts.action.goForward',
  'view.toggleSidebar': 'shortcuts.action.toggleSidebar',
  'view.toggleFocusMode': 'shortcuts.action.toggleFocusMode',
  'navigator.selectAll': 'shortcuts.action.selectAll',
  'navigator.clearSelection': 'shortcuts.action.clearSelection',
  'panel.focusNext': 'shortcuts.action.focusNextPanel',
  'panel.focusPrev': 'shortcuts.action.focusPrevPanel',
  'chat.stopProcessing': 'shortcuts.action.stopProcessing',
  'chat.cyclePermissionMode': 'shortcuts.action.cyclePermissionMode',
  'chat.nextSearchMatch': 'shortcuts.action.nextSearchMatch',
  'chat.prevSearchMatch': 'shortcuts.action.prevSearchMatch',
}

function ActionShortcutRow({ actionId }: { actionId: ActionId }) {
  const { t } = useTranslation()
  const { label, hotkey } = useActionLabel(actionId)

  if (!hotkey) return null

  // Split hotkey into individual keys for display
  // Mac: symbols are concatenated (⌘⇧N) - need smart splitting
  // Windows: separated by + (Ctrl+Shift+N) - split on +
  const keys = isMac
    ? hotkey.match(/[⌘⇧⌥←→]|Tab|Esc|./g) || []
    : hotkey.split('+')

  return (
    <SettingsRow label={ACTION_LABEL_KEYS[actionId] ? t(ACTION_LABEL_KEYS[actionId]!) : label}>
      <div className="flex items-center gap-1">
        {keys.map((key, keyIndex) => (
          <Kbd key={keyIndex}>{key}</Kbd>
        ))}
      </div>
    </SettingsRow>
  )
}

export default function ShortcutsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  if (embedded) return <ShortcutsContent embedded />
  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t("settings.shortcuts.title")} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <ShortcutsContent />
        </ScrollArea>
      </div>
    </div>
  )
}

export function ShortcutsContent({ compact = false, embedded = false }: { compact?: boolean; embedded?: boolean }) {
  const { t } = useTranslation()
  const componentSpecificSections = useComponentSpecificSections()
  const [doubleCommandEnabled, setDoubleCommandEnabled] = React.useState(false)
  const [hideAppOnScreenshot, setHideAppOnScreenshot] = React.useState(false)
  const [doubleCommandStatus, setDoubleCommandStatus] = React.useState<string>('starting')
  const [permissions, setPermissions] = React.useState<{
    accessibility: string
    screenRecording: string
  } | null>(null)
  const supportsDoubleModifierScreenshot = isMac || isWindows
  const shortcutModifierName = isMac ? 'Command' : 'Alt'

  React.useEffect(() => {
    if (!supportsDoubleModifierScreenshot) return
    void Promise.all([
      window.electronAPI.getDoubleCommandScreenshotEnabled(),
      window.electronAPI.getDoubleCommandScreenshotHideApp(),
      window.electronAPI.getDoubleCommandScreenshotStatus(),
      window.electronAPI.getScreenCapturePermissionStatus(),
    ]).then(([enabled, hideApp, status, nextPermissions]) => {
      setDoubleCommandEnabled(enabled)
      setHideAppOnScreenshot(hideApp)
      setDoubleCommandStatus(status)
      setPermissions(nextPermissions)
    })
    const onStatus = (event: Event) => setDoubleCommandStatus((event as CustomEvent<string>).detail)
    window.addEventListener('craft:screen-capture-shortcut-status', onStatus)
    return () => window.removeEventListener('craft:screen-capture-shortcut-status', onStatus)
  }, [supportsDoubleModifierScreenshot])

  const shortcutStatusLabel = doubleCommandStatus === 'ready' ? '已就绪'
    : doubleCommandStatus === 'accessibility-denied' ? '需要在系统设置中允许辅助功能权限'
      : doubleCommandStatus === 'unavailable' ? '当前不可用，请检查安装与系统权限'
        : doubleCommandStatus === 'disabled' ? '已关闭'
          : '正在启动'

  const containerClass = embedded
    ? 'space-y-8'
    : compact
      ? 'space-y-6 px-4 py-4'
      : 'mx-auto max-w-3xl space-y-8 px-5 py-7'

  return (
    <div className={containerClass}>
      {supportsDoubleModifierScreenshot && (
        <SettingsSection title="屏幕截图">
          <SettingsCard>
            <SettingsToggle
              label={`双 ${shortcutModifierName} 截图`}
              description={`同时按下左右 ${shortcutModifierName}，将当前屏幕截图添加到当前会话输入框（不会自动发送）。${shortcutStatusLabel}`}
              checked={doubleCommandEnabled}
              onCheckedChange={async enabled => {
                setDoubleCommandEnabled(enabled)
                await window.electronAPI.setDoubleCommandScreenshotEnabled(enabled)
                setDoubleCommandStatus(await window.electronAPI.getDoubleCommandScreenshotStatus())
              }}
            />
            <SettingsToggle
              label="截图时隐藏 Craft Agent"
              description="截图前临时隐藏 Craft Agent 窗口，避免把当前应用本身截进图片。"
              checked={hideAppOnScreenshot}
              onCheckedChange={async enabled => {
                setHideAppOnScreenshot(enabled)
                await window.electronAPI.setDoubleCommandScreenshotHideApp(enabled)
              }}
            />
            {isMac ? (
              <>
                <SettingsRow
                  label="辅助功能权限"
                  description="用于在 Craft 不处于前台时监听左右 Command 同时按下。"
                >
                  <span className="text-xs text-muted-foreground">
                    {permissions?.accessibility === 'granted' ? '已授权' : '未授权'}
                  </span>
                  {permissions?.accessibility !== 'granted' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void window.electronAPI.openScreenCapturePermissionSettings('accessibility')}
                    >
                      去授权
                    </Button>
                  )}
                </SettingsRow>
                <SettingsRow
                  label="屏幕录制权限"
                  description="用于读取当前屏幕并把截图放入会话输入框。"
                >
                  <span className="text-xs text-muted-foreground">
                    {permissions?.screenRecording === 'granted' ? '已授权' : '未授权'}
                  </span>
                  {permissions?.screenRecording !== 'granted' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void window.electronAPI.openScreenCapturePermissionSettings('screen-recording')}
                    >
                      去授权
                    </Button>
                  )}
                </SettingsRow>
              </>
            ) : (
              <SettingsRow
                label="Windows 权限"
                description="Windows 截图不需要额外系统授权；后台双 Alt 使用本地键盘监听。若要截取管理员权限窗口，请用相同权限运行 Craft Agent。"
              >
                <span className="text-xs text-muted-foreground">无需授权</span>
              </SettingsRow>
            )}
            <SettingsRow
              label="重新检测"
              description={isMac ? '授权后返回 Craft，点击此处重新启动快捷键监听。' : '点击此处重新启动双 Alt 快捷键监听。'}
            >
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (doubleCommandEnabled) {
                    await window.electronAPI.setDoubleCommandScreenshotEnabled(false)
                    await window.electronAPI.setDoubleCommandScreenshotEnabled(true)
                  }
                  const [status, nextPermissions] = await Promise.all([
                    window.electronAPI.getDoubleCommandScreenshotStatus(),
                    window.electronAPI.getScreenCapturePermissionStatus(),
                  ])
                  setDoubleCommandStatus(status)
                  setPermissions(nextPermissions)
                }}
              >
                重新检测
              </Button>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      )}
      {Object.entries(actionsByCategory).map(([category, actions]) => (
        <SettingsSection key={category} title={t(`shortcuts.category.${category.toLowerCase()}`)}>
          <SettingsCard>
            {actions.map(action => (
              <ActionShortcutRow key={action.id} actionId={action.id as ActionId} />
            ))}
          </SettingsCard>
        </SettingsSection>
      ))}

      {componentSpecificSections.map((section) => (
        <SettingsSection key={section.title} title={section.title}>
          <SettingsCard>
            {section.shortcuts.map((shortcut, index) => (
              <SettingsRow key={index} label={shortcut.description}>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, keyIndex) => (
                    <Kbd key={keyIndex}>{key}</Kbd>
                  ))}
                </div>
              </SettingsRow>
            ))}
          </SettingsCard>
        </SettingsSection>
      ))}
    </div>
  )
}
