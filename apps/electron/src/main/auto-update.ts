/**
 * Auto-update module using electron-updater
 *
 * Handles checking for updates, downloading, and installing via the standard
 * electron-updater library. Updates are served from the latest GitHub Release
 * using the generic provider (platform YAML manifests + release assets).
 *
 * Platform behavior:
 * - macOS: Unsigned local builds offer the GitHub Release for manual download
 * - Windows: Downloads NSIS installer, runs silently on quit
 * - Linux: Validates APPIMAGE, then downloads and replaces the current file
 *
 * All platforms support download-progress events (electron-updater v6.8.0+).
 * quitAndInstall() handles restart natively — no external scripts.
 */

import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import { platform } from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { autoUpdateLog } from './logger'
import { getAppVersion } from '@craft-agent/shared/version'
import {
  getDismissedUpdateVersion,
  clearDismissedUpdateVersion,
} from '@craft-agent/shared/config'
import { RPC_CHANNELS, type UpdateInfo } from '../shared/types'
import type { EventSink } from '@craft-agent/server-core/transport'
import {
  UPDATE_FEED_URL,
  UPDATE_RELEASE_URL,
  getUpdateManifestUrl,
  getUpdatePlatformPolicy,
  isDownloadedUpdateEligible,
  isManifestVersionNewer,
  parseUpdaterCacheDirName,
  withManualRecovery,
  type UpdatePlatform,
  type UpdatePlatformPolicy,
} from './auto-update-policy'

// Platform detection
const PLATFORM = platform()
const IS_MAC = PLATFORM === 'darwin'
const IS_WINDOWS = PLATFORM === 'win32'

function getPlatformPolicy(): UpdatePlatformPolicy {
  return getUpdatePlatformPolicy(
    PLATFORM as UpdatePlatform,
    process.env.APPIMAGE,
    (candidate) => {
      if (!path.isAbsolute(candidate) || !fs.existsSync(candidate)) return false
      try {
        fs.accessSync(candidate, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK)
        return fs.statSync(candidate).isFile()
      } catch {
        return false
      }
    },
  )
}

const UPDATE_CACHE_MIGRATION_VERSION = '0.11.8'
const UPDATE_CACHE_MIGRATION_MARKER = `updater-cache-migrated-${UPDATE_CACHE_MIGRATION_VERSION}`

function getUpdaterBaseCacheDir(): string {
  if (IS_MAC) {
    return path.join(app.getPath('home'), 'Library', 'Caches')
  } else if (IS_WINDOWS) {
    const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local')
    return localAppData
  }
  return process.env.XDG_CACHE_HOME || path.join(app.getPath('home'), '.cache')
}

/** Resolve the exact cache name generated into packaged app-update.yml. */
function getUpdateCacheDir(): string | null {
  try {
    const config = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8')
    const cacheDirName = parseUpdaterCacheDirName(config)
    if (!cacheDirName) return null
    return path.join(getUpdaterBaseCacheDir(), cacheDirName, 'pending')
  } catch (error) {
    autoUpdateLog.warn('[auto-update] Could not resolve updater cache directory', error)
    return null
  }
}

async function clearPendingUpdateCache(reason: string): Promise<boolean> {
  try {
    // Prefer electron-updater's own helper when it has already been created.
    // @ts-expect-error - internal helper exposes the authoritative cache path.
    const helper = autoUpdater.downloadedUpdateHelper
    if (helper?.clear) {
      await helper.clear()
      autoUpdateLog.warn('[auto-update] Cleared pending update cache', { reason, source: 'updater-helper' })
      return true
    }

    const cacheDir = getUpdateCacheDir()
    if (!cacheDir) return false
    await fs.promises.rm(cacheDir, { recursive: true, force: true })
    autoUpdateLog.warn('[auto-update] Cleared pending update cache', { reason, cacheDir })
    return true
  } catch (error) {
    autoUpdateLog.error('[auto-update] Failed to clear pending update cache', { reason, error })
    return false
  }
}

async function migrateStaleUpdateCache(): Promise<void> {
  if (updateInfo.currentVersion !== UPDATE_CACHE_MIGRATION_VERSION) return
  const markerPath = path.join(app.getPath('userData'), UPDATE_CACHE_MIGRATION_MARKER)
  if (fs.existsSync(markerPath)) return

  if (await clearPendingUpdateCache('0.11.8 stale-cache migration')) {
    try {
      await fs.promises.writeFile(markerPath, new Date().toISOString(), 'utf8')
    } catch (error) {
      // Cache cleanup already succeeded. A marker failure should only cause a
      // harmless retry next launch, never block startup or update checks.
      autoUpdateLog.warn('[auto-update] Could not persist stale-cache migration marker', error)
    }
  }
}

// Module state — keeps track of update info for IPC queries
let updateInfo: UpdateInfo = {
  available: false,
  currentVersion: getAppVersion(),
  latestVersion: null,
  downloadState: 'idle',
  downloadProgress: 0,
  installMode: getPlatformPolicy().installMode,
  releaseUrl: UPDATE_RELEASE_URL,
}

let eventSink: EventSink | null = null

// Flag to indicate update is in progress — used to prevent force exit during quitAndInstall
let __isUpdating = false

// Hook fired immediately before quitAndInstall, while BrowserWindows still exist.
// electron-updater destroys windows between quitAndInstall and before-quit firing,
// so the regular before-quit save site would see an empty array.
let beforeUpdateQuitHook: (() => void) | null = null

/**
 * Register a callback to run inside installUpdate() before quitAndInstall.
 * Used by index.ts to snapshot multi-window state while windows are still alive.
 */
export function setBeforeUpdateQuitHook(fn: () => void): void {
  beforeUpdateQuitHook = fn
}

/**
 * Check if an update installation is in progress.
 * Used by main process to avoid force-quitting during update.
 */
export function isUpdating(): boolean {
  return __isUpdating
}

/**
 * Set the event sink for broadcasting update events to renderer windows
 */
export function setAutoUpdateEventSink(sink: EventSink): void {
  eventSink = sink
}

/**
 * Get current update info (called by IPC handler)
 */
export function getUpdateInfo(): UpdateInfo {
  return { ...updateInfo }
}

/**
 * Broadcast update info to all renderer windows.
 * Creates a snapshot to avoid race conditions during broadcast.
 */
function broadcastUpdateInfo(): void {
  if (!eventSink) return

  const snapshot = { ...updateInfo }
  eventSink(RPC_CHANNELS.update.AVAILABLE, { to: 'all' }, snapshot)
}

/**
 * Broadcast download progress to all renderer windows.
 */
function broadcastDownloadProgress(progress: number): void {
  if (!eventSink) return

  eventSink(RPC_CHANNELS.update.DOWNLOAD_PROGRESS, { to: 'all' }, progress)
}

// ─── Configure electron-updater ───────────────────────────────────────────────

// Release tags may be vX.Y.Z-local. The generic provider uses the plain SemVer
// in the selected YAML manifest, not the GitHub tag, for version comparison.
autoUpdater.channel = 'latest'
// Setting channel flips this to true inside electron-updater. Reset it after
// assigning the channel so a cached older installer can never be selected.
autoUpdater.allowDowngrade = false
autoUpdater.allowPrerelease = false

// macOS local builds are unsigned, and Linux can only replace a real AppImage.
// Those cases still check for updates but fall back to the GitHub Release.
autoUpdater.autoDownload = getPlatformPolicy().installMode === 'automatic'

// Never install merely because the user closed the app. Installation remains
// automatic after the explicit Restart/Install action calls quitAndInstall().
autoUpdater.autoInstallOnAppQuit = false

// Use the logger for electron-updater internal logging
autoUpdater.logger = {
  info: (msg: unknown) => autoUpdateLog.info('[electron-updater]', msg),
  warn: (msg: unknown) => autoUpdateLog.warn('[electron-updater]', msg),
  error: (msg: unknown) => autoUpdateLog.error('[electron-updater]', msg),
  debug: (msg: unknown) => autoUpdateLog.info('[electron-updater:debug]', msg),
}

// ─── Event handlers ───────────────────────────────────────────────────────────

autoUpdater.on('checking-for-update', () => {
  autoUpdateLog.info('[auto-update] Checking GitHub Release update feed', {
    feedUrl: UPDATE_FEED_URL,
    manifestUrl: getUpdateManifestUrl(PLATFORM as UpdatePlatform),
    installMode: getPlatformPolicy().installMode,
  })
})

autoUpdater.on('update-available', (info) => {
  const policy = getPlatformPolicy()
  autoUpdateLog.info(`Update available from YAML manifest: ${updateInfo.currentVersion} → ${info.version}`, {
    manifestUrl: getUpdateManifestUrl(PLATFORM as UpdatePlatform),
    installMode: policy.installMode,
    policyReason: policy.reason ?? null,
  })

  if (!isManifestVersionNewer(updateInfo.currentVersion, info.version)) {
    autoUpdateLog.warn('[auto-update] Ignoring update event with invalid or non-newer YAML version', {
      currentVersion: updateInfo.currentVersion,
      manifestVersion: info.version,
    })
    updateInfo = {
      ...updateInfo,
      available: false,
      latestVersion: null,
      downloadState: 'idle',
      downloadProgress: 0,
      error: undefined,
    }
    broadcastUpdateInfo()
    return
  }

  if (policy.installMode === 'manual') {
    updateInfo = {
      ...updateInfo,
      available: true,
      latestVersion: info.version,
      downloadState: 'manual',
      downloadProgress: 0,
      installMode: 'manual',
      releaseUrl: UPDATE_RELEASE_URL,
      error: undefined,
    }
    broadcastUpdateInfo()
    return
  }

  updateInfo = {
    ...updateInfo,
    available: true,
    latestVersion: info.version,
    downloadState: 'downloading',
    downloadProgress: 0,
    installMode: 'automatic',
    error: undefined,
  }
  broadcastUpdateInfo()
})

autoUpdater.on('update-not-available', (info) => {
  autoUpdateLog.info(`[auto-update] Already up to date (${info.version})`)

  updateInfo = {
    ...updateInfo,
    available: false,
    latestVersion: info.version,
    downloadState: 'idle',
    downloadProgress: 0,
    installMode: getPlatformPolicy().installMode,
    error: undefined,
  }
  broadcastUpdateInfo()
})

autoUpdater.on('download-progress', (progress) => {
  const percent = Math.round(progress.percent)
  updateInfo = { ...updateInfo, downloadProgress: percent }
  broadcastDownloadProgress(percent)
})

autoUpdater.on('update-downloaded', async (info) => {
  autoUpdateLog.info(`Update downloaded: v${info.version}`)

  if (!isDownloadedUpdateEligible(updateInfo.currentVersion, info.version, updateInfo.latestVersion)) {
    autoUpdateLog.error('[auto-update] Rejecting stale or unexpected downloaded installer', {
      currentVersion: updateInfo.currentVersion,
      downloadedVersion: info.version,
      expectedVersion: updateInfo.latestVersion,
    })
    await clearPendingUpdateCache('downloaded version is not the expected upgrade')
    updateInfo = {
      ...updateInfo,
      available: false,
      latestVersion: null,
      downloadState: 'idle',
      downloadProgress: 0,
      error: undefined,
    }
    broadcastUpdateInfo()
    return
  }

  // An unsigned macOS build may still have a stale cached download from an
  // older feed/configuration. Never turn that into an automatic install offer.
  const policy = getPlatformPolicy()
  if (policy.installMode === 'manual') {
    updateInfo = {
      ...updateInfo,
      available: true,
      latestVersion: info.version,
      downloadState: 'manual',
      downloadProgress: 100,
      installMode: 'manual',
      releaseUrl: UPDATE_RELEASE_URL,
      error: undefined,
    }
    broadcastUpdateInfo()
    return
  }

  updateInfo = {
    ...updateInfo,
    available: true,
    latestVersion: info.version,
    downloadState: 'ready',
    downloadProgress: 100,
    installMode: 'automatic',
    error: undefined,
  }
  broadcastUpdateInfo()

  // Rebuild menu to show "Install Update..." option
  const { rebuildMenu } = await import('./menu')
  rebuildMenu()
})

autoUpdater.on('error', (error) => {
  autoUpdateLog.error('electron-updater error', error)
  updateInfo = withManualRecovery(updateInfo, error)
  broadcastUpdateInfo()
})

// ─── Exported API ─────────────────────────────────────────────────────────────

/**
 * Options for checkForUpdates
 */
interface CheckOptions {
  /** If true, automatically start download when update is found (default: true) */
  autoDownload?: boolean
}

/**
 * Check for available updates.
 * Returns the current UpdateInfo state after check completes.
 *
 * @param options.autoDownload - If false, only checks without downloading (for manual "Check Now")
 */
export async function checkForUpdates(options: CheckOptions = {}): Promise<UpdateInfo> {
  const { autoDownload = true } = options
  const policy = getPlatformPolicy()
  const shouldAutoDownload = autoDownload && policy.installMode === 'automatic'

  // Temporarily override autoDownload for this check if needed
  // (e.g., manual check from settings shouldn't auto-download on metered connections)
  const previousAutoDownload = autoUpdater.autoDownload
  autoUpdater.autoDownload = shouldAutoDownload

  try {
    // Check for updates - this returns a promise that resolves with the check result
    await autoUpdater.checkForUpdates()
    // Give electron-updater's validated update-downloaded event time to settle.
    await new Promise(resolve => setTimeout(resolve, 500))
  } catch (error) {
    autoUpdateLog.error('Update check failed', error)
    updateInfo = withManualRecovery(updateInfo, error)
    broadcastUpdateInfo()
  } finally {
    // Restore previous autoDownload setting
    autoUpdater.autoDownload = previousAutoDownload
  }

  return getUpdateInfo()
}

/**
 * Install the downloaded update and restart the app.
 * Calls electron-updater's quitAndInstall which handles:
 * - macOS: Extracts zip and swaps app bundle
 * - Windows: Runs NSIS installer silently
 * - Linux: Replaces AppImage file
 * Then relaunches the app automatically.
 */
export async function installUpdate(): Promise<void> {
  if (updateInfo.downloadState !== 'ready') {
    throw new Error('No update ready to install')
  }

  if (!updateInfo.latestVersion || !isManifestVersionNewer(updateInfo.currentVersion, updateInfo.latestVersion)) {
    await clearPendingUpdateCache('install requested for a non-newer version')
    const error = new Error('The downloaded installer is not newer than the current version and was discarded.')
    updateInfo = {
      ...updateInfo,
      available: false,
      downloadState: 'idle',
      downloadProgress: 0,
      error: error.message,
    }
    broadcastUpdateInfo()
    throw error
  }

  const policy = getPlatformPolicy()
  if (policy.installMode !== 'automatic') {
    const error = new Error(
      policy.reason === 'unsigned-macos'
        ? 'This unsigned macOS build must be updated manually from GitHub Release.'
        : 'The current Linux process is not running from a valid APPIMAGE; update manually from GitHub Release.',
    )
    updateInfo = withManualRecovery(updateInfo, error)
    broadcastUpdateInfo()
    throw error
  }

  autoUpdateLog.info('Installing update and restarting...')

  updateInfo = { ...updateInfo, downloadState: 'installing' }
  broadcastUpdateInfo()

  // Clear dismissed version since user is explicitly updating
  clearDismissedUpdateVersion()

  // Set flag to prevent force exit from breaking electron-updater's shutdown sequence
  __isUpdating = true

  // Diagnostic correlation with before-quit's [update-flow] log. If these
  // window counts diverge, electron-updater is destroying windows between
  // here and before-quit firing — confirms the multi-window restore bug.
  autoUpdateLog.info('installUpdate pre-quit', {
    electronWindowCount: BrowserWindow.getAllWindows().length,
    downloadState: updateInfo.downloadState,
    latestVersion: updateInfo.latestVersion,
  })

  // Snapshot window state BEFORE quitAndInstall — electron-updater destroys
  // BrowserWindows between this call and before-quit firing, so the regular
  // before-quit save would clobber window-state.json with an empty array.
  try {
    beforeUpdateQuitHook?.()
  } catch (err) {
    autoUpdateLog.error('beforeUpdateQuit hook failed', err)
  }

  try {
    // isSilent=false shows the installer UI on Windows if needed (fallback)
    // isForceRunAfter=true ensures the app relaunches after install
    autoUpdater.quitAndInstall(false, true)
  } catch (error) {
    __isUpdating = false
    autoUpdateLog.error('quitAndInstall failed', error)
    updateInfo = withManualRecovery(updateInfo, error)
    broadcastUpdateInfo()
    throw error
  }
}

/**
 * Result of update check on launch
 */
export interface UpdateOnLaunchResult {
  action: 'none' | 'skipped' | 'ready' | 'downloading' | 'manual' | 'error'
  reason?: string
  version?: string | null
}

/**
 * Check for updates on app launch.
 * - Checks immediately (no delay)
 * - Respects dismissed version (skips notification but allows manual check)
 * - Auto-downloads if update available
 */
export async function checkForUpdatesOnLaunch(): Promise<UpdateOnLaunchResult> {
  autoUpdateLog.info('Checking for updates on launch...')

  await migrateStaleUpdateCache()

  const info = await checkForUpdates({ autoDownload: true })

  if (!info.available) {
    return info.downloadState === 'error'
      ? { action: 'error', reason: info.error }
      : { action: 'none' }
  }

  // Check if this version was dismissed by user
  const dismissedVersion = getDismissedUpdateVersion()
  if (dismissedVersion === info.latestVersion) {
    autoUpdateLog.info(`[auto-update] Update ${info.latestVersion} was dismissed, skipping notification`)
    return { action: 'skipped', reason: 'dismissed', version: info.latestVersion }
  }

  if (info.downloadState === 'ready') {
    return { action: 'ready', version: info.latestVersion }
  }

  if (info.downloadState === 'manual' || info.downloadState === 'error') {
    return { action: info.downloadState, reason: info.error, version: info.latestVersion }
  }

  // Download in progress — will notify when ready via update-downloaded event
  return { action: 'downloading', version: info.latestVersion }
}
