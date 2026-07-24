/**
 * Privacy storage paths under workspaceDataRoot.
 */

import { existsSync, mkdirSync } from 'fs'
import { join, resolve, sep } from 'path'

export const PRIVACY_DIR = 'privacy'
export const PRIVACY_POLICY_FILE = 'policy.json'
export const PRIVACY_ACCESS_LOG_FILE = 'access-log.jsonl'
export const PRIVACY_MODE_FILE = 'privacy-mode.json'

export function getPrivacyDir(workspaceDataRoot: string): string {
  const root = resolve(workspaceDataRoot)
  const dir = resolve(root, PRIVACY_DIR)
  if (dir !== root && !dir.startsWith(root + sep)) {
    throw new Error('Privacy path escapes workspaceDataRoot')
  }
  return dir
}

export function ensurePrivacyDir(workspaceDataRoot: string): string {
  const dir = getPrivacyDir(workspaceDataRoot)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getPrivacyPolicyPath(workspaceDataRoot: string): string {
  return join(getPrivacyDir(workspaceDataRoot), PRIVACY_POLICY_FILE)
}

export function getPrivacyAccessLogPath(workspaceDataRoot: string): string {
  return join(getPrivacyDir(workspaceDataRoot), PRIVACY_ACCESS_LOG_FILE)
}

export function getPrivacyModePath(workspaceDataRoot: string): string {
  return join(getPrivacyDir(workspaceDataRoot), PRIVACY_MODE_FILE)
}
