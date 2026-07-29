import { createHmac, timingSafeEqual, createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createDynamicItem } from '../dynamic/index.ts'
import { readVersionedStore, writeVersionedStore } from '../migrations/versioned-json-store.ts'
import { resolveAutomationsConfigPath } from './resolve-config-path.ts'

interface ReplayStore { schemaVersion: 1; entries: Record<string, number> }
const replayPath = (root: string) => join(root, 'automation-webhook-replays.json')
const readReplay = (root: string): ReplayStore => readVersionedStore({
  filePath: replayPath(root),
  displayName: 'Webhook 防重放',
  currentVersion: 1,
  empty: () => ({ schemaVersion: 1, entries: {} }),
  validate: (value): value is ReplayStore => {
    const store = value as Partial<ReplayStore>
    return store.schemaVersion === 1 && !!store.entries && typeof store.entries === 'object' && !Array.isArray(store.entries)
  },
  migrateLegacy: (value) => {
    const legacy = value as { version?: unknown; entries?: unknown }
    return legacy.version === 1 && legacy.entries && typeof legacy.entries === 'object'
      ? { schemaVersion: 1, entries: legacy.entries as Record<string, number> }
      : null
  },
})
const writeReplay = (root: string, store: ReplayStore) => writeVersionedStore(replayPath(root), store)
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }

export async function handleIncomingAutomationWebhook(input: { request: Request; workspaceId: string; workspaceRoot: string; automationId: string; emit: (data: Record<string, unknown>) => Promise<void>; now?: () => number }): Promise<Response> {
  if (input.request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const configPath = resolveAutomationsConfigPath(input.workspaceRoot)
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) as { automations?: Record<string, Array<Record<string, unknown>>> } : {}
  const matcher = (config.automations?.WebhookReceived ?? []).find((item) => item.id === input.automationId && item.enabled !== false)
  const hook = matcher?.inboundWebhook as { secret?: string; signatureHeader?: string } | undefined
  if (!matcher || !hook?.secret) return new Response('Not Found', { status: 404 })
  const raw = await input.request.text(); const header = hook.signatureHeader ?? 'x-craft-signature'; const signature = input.request.headers.get(header)
  const expected = `sha256=${createHmac('sha256', hook.secret).update(raw).digest('hex')}`
  if (!signature || !safeEqual(signature, expected)) {
    createDynamicItem(input.workspaceRoot, { kind: 'automation', title: 'Inbound webhook rejected', body: `Authentication failed for ${input.automationId}`, automationId: input.automationId, requiresAction: true, priority: 'high' })
    return new Response('Unauthorized', { status: 401 })
  }
  const now = input.now?.() ?? Date.now(); const replayKey = input.request.headers.get('x-webhook-id') ?? createHash('sha256').update(`${input.automationId}:${raw}`).digest('hex'); const store = readReplay(input.workspaceRoot)
  for (const [key, timestamp] of Object.entries(store.entries)) if (now - timestamp > 24 * 60 * 60_000) delete store.entries[key]
  if (store.entries[replayKey]) return new Response('Duplicate', { status: 409 })
  let payload: unknown; try { payload = raw ? JSON.parse(raw) : {} } catch { return new Response('Invalid JSON', { status: 400 }) }
  try {
    await input.emit({ automationId: input.automationId, payload, receivedAt: now, requestId: replayKey })
    // A delivery failure is not a replay: callers must be able to retry the
    // same authenticated request after the runtime comes back. Persist only
    // after EventBus/Run Session hand-off has succeeded.
    store.entries[replayKey] = now
    writeReplay(input.workspaceRoot, store)
    return Response.json({ ok: true }, { status: 202 })
  }
  catch (error) { createDynamicItem(input.workspaceRoot, { kind: 'automation', title: 'Inbound webhook delivery failed', body: error instanceof Error ? error.message : String(error), automationId: input.automationId, requiresAction: true, priority: 'high' }); return new Response('Delivery failed', { status: 503 }) }
}
