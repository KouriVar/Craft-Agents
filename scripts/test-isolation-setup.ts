/**
 * Bun test preload: keep cross-suite global state coherent.
 *
 * Bun runs the whole repo in one process. The biggest cross-suite poisoner is
 * `mermaid-validate` installing LinkeDOM onto `globalThis` (window/document/
 * HTMLElement/navigator) without `location`, `innerHeight`, `customElements`,
 * or `requestAnimationFrame`. Later suites then hit:
 *   - axios reading `window.location.href`
 *   - ProseMirror reading bare `innerHeight`
 *   - @pierre/diffs reading bare `customElements`
 *   - selection helpers calling `window.requestAnimationFrame` / `getSelection`
 *
 * This setup:
 *   1. Installs safe polyfills immediately on load
 *   2. Re-repairs before/after each test when the test runner is active
 *   3. Avoids registering hooks when inherited by non-runner subprocesses
 */

import { afterEach, beforeEach } from 'bun:test'

type AnyRecord = Record<string, unknown>

function ensureLocation(target: AnyRecord): void {
  if (target.location && typeof target.location === 'object') {
    const location = target.location as AnyRecord
    if (typeof location.href !== 'string') {
      location.href = 'http://localhost/'
    }
    return
  }
  target.location = {
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

function ensureViewportGlobals(target: AnyRecord): void {
  if (typeof target.innerWidth !== 'number') target.innerWidth = 1024
  if (typeof target.innerHeight !== 'number') target.innerHeight = 768
  if (typeof target.devicePixelRatio !== 'number') target.devicePixelRatio = 1
  if (typeof target.requestAnimationFrame !== 'function') {
    target.requestAnimationFrame = (cb: (time: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
  }
  if (typeof target.cancelAnimationFrame !== 'function') {
    target.cancelAnimationFrame = (id: number) => clearTimeout(id)
  }
  if (typeof target.getSelection !== 'function') {
    target.getSelection = () => null
  }
}

/**
 * Bare-identifier globals (ProseMirror / @pierre/diffs read `innerHeight` /
 * `customElements` without `globalThis.`). Assignment on globalThis is enough
 * for Bun CJS/ESM free-variable lookup. `window.innerHeight = …` alone is NOT.
 */
function ensureBareViewportGlobals(): void {
  const g = globalThis as AnyRecord
  if (typeof g.innerHeight !== 'number') {
    g.innerHeight = 768
  }
  if (typeof g.innerWidth !== 'number') {
    g.innerWidth = 1024
  }
  if (typeof g.devicePixelRatio !== 'number') {
    g.devicePixelRatio = 1
  }
  if (typeof g.requestAnimationFrame !== 'function') {
    g.requestAnimationFrame = (cb: (time: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
  }
  if (typeof g.cancelAnimationFrame !== 'function') {
    g.cancelAnimationFrame = (id: number) => clearTimeout(id)
  }
}

function ensureCustomElements(): void {
  const g = globalThis as AnyRecord
  // Always install — @pierre/diffs does `HTMLElement && customElements.get(...)`
  // mid-import after another module defines HTMLElement.
  if (typeof g.customElements !== 'undefined') return

  const registry = new Map<string, unknown>()
  g.customElements = {
    define: (name: string, ctor: unknown) => {
      registry.set(name, ctor)
    },
    get: (name: string) => registry.get(name),
    whenDefined: async (name: string) => registry.get(name),
    upgrade: () => {},
  }
}

function ensureNavigator(): void {
  const g = globalThis as AnyRecord
  const existing = g.navigator
  if (existing && typeof existing === 'object') {
    const nav = existing as AnyRecord
    if (typeof nav.platform !== 'string') nav.platform = 'MacIntel'
    if (typeof nav.userAgent !== 'string') nav.userAgent = 'CraftAgentTest/1.0'
    return
  }
  // Do not invent navigator for fully headless suites — only patch holes.
}

/**
 * Repair incomplete browser shims left by earlier suites (especially LinkeDOM
 * from mermaid-validate). Fills axios / ProseMirror / pierre gaps without
 * inventing a full DOM for suites that never installed one.
 */
export function repairTestGlobals(): void {
  const g = globalThis as AnyRecord

  const windowLike =
    (typeof window !== 'undefined' ? (window as unknown as AnyRecord) : undefined) ??
    (g.window && typeof g.window === 'object' ? (g.window as AnyRecord) : undefined)

  if (windowLike) {
    ensureLocation(windowLike)
    ensureViewportGlobals(windowLike)
    if (!g.window) g.window = windowLike
  }

  // Always keep bare polyfills available. LinkeDOM can appear mid-suite after a
  // previous afterEach; import-time consumers need these before the next hook.
  ensureBareViewportGlobals()
  ensureCustomElements()
  ensureNavigator()
}

/**
 * Between tests, drop querySelector-only document stubs that are not a real
 * DOM. Leaving them alongside a window shim makes axios treat the env as a
 * browser while TipTap may take a half-mounted path.
 */
function neutralizeStubDocument(): void {
  const g = globalThis as AnyRecord
  const doc = (typeof document !== 'undefined' ? document : g.document) as AnyRecord | undefined
  if (!doc || typeof doc !== 'object') return
  const hasCreateElement = typeof doc.createElement === 'function'
  const hasQuerySelector = typeof doc.querySelector === 'function'
  if (!hasCreateElement && hasQuerySelector) {
    Reflect.deleteProperty(globalThis, 'document')
  }
}

// Eager repair for import-time consumers.
ensureBareViewportGlobals()
ensureCustomElements()
repairTestGlobals()

try {
  beforeEach(() => {
    repairTestGlobals()
  })
  afterEach(() => {
    neutralizeStubDocument()
    repairTestGlobals()
  })
} catch {
  // Plain `bun` subprocesses inherit bunfig preloads but are not the test
  // runner — skip hooks so session-draft / preferences child procs can boot.
}
