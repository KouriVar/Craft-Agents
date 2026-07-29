/**
 * Network / HTTP proxy settings block (used by Integrations composite page).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Spinner } from '@craft-agent/ui'
import type { NetworkProxySettings } from '../../../shared/types'
import {
  SettingsSection,
  SettingsCard,
  SettingsCardFooter,
  SettingsToggle,
  SettingsInput,
} from '@/components/settings'

interface ProxyFormState {
  enabled: boolean
  httpProxy: string
  httpsProxy: string
  noProxy: string
}

const EMPTY_PROXY_FORM: ProxyFormState = {
  enabled: false,
  httpProxy: '',
  httpsProxy: '',
  noProxy: '',
}

function toProxyFormState(settings?: NetworkProxySettings): ProxyFormState {
  if (!settings) return EMPTY_PROXY_FORM
  return {
    enabled: settings.enabled,
    httpProxy: settings.httpProxy ?? '',
    httpsProxy: settings.httpsProxy ?? '',
    noProxy: settings.noProxy ?? '',
  }
}

function toNetworkProxySettings(form: ProxyFormState): NetworkProxySettings {
  return {
    enabled: form.enabled,
    httpProxy: form.httpProxy.trim() || undefined,
    httpsProxy: form.httpsProxy.trim() || undefined,
    noProxy: form.noProxy.trim() || undefined,
  }
}

function validateProxyUrl(url: string): string | undefined {
  if (!url.trim()) return undefined
  try {
    const parsed = new URL(url.trim())
    if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(parsed.protocol)) {
      return 'proxyErrorProtocol'
    }
    return undefined
  } catch {
    return 'proxyErrorFormat'
  }
}

export default function NetworkProxySection() {
  const { t } = useTranslation()
  const [proxyForm, setProxyForm] = useState<ProxyFormState>(EMPTY_PROXY_FORM)
  const [savedProxyForm, setSavedProxyForm] = useState<ProxyFormState>(EMPTY_PROXY_FORM)
  const [proxyError, setProxyError] = useState<string | undefined>()
  const [isSavingProxy, setIsSavingProxy] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!window.electronAPI) return
      try {
        const proxySettings = await window.electronAPI.getNetworkProxySettings()
        const form = toProxyFormState(proxySettings)
        setProxyForm(form)
        setSavedProxyForm(form)
      } catch (error) {
        console.error('Failed to load proxy settings:', error)
      }
    }
    void load()
  }, [])

  const isProxyDirty = useMemo(() => {
    return JSON.stringify(proxyForm) !== JSON.stringify(savedProxyForm)
  }, [proxyForm, savedProxyForm])

  const handleSaveProxy = useCallback(async () => {
    const httpErr = validateProxyUrl(proxyForm.httpProxy)
    const httpsErr = validateProxyUrl(proxyForm.httpsProxy)
    if (httpErr || httpsErr) {
      setProxyError(httpErr || httpsErr)
      return
    }
    setProxyError(undefined)
    setIsSavingProxy(true)
    try {
      const settings = toNetworkProxySettings(proxyForm)
      await window.electronAPI.setNetworkProxySettings(settings)
      const persisted = await window.electronAPI.getNetworkProxySettings()
      const form = toProxyFormState(persisted)
      setProxyForm(form)
      setSavedProxyForm(form)
    } catch (error) {
      setProxyError(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSavingProxy(false)
    }
  }, [proxyForm])

  const handleResetProxy = useCallback(() => {
    setProxyForm(savedProxyForm)
    setProxyError(undefined)
  }, [savedProxyForm])

  return (
    <SettingsSection title={t('settings.network.title')}>
      <SettingsCard>
        <SettingsToggle
          label={t('settings.network.httpProxy')}
          description={t('settings.network.httpProxyDesc')}
          checked={proxyForm.enabled}
          onCheckedChange={(enabled) => setProxyForm(prev => ({ ...prev, enabled }))}
        />
        {proxyForm.enabled && (
          <>
            <SettingsInput
              label={t('settings.network.httpProxyLabel')}
              value={proxyForm.httpProxy}
              onChange={(value) => setProxyForm(prev => ({ ...prev, httpProxy: value }))}
              placeholder={t('settings.network.proxyPlaceholder')}
              inCard
            />
            <SettingsInput
              label={t('settings.network.httpsProxyLabel')}
              value={proxyForm.httpsProxy}
              onChange={(value) => setProxyForm(prev => ({ ...prev, httpsProxy: value }))}
              placeholder={t('settings.network.proxyPlaceholder')}
              inCard
            />
            <SettingsInput
              label={t('settings.network.bypassRules')}
              value={proxyForm.noProxy}
              onChange={(value) => setProxyForm(prev => ({ ...prev, noProxy: value }))}
              placeholder={t('settings.network.bypassPlaceholder')}
              inCard
            />
          </>
        )}
        {(isProxyDirty || proxyError) && (
          <SettingsCardFooter>
            {proxyError && (
              <span className="text-destructive text-sm mr-auto">
                {proxyError === 'proxyErrorProtocol'
                  ? t('settings.network.proxyErrorProtocol')
                  : proxyError === 'proxyErrorFormat'
                    ? t('settings.network.proxyErrorFormat')
                    : proxyError}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetProxy}
              disabled={!isProxyDirty || isSavingProxy}
            >
              {t('common.reset')}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveProxy}
              disabled={!isProxyDirty || isSavingProxy}
            >
              {isSavingProxy ? (
                <>
                  <Spinner className="mr-1.5" />
                  {t('common.saving')}
                </>
              ) : (
                t('common.save')
              )}
            </Button>
          </SettingsCardFooter>
        )}
      </SettingsCard>
    </SettingsSection>
  )
}
