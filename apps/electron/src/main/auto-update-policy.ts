import semver from 'semver'
import type { UpdateInfo } from '../shared/types'

export const UPDATE_FEED_URL = 'https://github.com/KouriVar/Craft-Agents/releases/latest/download'
export const UPDATE_RELEASE_URL = 'https://github.com/KouriVar/Craft-Agents/releases/latest'

export type UpdatePlatform = 'darwin' | 'win32' | 'linux'
export type UpdateInstallMode = 'automatic' | 'manual'

export interface UpdatePlatformPolicy {
  installMode: UpdateInstallMode
  reason?: 'unsigned-macos' | 'missing-appimage' | 'invalid-appimage'
}

export function getUpdateManifestName(platform: UpdatePlatform): string {
  if (platform === 'darwin') return 'latest-mac.yml'
  if (platform === 'linux') return 'latest-linux.yml'
  return 'latest.yml'
}

export function getUpdateManifestUrl(platform: UpdatePlatform): string {
  return `${UPDATE_FEED_URL}/${getUpdateManifestName(platform)}`
}

/**
 * Release tags are intentionally not inputs here. The generic provider reads
 * the version from the selected YAML manifest and compares that value with the
 * installed application version.
 */
export function isManifestVersionNewer(currentVersion: string, manifestVersion: string): boolean {
  const current = semver.valid(currentVersion)
  const candidate = semver.valid(manifestVersion)
  return Boolean(current && candidate && semver.gt(candidate, current))
}

export function getUpdatePlatformPolicy(
  platform: UpdatePlatform,
  appImagePath: string | undefined,
  appImageExists: (path: string) => boolean,
): UpdatePlatformPolicy {
  if (platform === 'darwin') {
    return { installMode: 'manual', reason: 'unsigned-macos' }
  }
  if (platform === 'linux') {
    if (!appImagePath?.trim()) return { installMode: 'manual', reason: 'missing-appimage' }
    if (!appImageExists(appImagePath)) return { installMode: 'manual', reason: 'invalid-appimage' }
  }
  return { installMode: 'automatic' }
}

export function withManualRecovery(info: UpdateInfo, error: unknown): UpdateInfo {
  return {
    ...info,
    installMode: 'manual',
    releaseUrl: UPDATE_RELEASE_URL,
    downloadState: 'error',
    error: error instanceof Error ? error.message : String(error || 'Update failed'),
  }
}
