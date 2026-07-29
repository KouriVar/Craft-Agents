import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDynamicItem, DYNAMIC_ITEM_RETENTION_MS, clearDynamicItem, listDynamicItems, markDynamicRead, purgeExpiredDynamicItems, resolveDynamicAction, setDynamicMuteRules } from '../index.ts'
const roots: string[] = []; afterEach(() => roots.splice(0).forEach((x) => rmSync(x, { recursive: true, force: true })))
describe('Dynamic Item store', () => {
  it('keeps actionable items, supports read/clear, mute, filters and retention', () => {
    const root = mkdtempSync(join(tmpdir(), 'dynamic-')); roots.push(root)
    const normal = createDynamicItem(root, { kind: 'reminder', title: 'Review', requiresAction: false, priority: 'normal' })!
    const permission = createDynamicItem(root, { kind: 'permission', title: 'Approve', requiresAction: true, priority: 'high' })!
    expect(listDynamicItems(root, 'actionable').map((x) => x.id)).toEqual([permission.id])
    expect(markDynamicRead(root, normal.id, 10)).toBe(true); expect(clearDynamicItem(root, normal.id, 11)).toBe(true)
    expect(clearDynamicItem(root, permission.id)).toBe(false)
    expect(resolveDynamicAction(root, permission.id)).toBe(true)
    setDynamicMuteRules(root, { projectIds: [], automationIds: [], kinds: ['cognition'] })
    expect(createDynamicItem(root, { kind: 'cognition', title: 'Muted', requiresAction: false, priority: 'low' })).toBeNull()
    expect(purgeExpiredDynamicItems(root, normal.createdAt + DYNAMIC_ITEM_RETENTION_MS + 1_000)).toBe(2)
    expect(listDynamicItems(root)).toEqual([])
  })
})
