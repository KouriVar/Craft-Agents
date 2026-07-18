import React, { useCallback, useState } from 'react'
import { initReactI18next, useTranslation } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import ReactDOM from 'react-dom/client'
import { BrowserEmptyStateCard } from '@craft-agent/ui'
import { setupI18n } from '@craft-agent/shared/i18n'
import { routes } from '../shared/routes'
import { getEmptyStatePromptSamples } from './components/browser/empty-state-prompts'
import { applyPlatformAttribute } from '@/lib/platform'
import './index.css'

applyPlatformAttribute()

// Standalone renderer entry: initialize translations before rendering the
// runtime's new-tab page, just like browser-toolbar.tsx does.
setupI18n([LanguageDetector, initReactI18next])

// Kept for an easy rollback to the original prompt-oriented new-tab page.
// The current browser workspace intentionally uses the address-only surface.
const SHOW_LEGACY_BROWSER_EMPTY_STATE = false

function resolveNewTabInput(value: string): string {
  const trimmed = value.trim()
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  const looksLikeHost = /^(localhost|\d{1,3}(?:\.\d{1,3}){3}|[\w-]+(?:\.[\w-]+)+)(?::\d+)?(?:\/|$)/i.test(trimmed)

  if (hasScheme || looksLikeHost) return trimmed
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

function BrowserEmptyStateApp() {
  const { t, i18n } = useTranslation()
  const [address, setAddress] = useState('')
  const handlePromptSelect = useCallback(async (fullPrompt: string) => {
    const route = routes.action.newSession({ input: fullPrompt, send: true })
    const token = String(Date.now())

    try {
      if (window.electronAPI?.browserPane?.emptyStateLaunch) {
        await window.electronAPI.browserPane.emptyStateLaunch({ route, token })
        return
      }
    } catch {
      // Fallback to hash-signaling below if IPC route fails for any reason.
    }

    const launchParams = new URLSearchParams({ route, ts: token })
    window.location.hash = `launch=${launchParams.toString()}`
  }, [])

  const handleNavigate = useCallback((event: React.FormEvent) => {
    event.preventDefault()
    const value = address.trim()
    if (!value) return
    const params = new URLSearchParams({ value: resolveNewTabInput(value), ts: String(Date.now()) })
    window.location.hash = `navigate=${params.toString()}`
  }, [address])

  return (
    <div className="h-screen w-screen bg-foreground-2 overflow-hidden">
      <div className="h-full w-full bg-background overflow-auto">
        {SHOW_LEGACY_BROWSER_EMPTY_STATE ? (
          <BrowserEmptyStateCard
            title={t("browser.readyTitle")}
            description={t("browser.readyDescription")}
            prompts={getEmptyStatePromptSamples(i18n.resolvedLanguage ?? i18n.language)}
            showExamplePrompts={true}
            showSafetyHint={true}
            onPromptSelect={(sample) => handlePromptSelect(sample.full)}
          />
        ) : (
          <main className="flex h-full min-h-[360px] w-full items-center justify-center px-8">
            <form onSubmit={handleNavigate} className="w-full max-w-[720px]">
                <label htmlFor="browser-new-tab-address" className="sr-only">
                  {t('browser.urlPlaceholder')}
                </label>
                <div className="flex h-14 items-center rounded-[14px] border border-border/70 bg-background px-5 shadow-minimal transition-[border-color,box-shadow] focus-within:border-foreground/20 focus-within:shadow-modal-small">
                  <input
                    id="browser-new-tab-address"
                    autoFocus
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder={t('browser.urlPlaceholder')}
                    autoCapitalize="none"
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                </div>
            </form>
          </main>
        )}
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserEmptyStateApp />
  </React.StrictMode>,
)
