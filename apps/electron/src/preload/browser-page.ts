import { ipcRenderer } from 'electron'

const CAPTURE_CHANNEL = 'browser-credentials:captured'
const FILL_CHANNEL = 'browser-credentials:fill'

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
