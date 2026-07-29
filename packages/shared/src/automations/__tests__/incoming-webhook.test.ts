import { afterEach, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { listDynamicItems } from '../../dynamic/index.ts'
import { handleIncomingAutomationWebhook } from '../incoming-webhook.ts'

const roots: string[] = []; afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
const sign = (body: string) => `sha256=${createHmac('sha256', '0123456789abcdef').update(body).digest('hex')}`
test('validates HMAC, normalizes JSON, prevents replay and exposes failures', async () => {
  const root = mkdtempSync(join(tmpdir(), 'incoming-hook-')); roots.push(root)
  writeFileSync(join(root, 'automations.json'), JSON.stringify({ automations: { WebhookReceived: [{ id: 'hook', inboundWebhook: { secret: '0123456789abcdef' }, actions: [{ type: 'prompt', prompt: 'x' }] }] } }))
  const body = '{"issue":1}'; const emitted: Record<string, unknown>[] = []; const make = (signature = sign(body), id = 'one') => new Request('http://localhost/webhooks/ws/hook', { method: 'POST', headers: { 'x-craft-signature': signature, 'x-webhook-id': id }, body })
  expect((await handleIncomingAutomationWebhook({ request: make(), workspaceId: 'ws', workspaceRoot: root, automationId: 'hook', emit: async (data) => { emitted.push(data) } })).status).toBe(202)
  expect(emitted[0]).toMatchObject({ payload: { issue: 1 }, automationId: 'hook' })
  expect((await handleIncomingAutomationWebhook({ request: make(), workspaceId: 'ws', workspaceRoot: root, automationId: 'hook', emit: async () => {} })).status).toBe(409)
  expect((await handleIncomingAutomationWebhook({ request: make('sha256=bad', 'two'), workspaceId: 'ws', workspaceRoot: root, automationId: 'hook', emit: async () => {} })).status).toBe(401)
  expect(listDynamicItems(root, 'automation')).toHaveLength(1)
  expect(JSON.parse(readFileSync(join(root, 'automation-webhook-replays.json'), 'utf8')).schemaVersion).toBe(1)
})

test('migrates the legacy replay store once and preserves a recoverable backup', async () => {
  const root = mkdtempSync(join(tmpdir(), 'incoming-hook-schema-')); roots.push(root)
  writeFileSync(join(root, 'automations.json'), JSON.stringify({ automations: { WebhookReceived: [{ id: 'hook', inboundWebhook: { secret: '0123456789abcdef' }, actions: [{ type: 'prompt', prompt: 'x' }] }] } }))
  writeFileSync(join(root, 'automation-webhook-replays.json'), JSON.stringify({ version: 1, entries: { old: 1 } }))
  const body = '{}'
  const request = new Request('http://localhost/webhooks/ws/hook', { method: 'POST', headers: { 'x-craft-signature': sign(body), 'x-webhook-id': 'new' }, body })
  expect((await handleIncomingAutomationWebhook({ request, workspaceId: 'ws', workspaceRoot: root, automationId: 'hook', emit: async () => {}, now: () => 2 })).status).toBe(202)
  expect(existsSync(join(root, 'automation-webhook-replays.json.pre-v020-schema-v0.bak'))).toBe(true)
})

test('a failed runtime hand-off remains retryable and records a Dynamic failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'incoming-hook-retry-')); roots.push(root)
  writeFileSync(join(root, 'automations.json'), JSON.stringify({ automations: { WebhookReceived: [{ id: 'hook', inboundWebhook: { secret: '0123456789abcdef' }, actions: [{ type: 'prompt', prompt: 'x' }] }] } }))
  const body = '{"retry":true}'; const request = () => new Request('http://localhost/webhooks/ws/hook', { method: 'POST', headers: { 'x-craft-signature': sign(body), 'x-webhook-id': 'retry-me' }, body })
  expect((await handleIncomingAutomationWebhook({ request: request(), workspaceId: 'ws', workspaceRoot: root, automationId: 'hook', emit: async () => { throw new Error('runtime unavailable') } })).status).toBe(503)
  let delivered = 0
  expect((await handleIncomingAutomationWebhook({ request: request(), workspaceId: 'ws', workspaceRoot: root, automationId: 'hook', emit: async () => { delivered++ } })).status).toBe(202)
  expect(delivered).toBe(1)
  expect(listDynamicItems(root, 'automation')[0]).toMatchObject({ title: 'Inbound webhook delivery failed', requiresAction: true })
})
