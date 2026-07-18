import { ipcRenderer } from 'electron'

const CAPTURE_CHANNEL = 'browser-credentials:captured'
const FILL_CHANNEL = 'browser-credentials:fill'
const INSTALL_STORE_EXTENSION_CHANNEL = 'browser-extension:install-from-store-page'
const EMPTY_STATE_FOCUS_CHANNEL = 'browser-empty-state:request-focus'
const STORE_INSTALL_BUTTON_ID = 'craft-agents-store-install-button'
const STORE_INSTALL_Z_INDEX = 'var(--z-floating-menu, 400)'
const REPLACED_STORE_BUTTON_ATTRIBUTE = 'data-craft-agents-replaced-store-button'

function isBrowserEmptyStatePage(): boolean {
  return location.pathname.endsWith('/browser-empty-state.html')
    || location.pathname.endsWith('\\browser-empty-state.html')
}

// A WebContentsView embedded in a different BrowserWindow can retain DOM focus
// without owning the native Windows keyboard/IME focus. Reassert it from the
// trusted internal new-tab page whenever its address field is interacted with.
document.addEventListener('pointerdown', (event) => {
  if (!isBrowserEmptyStatePage()) return
  if (!(event.target instanceof HTMLInputElement)) return
  ipcRenderer.send(EMPTY_STATE_FOCUS_CHANNEL)
}, true)

document.addEventListener('focusin', (event) => {
  if (!isBrowserEmptyStatePage()) return
  if (!(event.target instanceof HTMLInputElement)) return
  ipcRenderer.send(EMPTY_STATE_FOCUS_CHANNEL)
}, true)

const CHROME_INSTALL_LABELS = [
  'add to chrome',
  '添加至 chrome',
  '添加到 chrome',
  '加到 chrome',
]

function getStoreExtensionId(url: URL): string | null {
  const supportedHost = url.hostname === 'chromewebstore.google.com'
    || url.hostname === 'chrome.google.com'
    || url.hostname === 'microsoftedge.microsoft.com'
  if (!supportedHost) return null
  return url.pathname.split('/').find((part) => /^[a-p]{32}$/.test(part)) ?? null
}

function normalizedControlLabel(element: Element): string {
  const label = element.getAttribute('aria-label')
    || element.getAttribute('title')
    || element.textContent
    || ''
  return label.replace(/\s+/g, ' ').trim().toLowerCase()
}

function findChromeInstallButton(currentUrl: URL): HTMLElement | null {
  if (currentUrl.hostname !== 'chromewebstore.google.com' && currentUrl.hostname !== 'chrome.google.com') return null

  const controls = [
    ...Array.from(document.querySelectorAll<HTMLElement>('button')),
    ...Array.from(document.querySelectorAll<HTMLElement>('[role="button"]:not(button)')),
  ]
  return controls.find((element) => {
    if (element.id === STORE_INSTALL_BUTTON_ID) return false
    const label = normalizedControlLabel(element)
    return CHROME_INSTALL_LABELS.some((candidate) => label === candidate || label.startsWith(`${candidate} `))
  }) ?? null
}

function applyFloatingStoreButtonStyle(button: HTMLButtonElement): void {
  Object.assign(button.style, {
    position: 'fixed',
    right: '24px',
    bottom: '24px',
    zIndex: STORE_INSTALL_Z_INDEX,
    width: 'auto',
    minWidth: '0',
    height: '42px',
    margin: '0',
    padding: '0 18px',
    border: '1px solid rgba(127,127,127,.28)',
    borderRadius: '10px',
    background: '#202124',
    color: '#ffffff',
    font: '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    cursor: 'pointer',
  })
  button.dataset.placement = 'floating'
}

function placeStoreButtonAtChromeAction(button: HTMLButtonElement, nativeButton: HTMLElement): void {
  if (nativeButton.getAttribute(REPLACED_STORE_BUTTON_ATTRIBUTE) === 'true'
    && nativeButton.previousElementSibling === button) {
    nativeButton.style.setProperty('display', 'none', 'important')
    return
  }

  const rect = nativeButton.getBoundingClientRect()
  const computed = getComputedStyle(nativeButton)

  nativeButton.setAttribute(REPLACED_STORE_BUTTON_ATTRIBUTE, 'true')
  nativeButton.setAttribute('aria-hidden', 'true')
  nativeButton.style.setProperty('display', 'none', 'important')

  Object.assign(button.style, {
    position: 'static',
    right: 'auto',
    bottom: 'auto',
    zIndex: 'auto',
    width: rect.width >= 100 && rect.width <= 360 ? `${Math.round(rect.width)}px` : 'auto',
    minWidth: rect.width >= 100 && rect.width <= 360 ? `${Math.round(rect.width)}px` : '148px',
    height: rect.height >= 32 && rect.height <= 72 ? `${Math.round(rect.height)}px` : '40px',
    margin: computed.margin,
    padding: '0 18px',
    border: '1px solid rgba(32,33,36,.16)',
    borderRadius: computed.borderRadius && computed.borderRadius !== '0px' ? computed.borderRadius : '20px',
    background: '#202124',
    color: '#ffffff',
    font: '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    cursor: 'pointer',
  })

  nativeButton.insertAdjacentElement('beforebegin', button)
  button.dataset.placement = 'chrome-action'
}

function installStoreButton(): void {
  let currentUrl: URL
  try {
    currentUrl = new URL(location.href)
  } catch {
    return
  }
  const extensionId = getStoreExtensionId(currentUrl)
  const existing = document.getElementById(STORE_INSTALL_BUTTON_ID)
  if (!extensionId) {
    existing?.remove()
    return
  }
  if (!document.body) return

  const isChinese = navigator.language.toLowerCase().startsWith('zh')
  const button = existing instanceof HTMLButtonElement ? existing : document.createElement('button')
  if (!existing) {
    button.id = STORE_INSTALL_BUTTON_ID
    button.type = 'button'
    button.textContent = isChinese ? '添加至 Craft Agents' : 'Add to Craft Agents'
    button.setAttribute('aria-label', button.textContent)
    button.addEventListener('click', async () => {
      if (button.dataset.pending === 'true') return
      button.dataset.pending = 'true'
      button.disabled = true
      button.style.opacity = '.72'
      button.textContent = isChinese ? '正在安装…' : 'Installing…'
      try {
        await ipcRenderer.invoke(INSTALL_STORE_EXTENSION_CHANNEL, location.href)
        button.textContent = isChinese ? '已安装' : 'Installed'
        button.style.opacity = '1'
      } catch (error) {
        button.dataset.pending = 'false'
        button.disabled = false
        button.style.opacity = '1'
        button.textContent = isChinese ? '安装失败，重试' : 'Install failed — retry'
        button.title = error instanceof Error ? error.message : String(error)
      }
    })
    document.body.appendChild(button)
  }

  const nativeChromeButton = findChromeInstallButton(currentUrl)
  if (nativeChromeButton) {
    placeStoreButtonAtChromeAction(button, nativeChromeButton)
  } else if (button.dataset.placement !== 'chrome-action') {
    applyFloatingStoreButtonStyle(button)
  }
}

let storeButtonFrame = 0
const scheduleStoreButton = () => {
  cancelAnimationFrame(storeButtonFrame)
  storeButtonFrame = requestAnimationFrame(installStoreButton)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleStoreButton, { once: true })
} else {
  scheduleStoreButton()
}
new MutationObserver(scheduleStoreButton).observe(document.documentElement, { childList: true, subtree: true })
window.addEventListener('popstate', scheduleStoreButton)
window.addEventListener('hashchange', scheduleStoreButton)

function findUsernameInput(form: HTMLFormElement, passwordInput: HTMLInputElement): HTMLInputElement | null {
  const explicit = form.querySelector<HTMLInputElement>('input[autocomplete="username"], input[type="email"]')
  if (explicit) return explicit
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="password"])'))
  const passwordIndex = Array.from(form.elements).indexOf(passwordInput)
  return [...inputs].reverse().find((input) => Array.from(form.elements).indexOf(input) < passwordIndex) ?? inputs[0] ?? null
}

function capture(form: HTMLFormElement): void {
  const passwords = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="password"]'))
    .filter((input) => input.value && !input.disabled)
  if (passwords.length === 0) return
  const passwordInput = passwords.find((input) => input.autocomplete === 'current-password') ?? passwords[0]!
  const usernameInput = findUsernameInput(form, passwordInput)
  const username = usernameInput?.value?.trim() ?? ''
  if (!username || passwordInput.value.length > 4096) return
  ipcRenderer.send(CAPTURE_CHANNEL, {
    origin: location.origin,
    username: username.slice(0, 512),
    password: passwordInput.value,
  })
}

document.addEventListener('submit', (event) => {
  if (event.target instanceof HTMLFormElement) capture(event.target)
}, true)

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('button, input[type="submit"]') : null
  const form = target instanceof HTMLButtonElement || target instanceof HTMLInputElement ? target.form : null
  if (form) capture(form)
}, true)

ipcRenderer.on(FILL_CHANNEL, (_event, credential: { username: string; password: string }) => {
  const passwordInput = document.querySelector<HTMLInputElement>('input[autocomplete="current-password"], input[type="password"]')
  if (!passwordInput) return
  const form = passwordInput.form
  if (!form) return
  const usernameInput = findUsernameInput(form, passwordInput)
  const setValue = (input: HTMLInputElement, value: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
    descriptor?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  if (usernameInput) setValue(usernameInput, credential.username)
  setValue(passwordInput, credential.password)
  passwordInput.focus()
})
