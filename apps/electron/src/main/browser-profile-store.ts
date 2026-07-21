import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import type {
  BrowserBookmarkEntry,
  BrowserBookmarkFolder,
  BrowserDownloadRecord,
  BrowserHistoryEntry,
  BrowserPermissionEntry,
  BrowserWorkspaceSnapshot,
} from '../shared/types'

interface StoredExtensionPreference {
  id: string
  pinned: boolean
  hidden: boolean
  order: number
}

interface StoredBrowserProfile {
  version: 3
  bookmarks: BrowserBookmarkEntry[]
  bookmarkFolders: BrowserBookmarkFolder[]
  history: BrowserHistoryEntry[]
  downloads: BrowserDownloadRecord[]
  extensionPaths: string[]
  extensionPreferences: StoredExtensionPreference[]
  permissions: BrowserPermissionEntry[]
  browserWorkspaces: Record<string, BrowserWorkspaceSnapshot>
}

const EMPTY_PROFILE: StoredBrowserProfile = {
  version: 3,
  bookmarks: [],
  bookmarkFolders: [],
  history: [],
  downloads: [],
  extensionPaths: [],
  extensionPreferences: [],
  permissions: [],
  browserWorkspaces: {},
}

const MAX_HISTORY_ENTRIES = 5_000
const MAX_DOWNLOAD_ENTRIES = 1_000

export class BrowserProfileStore {
  private readonly filePath: string
  private profile: StoredBrowserProfile | null = null

  constructor(filePath = join(app.getPath('userData'), 'browser-profile', 'profile.json')) {
    this.filePath = filePath
  }

  listBookmarks(workspaceId: string | null): BrowserBookmarkEntry[] {
    return this.load().bookmarks
      .filter((entry) => entry.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  addBookmark(entry: BrowserBookmarkEntry): BrowserBookmarkEntry {
    const profile = this.load()
    const existing = profile.bookmarks.find(
      (item) => item.workspaceId === entry.workspaceId && item.url === entry.url,
    )
    if (existing) {
      Object.assign(existing, entry, { id: existing.id, createdAt: existing.createdAt })
      this.save()
      return existing
    }
    profile.bookmarks.push(entry)
    this.save()
    return entry
  }

  updateBookmark(
    workspaceId: string | null,
    id: string,
    changes: Partial<Pick<BrowserBookmarkEntry, 'title' | 'folderId'>>,
  ): BrowserBookmarkEntry {
    const profile = this.load()
    const bookmark = profile.bookmarks.find((entry) => entry.workspaceId === workspaceId && entry.id === id)
    if (!bookmark) throw new Error('Bookmark not found.')
    if (changes.title !== undefined) bookmark.title = changes.title
    if (changes.folderId !== undefined) bookmark.folderId = changes.folderId
    this.save()
    return bookmark
  }

  removeBookmark(workspaceId: string | null, idOrUrl: string): void {
    const profile = this.load()
    profile.bookmarks = profile.bookmarks.filter(
      (entry) => entry.workspaceId !== workspaceId || (entry.id !== idOrUrl && entry.url !== idOrUrl),
    )
    this.save()
  }

  listBookmarkFolders(workspaceId: string | null): BrowserBookmarkFolder[] {
    return this.load().bookmarkFolders
      .filter((entry) => entry.workspaceId === workspaceId)
      .sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name))
  }

  createBookmarkFolder(entry: BrowserBookmarkFolder): BrowserBookmarkFolder {
    const profile = this.load()
    const existing = profile.bookmarkFolders.find(
      (item) => item.workspaceId === entry.workspaceId && item.name.toLocaleLowerCase() === entry.name.toLocaleLowerCase(),
    )
    if (existing) return existing
    profile.bookmarkFolders.push(entry)
    this.save()
    return entry
  }

  renameBookmarkFolder(workspaceId: string | null, id: string, name: string): BrowserBookmarkFolder {
    const profile = this.load()
    const folder = profile.bookmarkFolders.find((entry) => entry.workspaceId === workspaceId && entry.id === id)
    if (!folder) throw new Error('Bookmark folder not found.')
    folder.name = name
    this.save()
    return folder
  }

  removeBookmarkFolder(workspaceId: string | null, id: string): void {
    const profile = this.load()
    profile.bookmarkFolders = profile.bookmarkFolders.filter(
      (entry) => entry.workspaceId !== workspaceId || entry.id !== id,
    )
    for (const bookmark of profile.bookmarks) {
      if (bookmark.workspaceId === workspaceId && bookmark.folderId === id) bookmark.folderId = null
    }
    this.save()
  }

  listHistory(workspaceId: string | null, limit = 500): BrowserHistoryEntry[] {
    return this.load().history
      .filter((entry) => entry.workspaceId === workspaceId)
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, Math.max(1, Math.min(2_000, limit)))
  }

  recordHistory(entry: BrowserHistoryEntry): void {
    const profile = this.load()
    const recent = profile.history.find(
      (item) => item.workspaceId === entry.workspaceId
        && item.tabId === entry.tabId
        && item.url === entry.url
        && Math.abs(item.visitedAt - entry.visitedAt) < 10_000,
    )
    if (recent) {
      Object.assign(recent, entry, { id: recent.id })
    } else {
      profile.history.push(entry)
    }
    if (profile.history.length > MAX_HISTORY_ENTRIES) {
      profile.history.sort((a, b) => b.visitedAt - a.visitedAt)
      profile.history.length = MAX_HISTORY_ENTRIES
    }
    this.save()
  }

  clearHistory(workspaceId: string | null): void {
    const profile = this.load()
    profile.history = profile.history.filter((entry) => entry.workspaceId !== workspaceId)
    this.save()
  }

  removeHistoryEntry(workspaceId: string | null, id: string): void {
    const profile = this.load()
    profile.history = profile.history.filter((entry) => entry.workspaceId !== workspaceId || entry.id !== id)
    this.save()
  }

  listDownloads(workspaceId: string | null, limit = 500): BrowserDownloadRecord[] {
    return this.load().downloads
      .filter((entry) => entry.workspaceId === workspaceId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(1, Math.min(2_000, limit)))
  }

  upsertDownload(entry: BrowserDownloadRecord): void {
    const profile = this.load()
    const index = profile.downloads.findIndex((item) => item.id === entry.id)
    if (index >= 0) profile.downloads[index] = entry
    else profile.downloads.push(entry)
    if (profile.downloads.length > MAX_DOWNLOAD_ENTRIES) {
      profile.downloads.sort((a, b) => b.timestamp - a.timestamp)
      profile.downloads.length = MAX_DOWNLOAD_ENTRIES
    }
    this.save()
  }

  clearDownloads(workspaceId: string | null): void {
    const profile = this.load()
    profile.downloads = profile.downloads.filter((entry) => entry.workspaceId !== workspaceId)
    this.save()
  }

  getExtensionPaths(): string[] {
    return [...this.load().extensionPaths]
  }

  addExtensionPath(path: string): void {
    const profile = this.load()
    if (!profile.extensionPaths.includes(path)) {
      profile.extensionPaths.push(path)
      this.save()
    }
  }

  removeExtensionPath(path: string): void {
    const profile = this.load()
    profile.extensionPaths = profile.extensionPaths.filter((entry) => entry !== path)
    this.save()
  }

  getExtensionPreference(id: string): StoredExtensionPreference {
    return this.load().extensionPreferences.find((entry) => entry.id === id)
      ?? { id, pinned: false, hidden: false, order: Number.MAX_SAFE_INTEGER }
  }

  setExtensionPreference(id: string, preference: Partial<Omit<StoredExtensionPreference, 'id'>>): void {
    const profile = this.load()
    const existing = profile.extensionPreferences.find((entry) => entry.id === id)
    if (existing) Object.assign(existing, preference)
    else profile.extensionPreferences.push({
      id,
      pinned: preference.pinned ?? false,
      hidden: preference.hidden ?? false,
      order: preference.order ?? profile.extensionPreferences.length,
    })
    this.save()
  }

  removeExtensionPreference(id: string): void {
    const profile = this.load()
    profile.extensionPreferences = profile.extensionPreferences.filter((entry) => entry.id !== id)
    this.save()
  }

  listPermissions(origin?: string): BrowserPermissionEntry[] {
    return this.load().permissions
      .filter((entry) => !origin || entry.origin === origin)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  setPermission(entry: BrowserPermissionEntry): void {
    const profile = this.load()
    const existing = profile.permissions.find(
      (item) => item.origin === entry.origin && item.permission === entry.permission,
    )
    if (existing) Object.assign(existing, entry)
    else profile.permissions.push(entry)
    this.save()
  }

  clearPermission(origin: string, permission?: string): void {
    const profile = this.load()
    profile.permissions = profile.permissions.filter(
      (entry) => entry.origin !== origin || (permission !== undefined && entry.permission !== permission),
    )
    this.save()
  }

  loadWorkspaceState(workspaceId: string): BrowserWorkspaceSnapshot {
    const snapshot = this.load().browserWorkspaces[workspaceId]
    if (!snapshot) return { version: 1, activeTabId: null, tabs: [], updatedAt: 0 }
    return structuredClone(snapshot)
  }

  saveWorkspaceState(workspaceId: string, snapshot: BrowserWorkspaceSnapshot): void {
    const seen = new Set<string>()
    const tabs = snapshot.tabs.filter((tab) => {
      if (!tab || typeof tab.id !== 'string' || typeof tab.url !== 'string' || seen.has(tab.id)) return false
      seen.add(tab.id)
      return true
    }).map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: typeof tab.title === 'string' ? tab.title : tab.url,
      favicon: tab.favicon ?? null,
      createdAt: tab.createdAt,
      lastAccessedAt: tab.lastAccessedAt,
      pageState: tab.pageState ?? null,
    }))
    const activeTabId = snapshot.activeTabId && seen.has(snapshot.activeTabId)
      ? snapshot.activeTabId
      : (tabs[0]?.id ?? null)
    this.load().browserWorkspaces[workspaceId] = {
      version: 1,
      activeTabId,
      tabs,
      updatedAt: Date.now(),
    }
    this.save()
  }

  private load(): StoredBrowserProfile {
    if (this.profile) return this.profile
    try {
      if (existsSync(this.filePath)) {
        const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<StoredBrowserProfile>
        this.profile = {
          version: 3,
          bookmarks: Array.isArray(parsed.bookmarks)
            ? parsed.bookmarks.map((entry) => ({ ...entry, folderId: entry.folderId ?? null }))
            : [],
          bookmarkFolders: Array.isArray(parsed.bookmarkFolders) ? parsed.bookmarkFolders : [],
          history: Array.isArray(parsed.history) ? parsed.history : [],
          downloads: Array.isArray(parsed.downloads) ? parsed.downloads : [],
          extensionPaths: Array.isArray(parsed.extensionPaths) ? parsed.extensionPaths : [],
          extensionPreferences: Array.isArray(parsed.extensionPreferences) ? parsed.extensionPreferences : [],
          permissions: Array.isArray(parsed.permissions) ? parsed.permissions : [],
          browserWorkspaces: parsed.browserWorkspaces && typeof parsed.browserWorkspaces === 'object'
            ? parsed.browserWorkspaces
            : {},
        }
        return this.profile
      }
    } catch {
      // Preserve corrupt data for diagnosis/recovery instead of silently
      // overwriting the only copy on the next successful write.
      if (existsSync(this.filePath)) {
        try {
          renameSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}.json`)
        } catch {
          // Best effort: startup must still continue with an empty profile.
        }
      }
    }
    this.profile = structuredClone(EMPTY_PROFILE)
    return this.profile
  }

  private save(): void {
    const profile = this.load()
    mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.filePath}.tmp`
    writeFileSync(temporaryPath, JSON.stringify(profile, null, 2), { encoding: 'utf8', mode: 0o600 })
    renameSync(temporaryPath, this.filePath)
    chmodSync(this.filePath, 0o600)
  }
}
