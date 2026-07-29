import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { atomicWriteFileSync } from '../utils/files.ts'

export const V020_AUTOMATION_CONFIG_SCHEMA_VERSION = 1 as const

/** Adds the explicit v0.20 schema marker without changing matcher content. */
export function migrateAutomationConfigSchema(filePath: string): 'missing' | 'migrated' | 'current' {
  if (!existsSync(filePath)) return 'missing'
  let raw: unknown
  try { raw = JSON.parse(readFileSync(filePath, 'utf8')) }
  catch { throw new Error(`自动化配置已损坏，原文件已保留：${filePath}`) }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`自动化配置结构无效，原文件已保留：${filePath}`)
  const config = raw as { schemaVersion?: unknown; automations?: unknown }
  if (config.schemaVersion === V020_AUTOMATION_CONFIG_SCHEMA_VERSION) return 'current'
  if (config.schemaVersion !== undefined) throw new Error(`自动化配置数据版本 ${String(config.schemaVersion)} 不受当前应用支持，原文件已保留`)
  const backupPath = `${filePath}.pre-v020-schema-v0.bak`
  if (!existsSync(backupPath)) copyFileSync(filePath, backupPath)
  atomicWriteFileSync(filePath, `${JSON.stringify({ ...config, schemaVersion: V020_AUTOMATION_CONFIG_SCHEMA_VERSION }, null, 2)}\n`)
  return 'migrated'
}
