/**
 * Phase B Electron runtime acceptance via CDP (real Electron renderer + main IPC).
 * Usage: bun scripts/_phaseb-runtime-accept.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, statSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const WS_ID = '47962a7b-1979-4de7-bdf3-4a079e216afe'
const ROOT = join(homedir(), '.craft-agent-phaseb-rt', 'workspaces', 'phaseb-rt')
const EVENTS = join(ROOT, 'cognition', 'events.jsonl')
const ACCESS = join(ROOT, 'privacy', 'access-log.jsonl')
const REPORT: string[] = []

function log(msg: string) {
  console.log(msg)
  REPORT.push(msg)
}

function countLines(path: string): number {
  if (!existsSync(path)) return 0
  const t = readFileSync(path, 'utf8')
  return t.split('\n').filter((l) => l.trim()).length
}

function fileTail(path: string, n = 3): string {
  if (!existsSync(path)) return '(missing)'
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim())
  return lines.slice(-n).join('\n') || '(empty)'
}

async function getDebuggerUrl(): Promise<string> {
  const res = await fetch('http://127.0.0.1:9223/json')
  const pages = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl?: string; url?: string }>
  const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl)
  if (!page?.webSocketDebuggerUrl) throw new Error('No CDP page target')
  return page.webSocketDebuggerUrl
}

class Cdp {
  private ws: WebSocket
  private id = 0
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  constructor(url: string) {
    this.ws = new WebSocket(url)
  }
  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return
    await new Promise<void>((resolve, reject) => {
      this.ws.onopen = () => resolve()
      this.ws.onerror = (e) => reject(new Error(String(e)))
    })
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string } }
      if (msg.id != null && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!
        this.pending.delete(msg.id)
        if (msg.error) p.reject(new Error(msg.error.message))
        else p.resolve(msg.result)
      }
    }
  }
  call(method: string, params?: Record<string, unknown>) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval<T = unknown>(expression: string): Promise<T> {
    const wrapped = `(async () => { return (${expression}); })()`
    const result = (await this.call('Runtime.evaluate', {
      expression: wrapped,
      awaitPromise: true,
      returnByValue: true,
    })) as { result?: { value?: T; description?: string; subtype?: string; objectId?: string }; exceptionDetails?: unknown }
    if (result.exceptionDetails) {
      throw new Error(`Eval exception: ${JSON.stringify(result.exceptionDetails).slice(0, 800)}`)
    }
    return result.result?.value as T
  }

  /** Run a statement block that returns a value. */
  async evalBlock<T = unknown>(body: string): Promise<T> {
    const wrapped = `(async () => { ${body} })()`
    const result = (await this.call('Runtime.evaluate', {
      expression: wrapped,
      awaitPromise: true,
      returnByValue: true,
    })) as { result?: { value?: T }; exceptionDetails?: unknown }
    if (result.exceptionDetails) {
      throw new Error(`EvalBlock exception: ${JSON.stringify(result.exceptionDetails).slice(0, 800)}`)
    }
    return result.result?.value as T
  }
  close() {
    this.ws.close()
  }
}

async function main() {
  log(`WS_ID=${WS_ID}`)
  log(`ROOT=${ROOT}`)
  log(`EVENTS=${EVENTS}`)
  log(`ACCESS=${ACCESS}`)
  log(`baseline events=${countLines(EVENTS)} access=${countLines(ACCESS)}`)

  const url = await getDebuggerUrl()
  const cdp = new Cdp(url)
  await cdp.ready()
  await cdp.call('Runtime.enable')

  // Console errors collector
  await cdp.call('Console.enable').catch(() => {})
  const apiReady = await cdp.eval<boolean>(`Boolean(window.electronAPI && window.electronAPI.getPrivacyPolicy)`)
  log(`electronAPI privacy ready: ${apiReady}`)
  if (!apiReady) throw new Error('electronAPI.getPrivacyPolicy missing — privacy preload/channel not wired')

  // ---- Settings page navigation ----
  const nav = await cdp.evalBlock<{ ok: boolean; href: string; text?: string }>(`
    try {
      window.dispatchEvent(new CustomEvent('craft-agent-navigate', {
        detail: { route: 'settings/privacy' },
        bubbles: true,
      }))
      await new Promise(r => setTimeout(r, 800))
      // Fallback: click settings nav then privacy if present
      const clickText = (re) => {
        const nodes = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'))
        const el = nodes.find(n => re.test((n.textContent || '').trim()) && (n.textContent || '').trim().length < 40)
        if (el) { el.click(); return true }
        return false
      }
      clickText(/^设置$|^Settings$/)
      await new Promise(r => setTimeout(r, 500))
      clickText(/^隐私$|^Privacy$/)
      await new Promise(r => setTimeout(r, 800))
      return { ok: true, href: location.href, text: (document.body?.innerText || '').slice(0, 400) }
    } catch (e) {
      return { ok: false, href: String(e) }
    }
  `)
  log(`navigate settings/privacy: ${JSON.stringify(nav)}`)
  await Bun.sleep(1500)
  const pageText = await cdp.eval<string>(`document.body?.innerText?.slice(0, 2500) || ''`)
  const hasPrivacyTitle = /隐私|Privacy/.test(pageText)
  const hasNever = /Cookie|Token|密码|password|永不|Never/i.test(pageText)
  const hasUnavailable = /暂不支持|Not connected|尚未接入|不可用|Not supported/i.test(pageText)
  log(`settings page opened title-ish=${hasPrivacyTitle}`)
  log(`never-collect visible=${hasNever}`)
  log(`unavailable sources visible=${hasUnavailable}`)
  log(`page snippet:\\n${pageText.slice(0, 800)}`)

  // ---- Policy read/write via IPC (real Electron main handlers) ----
  const beforePolicy = await cdp.eval(`await window.electronAPI.getPrivacyPolicy({ workspaceId: '${WS_ID}' })`)
  log(`getPrivacyPolicy ok keys=${Object.keys(beforePolicy as object).join(',')}`)

  await cdp.eval(`await window.electronAPI.setPrivacyPolicy({
    workspaceId: '${WS_ID}',
    policy: {
      contextAwarenessEnabled: false,
      today: { useContext: false },
      sources: {
        session: { meta: 'allow', body: 'deny', attachments: 'deny', archived: 'ask' },
        browser: { urlTitle: 'deny', pageContent: 'deny', history: 'deny' },
        git: { statusMeta: 'allow', diffContent: 'deny', mutate: 'ask' },
      }
    }
  })`)
  let policy = await cdp.eval<any>(`await window.electronAPI.getPrivacyPolicy({ workspaceId: '${WS_ID}' })`)
  log(`after set: awareness=${policy.contextAwarenessEnabled} today=${policy.today?.useContext} browser.urlTitle=${policy.sources?.browser?.urlTitle}`)

  // Privacy mode on/off
  await cdp.eval(`await window.electronAPI.setPrivacyMode({ workspaceId: '${WS_ID}', mode: { active: true, pauseAutomations: true, persistAcrossRestart: true } })`)
  policy = await cdp.eval<any>(`await window.electronAPI.getPrivacyPolicy({ workspaceId: '${WS_ID}' })`)
  log(`privacyMode active=${policy.effectivePrivacyModeActive ?? policy.privacyMode?.active} persist=${policy.privacyMode?.persistAcrossRestart}`)
  await cdp.eval(`await window.electronAPI.setPrivacyMode({ workspaceId: '${WS_ID}', mode: { active: false, pauseAutomations: true, persistAcrossRestart: true } })`)

  // Ensure awareness OFF for session A
  await cdp.eval(`await window.electronAPI.setPrivacyPolicy({ workspaceId: '${WS_ID}', policy: { contextAwarenessEnabled: false, today: { useContext: true } } })`)

  const eventsBeforeA = countLines(EVENTS)
  const accessBeforeA = countLines(ACCESS)
  log(`\\n== Scenario A: awareness OFF == events=${eventsBeforeA} access=${accessBeforeA}`)

  // Create real session + send message
  const sessionA = await cdp.eval<any>(`await window.electronAPI.createSession('${WS_ID}', { name: 'PhaseB-A-off' })`)
  log(`sessionA id=${sessionA?.id || sessionA?.sessionId || JSON.stringify(sessionA).slice(0, 200)}`)
  const sidA = sessionA?.id || sessionA?.sessionId
  if (!sidA) throw new Error('createSession failed')

  // sendMessage signature — check types
  let sendResult: unknown
  try {
    sendResult = await cdp.eval(`await window.electronAPI.sendMessage('${sidA}', 'Reply with exactly: PONG_PHASEB_A')`)
    log(`sendMessage A result type=${typeof sendResult}`)
  } catch (e) {
    log(`sendMessage A FAIL: ${e}`)
  }

  // Wait for model response a bit
  await Bun.sleep(8000)

  // Stop/interrupt session to trigger lifecycle
  try {
    await cdp.eval(`await window.electronAPI.stopSession?.('${sidA}')`)
  } catch { /* optional */ }
  try {
    await cdp.eval(`await window.electronAPI.interruptSession?.('${sidA}')`)
  } catch { /* optional */ }
  await Bun.sleep(2000)

  const eventsAfterA = countLines(EVENTS)
  const accessAfterA = countLines(ACCESS)
  log(`events A: ${eventsBeforeA} -> ${eventsAfterA} (delta=${eventsAfterA - eventsBeforeA})`)
  log(`access A: ${accessBeforeA} -> ${accessAfterA}`)
  log(`events tail:\\n${fileTail(EVENTS, 5)}`)
  log(`access tail:\\n${fileTail(ACCESS, 5)}`)
  const accessSafe = !existsSync(ACCESS) || !/Reply with exactly|PONG_PHASEB|chatMessages/.test(readFileSync(ACCESS, 'utf8'))
  log(`access log no body: ${accessSafe}`)
  log(`PASS awareness-off no new events: ${eventsAfterA === eventsBeforeA}`)

  // Check console for CognitionPrivacyDeniedError user-visible
  const consoleProbe = await cdp.eval<string[]>(`(() => {
    // best-effort: no built-in buffer; return empty
    return []
  })()`)
  log(`console probe ${JSON.stringify(consoleProbe)}`)

  // ---- Scenario B: awareness ON ----
  await cdp.eval(`await window.electronAPI.setPrivacyPolicy({ workspaceId: '${WS_ID}', policy: {
    contextAwarenessEnabled: true,
    today: { useContext: true },
    sources: { session: { meta: 'allow', body: 'deny', attachments: 'deny', archived: 'ask' }, browser: { urlTitle: 'deny', pageContent: 'deny', history: 'deny' } }
  }})`)
  const eventsBeforeB = countLines(EVENTS)
  log(`\\n== Scenario B: awareness ON == events=${eventsBeforeB}`)
  const sessionB = await cdp.eval<any>(`await window.electronAPI.createSession('${WS_ID}', { name: 'PhaseB-B-on' })`)
  const sidB = sessionB?.id || sessionB?.sessionId
  log(`sessionB=${sidB}`)
  try {
    await cdp.eval(`await window.electronAPI.sendMessage('${sidB}', 'Reply with exactly: PONG_PHASEB_B')`)
  } catch (e) {
    log(`send B fail ${e}`)
  }
  await Bun.sleep(10000)
  try { await cdp.eval(`await window.electronAPI.stopSession?.('${sidB}')`) } catch {}
  await Bun.sleep(2000)
  const eventsAfterB = countLines(EVENTS)
  log(`events B: ${eventsBeforeB} -> ${eventsAfterB} delta=${eventsAfterB - eventsBeforeB}`)
  const newEvents = existsSync(EVENTS)
    ? readFileSync(EVENTS, 'utf8').split('\\n').filter(Boolean).slice(eventsBeforeB).map((l) => {
        try { return JSON.parse(l) } catch { return null }
      }).filter(Boolean)
    : []
  // re-read properly
  const allLines = existsSync(EVENTS) ? readFileSync(EVENTS, 'utf8').split('\\n').filter((l) => l.trim()) : []
  // fix split - use real newline
  const all = existsSync(EVENTS) ? readFileSync(EVENTS, 'utf8').split('\\n') : []
  void all
  const lines = existsSync(EVENTS) ? readFileSync(EVENTS, 'utf8').trim().split(/\\n/).filter(Boolean) : []
  // Bun string split with actual newline:
  const eventLines = existsSync(EVENTS)
    ? readFileSync(EVENTS, 'utf8').split('\\n'.replace('\\\\n', '\n') === '\\n' ? '\n' : '\n').filter((l) => l.trim())
    : []
  const fresh = eventLines.slice(eventsBeforeB).map((l) => {
    try { return JSON.parse(l) as { type: string; source: string; payload?: Record<string, unknown>; summary?: string } } catch { return null }
  }).filter(Boolean) as Array<{ type: string; source: string; payload?: Record<string, unknown>; summary?: string }>
  log(`fresh event types: ${fresh.map((e) => e.type + '/' + e.source).join(', ') || '(none)'}`)
  const hasBodyLeak = fresh.some((e) => JSON.stringify(e).includes('PONG_PHASEB_B') || JSON.stringify(e.payload || {}).includes('messages'))
  log(`body leak into ledger: ${hasBodyLeak}`)
  log(`PASS awareness-on wrote session events: ${fresh.some((e) => e.source === 'session')}`)

  // ---- Browser deny ----
  await cdp.eval(`await window.electronAPI.setPrivacyPolicy({ workspaceId: '${WS_ID}', policy: {
    contextAwarenessEnabled: true,
    sources: { browser: { urlTitle: 'deny', pageContent: 'deny', history: 'deny' } }
  }})`)
  const eventsBeforeBr = countLines(EVENTS)
  log(`\\n== Browser deny == events=${eventsBeforeBr}`)
  // Try browser pane APIs
  const browserApi = await cdp.eval<string[]>(`Object.keys(window.electronAPI).filter(k => /browser/i.test(k)).slice(0, 40)`)
  log(`browser api keys: ${browserApi.join(', ')}`)
  let browserOpened = false
  try {
    const created = await cdp.eval<string>(`await window.electronAPI.browserPane.create({ url: 'https://example.com' })`)
    log(`browser create: ${created}`)
    browserOpened = Boolean(created)
    if (created) {
      await Bun.sleep(1500)
      await cdp.eval(`await window.electronAPI.browserPane.navigate(${JSON.stringify(created)}, 'https://example.com/')`)
      await Bun.sleep(1500)
      await cdp.eval(`await window.electronAPI.browserPane.destroy(${JSON.stringify(created)})`).catch(() => {})
    }
  } catch (e) {
    log(`browser create via electronAPI failed: ${e}`)
  }
  await Bun.sleep(4000)
  const eventsAfterBr = countLines(EVENTS)
  log(`events browser-deny: ${eventsBeforeBr} -> ${eventsAfterBr} delta=${eventsAfterBr - eventsBeforeBr}`)
  const browserFresh = eventLines.slice(eventsBeforeBr) // stale — recount
  const afterBrLines = existsSync(EVENTS) ? readFileSync(EVENTS, 'utf8').split('\n').filter((l) => l.trim()) : []
  const brDelta = afterBrLines.slice(eventsBeforeBr).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) as any[]
  log(`browser deny new sources: ${brDelta.map((e) => e.source + ':' + e.type).join(', ') || '(none)'}`)
  log(`PASS no browser events when deny: ${!brDelta.some((e) => e.source === 'browser')}`)

  // ---- Browser allow ----
  await cdp.eval(`await window.electronAPI.setPrivacyPolicy({ workspaceId: '${WS_ID}', policy: {
    contextAwarenessEnabled: true,
    sources: { browser: { urlTitle: 'allow', pageContent: 'deny', history: 'deny' } }
  }})`)
  const eventsBeforeAllow = countLines(EVENTS)
  try {
    const created = await cdp.eval<string>(`await window.electronAPI.browserPane.create({ url: 'https://example.org' })`)
    log(`browser allow create: ${created}`)
    if (created) {
      await Bun.sleep(2000)
      await cdp.eval(`await window.electronAPI.browserPane.destroy(${JSON.stringify(created)})`).catch(() => {})
    }
  } catch (e) {
    log(`browser allow open fail: ${e}`)
  }
  await Bun.sleep(5000)
  const afterAllowLines = existsSync(EVENTS) ? readFileSync(EVENTS, 'utf8').split('\n').filter((l) => l.trim()) : []
  const allowDelta = afterAllowLines.slice(eventsBeforeAllow).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) as any[]
  log(`browser allow new: ${allowDelta.map((e) => e.source + ':' + e.type).join(', ') || '(none)'}`)
  const allowJson = JSON.stringify(allowDelta)
  log(`PASS browser allow sanitized (no cookie/html/password): ${!/cookie|password|pageContent|<html/i.test(allowJson)}`)

  // ---- Privacy mode ----
  await cdp.eval(`await window.electronAPI.setPrivacyPolicy({ workspaceId: '${WS_ID}', policy: {
    contextAwarenessEnabled: true,
    sources: {
      session: { meta: 'allow', body: 'deny', attachments: 'deny', archived: 'ask' },
      browser: { urlTitle: 'allow', pageContent: 'deny', history: 'deny' },
      git: { statusMeta: 'allow', diffContent: 'deny', mutate: 'ask' },
    }
  }})`)
  await cdp.eval(`await window.electronAPI.setPrivacyMode({ workspaceId: '${WS_ID}', mode: { active: true, pauseAutomations: true, persistAcrossRestart: true } })`)
  const beforePm = countLines(EVENTS)
  const sessionPm = await cdp.eval<any>(`await window.electronAPI.createSession('${WS_ID}', { name: 'PhaseB-PM' })`)
  const sidPm = sessionPm?.id || sessionPm?.sessionId
  try { await cdp.eval(`await window.electronAPI.sendMessage('${sidPm}', 'hi privacy mode')`) } catch (e) {
    log(`pm send fail ${e}`)
  }
  await Bun.sleep(6000)
  const afterPm = countLines(EVENTS)
  log(`privacy mode events: ${beforePm} -> ${afterPm} delta=${afterPm - beforePm}`)
  const accessLog = existsSync(ACCESS) ? readFileSync(ACCESS, 'utf8') : ''
  log(`PASS privacy mode blocked_by_privacy_mode in access log: ${accessLog.includes('blocked_by_privacy_mode')}`)
  await cdp.eval(`await window.electronAPI.setPrivacyMode({ workspaceId: '${WS_ID}', mode: { active: false, pauseAutomations: true, persistAcrossRestart: true } })`)
  policy = await cdp.eval<any>(`await window.electronAPI.getPrivacyPolicy({ workspaceId: '${WS_ID}' })`)
  log(`after disable privacy mode: awareness=${policy.contextAwarenessEnabled} browser=${policy.sources?.browser?.urlTitle} session.meta=${policy.sources?.session?.meta}`)

  // ---- Read path filter ----
  // Seed a browser guidance item
  const guidancePath = join(ROOT, 'cognition', 'guidance.json')
  const g = JSON.parse(readFileSync(guidancePath, 'utf8'))
  g.items = g.items || []
  g.items.push({
    id: 'g_browser_phaseb',
    type: 'next_action',
    title: 'Browser seeded guidance',
    reason: 'phaseb-test',
    action: 'open docs',
    importance: 5,
    confidence: 0.9,
    sourceObservationIds: [],
    sourceLoopIds: [],
    sourceEventIds: [],
    sourceKinds: ['browser'],
    createdAt: Date.now(),
  })
  writeFileSync(guidancePath, JSON.stringify(g, null, 2) + '\n')

  await cdp.eval(`await window.electronAPI.setPrivacyPolicy({ workspaceId: '${WS_ID}', policy: {
    contextAwarenessEnabled: true,
    today: { useContext: true },
    sources: { browser: { urlTitle: 'allow', pageContent: 'deny', history: 'deny' } }
  }})`)
  const listAllow = await cdp.eval<any[]>(`await window.electronAPI.listCognitionGuidance({ workspaceId: '${WS_ID}', limit: 50 })`)
  const seeAllow = listAllow?.some((x) => x.id === 'g_browser_phaseb' || x.title === 'Browser seeded guidance')
  log(`guidance product allow sees browser item: ${seeAllow}`)

  await cdp.eval(`await window.electronAPI.setPrivacyPolicy({ workspaceId: '${WS_ID}', policy: {
    sources: { browser: { urlTitle: 'deny', pageContent: 'deny', history: 'deny' } }
  }})`)
  const listDeny = await cdp.eval<any[]>(`await window.electronAPI.listCognitionGuidance({ workspaceId: '${WS_ID}', limit: 50 })`)
  const seeDeny = listDeny?.some((x) => x.id === 'g_browser_phaseb' || x.title === 'Browser seeded guidance')
  log(`guidance product deny hides browser item: ${!seeDeny}`)

  const listDebug = await cdp.eval<any[]>(`await window.electronAPI.listCognitionGuidance({ workspaceId: '${WS_ID}', includeDismissed: true, forDebug: true, limit: 50 })`)
  const debugItem = listDebug?.find((x) => x.id === 'g_browser_phaseb' || x.title === 'Browser seeded guidance')
  log(`debug still sees item: ${Boolean(debugItem)} policyHidden=${debugItem?.policyHidden}`)

  await cdp.eval(`await window.electronAPI.setPrivacyPolicy({ workspaceId: '${WS_ID}', policy: {
    today: { useContext: false },
    sources: { browser: { urlTitle: 'allow', pageContent: 'deny', history: 'deny' } }
  }})`)
  const listTodayOff = await cdp.eval<any[]>(`await window.electronAPI.listCognitionGuidance({ workspaceId: '${WS_ID}', forToday: true, limit: 50 })`)
  log(`today.useContext=false returns empty-ish product list: ${(listTodayOff?.length ?? 0) === 0}`)

  // ---- Cleanup UI ops ----
  mkdirSync(join(ROOT, 'library'), { recursive: true })
  writeFileSync(join(ROOT, 'library', 'fixture.md'), '# keep\\n')
  writeFileSync(join(ROOT, 'projects', 'MEMORY.md'), '# keep memory\\n')
  writeFileSync(join(ROOT, 'sessions', 'keepalive.jsonl'), '{"keep":true}\\n')
  const browserProfileHint = join(homedir(), 'Library', 'Application Support', '@craft-agent', 'electron')
  const clearRes = await cdp.eval<any>(`await window.electronAPI.clearPrivacyData({ workspaceId: '${WS_ID}', target: { cognition: true, accessLog: true } })`)
  log(`clear result: ${JSON.stringify(clearRes)}`)
  log(`session keepalive kept: ${existsSync(join(ROOT, 'sessions', 'keepalive.jsonl'))}`)
  log(`MEMORY kept: ${existsSync(join(ROOT, 'projects', 'MEMORY.md'))}`)
  log(`library kept: ${existsSync(join(ROOT, 'library', 'fixture.md'))}`)
  log(`events cleared or empty: ${countLines(EVENTS) === 0}`)
  log(`access cleared or empty: ${countLines(ACCESS) === 0}`)
  log(`browser-profile dir exists (not deleted): ${existsSync(browserProfileHint)}`)

  // Persist check — preferences.json
  const prefsPath = join(homedir(), '.craft-agent-phaseb-rt', 'preferences.json')
  const modePath = join(ROOT, 'privacy', 'privacy-mode.json')
  log(`preferences exists: ${existsSync(prefsPath)}`)
  if (existsSync(prefsPath)) {
    const prefs = JSON.parse(readFileSync(prefsPath, 'utf8'))
    log(`prefs.privacy.contextAwarenessEnabled=${prefs.privacy?.contextAwarenessEnabled}`)
    log(`prefs.privacy.privacyMode=${JSON.stringify(prefs.privacy?.privacyMode)}`)
  }
  log(`workspace privacy-mode file: ${existsSync(modePath) ? readFileSync(modePath, 'utf8') : '(none)'}`)

  // Main log scan for privacy denied bubbling
  const mainLog = '/tmp/craft-phaseb-electron.log'
  const mainTxt = existsSync(mainLog) ? readFileSync(mainLog, 'utf8') : ''
  const deniedBubbles = (mainTxt.match(/CognitionPrivacyDeniedError/g) || []).length
  const warnDenied = (mainTxt.match(/Cognition append failed/g) || []).length
  log(`mainlog CognitionPrivacyDeniedError mentions=${deniedBubbles} append-failed-warns=${warnDenied}`)

  cdp.close()

  const out = join(homedir(), '.craft-agent-phaseb-rt', 'phaseb-runtime-report.txt')
  writeFileSync(out, REPORT.join('\n') + '\n')
  log(`report written: ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
