/**
 * Registry config-write preservation.
 *
 * Every platform config write must spread existing fields rather than replace
 * the platform object, otherwise owners + accessMode get silently dropped.
 * These tests pin the helper-driven behaviour: owners + accessMode survive
 * every flow that writes platform config, generically across platforms.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { CredentialManager } from '@craft-agent/shared/credentials'
import type { ISessionManager } from '@craft-agent/server-core/handlers'
import { MessagingGatewayRegistry } from '../registry'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'reg-cfg-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function stubSessionManager(): ISessionManager {
  return { setAutomationBinder: () => {} } as unknown as ISessionManager
}

function stubCredentialManager(): CredentialManager {
  return {
    get: async () => null,
    set: async () => {},
    delete: async () => {},
  } as unknown as CredentialManager
}

function makeRegistry() {
  const registry = new MessagingGatewayRegistry({
    sessionManager: stubSessionManager(),
    credentialManager: stubCredentialManager(),
    getMessagingDir: (workspaceId: string) =>
      join(dir, 'workspaces', workspaceId, 'messaging'),
  })
  return { registry, workspaceId: 'ws-test' }
}

describe('MessagingGatewayRegistry — config preservation across writes', () => {
  it('owners + accessMode survive setPlatformAccessMode', () => {
    const { registry, workspaceId } = makeRegistry()
    registry.setPlatformOwners(workspaceId, 'lark', [
      { userId: 'owner-1', addedAt: Date.now() },
    ])
    registry.setPlatformAccessMode(workspaceId, 'lark', 'owner-only')
    const owners = registry.getPlatformOwners(workspaceId, 'lark')
    expect(owners).toHaveLength(1)
    expect(registry.getPlatformAccessMode(workspaceId, 'lark')).toBe('owner-only')
  })

  it('seedFirstOwner is no-op when owners already exist', async () => {
    const { registry, workspaceId } = makeRegistry()
    registry.setPlatformOwners(workspaceId, 'lark', [
      { userId: 'first', addedAt: Date.now() },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seeded = await (registry as any).seedFirstOwner(workspaceId, 'lark', {
      userId: 'second',
      addedAt: Date.now(),
    })
    expect(seeded).toHaveLength(1)
    expect(seeded[0].userId).toBe('first')
    const owners = registry.getPlatformOwners(workspaceId, 'lark')
    expect(owners).toHaveLength(1)
    expect(owners[0]!.userId).toBe('first')
  })
})

describe('MessagingGatewayRegistry — lock-down migrates open bindings', () => {
  it('setPlatformAccessMode("owner-only") flips legacy open bindings to inherit', () => {
    const { registry, workspaceId } = makeRegistry()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = (registry as any).workspaces.get(workspaceId) ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (registry as any).bootstrapWorkspace(workspaceId)
    const store = state.gateway.getBindingStore()
    // Persist a binding in legacy 'open' mode (mimics migration).
    const b = store.bind('ws-test', 'sess-A', 'lark', 'chat-1', undefined, {
      accessMode: 'open',
    })
    expect(b.config.accessMode).toBe('open')

    registry.setPlatformAccessMode(workspaceId, 'lark', 'owner-only')

    const reloaded = store.getAll().find((x: { id: string }) => x.id === b.id)
    expect(reloaded.config.accessMode).toBe('inherit')
    // Binding ID and createdAt must have survived the migration (no rotation).
    expect(reloaded.id).toBe(b.id)
    expect(reloaded.createdAt).toBe(b.createdAt)
  })

  it('bindings for a different platform are not touched by the lock-down', () => {
    const { registry, workspaceId } = makeRegistry()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = (registry as any).workspaces.get(workspaceId) ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (registry as any).bootstrapWorkspace(workspaceId)
    const store = state.gateway.getBindingStore()
    const other = store.bind('ws-test', 'sess-A', 'wechat', 'chan-A', undefined, {
      accessMode: 'open',
    })

    registry.setPlatformAccessMode(workspaceId, 'lark', 'owner-only')

    const reloaded = store.getAll().find((x: { id: string }) => x.id === other.id)
    expect(reloaded.config.accessMode).toBe('open')
  })
})
