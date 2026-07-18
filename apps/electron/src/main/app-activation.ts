export interface ActivatableWindow {
  isDestroyed(): boolean
  isMinimized(): boolean
  isVisible(): boolean
  restore(): void
  show(): void
  focus(): void
}

export function extractDeepLink(commandLine: string[], scheme: string): string | null {
  const prefix = `${scheme.toLowerCase()}://`
  return commandLine.find(argument => argument.toLowerCase().startsWith(prefix)) ?? null
}

/** One event-driven activation; intentionally contains no timer or focus loop. */
export function activateWindow(window: ActivatableWindow): boolean {
  if (window.isDestroyed()) return false
  if (window.isMinimized()) window.restore()
  if (!window.isVisible()) window.show()
  window.focus()
  return true
}
