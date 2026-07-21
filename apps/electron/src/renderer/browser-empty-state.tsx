import React, { useCallback, useRef, useState } from 'react'
import { initReactI18next, useTranslation } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import ReactDOM from 'react-dom/client'
import { ArrowUp, Search } from 'lucide-react'
import { setupI18n } from '@craft-agent/shared/i18n'
import { resolveBrowserAddress } from './components/browser/utils'
import { applyPlatformAttribute } from '@/lib/platform'
import './index.css'

applyPlatformAttribute()
setupI18n([LanguageDetector, initReactI18next])

function BrowserEmptyStateApp() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = useCallback((event: React.FormEvent) => {
    event.preventDefault()
    const value = input.trim()
    if (!value) return

    const params = new URLSearchParams({ value: resolveBrowserAddress(value), ts: String(Date.now()) })
    window.location.hash = `navigate=${params.toString()}`
  }, [input])

  return (
    <div className="h-screen w-screen overflow-hidden bg-foreground-2">
      <main className="flex h-full w-full flex-col justify-center overflow-hidden bg-background pb-[24vh] text-foreground">
        <form onSubmit={submit} className="mx-auto w-[82vw] max-w-[980px]">
          <label htmlFor="browser-new-tab-input" className="sr-only">
            {t('browser.urlPlaceholder')}
          </label>
          <div className="flex h-14 items-center gap-3 rounded-[18px] border border-border/80 bg-background px-5 shadow-modal-small transition-[border-color,box-shadow] focus-within:border-foreground/25">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/70" aria-hidden="true">
              <Search className="h-4 w-4" />
            </span>
            <input
              ref={inputRef}
              id="browser-new-tab-input"
              autoFocus
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('browser.urlPlaceholder')}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label={t('browser.searchMode')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-[opacity,transform] hover:opacity-85 active:scale-95 disabled:opacity-0"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserEmptyStateApp />
  </React.StrictMode>,
)
