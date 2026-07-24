/**
 * Phase C Electron runtime acceptance via CDP.
 * Requires a running Electron with --remote-debugging-port=9223.
 * Usage: bun run scripts/_phasec-runtime-accept.ts
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const REPORT: string[] = []
const OUT = join(homedir(), '.craft-agent-phasec-rt', 'phase-c-accept-report.txt')

function log(msg: string) {
  console.log(msg)
  REPORT.push(msg)
}

async function getDebuggerUrl(): Promise<string> {
  const res = await fetch('http://127.0.0.1:9223/json')
  const pages = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>
  const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl)
  if (!page?.webSocketDebuggerUrl) throw new Error('No CDP page target on :9223')
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
  async evalBlock<T = unknown>(body: string): Promise<T> {
    const wrapped = `(async () => { ${body} })()`
    const result = (await this.call('Runtime.evaluate', {
      expression: wrapped,
      awaitPromise: true,
      returnByValue: true,
    })) as { result?: { value?: T }; exceptionDetails?: unknown }
    if (result.exceptionDetails) {
      throw new Error(`Eval exception: ${JSON.stringify(result.exceptionDetails).slice(0, 1000)}`)
    }
    return result.result?.value as T
  }
  close() {
    this.ws.close()
  }
}

async function main() {
  mkdirSync(join(homedir(), '.craft-agent-phasec-rt'), { recursive: true })
  const url = await getDebuggerUrl()
  const cdp = new Cdp(url)
  await cdp.ready()
  await cdp.call('Runtime.enable')

  const api = await cdp.evalBlock<{
    complete: boolean
    today: boolean
    brief: boolean
  }>(`
    return {
      complete: typeof window.electronAPI?.completeAndArchiveSession === 'function',
      today: typeof window.electronAPI?.getTodayState === 'function'
        && typeof window.electronAPI?.snoozeTodayItem === 'function',
      brief: typeof window.electronAPI?.generateExploreBrief === 'function',
    }
  `)
  log(`API wired: completeAndArchive=${api.complete} today=${api.today} briefKept=${api.brief}`)
  if (!api.complete || !api.today) throw new Error('Phase C APIs missing from preload')

  const workspaces = await cdp.evalBlock<Array<{ id: string }>>(`
    return await window.electronAPI.getWorkspaces()
  `)
  const workspaceId = workspaces?.[0]?.id
  log(`workspaceId=${workspaceId}`)
  if (!workspaceId) throw new Error('No workspace')

  // ---- Explore settings C/D ----
  const settingsRoundtrip = await cdp.evalBlock<{
    before: unknown
    afterOff: unknown
    afterOn: unknown
  }>(`
    const read = async () => {
      const { content } = await window.electronAPI.readPreferences()
      const prefs = JSON.parse(content || '{}')
      return prefs.explore || null
    }
    const write = async (patch) => {
      const { content } = await window.electronAPI.readPreferences()
      const prefs = JSON.parse(content || '{}')
      const explore = { ...(prefs.explore || {}), ...patch, _phaseCMigrated: true }
      await window.electronAPI.writePreferences(JSON.stringify({ ...prefs, explore, updatedAt: Date.now() }, null, 2))
      window.dispatchEvent(new CustomEvent('craft:explore-settings-changed', { detail: explore }))
      return explore
    }
    const before = await read()
    const afterOff = await write({ showTodaySection: false, showSessionComposer: false })
    await new Promise(r => setTimeout(r, 300))
    const afterOffRead = await read()
    const afterOn = await write({ showTodaySection: true, showSessionComposer: true })
    await new Promise(r => setTimeout(r, 300))
    const afterOnRead = await read()
    return { before, afterOff: afterOffRead, afterOn: afterOnRead }
  `)
  log(`settings C/D off persisted=${(settingsRoundtrip.afterOff as any)?.showTodaySection === false && (settingsRoundtrip.afterOff as any)?.showSessionComposer === false}`)
  log(`settings C/D on restored=${(settingsRoundtrip.afterOn as any)?.showTodaySection === true && (settingsRoundtrip.afterOn as any)?.showSessionComposer === true}`)

  // Navigate Explore and inspect DOM
  const home = await cdp.evalBlock<{
    href: string
    hasComposer: boolean
    hasPending: boolean
    hasRecent: boolean
    hasBrief: boolean
    hasGuidance: boolean
    hasNextSteps: boolean
    text: string
  }>(`
    window.dispatchEvent(new CustomEvent('craft-agent-navigate', {
      detail: { route: 'explore' },
      bubbles: true,
    }))
    await new Promise(r => setTimeout(r, 1200))
    const text = document.body?.innerText || ''
    return {
      href: location.href,
      hasComposer: !!document.querySelector('input[placeholder]') || /想推进什么|What do you want/i.test(text),
      hasPending: /待处理|Pending/i.test(text),
      hasRecent: /最近使用|Recently used/i.test(text),
      hasBrief: /工作概览|Work briefing/i.test(text),
      hasGuidance: /工作建议|Work suggestions/i.test(text),
      hasNextSteps: /下一步推荐|Suggested next steps/i.test(text),
      text: text.slice(0, 1200),
    }
  `)
  log(`explore DOM composer=${home.hasComposer} pending=${home.hasPending} recent=${home.hasRecent}`)
  log(`legacy brief=${home.hasBrief} guidance=${home.hasGuidance} nextSteps=${home.hasNextSteps}`)
  if (home.hasBrief || home.hasGuidance || home.hasNextSteps) {
    log('WARN: legacy Explore recommendation surfaces still visible')
  }

  // Both off empty state
  const bothOff = await cdp.evalBlock<{ minimal: boolean; text: string }>(`
    const { content } = await window.electronAPI.readPreferences()
    const prefs = JSON.parse(content || '{}')
    const explore = { ...(prefs.explore || {}), showTodaySection: false, showSessionComposer: false, _phaseCMigrated: true }
    await window.electronAPI.writePreferences(JSON.stringify({ ...prefs, explore, updatedAt: Date.now() }, null, 2))
    window.dispatchEvent(new CustomEvent('craft:explore-settings-changed', { detail: explore }))
    await new Promise(r => setTimeout(r, 800))
    const text = document.body?.innerText || ''
    return {
      minimal: /最小化|minimal/i.test(text),
      text: text.slice(0, 600),
    }
  `)
  log(`C=false D=false minimalEmpty=${bothOff.minimal}`)

  // Restore defaults
  await cdp.evalBlock(`
    const { content } = await window.electronAPI.readPreferences()
    const prefs = JSON.parse(content || '{}')
    const explore = { ...(prefs.explore || {}), showTodaySection: true, showSessionComposer: true, _phaseCMigrated: true }
    await window.electronAPI.writePreferences(JSON.stringify({ ...prefs, explore, updatedAt: Date.now() }, null, 2))
    window.dispatchEvent(new CustomEvent('craft:explore-settings-changed', { detail: explore }))
  `)

  // Snooze store
  const snooze = await cdp.evalBlock<{ active: boolean; cleared: boolean }>(`
    const ws = '${workspaceId}'
    await window.electronAPI.snoozeTodayItem({ workspaceId: ws, targetKey: 'phasec-probe', until: Date.now() + 60_000 })
    const state = await window.electronAPI.getTodayState({ workspaceId: ws })
    const active = (state.snoozes || []).some(s => s.targetKey === 'phasec-probe')
    await window.electronAPI.clearTodaySnooze({ workspaceId: ws, targetKey: 'phasec-probe' })
    const after = await window.electronAPI.getTodayState({ workspaceId: ws })
    const cleared = !(after.snoozes || []).some(s => s.targetKey === 'phasec-probe')
    return { active, cleared }
  `)
  log(`snooze active=${snooze.active} cleared=${snooze.cleared}`)

  // Privacy B off should still allow local strong signals path (API level)
  const privacy = await cdp.evalBlock<{ a: boolean; b: boolean; mode: boolean }>(`
    const p = await window.electronAPI.getPrivacyPolicy({ workspaceId: '${workspaceId}' })
    return {
      a: !!p.contextAwarenessEnabled,
      b: !!p.today?.useContext,
      mode: !!(p.effectivePrivacyModeActive || p.privacyMode?.active),
    }
  `)
  log(`privacy A=${privacy.a} B=${privacy.b} mode=${privacy.mode}`)

  // completeAndArchive on missing session should fail gracefully
  const caa = await cdp.evalBlock<{ ok: boolean; steps: number }>(`
    const result = await window.electronAPI.completeAndArchiveSession({
      workspaceId: '${workspaceId}',
      sessionId: 'phasec-missing-session',
      idempotencyKey: 'phasec-missing-1',
    })
    return { ok: !!result.ok, steps: (result.steps || []).length }
  `)
  log(`completeAndArchive missing session ok=${caa.ok} steps=${caa.steps}`)

  // Console errors sample
  const errors = await cdp.evalBlock<string[]>(`
    return (window.__phasecConsoleErrors || [])
  `).catch(() => [] as string[])
  log(`consoleErrors sample=${JSON.stringify(errors).slice(0, 200)}`)

  writeFileSync(OUT, REPORT.join('\n') + '\n')
  log(`report written: ${OUT}`)
  cdp.close()
}

main().catch((err) => {
  console.error(err)
  if (!existsSync(join(homedir(), '.craft-agent-phasec-rt'))) {
    mkdirSync(join(homedir(), '.craft-agent-phasec-rt'), { recursive: true })
  }
  writeFileSync(OUT, REPORT.concat([`FATAL: ${String(err)}`]).join('\n') + '\n')
  process.exit(1)
})
