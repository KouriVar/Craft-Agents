import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDynamicItem, getDynamicItem } from '@craft-agent/shared/dynamic'
import { respondDynamicPermission } from './dynamic.ts'

const roots: string[] = []; afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
test('permission decisions deliver exactly once; expired/repeated requests stay visible or fail explicitly', () => {
  const root = mkdtempSync(join(tmpdir(), 'dynamic-permission-')); roots.push(root); const calls: unknown[][] = []
  const pending = createDynamicItem(root, { kind: 'permission', title: 'Allow', requiresAction: true, priority: 'high', source: { sessionId: 's1', requestId: 'r1' } })!
  expect(respondDynamicPermission({ workspaceRoot: root, id: pending.id, allowed: true, respond: (...args) => { calls.push(args); return true } })).toBe(true)
  expect(calls).toEqual([['s1', 'r1', true, false]])
  expect(getDynamicItem(root, pending.id)).toBeUndefined()
  expect(() => respondDynamicPermission({ workspaceRoot: root, id: pending.id, allowed: true, respond: () => true })).toThrow('no longer pending')
  const expired = createDynamicItem(root, { kind: 'permission', title: 'Expired', requiresAction: true, priority: 'high', source: { sessionId: 's2', requestId: 'r2' } })!
  expect(() => respondDynamicPermission({ workspaceRoot: root, id: expired.id, allowed: false, respond: () => false })).toThrow('expired')
  expect(getDynamicItem(root, expired.id)).toBeDefined()
})
