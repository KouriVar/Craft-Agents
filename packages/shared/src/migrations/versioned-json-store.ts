import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { atomicWriteFileSync } from '../utils/files.ts'

export class VersionedStoreError extends Error {
  constructor(
    message: string,
    readonly code: 'corrupt' | 'unknown-version' | 'invalid-shape' | 'migration-failed',
    readonly filePath: string,
  ) {
    super(message)
    this.name = 'VersionedStoreError'
  }
}

export interface VersionedStoreOptions<T extends { schemaVersion: number }> {
  filePath: string
  displayName: string
  currentVersion: number
  empty: () => T
  validate: (value: unknown) => value is T
  migrateLegacy?: (value: unknown) => T | null
  migrate?: (value: unknown, fromVersion: number) => T | null
}

function backupBeforeMigration(filePath: string, fromVersion: number): string {
  const backupPath = `${filePath}.pre-v020-schema-v${fromVersion}.bak`
  if (!existsSync(backupPath)) copyFileSync(filePath, backupPath)
  return backupPath
}

/**
 * Reads a versioned JSON store without ever converting corrupt or future data
 * into an empty store. Legacy conversion is backed up first and is idempotent.
 */
export function readVersionedStore<T extends { schemaVersion: number }>(options: VersionedStoreOptions<T>): T {
  if (!existsSync(options.filePath)) return options.empty()

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(options.filePath, 'utf8'))
  } catch {
    throw new VersionedStoreError(
      `${options.displayName}数据已损坏，原文件已保留：${options.filePath}`,
      'corrupt',
      options.filePath,
    )
  }

  const candidate = raw as { schemaVersion?: unknown }
  if (typeof candidate.schemaVersion !== 'number') {
    const migrated = options.migrateLegacy?.(raw) ?? null
    if (!migrated) {
      throw new VersionedStoreError(
        `${options.displayName}缺少可识别的数据版本，原文件已保留：${options.filePath}`,
        'unknown-version',
        options.filePath,
      )
    }
    backupBeforeMigration(options.filePath, 0)
    try {
      writeVersionedStore(options.filePath, migrated)
      return migrated
    } catch (error) {
      throw new VersionedStoreError(
        `${options.displayName}迁移失败，已保留迁移前备份：${error instanceof Error ? error.message : String(error)}`,
        'migration-failed',
        options.filePath,
      )
    }
  }

  if (candidate.schemaVersion > options.currentVersion || candidate.schemaVersion < 1) {
    throw new VersionedStoreError(
      `${options.displayName}数据版本 ${String(candidate.schemaVersion)} 不受当前应用支持，原文件已保留`,
      'unknown-version',
      options.filePath,
    )
  }
  if (candidate.schemaVersion !== options.currentVersion) {
    const migrated = options.migrate?.(raw, candidate.schemaVersion) ?? null
    if (!migrated) {
      throw new VersionedStoreError(
        `${options.displayName}缺少从版本 ${String(candidate.schemaVersion)} 到 ${options.currentVersion} 的迁移步骤`,
        'unknown-version',
        options.filePath,
      )
    }
    backupBeforeMigration(options.filePath, candidate.schemaVersion)
    try {
      writeVersionedStore(options.filePath, migrated)
      return migrated
    } catch (error) {
      throw new VersionedStoreError(
        `${options.displayName}迁移失败，已保留迁移前备份：${error instanceof Error ? error.message : String(error)}`,
        'migration-failed',
        options.filePath,
      )
    }
  }
  if (!options.validate(raw)) {
    throw new VersionedStoreError(
      `${options.displayName}数据结构无效，原文件已保留：${options.filePath}`,
      'invalid-shape',
      options.filePath,
    )
  }
  return raw
}

export function writeVersionedStore<T extends { schemaVersion: number }>(filePath: string, value: T): void {
  mkdirSync(dirname(filePath), { recursive: true })
  atomicWriteFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
