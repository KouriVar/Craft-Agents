/**
 * Phase D.2 acceptance — fidelity, dual modes, consent token, HTML/PDF export.
 * Requires Electron with CRAFT_CONFIG_DIR=~/.craft-agent-phased-rt --remote-debugging-port=9224
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const RT = join(homedir(), '.craft-agent-phased-rt')
mkdirSync(RT, { recursive: true })
const OUT = join(RT, 'phase-d2-accept-report.txt')
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
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); reject(new Error(`timeout ${method}`)) } }, 180_000)
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

// Ensure ask policy
await evalBlock(`
  const ws = '${workspaceId}'
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

const richMd = [
  '# 验收标题',
  '',
  '## 小节',
  '',
  '| 维度 | 6号 | 8号 |',
  '|---|---:|---:|',
  '| 酒精度 | 7.5% | 9.2% |',
  '',
  '- 列表一项',
  '- 列表二项',
  '',
  '> 引用内容',
  '',
  '```ts',
  'const x = 1',
  '```',
  '',
  '```mermaid',
  'graph TD; A-->B',
  '```',
  '',
  '![示意图](https://example.com/a.png)',
].join('\\n')

const session = await evalBlock<any>(`
  const session = await window.electronAPI.createSession('${workspaceId}', { name: 'PhaseD2保真验收' })
  // Inject rich messages via update if available — fallback: sendMessage may not set markdown.
  // Prefer direct createLibrary with preserve after seeding messages through API.
  return { id: session?.id, name: session?.name }
`)
log(`session=${session.id}`)

// Seed messages if API allows — try sendMessage as user
await evalBlock(`
  try {
    await window.electronAPI.sendMessage('${session.id}', ${JSON.stringify(richMd.replace(/\\n/g, '\n'))})
  } catch (e) {
    return String(e)
  }
  return 'sent'
`).catch(() => 'skip-send')

// 1) consentGranted boolean must NOT bypass ask
const bypass = await evalBlock<any>(`
  return await window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: '${workspaceId}',
    sessionId: '${session.id}',
    templateId: 'decision',
    generateMode: 'ai',
    locale: 'zh-Hans',
    consentGranted: true,
  })
`)
log(`1 boolean bypass blocked: ok=${bypass.ok} error=${bypass.error} hasToken=${Boolean(bypass.consentToken)}`)

// 2) Token flow — first gets token, second consumes
const first = await evalBlock<any>(`
  return await window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: '${workspaceId}',
    sessionId: '${session.id}',
    templateId: 'general',
    generateMode: 'preserve',
    locale: 'zh-Hans',
  })
`)
log(`2 first ask: ok=${first.ok} error=${first.error} token=${Boolean(first.consentToken)}`)

const preserve = await evalBlock<any>(`
  return await window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: '${workspaceId}',
    sessionId: '${session.id}',
    templateId: 'general',
    generateMode: 'preserve',
    locale: 'zh-Hans',
    consentToken: ${JSON.stringify(first.consentToken || '')},
  })
`)
log(`3 preserve: ok=${preserve.ok} mode=${preserve.generation?.mode} anchors=${preserve.document?.body?.includes('craft-section')} leak=${/CRAFT_SECTION|⟦CRAFT/.test(preserve.document?.body || '')}`)

// Token reuse must fail
const reuse = await evalBlock<any>(`
  return await window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: '${workspaceId}',
    sessionId: '${session.id}',
    generateMode: 'preserve',
    consentToken: ${JSON.stringify(first.consentToken || '')},
  })
`)
log(`4 token reuse rejected: ok=${reuse.ok} error=${reuse.error}`)

// AI path (may fallback)
const ask2 = await evalBlock<any>(`
  return await window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: '${workspaceId}',
    sessionId: '${session.id}',
    templateId: 'decision',
    generateMode: 'ai',
    locale: 'zh-Hans',
  })
`)
let ai: any = { ok: false, error: 'skipped' }
try {
  ai = await evalBlock<any>(`
    return await window.electronAPI.createLibraryDocumentFromSession({
      workspaceId: '${workspaceId}',
      sessionId: '${session.id}',
      templateId: 'decision',
      generateMode: 'ai',
      locale: 'zh-Hans',
      consentToken: ${JSON.stringify(ask2.consentToken || '')},
    })
  `)
} catch (e) {
  log(`5 ai: TIMEOUT/ERROR ${String(e).slice(0, 200)}`)
  ai = { ok: false, error: 'timeout' }
}
log(`5 ai: ok=${ai.ok} mode=${ai.generation?.mode} model=${ai.generation?.model || ai.document?.meta?.generation?.modelId} quality=${ai.document?.meta?.generation?.qualityStatus}`)
log(`5b sources docLevel=${ai.document?.meta?.sourceReferences?.some((r: any) => r.documentLevel)} count=${ai.document?.meta?.sourceReferences?.length}`)

const docId = ai.document?.meta?.id || preserve.document?.meta?.id
if (docId) {
  const md = await evalBlock<any>(`
    return await window.electronAPI.exportLibraryDocument({
      workspaceId: '${workspaceId}',
      documentId: '${docId}',
      format: 'markdown',
      keepSourceMarkers: false,
    })
  `)
  const html = await evalBlock<any>(`
    return await window.electronAPI.exportLibraryDocument({
      workspaceId: '${workspaceId}',
      documentId: '${docId}',
      format: 'html',
      keepSourceMarkers: false,
    })
  `)
  let pdf: any = { error: 'skipped' }
  try {
    pdf = await evalBlock<any>(`
      return await window.electronAPI.exportLibraryDocument({
        workspaceId: '${workspaceId}',
        documentId: '${docId}',
        format: 'pdf',
        keepSourceMarkers: false,
      })
    `)
  } catch (e) {
    pdf = { error: String(e).slice(0, 200) }
  }
  log(`6 md strip=${!(md.markdown || '').includes('craft-section')} len=${(md.markdown || '').length}`)
  log(`7 html ok=${Boolean(html.html?.includes('<!doctype html>'))} strip=${!(html.html || '').includes('craft-section')} hasTable=${Boolean(html.html?.includes('<table'))}`)
  log(`8 pdf ok=${Boolean(pdf.pdfBase64) && !pdf.error} err=${pdf.error || ''} bytes=${pdf.pdfBase64 ? Math.floor(pdf.pdfBase64.length * 0.75) : 0}`)

  const meta = await evalBlock<any>(`
    const doc = await window.electronAPI.getLibraryDocument({ workspaceId: '${workspaceId}', documentId: '${docId}' })
    return {
      mode: doc?.meta?.generation?.mode,
      modelId: doc?.meta?.generation?.modelId,
      quality: doc?.meta?.generation?.qualityStatus,
      sources: doc?.meta?.sourceReferences?.length,
      bodyHasPlaceholder: /CRAFT_SECTION|⟦CRAFT/.test(doc?.body || ''),
      previewSafe: !(doc?.body || '').includes('⟦CRAFT_SECTION'),
    }
  `)
  log(`9 meta mode=${meta.mode} model=${meta.modelId} quality=${meta.quality} sources=${meta.sources} placeholderLeak=${meta.bodyHasPlaceholder}`)
}

writeFileSync(OUT, REPORT.join('\n') + '\n')
log(`report=${OUT}`)
ws.close()
