/**
 * Phase C Electron acceptance — full checklist against live CDP.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const REPORT: string[] = []
const OUT = join(homedir(), '.craft-agent-phasec-rt', 'phase-c-accept-report.txt')
function log(msg: string) {
  console.log(msg)
  REPORT.push(msg)
}

const res = await fetch('http://127.0.0.1:9223/json')
const pages = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>
const wsUrl = pages.find((p) => p.type === 'page')?.webSocketDebuggerUrl
if (!wsUrl) throw new Error('no page')
const ws = new WebSocket(wsUrl)
await new Promise<void>((resolve, reject) => {
  ws.onopen = () => resolve()
  ws.onerror = (e) => reject(new Error(String(e)))
})
let id = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string } }
  if (msg.id != null && pending.has(msg.id)) {
    const p = pending.get(msg.id)!
    pending.delete(msg.id)
    if (msg.error) p.reject(new Error(msg.error.message))
    else p.resolve(msg.result)
  }
}
function call(method: string, params?: Record<string, unknown>) {
  const i = ++id
  return new Promise((resolve, reject) => {
    pending.set(i, { resolve, reject })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
}
async function evalBlock<T>(body: string): Promise<T> {
  const r = (await call('Runtime.evaluate', {
    expression: `(async () => { ${body} })()`,
    awaitPromise: true,
    returnByValue: true,
  })) as { result?: { value?: T }; exceptionDetails?: unknown }
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 1000))
  return r.result?.value as T
}
await call('Runtime.enable')

async function goExplore() {
  return evalBlock(`
    const u = new URL(location.href)
    u.searchParams.set('route', 'allSessions')
    history.pushState({ seq: Date.now() }, '', u.toString())
    window.dispatchEvent(new PopStateEvent('popstate', { state: { seq: Date.now() } }))
    await new Promise(r => setTimeout(r, 900))
    return location.href
  `)
}

async function setExplore(patch: Record<string, unknown>) {
  return evalBlock(`
    const { content } = await window.electronAPI.readPreferences()
    const prefs = JSON.parse(content || '{}')
    const explore = { ...(prefs.explore || {}), ...${JSON.stringify(patch)}, _phaseCMigrated: true }
    await window.electronAPI.writePreferences(JSON.stringify({ ...prefs, explore, updatedAt: Date.now() }, null, 2))
    window.dispatchEvent(new CustomEvent('craft:explore-settings-changed', { detail: explore }))
    await new Promise(r => setTimeout(r, 700))
    return explore
  `)
}

const api = await evalBlock<{ complete: boolean; today: boolean }>(`
  return {
    complete: typeof window.electronAPI.completeAndArchiveSession === 'function',
    today: typeof window.electronAPI.getTodayState === 'function',
  }
`)
log(`1 API completeAndArchive=${api.complete} today=${api.today}`)

const workspaces = await evalBlock<Array<{ id: string }>>(`return await window.electronAPI.getWorkspaces()`)
const workspaceId = workspaces[0]?.id
log(`workspaceId=${workspaceId}`)

// 1+2 settings C/D persist
await setExplore({ showTodaySection: false, showSessionComposer: false })
const off = await evalBlock<any>(`
  const { content } = await window.electronAPI.readPreferences()
  return JSON.parse(content||'{}').explore
`)
log(`2 C/D off persist showToday=${off.showTodaySection} composer=${off.showSessionComposer}`)
await setExplore({ showTodaySection: true, showSessionComposer: true })
const on = await evalBlock<any>(`
  const { content } = await window.electronAPI.readPreferences()
  return JSON.parse(content||'{}').explore
`)
log(`2b C/D on restore showToday=${on.showTodaySection} composer=${on.showSessionComposer}`)

// 4 Explore structure
await goExplore()
const home = await evalBlock<any>(`
  const text = document.body?.innerText || ''
  return {
    composer: /想推进什么|What do you want|Search, open a page/.test(text),
    pending: /待处理|Pending/.test(text),
    recent: /最近使用|Recently used/.test(text),
    brief: /工作概览|Work briefing/.test(text),
    guidance: /工作建议|Work suggestions/.test(text),
    next: /下一步推荐|Suggested next steps/.test(text),
  }
`)
log(`4 Today structure composer=${home.composer} pending=${home.pending} recent=${home.recent}`)
log(`4 legacy removed brief=${home.brief} guidance=${home.guidance} next=${home.next}`)

// 3 Browser address bar not controlled by D — API still exists; composer off shouldn't remove browser chrome
await setExplore({ showSessionComposer: false, showTodaySection: true })
await goExplore()
const dOff = await evalBlock<any>(`
  const text = document.body?.innerText || ''
  return {
    composerGone: !(/想推进什么|What do you want/.test(text)),
    pendingStill: /待处理|Pending/.test(text),
    newSessionStill: /新建会话/.test(text),
  }
`)
log(`3 D=off composerGone=${dOff.composerGone} pendingStill=${dOff.pendingStill} sidebarNewSession=${dOff.newSessionStill}`)

// 12 C=false D=false
await setExplore({ showTodaySection: false, showSessionComposer: false })
await goExplore()
const both = await evalBlock<any>(`
  const text = document.body?.innerText || ''
  return {
    minimal: /最小化|minimal/i.test(text),
    crashed: false,
    snippet: text.slice(0, 400),
  }
`)
log(`12 C=off D=off minimal=${both.minimal} snippet=${JSON.stringify(both.snippet).slice(0, 200)}`)

await setExplore({ showTodaySection: true, showSessionComposer: true })
await goExplore()

// 7 Snooze
const snooze = await evalBlock<any>(`
  const ws = '${workspaceId}'
  await window.electronAPI.snoozeTodayItem({ workspaceId: ws, targetKey: 'phasec-s1', until: Date.now() + 120000 })
  let state = await window.electronAPI.getTodayState({ workspaceId: ws })
  const active = state.snoozes.some(s => s.targetKey === 'phasec-s1')
  // expire by writing until in the past via clear+snooze past? store filters active by until>now
  await window.electronAPI.snoozeTodayItem({ workspaceId: ws, targetKey: 'phasec-s1', until: Date.now() - 1000 })
  state = await window.electronAPI.getTodayState({ workspaceId: ws })
  const expiredHidden = !state.snoozes.some(s => s.targetKey === 'phasec-s1')
  await window.electronAPI.clearTodaySnooze({ workspaceId: ws, targetKey: 'phasec-s1' })
  return { active, expiredHidden }
`)
log(`7 snooze active=${snooze.active} expiredLeavesQueue=${snooze.expiredHidden}`)

// 8/9 completeAndArchive single RPC + missing session
const caa = await evalBlock<any>(`
  const result = await window.electronAPI.completeAndArchiveSession({
    workspaceId: '${workspaceId}',
    sessionId: 'missing-phasec',
    idempotencyKey: 'phasec-caa-1',
  })
  const again = await window.electronAPI.completeAndArchiveSession({
    workspaceId: '${workspaceId}',
    sessionId: 'missing-phasec',
    idempotencyKey: 'phasec-caa-1',
  })
  return { ok: result.ok, steps: result.steps?.length, same: JSON.stringify(result) === JSON.stringify(again) }
`)
log(`8/9 completeAndArchive missing ok=${caa.ok} steps=${caa.steps} idempotentCache=${caa.same}`)

// 10/11 privacy B / A
const privacy = await evalBlock<any>(`
  const ws = '${workspaceId}'
  const before = await window.electronAPI.getPrivacyPolicy({ workspaceId: ws })
  await window.electronAPI.setPrivacyPolicy({ workspaceId: ws, policy: { today: { useContext: false } } })
  const bOff = await window.electronAPI.getPrivacyPolicy({ workspaceId: ws })
  await window.electronAPI.setPrivacyPolicy({ workspaceId: ws, policy: { contextAwarenessEnabled: false } })
  const aOff = await window.electronAPI.getPrivacyPolicy({ workspaceId: ws })
  await window.electronAPI.setPrivacyMode({ workspaceId: ws, mode: { active: true, pauseAutomations: true, persistAcrossRestart: false } })
  const modeOn = await window.electronAPI.getPrivacyPolicy({ workspaceId: ws })
  // restore
  await window.electronAPI.setPrivacyMode({ workspaceId: ws, mode: { active: false, pauseAutomations: true, persistAcrossRestart: false } })
  await window.electronAPI.setPrivacyPolicy({ workspaceId: ws, policy: {
    contextAwarenessEnabled: before.contextAwarenessEnabled,
    today: { useContext: before.today.useContext },
  } })
  return {
    bOff: bOff.today.useContext === false,
    aOff: aOff.contextAwarenessEnabled === false,
    mode: !!(modeOn.effectivePrivacyModeActive || modeOn.privacyMode?.active),
  }
`)
log(`10/11 privacy B-off settable=${privacy.bOff} A-off settable=${privacy.aOff} modeOn=${privacy.mode}`)

// 13 Brief not auto-called — monkeypatch counter while on explore
const brief = await evalBlock<any>(`
  let calls = 0
  const orig = window.electronAPI.generateExploreBrief
  window.electronAPI.generateExploreBrief = async (...args) => { calls++; return orig.apply(window.electronAPI, args) }
  // re-enter explore
  const u = new URL(location.href)
  u.searchParams.set('route', 'allSessions')
  history.pushState({ seq: Date.now() }, '', u.toString())
  window.dispatchEvent(new PopStateEvent('popstate', { state: { seq: Date.now() } }))
  await new Promise(r => setTimeout(r, 2000))
  window.electronAPI.generateExploreBrief = orig
  return { calls }
`)
log(`13 Explore auto Brief calls=${brief.calls}`)

// Settings explore page shows C/D
const settings = await evalBlock<any>(`
  const u = new URL(location.href)
  u.searchParams.set('route', 'settings/explore')
  history.pushState({ seq: Date.now() }, '', u.toString())
  window.dispatchEvent(new PopStateEvent('popstate', { state: { seq: Date.now() } }))
  await new Promise(r => setTimeout(r, 1000))
  const text = document.body?.innerText || ''
  return {
    hasC: /显示 Today 区域|Show Today section/.test(text),
    hasD: /显示会话输入框|Show session composer/.test(text),
    snippet: text.slice(0, 500),
  }
`)
log(`1 settings explore C=${settings.hasC} D=${settings.hasD}`)

mkdirSync(join(homedir(), '.craft-agent-phasec-rt'), { recursive: true })
writeFileSync(OUT, REPORT.join('\n') + '\n')
log(`report: ${OUT}`)
ws.close()
