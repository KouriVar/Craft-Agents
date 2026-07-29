export {
  V020_BACKUP_FORMAT_VERSION,
  V020_BASELINE_STEP_ID,
  createV020Backup,
  establishV020MigrationBaseline,
  scanLegacyTaskData,
  verifyV020Backup,
} from './v020-baseline.ts';

export type {
  CreateV020BackupOptions,
  LegacyTaskScanReport,
  LegacyTaskWorkspaceScan,
  V020BackupFile,
  V020BackupManifest,
  V020MigrationBaseline,
  V020WorkspaceBackup,
} from './v020-baseline.ts';
export { V020_KNOWLEDGE_MIGRATION_ID, migrateLibraryToKnowledge } from './v020-knowledge.ts';
export { V020_AUTOMATION_CONFIG_SCHEMA_VERSION, migrateAutomationConfigSchema } from './v020-automation-config.ts';
