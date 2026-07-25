/**
 * Focused follow-up: settings UI navigate + browser allow write + restart persist.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const WS_ID = '47962a7b-1979-4de7-bdf3-4a079e216afe'
const ROOT = join(homedir(), '.craft-agent-phaseb-rt', 'workspaces', 'phaseb-rt')
const EVENTS = join(ROOT, 'cognition', 'events.jsonl')
const ACCESS = join(ROOT, 'privacy', 'access-log.jsonl')
const PREFS = join(homedir(), '.craft-agent-phaseb-rt', 'preferences.json')

function count(path: string) {
  if (!existsSync(path)) return 0
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).length
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
      this.ws.onerror = () => reject(new Error('ws error'))
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
  async evalBlock<T>(body: string): Promise<T> {
    const result = (await this.call('Runtime.evaluate', {
      expression: `(async () => { ${body} })()`,
      awaitPromise: true,
      returnByValue: true,
    })) as { result?: { value?: T }; exceptionDetails?: unknown }
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 800))
    return result.result?.value as T
  }
}

async function main() {
  const pages = (await (await fetch('http://127.0.0.1:9223/json')).json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>
  const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl)!
  const cdp = new Cdp(page.webSocketDebuggerUrl!)
  await cdp.ready()
  await cdp.call('Runtime.enable')

  // Settings UI structure assertions (display only — hard-fail; do not change behavior tests)
  const ui = await cdp.evalBlock<{
    href: string
    text: string
    hasPrivacy: boolean
    hasAutoContext: boolean
    hasInteractive: boolean
    hasSensitive: boolean
    hasTransparency: boolean
    hasRecentAccess: boolean
    hasUnavailable: boolean
    hasLegacyNeverRows: boolean
  }>(`
    window.dispatchEvent(new CustomEvent('craft-agent-navigate', { detail: { route: 'settings/privacy' }, bubbles: true }))
    await new Promise(r => setTimeout(r, 1200))
    const text = document.body?.innerText || ''
    return {
      href: location.href,
      text: text.slice(0, 1200),
      hasPrivacy: /隐私|Privacy/.test(text) && /后台上下文感知|Background context awareness/.test(text),
      hasAutoContext: /自动形成上下文|Automatic context/.test(text),
      hasInteractive: /主动使用内容|Active content use/.test(text),
      hasSensitive: /敏感信息保护|Sensitive information protection/.test(text),
      hasTransparency: /透明度|Transparency/.test(text),
      hasRecentAccess: /最近上下文访问|Recent context access/.test(text),
      hasUnavailable: /尚未接入|暂不支持|Not connected|Not supported|不可用/.test(text),
      hasLegacyNeverRows: /永不采集|Never collected/.test(text),
    }
  `)
  console.log('UI href', ui.href)
  console.log(
    'UI hasPrivacy', ui.hasPrivacy,
    'hasAutoContext', ui.hasAutoContext,
    'hasInteractive', ui.hasInteractive,
    'hasSensitive', ui.hasSensitive,
    'hasTransparency', ui.hasTransparency,
    'hasRecentAccess', ui.hasRecentAccess,
    'hasUnavailable', ui.hasUnavailable,
    'hasLegacyNeverRows', ui.hasLegacyNeverRows,
  )
  console.log('UI text snippet:\\n', ui.text.slice(0, 600))
  if (!ui.hasPrivacy || !ui.hasAutoContext || !ui.hasInteractive || !ui.hasSensitive) {
    throw new Error('Privacy UI structure assertions failed (context / sources / sensitive)')
  }
  if (!ui.hasTransparency || !ui.hasRecentAccess) {
    throw new Error('Privacy UI transparency assertions failed')
  }
  if (ui.hasUnavailable || ui.hasLegacyNeverRows) {
    throw new Error('Privacy UI must not show unavailable sources or legacy never-collect rows')
  }

  // Toggle via UI if possible: use IPC which settings page also uses — verify page can re-read
  await cdp.evalBlock(`
    await window.electronAPI.setPrivacyPolicy({ workspaceId: '${WS_ID}', policy: {
      contextAwarenessEnabled: true,
      today: { useContext: true },
      sources: { browser: { urlTitle: 'allow', pageContent: 'deny', history: 'deny' }, session: { meta: 'allow', body: 'deny', attachments: 'deny', archived: 'ask' } }
    }})
    await window.electronAPI.setPrivacyMode({ workspaceId: '${WS_ID}', mode: { active: false, pauseAutomations: true, persistAcrossRestart: true } })
  `)

  // Browser allow with long wait for did-stop-loading
  const before = count(EVENTS)
  const created = await cdp.evalBlock<string>(`
    const id = await window.electronAPI.browserPane.create({ url: 'https://example.com/' })
    await new Promise(r => setTimeout(r, 6000))
    try { await window.electronAPI.browserPane.navigate(id, 'https://example.org/') } catch {}
    await new Promise(r => setTimeout(r, 6000))
    return id
  `)
  console.log('browser id', created, 'events', before, '->', count(EVENTS))
  const lines = existsSync(EVENTS) ? readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean) : []
  const fresh = lines.slice(before).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) as any[]
  console.log('fresh', fresh.map((e) => `${e.source}:${e.type}`).join(', ') || '(none)')
  console.log('sanitized', !/cookie|password|<html|pageContent/i.test(JSON.stringify(fresh)))
  if (created) {
    await cdp.evalBlock(`try { await window.electronAPI.browserPane.destroy('${created}') } catch {}`)
  }

  // Persist marker for restart check
  await cdp.evalBlock(`
    await window.electronAPI.setPrivacyPolicy({ workspaceId: '${WS_ID}', policy: {
      contextAwarenessEnabled: false,
      today: { useContext: false },
      privacyMode: { active: false, pauseAutomations: true, persistAcrossRestart: true },
      sources: { browser: { urlTitle: 'deny', pageContent: 'deny', history: 'deny' } }
    }})
    await window.electronAPI.setPrivacyMode({ workspaceId: '${WS_ID}', mode: { active: true, pauseAutomations: true, persistAcrossRestart: true } })
  `)
  const prefs = JSON.parse(readFileSync(PREFS, 'utf8'))
  console.log('persist prefs awareness', prefs.privacy?.contextAwarenessEnabled, 'mode', prefs.privacy?.privacyMode)
  writeFileSync(join(homedir(), '.craft-agent-phaseb-rt', 'persist-marker.json'), JSON.stringify({
    at: Date.now(),
    awareness: prefs.privacy?.contextAwarenessEnabled,
    modeActive: prefs.privacy?.privacyMode?.active,
    persistAcrossRestart: prefs.privacy?.privacyMode?.persistAcrossRestart,
    browserUrlTitle: prefs.privacy?.sources?.browser?.urlTitle,
  }, null, 2))
  console.log('access lines', count(ACCESS))
  if (existsSync(ACCESS)) console.log('access sample', readFileSync(ACCESS, 'utf8').trim().split('\n').slice(-2).join('\\n'))
  cdp.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
