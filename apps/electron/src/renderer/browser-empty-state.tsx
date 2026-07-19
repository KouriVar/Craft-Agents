import React, { useCallback, useMemo, useRef, useState } from 'react'
import { initReactI18next, useTranslation } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import ReactDOM from 'react-dom/client'
import { ArrowUp, Check, Globe2, LoaderCircle, Search, Sparkles } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@craft-agent/ui'
import { setupI18n } from '@craft-agent/shared/i18n'
import {
  appendBrowserIntentCorrection,
  classifyBrowserNewTabIntent,
  normalizeBrowserIntentCorrections,
  type BrowserIntentCorrection,
  type BrowserNewTabIntent,
} from './components/browser/new-tab-intent'
import { launchBrowserAskAiSession } from './components/browser/browser-ask-ai-launcher'
import { buildBrowserSearchUrl, resolveBrowserAddress } from './components/browser/utils'
import { applyPlatformAttribute } from '@/lib/platform'
import { get as getLocalStorage, KEYS, set as setLocalStorage } from '@/lib/local-storage'
import './index.css'

applyPlatformAttribute()
setupI18n([LanguageDetector, initReactI18next])

function BrowserEmptyStateApp() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [intentOverride, setIntentOverride] = useState<BrowserNewTabIntent | null>(null)
  const [corrections, setCorrections] = useState<BrowserIntentCorrection[]>(() => (
    normalizeBrowserIntentCorrections(getLocalStorage<unknown>(KEYS.browserIntentCorrections, []))
  ))
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const decision = useMemo(
    () => classifyBrowserNewTabIntent(input, corrections),
    [corrections, input],
  )
  const selectedIntent = intentOverride ?? decision.intent
  const selectedIntentLabel = selectedIntent === 'navigate'
    ? t('browser.navigateMode')
    : selectedIntent === 'search'
      ? t('browser.searchMode')
      : t('browser.askAiMode')

  const submit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault()
    const value = input.trim()
    if (!value || submitting) return

    if (intentOverride && intentOverride !== decision.intent) {
      const next = appendBrowserIntentCorrection(corrections, value, decision.intent, intentOverride)
      setCorrections(next)
      setLocalStorage(KEYS.browserIntentCorrections, next)
    }

    if (selectedIntent !== 'ask-ai') {
      const destination = selectedIntent === 'search'
        ? buildBrowserSearchUrl(value)
        : resolveBrowserAddress(value)
      const params = new URLSearchParams({ value: destination, ts: String(Date.now()) })
      window.location.hash = `navigate=${params.toString()}`
      return
    }

    setSubmitError(null)
    setSubmitting(true)
    try {
      // Ask AI is a real CraftAgent session. Hand it straight to the existing
      // ChatPage, then restore this browser tab as a fresh reusable launcher.
      await launchBrowserAskAiSession({
        api: window.browserNewTab,
        prompt: value,
        token: crypto.randomUUID(),
        unavailableMessage: t('browser.askAiUnavailable'),
        onOpened: () => {
          setInput('')
          setIntentOverride(null)
          setSubmitError(null)
          setSubmitting(false)
        },
      })
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error))
      setSubmitting(false)
    }
  }, [corrections, decision.intent, input, intentOverride, selectedIntent, submitting, t])

  return (
    <div className="h-screen w-screen overflow-hidden bg-foreground-2">
      <main className="flex h-full w-full flex-col justify-center overflow-hidden bg-background pb-[24vh] text-foreground">
        <form onSubmit={submit} className="mx-auto w-[82vw] max-w-[980px]">
          <label htmlFor="browser-new-tab-input" className="sr-only">
            {t('browser.smartInputPlaceholder')}
          </label>
          <div className="flex h-14 items-center gap-3 rounded-[18px] border border-border/80 bg-background px-5 shadow-modal-small transition-[border-color,box-shadow] focus-within:border-foreground/25">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`${t('browser.intentMode')}: ${selectedIntentLabel}`}
                  title={selectedIntentLabel}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-foreground/6 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 data-[state=open]:bg-foreground/6 data-[state=open]:text-foreground"
                >
                  {selectedIntent === 'navigate' && <Globe2 className="h-4 w-4" />}
                  {selectedIntent === 'search' && <Search className="h-4 w-4" />}
                  {selectedIntent === 'ask-ai' && <Sparkles className="h-4 w-4" />}
                </button>
              </DropdownMenuTrigger>
              <StyledDropdownMenuContent align="start" sideOffset={8} minWidth="min-w-40">
                {([
                  ['navigate', t('browser.navigateMode'), Globe2],
                  ['search', t('browser.searchMode'), Search],
                  ['ask-ai', t('browser.askAiMode'), Sparkles],
                ] as const).map(([intent, label, Icon]) => (
                  <StyledDropdownMenuItem
                    key={intent}
                    onClick={() => setIntentOverride(intent)}
                    className="gap-2.5"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{label}</span>
                    {selectedIntent === intent && <Check className="h-3.5 w-3.5" />}
                  </StyledDropdownMenuItem>
                ))}
              </StyledDropdownMenuContent>
            </DropdownMenu>
            <input
              ref={inputRef}
              id="browser-new-tab-input"
              autoFocus
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                setIntentOverride(null)
              }}
              placeholder={t('browser.smartInputPlaceholder')}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={selectedIntent === 'ask-ai'}
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            <button
              type="submit"
              disabled={!input.trim() || submitting}
              aria-label={selectedIntentLabel}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-[opacity,transform] hover:opacity-85 active:scale-95 disabled:opacity-0"
            >
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
          {submitting && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent" />
              {t('browser.askAiThinking')}
            </div>
          )}
          {submitError && <p role="alert" className="mt-3 px-2 text-center text-sm text-destructive">{submitError}</p>}
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
