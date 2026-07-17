import { afterEach, describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

mock.module('electron', () => ({
  app: { getPath: () => tmpdir() },
}))

const { BrowserProfileStore } = await import('../browser-profile-store')

const temporaryDirectories: string[] = []

function createStore() {
  const directory = mkdtempSync(join(tmpdir(), 'craft-browser-profile-'))
  temporaryDirectories.push(directory)
  const filePath = join(directory, 'profile.json')
  return { store: new BrowserProfileStore(filePath), filePath }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('BrowserProfileStore', () => {
  it('persists browser data and extension preferences across instances', () => {
    const { store, filePath } = createStore()
    store.addBookmark({
      id: 'bookmark-1',
      workspaceId: 'workspace-a',
      url: 'https://example.com/',
      title: 'Example',
      favicon: null,
      createdAt: 1,
    })
    const folder = store.createBookmarkFolder({
      id: 'folder-1',
      workspaceId: 'workspace-a',
      name: 'Research',
      createdAt: 1,
    })
    store.updateBookmark('workspace-a', 'bookmark-1', { folderId: folder.id })
    store.recordHistory({
      id: 'history-1',
      workspaceId: 'workspace-a',
      tabId: 'browser-1',
      url: 'https://example.com/',
      title: 'Example',
      favicon: null,
      visitedAt: 2,
    })
    store.upsertDownload({
      id: 'download-1',
      workspaceId: 'workspace-a',
      tabId: 'browser-1',
      timestamp: 3,
      url: 'https://example.com/file.zip',
      filename: 'file.zip',
      state: 'completed',
      bytesReceived: 10,
      totalBytes: 10,
      mimeType: 'application/zip',
    })
    store.setExtensionPreference('extension-1', { pinned: true, hidden: false, order: 2 })
    store.setPermission({
      origin: 'https://example.com',
      permission: 'notifications',
      allowed: false,
      updatedAt: 4,
    })

    const restored = new BrowserProfileStore(filePath)
    expect(restored.listBookmarks('workspace-a')).toHaveLength(1)
    expect(restored.listBookmarks('workspace-a')[0]?.folderId).toBe('folder-1')
    expect(restored.listBookmarkFolders('workspace-a')).toEqual([expect.objectContaining({ name: 'Research' })])
    expect(restored.listHistory('workspace-a')).toHaveLength(1)
    expect(restored.listDownloads('workspace-a')).toHaveLength(1)
    expect(restored.getExtensionPreference('extension-1')).toMatchObject({ pinned: true, order: 2 })
    expect(restored.listPermissions('https://example.com')).toEqual([
      expect.objectContaining({ permission: 'notifications', allowed: false }),
    ])
    expect(JSON.parse(readFileSync(filePath, 'utf8')).version).toBe(3)
    expect(statSync(filePath).mode & 0o777).toBe(0o600)
  })

  it('keeps bookmarks when their folder is deleted', () => {
    const { store } = createStore()
    store.createBookmarkFolder({ id: 'folder-1', workspaceId: 'workspace-a', name: 'Read later', createdAt: 1 })
    store.addBookmark({
      id: 'bookmark-1', workspaceId: 'workspace-a', url: 'https://example.com/', title: 'Example',
      favicon: null, folderId: 'folder-1', createdAt: 2,
    })

    store.removeBookmarkFolder('workspace-a', 'folder-1')

    expect(store.listBookmarkFolders('workspace-a')).toEqual([])
    expect(store.listBookmarks('workspace-a')).toEqual([expect.objectContaining({ id: 'bookmark-1', folderId: null })])
  })

  it('isolates workspace records and supports targeted deletion', () => {
    const { store } = createStore()
    for (const workspaceId of ['workspace-a', 'workspace-b']) {
      store.recordHistory({
        id: `history-${workspaceId}`,
        workspaceId,
        tabId: 'browser-1',
        url: `https://${workspaceId}.example.com/`,
        title: workspaceId,
        favicon: null,
        visitedAt: Date.now(),
      })
    }

    store.removeHistoryEntry('workspace-a', 'history-workspace-a')
    expect(store.listHistory('workspace-a')).toEqual([])
    expect(store.listHistory('workspace-b')).toHaveLength(1)
  })

  it('persists crash-recovery tab snapshots in the browser profile', () => {
    const { store, filePath } = createStore()
    store.saveWorkspaceState('workspace-a', {
      version: 1,
      activeTabId: 'tab-2',
      tabs: [
        { id: 'tab-1', url: 'https://example.com/', title: 'Example' },
        { id: 'tab-2', url: 'https://figma.com/', title: 'Figma' },
      ],
      updatedAt: 1,
    })

    const restored = new BrowserProfileStore(filePath).loadWorkspaceState('workspace-a')
    expect(restored.activeTabId).toBe('tab-2')
    expect(restored.tabs).toHaveLength(2)
    expect(restored.updatedAt).toBeGreaterThan(1)
  })

  it('backs up a corrupt profile before starting with clean data', () => {
    const { store, filePath } = createStore()
    writeFileSync(filePath, '{not-json', 'utf8')

    expect(store.listBookmarks('workspace-a')).toEqual([])
    const files = readdirSync(dirname(filePath))
    expect(files.some((name) => name.startsWith('profile.json.corrupt-'))).toBe(true)
  })
})
