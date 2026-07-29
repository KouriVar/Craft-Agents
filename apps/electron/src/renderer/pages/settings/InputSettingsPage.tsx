/**
 * InputSettingsPage
 *
 * Input behavior settings that control how the chat input works.
 *
 * Settings:
 * - Auto Capitalisation (on/off)
 * - Spell Check (on/off)
 * - Send Message Key (Enter or ⌘+Enter)
 * - History conversation scroll
 * - Right sidebar / layout
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { routes } from '@/lib/navigate'
import { isMac } from '@/lib/platform'
import type { DetailsPageMeta } from '@/lib/details-page-meta'

import {
  SettingsSection,
  SettingsCard,
  SettingsToggle,
  SettingsMenuSelectRow,
} from '@/components/settings'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'input',
}

export interface InputSettingsPageProps {
  embedded?: boolean
  showTyping?: boolean
  showSending?: boolean
  showHistory?: boolean
  showLayout?: boolean
}

export default function InputSettingsPage({
  embedded = false,
  showTyping = true,
  showSending = true,
  showHistory = true,
  showLayout = true,
}: InputSettingsPageProps = {}) {
  const { t } = useTranslation()

  const [autoCapitalisation, setAutoCapitalisation] = useState(true)
  const [spellCheck, setSpellCheck] = useState(false)
  const [sendMessageKey, setSendMessageKey] = useState<'enter' | 'cmd-enter'>('enter')
  const [openConversationScroll, setOpenConversationScrollState] = useState<'bottom' | 'top' | 'last'>('bottom')
  const [rightSidebarMode, setRightSidebarModeState] = useState<'manual' | 'auto' | 'always'>('manual')
  const [rightSidebarFollow, setRightSidebarFollow] = useState(false)
  const [browserOpenMode, setBrowserOpenModeState] = useState<'sidebar' | 'window'>('sidebar')

  useEffect(() => {
    const loadSettings = async () => {
      if (!window.electronAPI) return
      try {
        const [autoCapEnabled, spellCheckEnabled, sendKey, scrollPos, rsMode, rsFollow, browserMode] = await Promise.all([
          window.electronAPI.getAutoCapitalisation(),
          window.electronAPI.getSpellCheck(),
          window.electronAPI.getSendMessageKey(),
          window.electronAPI.getOpenConversationScroll(),
          window.electronAPI.getRightSidebarMode(),
          window.electronAPI.getRightSidebarFollowSession(),
          window.electronAPI.getBrowserOpenMode(),
        ])
        setAutoCapitalisation(autoCapEnabled)
        setSpellCheck(spellCheckEnabled)
        setSendMessageKey(sendKey)
        setOpenConversationScrollState(scrollPos)
        setRightSidebarModeState(rsMode)
        setRightSidebarFollow(rsFollow)
        setBrowserOpenModeState(browserMode)
      } catch (error) {
        console.error('Failed to load input settings:', error)
      }
    }
    loadSettings()
  }, [])

  const handleAutoCapitalisationChange = useCallback(async (enabled: boolean) => {
    setAutoCapitalisation(enabled)
    await window.electronAPI.setAutoCapitalisation(enabled)
  }, [])

  const handleSpellCheckChange = useCallback(async (enabled: boolean) => {
    setSpellCheck(enabled)
    await window.electronAPI.setSpellCheck(enabled)
  }, [])

  const handleSendMessageKeyChange = useCallback((value: string) => {
    const key = value as 'enter' | 'cmd-enter'
    setSendMessageKey(key)
    window.electronAPI.setSendMessageKey(key)
  }, [])

  const handleOpenConversationScrollChange = useCallback((value: string) => {
    const pos = value as 'bottom' | 'top' | 'last'
    setOpenConversationScrollState(pos)
    window.electronAPI.setOpenConversationScroll(pos)
  }, [])

  const handleRightSidebarModeChange = useCallback((value: string) => {
    const mode = value as 'manual' | 'auto' | 'always'
    setRightSidebarModeState(mode)
    window.electronAPI.setRightSidebarMode(mode)
  }, [])

  const handleRightSidebarFollowChange = useCallback(async (enabled: boolean) => {
    setRightSidebarFollow(enabled)
    await window.electronAPI.setRightSidebarFollowSession(enabled)
  }, [])

  const handleBrowserOpenModeChange = useCallback((value: string) => {
    const mode = value as 'sidebar' | 'window'
    setBrowserOpenModeState(mode)
    window.electronAPI.setBrowserOpenMode(mode)
  }, [])

  const body = (
    <div className="space-y-8">
      {showTyping && (
        <SettingsSection title={t('settings.input.typing')} description={t('settings.input.typingDesc')}>
          <SettingsCard>
            <SettingsToggle
              label={t('settings.input.autoCapitalisation')}
              description={t('settings.input.autoCapitalisationDesc')}
              checked={autoCapitalisation}
              onCheckedChange={handleAutoCapitalisationChange}
            />
            <SettingsToggle
              label={t('settings.input.spellCheck')}
              description={t('settings.input.spellCheckDesc')}
              checked={spellCheck}
              onCheckedChange={handleSpellCheckChange}
            />
          </SettingsCard>
        </SettingsSection>
      )}

      {showSending && (
        <SettingsSection title={t('settings.input.sending')} description={t('settings.input.sendingDesc')}>
          <SettingsCard>
            <SettingsMenuSelectRow
              label={t('settings.input.sendMessageWith')}
              description={t('settings.input.sendMessageWithDesc')}
              value={sendMessageKey}
              onValueChange={handleSendMessageKeyChange}
              options={[
                { value: 'enter', label: t('settings.input.enterKey'), description: t('settings.input.enterKeyDesc') },
                { value: 'cmd-enter', label: isMac ? t('settings.input.cmdEnterKey') : t('settings.input.ctrlEnterKey'), description: t('settings.input.cmdEnterKeyDesc') },
              ]}
            />
          </SettingsCard>
        </SettingsSection>
      )}

      {showHistory && (
        <SettingsSection title={t('settings.input.historyConversation')} description={t('settings.input.historyConversationDesc')}>
          <SettingsCard>
            <SettingsMenuSelectRow
              label={t('settings.input.openConversationScroll')}
              description={t('settings.input.openConversationScrollDesc')}
              value={openConversationScroll}
              onValueChange={handleOpenConversationScrollChange}
              options={[
                { value: 'bottom', label: t('settings.input.scrollBottom'), description: t('settings.input.scrollBottomDesc') },
                { value: 'top', label: t('settings.input.scrollTop'), description: t('settings.input.scrollTopDesc') },
                { value: 'last', label: t('settings.input.scrollLast'), description: t('settings.input.scrollLastDesc') },
              ]}
            />
          </SettingsCard>
        </SettingsSection>
      )}

      {showLayout && (
        <SettingsSection title={t('settings.input.rightSidebar')} description={t('settings.input.rightSidebarDesc')}>
          <SettingsCard>
            <SettingsMenuSelectRow
              label={t('settings.input.rightSidebarMode')}
              description={t('settings.input.rightSidebarModeDesc')}
              value={rightSidebarMode}
              onValueChange={handleRightSidebarModeChange}
              options={[
                { value: 'manual', label: t('settings.input.rightSidebarManual'), description: t('settings.input.rightSidebarManualDesc') },
                { value: 'auto', label: t('settings.input.rightSidebarAuto'), description: t('settings.input.rightSidebarAutoDesc') },
                { value: 'always', label: t('settings.input.rightSidebarAlways'), description: t('settings.input.rightSidebarAlwaysDesc') },
              ]}
            />
            <SettingsToggle
              label={t('settings.input.rightSidebarFollow')}
              description={t('settings.input.rightSidebarFollowDesc')}
              checked={rightSidebarFollow}
              onCheckedChange={handleRightSidebarFollowChange}
            />
            <SettingsMenuSelectRow
              label={t('settings.input.browserOpenMode')}
              description={t('settings.input.browserOpenModeDesc')}
              value={browserOpenMode}
              onValueChange={handleBrowserOpenModeChange}
              options={[
                { value: 'sidebar', label: t('settings.input.browserOpenSidebar'), description: t('settings.input.browserOpenSidebarDesc') },
                { value: 'window', label: t('settings.input.browserOpenWindow'), description: t('settings.input.browserOpenWindowDesc') },
              ]}
            />
          </SettingsCard>
        </SettingsSection>
      )}
    </div>
  )

  if (embedded) return body

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('settings.input.title')} actions={<HeaderMenu route={routes.view.settings('input')} />} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            {body}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
