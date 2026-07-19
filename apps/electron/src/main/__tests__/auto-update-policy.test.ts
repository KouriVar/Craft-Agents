import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'
import {
  UPDATE_FEED_URL,
  UPDATE_RELEASE_URL,
  getUpdateManifestName,
  getUpdateManifestUrl,
  getUpdatePlatformPolicy,
  isManifestVersionNewer,
  withManualRecovery,
} from '../auto-update-policy'

describe('local auto-update policy', () => {
  it('keeps the generic provider on the local GitHub latest/download feed', () => {
    const builderPath = join(import.meta.dir, '../../../electron-builder.yml')
    const config = load(readFileSync(builderPath, 'utf8')) as {
      publish?: { provider?: string; url?: string }
    }

    expect(config.publish).toEqual({
      provider: 'generic',
      url: UPDATE_FEED_URL,
    })
  })

  it('selects the electron-updater manifest for each platform', () => {
    expect(getUpdateManifestName('win32')).toBe('latest.yml')
    expect(getUpdateManifestName('darwin')).toBe('latest-mac.yml')
    expect(getUpdateManifestName('linux')).toBe('latest-linux.yml')
    expect(getUpdateManifestUrl('linux')).toBe(`${UPDATE_FEED_URL}/latest-linux.yml`)
  })

  it('compares the YAML version and does not depend on a GitHub tag', () => {
    const releaseTag = 'v0.11.7-local'
    expect(releaseTag).toEndWith('-local')
    expect(isManifestVersionNewer('0.11.6', '0.11.7')).toBe(true)
    expect(isManifestVersionNewer('0.11.7', '0.11.7')).toBe(false)
    expect(isManifestVersionNewer('0.11.8', '0.11.7')).toBe(false)
    expect(isManifestVersionNewer('0.11.6', 'not-semver')).toBe(false)
  })

  it('uses manual macOS updates while retaining Windows and valid AppImage automation', () => {
    const exists = (candidate: string) => candidate === '/opt/Craft-Agents.AppImage'
    expect(getUpdatePlatformPolicy('darwin', undefined, exists)).toEqual({
      installMode: 'manual',
      reason: 'unsigned-macos',
    })
    expect(getUpdatePlatformPolicy('win32', undefined, exists)).toEqual({ installMode: 'automatic' })
    expect(getUpdatePlatformPolicy('linux', '/opt/Craft-Agents.AppImage', exists)).toEqual({ installMode: 'automatic' })
    expect(getUpdatePlatformPolicy('linux', undefined, exists)).toEqual({
      installMode: 'manual',
      reason: 'missing-appimage',
    })
    expect(getUpdatePlatformPolicy('linux', '/missing.AppImage', exists)).toEqual({
      installMode: 'manual',
      reason: 'invalid-appimage',
    })
  })

  it('turns update failures into an explicit manual recovery state', () => {
    const recovered = withManualRecovery({
      available: true,
      currentVersion: '0.11.6',
      latestVersion: '0.11.7',
      downloadState: 'downloading',
      downloadProgress: 42,
      installMode: 'automatic',
    }, new Error('network interrupted'))

    expect(recovered.downloadState).toBe('error')
    expect(recovered.installMode).toBe('manual')
    expect(recovered.releaseUrl).toBe(UPDATE_RELEASE_URL)
    expect(recovered.error).toBe('network interrupted')
  })
})
