/**
 * Phase E.1 Electron smoke — multi-workspace isolation + library export.
 * Requires: CRAFT_CONFIG_DIR=~/.craft-agent-phasee-rt CRAFT_ELECTRON_ARGS=--remote-debugging-port=9225
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const RT = join(homedir(), '.craft-agent-phasee-rt')
mkdirSync(join(RT, 'artifacts'), { recursive: true })
const OUT = join(RT, 'artifacts', 'phase-e-electron.txt')
const REPORT: string[] = []
function log(msg: string) {
  console.log(msg)
  REPORT.push(msg)
}

async function waitForCdp(port = 9225, timeoutMs = 120_000): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`)
      const pages = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>
      const wsUrl = pages.find((p) => p.type === 'page')?.webSocketDebuggerUrl
      if (wsUrl) return wsUrl
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`CDP ${port} not ready`)
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
await new Promise((r) => setTimeout(r, 2500))

const boot = await evalBlock<any>(`
  const workspaces = await window.electronAPI.getWorkspaces()
  return { count: workspaces?.length, ids: (workspaces||[]).map(w => w.id), version: window.electronAPI?.getAppVersion ? await window.electronAPI.getAppVersion() : null }
`)
log(`1 boot workspaces=${boot.count} version=${boot.version || 'n/a'}`)

// Ensure privacy ask for library generate
const wsA = boot.ids?.[0]
if (!wsA) throw new Error('no workspace')

await evalBlock(`
  const ws = '${wsA}'
  const current = await window.electronAPI.getPrivacyPolicy({ workspaceId: ws })
  await window.electronAPI.setPrivacyPolicy({
    workspaceId: ws,
    workspaceOverride: true,
    policy: {
      sources: {
        ...(current.sources || {}),
        session: { ...(current.sources?.session || {}), body: 'ask', attachments: 'deny', archived: 'ask', meta: 'allow' },
        library: { generateWithModel: 'ask', autoDetectSync: false },
      },
    },
  })
  return true
`)

const session = await evalBlock<any>(`
  return await window.electronAPI.createSession('${wsA}', { name: 'PhaseE回归会话' })
`)
log(`2 session=${session?.id}`)

const ask = await evalBlock<any>(`
  return await window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: '${wsA}',
    sessionId: '${session.id}',
    generateMode: 'preserve',
    templateId: 'general',
    locale: 'zh-Hans',
  })
`)
const doc = await evalBlock<any>(`
  return await window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: '${wsA}',
    sessionId: '${session.id}',
    generateMode: 'preserve',
    templateId: 'general',
    locale: 'zh-Hans',
    consentToken: ${JSON.stringify(ask.consentToken || '')},
  })
`)
log(`3 preserve ok=${doc.ok} mode=${doc.generation?.mode} leak=${/CRAFT_SECTION|⟦CRAFT/.test(doc.document?.body || '')}`)

const docId = doc.document?.meta?.id
const exports = await evalBlock<any>(`
  const id = '${docId}'
  const md = await window.electronAPI.exportLibraryDocument({ workspaceId: '${wsA}', documentId: id, format: 'markdown' })
  const html = await window.electronAPI.exportLibraryDocument({ workspaceId: '${wsA}', documentId: id, format: 'html' })
  const pdf = await window.electronAPI.exportLibraryDocument({ workspaceId: '${wsA}', documentId: id, format: 'pdf' })
  return {
    mdOk: !(md.markdown||'').includes('craft-section'),
    htmlOk: (html.html||'').includes('<!doctype html>') && !(html.html||'').includes('craft-section'),
    pdfOk: Boolean(pdf.pdfBase64) && !pdf.error,
    pdfErr: pdf.error || '',
  }
`)
log(`4 export md=${exports.mdOk} html=${exports.htmlOk} pdf=${exports.pdfOk} ${exports.pdfErr}`)

// Multi-workspace isolation
const folderB = join(RT, `ws-b-${Date.now()}`)
mkdirSync(folderB, { recursive: true })
const createdB = await evalBlock<any>(`
  try {
    const ws = await window.electronAPI.createWorkspace(${JSON.stringify(folderB)}, 'PhaseE-Workspace-B')
    return { ok: true, id: ws?.id, folderPath: ${JSON.stringify(folderB)} }
  } catch (e) {
    return { ok: false, error: String(e), folderPath: ${JSON.stringify(folderB)} }
  }
`)
log(`5 create workspace B ok=${createdB.ok} id=${createdB.id} err=${createdB.error || ''}`)

if (createdB.id) {
  const blankB = await evalBlock<any>(`
    return await window.electronAPI.createLibraryDocument({
      workspaceId: '${createdB.id}',
      title: 'B独立文档',
    })
  `)
  const listA = await evalBlock<any>(`
    return await window.electronAPI.listLibraryDocuments({ workspaceId: '${wsA}', filter: 'all' })
  `)
  const listB = await evalBlock<any>(`
    return await window.electronAPI.listLibraryDocuments({ workspaceId: '${createdB.id}', filter: 'all' })
  `)
  const aHasB = (listA || []).some((d: any) => d.title === 'B独立文档' || d.id === blankB?.meta?.id)
  const bHasA = (listB || []).some((d: any) => d.id === '${docId}' || d.id === docId)
  log(`6 isolation A_count=${listA?.length} B_count=${listB?.length} A_sees_B_doc=${aHasB} B_sees_A_doc=${bHasA}`)
} else {
  log(`6 isolation SKIPPED — createWorkspace API unavailable or failed`)
}

// Consent bypass
const bypass = await evalBlock<any>(`
  return await window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: '${wsA}',
    sessionId: '${session.id}',
    generateMode: 'preserve',
    consentGranted: true,
  })
`)
log(`7 consentGranted bypass blocked=${!bypass.ok && Boolean(bypass.consentToken)}`)

writeFileSync(OUT, `${REPORT.join('\n')}\n`)
log(`report=${OUT}`)
ws.close()
