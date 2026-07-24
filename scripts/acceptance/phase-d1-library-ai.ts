/**
 * Phase D.1 acceptance — AI generate + privacy ask + LOCAL_ONLY library ops still work locally.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const RT = join(homedir(), '.craft-agent-phased-rt')
mkdirSync(RT, { recursive: true })
const OUT = join(RT, 'phase-d1-accept-report.txt')
const REPORT: string[] = []
function log(msg: string) {
  console.log(msg)
  REPORT.push(msg)
}

async function waitForCdp(timeoutMs = 90_000): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch('http://127.0.0.1:9224/json')
      const pages = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>
      const wsUrl = pages.find((p) => p.type === 'page')?.webSocketDebuggerUrl
      if (wsUrl) return wsUrl
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('CDP not ready')
}

const wsUrl = await waitForCdp()
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
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); reject(new Error(`timeout ${method}`)) } }, 120_000)
  })
}
async function evalBlock<T>(body: string): Promise<T> {
  const r = (await call('Runtime.evaluate', {
    expression: `(async () => { ${body} })()`,
    awaitPromise: true,
    returnByValue: true,
  })) as { result?: { value?: T }; exceptionDetails?: unknown }
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 1500))
  return r.result?.value as T
}
await call('Runtime.enable')
await new Promise((r) => setTimeout(r, 2000))

const workspaces = await evalBlock<Array<{ id: string }>>(`return await window.electronAPI.getWorkspaces()`)
const workspaceId = workspaces[0]?.id
log(`workspaceId=${workspaceId}`)

// Ensure privacy migration / body ask
const policy = await evalBlock<any>(`
  const ws = '${workspaceId}'
  const p = await window.electronAPI.getPrivacyPolicy({ workspaceId: ws })
  return { body: p?.sources?.session?.body, gen: p?.sources?.library?.generateWithModel }
`)
log(`1 privacy session.body=${policy.body} library.generateWithModel=${policy.gen}`)

const sessions = await evalBlock<any>(`
  const list = await window.electronAPI.getSessions()
  let session = list.find(s => !s.isArchived) || list[0]
  if (!session) {
    session = await window.electronAPI.createSession('${workspaceId}', { name: 'PhaseD1整理验收' })
  }
  return { id: session?.id, name: session?.name, model: session?.model, conn: session?.llmConnection }
`)
log(`session=${sessions.id} name=${sessions.name} model=${sessions.model}`)

// First call without consent → expect ask (or allow)
const first = await evalBlock<any>(`
  return await window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: '${workspaceId}',
    sessionId: '${sessions.id}',
    templateId: 'decision',
    locale: 'zh-Hans',
  })
`)
log(`2 first decision=${first.privacy?.decision || (first.ok ? 'allow' : first.error)} ok=${first.ok}`)

// Cancel path: do not call with consent — verify no new doc if we stop here
const beforeCount = await evalBlock<number>(`
  return (await window.electronAPI.listLibraryDocuments({ workspaceId: '${workspaceId}', filter: 'all' })).length
`)

// Deny cannot be bypassed
const denyCheck = await evalBlock<any>(`
  const ws = '${workspaceId}'
  const current = await window.electronAPI.getPrivacyPolicy({ workspaceId: ws })
  await window.electronAPI.setPrivacyPolicy({
    workspaceId: ws,
    workspaceOverride: true,
    policy: {
      sources: {
        ...(current.sources || {}),
        session: { ...(current.sources?.session || {}), body: 'deny' },
      },
    },
  })
  const denied = await window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: ws,
    sessionId: '${sessions.id}',
    templateId: 'general',
    consentGranted: true,
  })
  // restore ask for rest of test
  await window.electronAPI.setPrivacyPolicy({
    workspaceId: ws,
    workspaceOverride: true,
    policy: {
      sources: {
        ...(current.sources || {}),
        session: { ...(current.sources?.session || {}), body: 'ask' },
        library: { generateWithModel: 'ask', autoDetectSync: false },
      },
    },
  })
  return { decision: denied.privacy?.decision, ok: denied.ok, error: denied.error }
`)
log(`8 deny+consent still blocked decision=${denyCheck.decision} ok=${denyCheck.ok}`)

// Allow once → real generate
const generated = await evalBlock<any>(`
  const res = await window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: '${workspaceId}',
    sessionId: '${sessions.id}',
    templateId: 'decision',
    locale: 'zh-Hans',
    consentGranted: true,
  })
  const body = res.document?.body || ''
  return {
    ok: res.ok,
    mode: res.generation?.mode,
    model: res.generation?.model,
    warning: res.generation?.warning,
    hasAnchor: /craft-section/.test(body),
    hasH2: /^##\\s+/m.test(body),
    links: res.document?.meta?.sessionLinks?.length,
    excerptLike: /待补充/.test(body) && body.split('##').length <= 6,
    title: res.document?.meta?.title,
    id: res.document?.meta?.id,
    preview: body.slice(0, 240),
  }
`)
log(`3/4/5/6/7 generate ok=${generated.ok} mode=${generated.mode} model=${generated.model} anchors=${generated.hasAnchor} h2=${generated.hasH2} links=${generated.links}`)
log(`   warning=${generated.warning || ''}`)
log(`   preview=${JSON.stringify(generated.preview)}`)

const afterCount = await evalBlock<number>(`
  return (await window.electronAPI.listLibraryDocuments({ workspaceId: '${workspaceId}', filter: 'all' })).length
`)
log(`cancel-before-consent list delta from ${beforeCount} (informational); after generate=${afterCount}`)

// LOCAL_ONLY delete still works via local IPC
const localCrud = await evalBlock<any>(`
  const ws = '${workspaceId}'
  const blank = await window.electronAPI.createLibraryDocument({ workspaceId: ws, title: 'D1本地删除' })
  const del = await window.electronAPI.deleteLibraryDocument({ workspaceId: ws, documentId: blank.meta.id })
  const gone = await window.electronAPI.getLibraryDocument({ workspaceId: ws, documentId: blank.meta.id })
  const repaired = await window.electronAPI.repairLibrary(ws)
  return { deleted: del?.ok, gone: !gone, repairOk: repaired?.ok }
`)
log(`10 local CRUD delete=${localCrud.deleted} gone=${localCrud.gone} repair=${localCrud.repairOk}`)

writeFileSync(OUT, REPORT.join('\n') + '\n')
log(`REPORT ${OUT}`)
ws.close()
