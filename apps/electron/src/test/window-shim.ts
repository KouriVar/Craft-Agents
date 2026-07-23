/**
 * Helpers for tests that temporarily install a partial `globalThis.window`.
 * Always restore with {@link restoreWindowShim} so axios / later suites do not
 * see a window object without `location`.
 */

type WindowShim = typeof globalThis.window

let depth = 0
let stack: Array<WindowShim | undefined> = []

function ensureLocationOnShim(shim: Record<string, unknown>): void {
  if (!shim.location || typeof shim.location !== 'object') {
    shim.location = {
      href: 'http://localhost/',
      origin: 'http://localhost',
      protocol: 'http:',
      host: 'localhost',
      hostname: 'localhost',
      port: '',
      pathname: '/',
      search: '',
      hash: '',
      assign: () => {},
      replace: () => {},
      reload: () => {},
    }
  }
}

/** Install a window shim (merges a safe `location` if missing). */
export function installWindowShim(partial: Record<string, unknown>): void {
  stack.push(globalThis.window)
  depth += 1
  ensureLocationOnShim(partial)
  if (typeof partial.requestAnimationFrame !== 'function') {
    partial.requestAnimationFrame = (cb: (time: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
  }
  if (typeof partial.getSelection !== 'function') {
    partial.getSelection = () => null
  }
  globalThis.window = partial as unknown as WindowShim
}

/** Restore the window captured by the matching {@link installWindowShim}. */
export function restoreWindowShim(): void {
  if (depth === 0) return
  depth -= 1
  const previous = stack.pop()
  if (previous === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
  } else {
    ensureLocationOnShim(previous as unknown as Record<string, unknown>)
    globalThis.window = previous
  }
}
