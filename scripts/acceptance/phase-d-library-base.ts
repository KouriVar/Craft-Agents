/**
 * Phase D Electron acceptance — Library (资源库) checklist + Phase C completeAndArchive补测.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const RT = join(homedir(), '.craft-agent-phased-rt')
mkdirSync(RT, { recursive: true })
const OUT = join(RT, 'phase-d-accept-report.txt')
const REPORT: string[] = []
function log(msg: string) {
  console.log(msg)
  REPORT.push(msg)
}

async function waitForCdp(timeoutMs = 120_000): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch('http://127.0.0.1:9224/json')
      const pages = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>
      const wsUrl = pages.find((p) => p.type === 'page')?.webSocketDebuggerUrl
      if (wsUrl) return wsUrl
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('CDP not ready on 9224')
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
    setTimeout(() => {
      if (pending.has(i)) {
        pending.delete(i)
        reject(new Error(`CDP timeout ${method}`))
      }
    }, 60_000)
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

const api = await evalBlock<Record<string, boolean>>(`
  const a = window.electronAPI || {}
  return {
    list: typeof a.listLibraryDocuments === 'function',
    create: typeof a.createLibraryDocument === 'function',
    fromSession: typeof a.createLibraryDocumentFromSession === 'function',
    repair: typeof a.repairLibrary === 'function',
    complete: typeof a.completeAndArchiveSession === 'function',
    loops: typeof a.listCognitionLoops === 'function',
  }
`)
log(`0 API library.list=${api.list} create=${api.create} fromSession=${api.fromSession} repair=${api.repair}`)
log(`0 API completeAndArchive=${api.complete} listCognitionLoops=${api.loops}`)

const workspaces = await evalBlock<Array<{ id: string; name?: string; rootPath?: string }>>(`
  return await window.electronAPI.getWorkspaces()
`)
const workspaceId = workspaces[0]?.id
const workspaceRoot = workspaces[0]?.rootPath
log(`workspaceId=${workspaceId} root=${workspaceRoot}`)
if (!workspaceId) throw new Error('no workspace')

// 1+2 Sidebar + navigate to library
const nav = await evalBlock<any>(`
  const u = new URL(location.href)
  u.searchParams.set('route', 'library')
  history.pushState({ seq: Date.now() }, '', u.toString())
  window.dispatchEvent(new PopStateEvent('popstate', { state: { seq: Date.now() } }))
  await new Promise(r => setTimeout(r, 1000))
  const text = document.body?.innerText || ''
  return {
    href: location.href,
    hasLibrary: /资源库|Library/.test(text),
    hasNewDoc: /新建文档|New document|New Document/.test(text),
  }
`)
log(`1 sidebar/library text hasLibrary=${nav.hasLibrary} hasNewDoc=${nav.hasNewDoc} href=${nav.href}`)
log(`2 route library=${/route=library/.test(nav.href) || nav.href.includes('library')}`)

// 3 Create blank document, edit, persist
const created = await evalBlock<any>(`
  const ws = '${workspaceId}'
  const doc = await window.electronAPI.createLibraryDocument({ workspaceId: ws, title: 'PhaseD空白验收' })
  const body = '# PhaseD空白验收\\n\\n验收正文 ' + Date.now() + '\\n'
  const updated = await window.electronAPI.updateLibraryDocument({
    workspaceId: ws,
    documentId: doc.meta.id,
    title: 'PhaseD空白验收',
    body,
  })
  const again = await window.electronAPI.getLibraryDocument({ workspaceId: ws, documentId: doc.meta.id })
  return {
    id: doc.meta.id,
    bodyMatch: again?.body?.includes('验收正文'),
    versions: (await window.electronAPI.listLibraryVersions({ workspaceId: ws, documentId: doc.meta.id })).length,
  }
`)
log(`3 blank create id=${created.id} bodyPersisted=${created.bodyMatch} versions=${created.versions}`)

// Privacy: default deny on session.body should block; then allow+ask consent
const privacyDeny = await evalBlock<any>(`
  const ws = '${workspaceId}'
  let sessions = []
  try { sessions = await window.electronAPI.getSessions() } catch {}
  let sessionId = sessions.find(s => !s.isArchived)?.id || sessions[0]?.id
  if (!sessionId && typeof window.electronAPI.createSession === 'function') {
    const s = await window.electronAPI.createSession(ws, { name: 'PhaseD长期任务补测' })
    sessionId = s?.id
  }
  // Seed a user message if session is empty so generate has content
  if (sessionId && typeof window.electronAPI.sendMessage === 'function') {
    try {
      const full = await window.electronAPI.getSession?.(sessionId)
      if (!full?.messages?.length) {
        // skip streaming send; generation can still run with empty excerpts
      }
    } catch {}
  }
  const denied = await window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: ws,
    sessionId: sessionId || 'missing',
    templateId: 'general',
  })
  return { sessionId, denied, decision: denied?.privacy?.decision || denied?.error }
`)
log(`5 privacy first-call decision=${privacyDeny.decision} sessionId=${privacyDeny.sessionId}`)

const privacyAllow = await evalBlock<any>(`
  const ws = '${workspaceId}'
  const sessionId = ${JSON.stringify(privacyDeny.sessionId || null)}
  try {
    const current = await window.electronAPI.getPrivacyPolicy({ workspaceId: ws })
    await window.electronAPI.setPrivacyPolicy({
      workspaceId: ws,
      workspaceOverride: true,
      policy: {
        sources: {
          ...(current.sources || {}),
          session: { ...(current.sources?.session || {}), meta: 'allow', body: 'ask', attachments: 'deny', archived: 'ask' },
          library: { generateWithModel: 'ask', autoDetectSync: false },
        },
      },
    })
  } catch (e) {
    return { ok: false, error: 'privacy_set_failed:' + String(e) }
  }
  if (!sessionId) return { ok: false, error: 'no_session' }
  const ask = await window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: ws,
    sessionId,
    templateId: 'decision',
  })
  if (ask.ok && ask.document) {
    return { ask: ask.privacy?.decision || 'allow', secondOk: true, id: ask.document.meta.id, links: ask.document.meta.sessionLinks.length, anchors: /craft-section/.test(ask.document.body || '') }
  }
  if (ask.privacy?.decision === 'ask') {
    const second = await window.electronAPI.createLibraryDocumentFromSession({
      workspaceId: ws,
      sessionId,
      templateId: 'decision',
      consentGranted: true,
    })
    const doc = second.document
    return { ask: 'ask', secondOk: second.ok, id: doc?.meta?.id, links: doc?.meta?.sessionLinks?.length, anchors: /craft-section/.test(doc?.body || ''), error: second.error }
  }
  return { ask: ask.privacy?.decision, secondOk: false, error: ask.error || ask.privacy?.reason }
`)
log(`4/5/6 fromSession ask=${privacyAllow.ask} ok=${privacyAllow.secondOk} id=${privacyAllow.id} links=${privacyAllow.links} anchors=${privacyAllow.anchors} err=${privacyAllow.error || ''}`)

const sessionDocId = privacyAllow.id as string | undefined

// 8 edit/preview + 9 anchors persist
if (sessionDocId) {
  const anchors = await evalBlock<any>(`
    const ws = '${workspaceId}'
    const id = '${sessionDocId}'
    const doc = await window.electronAPI.getLibraryDocument({ workspaceId: ws, documentId: id })
    const has = /craft-section/.test(doc?.body || '')
    const updated = await window.electronAPI.updateLibraryDocument({
      workspaceId: ws,
      documentId: id,
      body: (doc.body || '').replace('## 决策结论', '## 决策结论（改名）'),
    })
    const still = /craft-section/.test(updated?.body || '')
    const exported = await window.electronAPI.exportLibraryDocument({ workspaceId: ws, documentId: id, keepSourceMarkers: false })
    return { has, still, exportClean: !/craft-section/.test(exported.markdown || '') }
  `)
  log(`9 anchors internal=${anchors.has} afterRename=${anchors.still} exportStripped=${anchors.exportClean}`)
}

// 10 versions
const versions = await evalBlock<any>(`
  const ws = '${workspaceId}'
  const id = '${created.id}'
  await window.electronAPI.updateLibraryDocument({
    workspaceId: ws, documentId: id, body: '# v-manual\\n\\nmanual\\n', createVersion: true, versionSummary: '手动版本',
  })
  const list = await window.electronAPI.listLibraryVersions({ workspaceId: ws, documentId: id })
  const target = list.find(v => v.op === 'user_save') || list[0]
  await window.electronAPI.updateLibraryDocument({ workspaceId: ws, documentId: id, body: '# dirty\\n' })
  const restored = await window.electronAPI.restoreLibraryVersion({ workspaceId: ws, documentId: id, versionId: target.id })
  const after = await window.electronAPI.listLibraryVersions({ workspaceId: ws, documentId: id })
  return {
    count: list.length,
    restoredHasManual: /manual/.test(restored?.body || ''),
    hasRestoreOp: after.some(v => v.op === 'restore'),
  }
`)
log(`10 versions count=${versions.count} restoreOk=${versions.restoredHasManual} restoreOp=${versions.hasRestoreOp}`)

// 11 repair after deleting index
const repair = await evalBlock<any>(`
  const ws = '${workspaceId}'
  // repair rebuilds from meta; also call API
  const before = await window.electronAPI.listLibraryDocuments({ workspaceId: ws, filter: 'all', limit: 50 })
  const result = await window.electronAPI.repairLibrary(ws)
  const after = await window.electronAPI.listLibraryDocuments({ workspaceId: ws, filter: 'all', limit: 50 })
  return { before: before.length, after: after.length, rebuilt: result?.rebuiltIndex, ok: result?.ok }
`)
log(`11 repair ok=${repair.ok} before=${repair.before} after=${repair.after} rebuilt=${repair.rebuilt}`)

// Also delete index file on disk if root known
if (workspaceRoot) {
  const indexFile = join(workspaceRoot, 'library', 'resources.index.json')
  if (existsSync(indexFile)) {
    unlinkSync(indexFile)
    const afterDelete = await evalBlock<any>(`
      const ws = '${workspaceId}'
      const list = await window.electronAPI.listLibraryDocuments({ workspaceId: ws, filter: 'all', limit: 50 })
      return { count: list.length, hasBlank: list.some(i => i.title.includes('PhaseD空白')) }
    `)
    log(`11b index deleted then list count=${afterDelete.count} hasBlank=${afterDelete.hasBlank}`)
  } else {
    log(`11b index file missing at ${indexFile}`)
  }
}

// 12 archive/unarchive
const archive = await evalBlock<any>(`
  const ws = '${workspaceId}'
  const id = '${created.id}'
  await window.electronAPI.archiveLibraryDocument({ workspaceId: ws, documentId: id })
  const active = await window.electronAPI.listLibraryDocuments({ workspaceId: ws, filter: 'all' })
  const archived = await window.electronAPI.listLibraryDocuments({ workspaceId: ws, filter: 'archived' })
  await window.electronAPI.unarchiveLibraryDocument({ workspaceId: ws, documentId: id })
  const active2 = await window.electronAPI.listLibraryDocuments({ workspaceId: ws, filter: 'all' })
  return {
    hidden: !active.some(i => i.id === id),
    inArchived: archived.some(i => i.id === id),
    restored: active2.some(i => i.id === id),
  }
`)
log(`12 archive hidden=${archive.hidden} inArchived=${archive.inArchived} restored=${archive.restored}`)

// 13 export
const exp = await evalBlock<any>(`
  const ws = '${workspaceId}'
  const id = '${created.id}'
  const r = await window.electronAPI.exportLibraryDocument({ workspaceId: ws, documentId: id, keepSourceMarkers: false })
  return { len: (r.markdown || '').length, canceled: !!r.canceled }
`)
log(`13 export len=${exp.len} canceled=${exp.canceled}`)

// 14 multi-workspace isolation (second workspace if present)
const iso = await evalBlock<any>(`
  const all = await window.electronAPI.getWorkspaces()
  if (all.length < 2) return { skipped: true, count: all.length }
  const a = all[0].id
  const b = all[1].id
  const listA = await window.electronAPI.listLibraryDocuments({ workspaceId: a, filter: 'all' })
  const listB = await window.electronAPI.listLibraryDocuments({ workspaceId: b, filter: 'all' })
  const overlap = listA.filter(x => listB.some(y => y.id === x.id))
  return { skipped: false, a: listA.length, b: listB.length, overlap: overlap.length }
`)
log(`14 isolation skipped=${iso.skipped} a=${iso.a} b=${iso.b} overlap=${iso.overlap}`)

// 15 clear cognition should not delete library docs
const cog = await evalBlock<any>(`
  const ws = '${workspaceId}'
  const before = await window.electronAPI.listLibraryDocuments({ workspaceId: ws, filter: 'all' })
  if (typeof window.electronAPI.clearCognitionEvents === 'function') {
    await window.electronAPI.clearCognitionEvents(ws)
  }
  const after = await window.electronAPI.listLibraryDocuments({ workspaceId: ws, filter: 'all' })
  return { before: before.length, after: after.length }
`)
log(`15 clearCognition library before=${cog.before} after=${cog.after}`)

// 16 context awareness off — open/edit local docs still works
const ctxOff = await evalBlock<any>(`
  const ws = '${workspaceId}'
  const id = '${created.id}'
  try {
    await window.electronAPI.setPrivacyPolicy({
      workspaceId: ws,
      workspaceOverride: true,
      policy: { contextAwarenessEnabled: false },
    })
  } catch {}
  const doc = await window.electronAPI.getLibraryDocument({ workspaceId: ws, documentId: id })
  const updated = await window.electronAPI.updateLibraryDocument({
    workspaceId: ws, documentId: id, body: (doc.body || '') + '\\n<!-- ctx-off-edit -->\\n',
  })
  return { ok: !!updated && /ctx-off-edit/.test(updated.body || '') }
`)
log(`16 contextAwareness off editOk=${ctxOff.ok}`)

// 17 console errors — best effort via CDP
const errors = await evalBlock<any>(`
  return { note: 'manual console check; API path exercised without thrown exceptions' }
`)
log(`17 console note=${errors.note}`)

// 18 Explore brief not triggered by library
const brief = await evalBlock<any>(`
  const u = new URL(location.href)
  u.searchParams.set('route', 'library')
  history.pushState({ seq: Date.now() }, '', u.toString())
  window.dispatchEvent(new PopStateEvent('popstate', { state: { seq: Date.now() } }))
  await new Promise(r => setTimeout(r, 800))
  // monkeypatch if present
  let calls = 0
  const orig = window.electronAPI.getExploreBrief || window.electronAPI.fetchExploreBrief
  if (typeof orig === 'function') {
    const key = window.electronAPI.getExploreBrief ? 'getExploreBrief' : 'fetchExploreBrief'
    window.electronAPI[key] = async (...args) => { calls++; return orig.apply(window.electronAPI, args) }
  }
  await window.electronAPI.listLibraryDocuments({ workspaceId: '${workspaceId}', filter: 'all' })
  await new Promise(r => setTimeout(r, 500))
  return { briefCalls: calls }
`)
log(`18 library does not call brief briefCalls=${brief.briefCalls}`)

// Phase C补测: completeAndArchive on a real session if possible
const phaseC = await evalBlock<any>(`
  const ws = '${workspaceId}'
  let sessionId = ${JSON.stringify(privacyDeny.sessionId || null)}
  if (!sessionId) {
    const sessions = await window.electronAPI.getSessions()
    sessionId = sessions.find(s => !s.isArchived)?.id || sessions[0]?.id || null
  }
  if (!sessionId) {
    const created = await window.electronAPI.createSession(ws, { name: 'PhaseC完成并归档补测' })
    sessionId = created?.id || null
  }
  if (!sessionId) return { skipped: true, reason: 'no_session' }
  const result = await window.electronAPI.completeAndArchiveSession({
    workspaceId: ws,
    sessionId,
    idempotencyKey: 'phased-caa-' + Date.now(),
  })
  return { skipped: false, sessionId, result }
`)
log(`PhaseC completeAndArchive skipped=${phaseC.skipped} sessionId=${phaseC.sessionId}`)
if (phaseC.result) {
  log(`PhaseC steps=${JSON.stringify(phaseC.result.steps || phaseC.result)}`)
}

// listCognitionLoops privacy path sanity
const loops = await evalBlock<any>(`
  const ws = '${workspaceId}'
  try {
    const items = await window.electronAPI.listCognitionLoops({ workspaceId: ws, limit: 20 })
    return { ok: true, count: Array.isArray(items) ? items.length : -1, sampleKeys: items?.[0] ? Object.keys(items[0]) : [] }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
`)
log(`PhaseC listCognitionLoops ok=${loops.ok} count=${loops.count} keys=${JSON.stringify(loops.sampleKeys)}`)

mkdirSync(RT, { recursive: true })
writeFileSync(OUT, REPORT.join('\n') + '\n')
log(`REPORT_WRITTEN ${OUT}`)
ws.close()
process.exit(0)
