import { beforeEach, describe, expect, it } from 'bun:test'
import type { LoadedProject } from '@craft-agent/shared/projects/types'
import {
  clearLastActiveProjectId,
  getLastActiveProjectId,
  resolveLastActiveProject,
  setLastActiveProjectId,
} from '../last-active-project'
const memory = new Map<string, string>()

function stubLocalStorage() {
  const localStorageStub = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value) },
    removeItem: (key: string) => { memory.delete(key) },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageStub,
    configurable: true,
    writable: true,
  })
}

function project(id: string, name = id): LoadedProject {
  return {
    config: {
      id,
      slug: id,
      name,
      createdAt: 1,
      updatedAt: 1,
    },
    folderPath: `/tmp/${id}`,
    assetsPath: `/tmp/${id}/assets`,
    workspaceRootPath: '/tmp/ws',
    workspaceId: 'ws-1',
  }
}

describe('last-active-project', () => {
  beforeEach(() => {
    memory.clear()
    stubLocalStorage()
  })

  it('stores and reads a workspace-scoped project id', () => {
    setLastActiveProjectId('ws-1', 'proj_a')
    expect(getLastActiveProjectId('ws-1')).toBe('proj_a')
    expect(getLastActiveProjectId('ws-2')).toBeNull()
  })

  it('ignores empty project ids', () => {
    setLastActiveProjectId('ws-1', '   ')
    expect(getLastActiveProjectId('ws-1')).toBeNull()
  })

  it('clears the pointer', () => {
    setLastActiveProjectId('ws-1', 'proj_a')
    clearLastActiveProjectId('ws-1')
    expect(getLastActiveProjectId('ws-1')).toBeNull()
  })

  it('resolves against the project list and clears deleted projects', () => {
    setLastActiveProjectId('ws-1', 'proj_gone')
    expect(resolveLastActiveProject('ws-1', [project('proj_a')])).toBeNull()
    expect(getLastActiveProjectId('ws-1')).toBeNull()

    setLastActiveProjectId('ws-1', 'proj_a')
    const resolved = resolveLastActiveProject('ws-1', [project('proj_a', 'Alpha')])
    expect(resolved?.config.name).toBe('Alpha')
    expect(getLastActiveProjectId('ws-1')).toBe('proj_a')
  })

  it('returns null when no pointer is stored', () => {
    expect(resolveLastActiveProject('ws-1', [project('proj_a')])).toBeNull()
  })
})
