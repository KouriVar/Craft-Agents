/**
 * v0.20 migration preflight and backup baseline.
 *
 * This module deliberately has no startup side effects. Phase 0 establishes a
 * verified, versioned snapshot before later phases register destructive data
 * migrations. Credentials are never copied into a migration backup.
 */

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import { createHash } from 'crypto';
import { basename, join, relative, resolve } from 'path';
import { homedir } from 'os';
import type { Workspace } from '@craft-agent/core/types';
import { CONFIG_DIR } from '../config/paths.ts';

export const V020_BACKUP_FORMAT_VERSION = 'v0.20.0-pre-migration';
export const V020_BASELINE_STEP_ID = 'v0.20.0.phase-0.baseline';

const BACKUP_DIR_NAME = 'backups';
const BACKUP_MANIFEST_FILE = 'manifest.json';
const BASELINE_STATE_FILE = 'migration-state.json';

/** Sensitive data is managed by the credential backend and must be re-authorized. */
const EXCLUDED_FILE_NAMES = new Set([
  'credentials.enc',
  '.credential-cache.json',
]);

export interface LegacyTaskWorkspaceScan {
  workspaceId: string;
  location: 'local' | 'remote';
  status: 'scanned' | 'root_missing' | 'remote_preflight_required';
  taskCount: number;
  runCount: number;
}

export interface LegacyTaskScanReport {
  scannedAt: string;
  workspaces: LegacyTaskWorkspaceScan[];
  totalTaskCount: number;
  totalRunCount: number;
}

export interface V020BackupFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface V020WorkspaceBackup {
  workspaceId: string;
  sourcePath: string;
  backupPath: string;
  status: 'copied' | 'root_missing' | 'remote_not_backed_up';
}

export interface V020BackupManifest {
  formatVersion: typeof V020_BACKUP_FORMAT_VERSION;
  createdAt: string;
  appVersion: string;
  dataSchemaVersion: string;
  migrationStepId: typeof V020_BASELINE_STEP_ID;
  excludesCredentials: true;
  excludedFileNames: string[];
  configIncluded: boolean;
  workspaces: V020WorkspaceBackup[];
  files: V020BackupFile[];
}

export interface CreateV020BackupOptions {
  workspaces: Workspace[];
  appVersion: string;
  dataSchemaVersion: string;
  configDir?: string;
  backupRoot?: string;
  now?: Date;
}

export interface V020MigrationBaseline {
  backupPath: string;
  manifest: V020BackupManifest;
  taskScan: LegacyTaskScanReport;
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function isExcluded(sourcePath: string): boolean {
  return EXCLUDED_FILE_NAMES.has(basename(sourcePath));
}

/** Workspace config historically stores paths with `~`; filesystem APIs do not expand it. */
export function resolveWorkspaceDataPath(rootPath: string): string {
  if (rootPath === '~') return homedir();
  if (rootPath.startsWith('~/') || rootPath.startsWith('~\\')) {
    return join(homedir(), rootPath.slice(2));
  }
  return resolve(rootPath);
}

function copyDirectoryWithoutCredentials(sourcePath: string, destinationPath: string): void {
  mkdirSync(destinationPath, { recursive: true });
  for (const entry of readdirSync(sourcePath, { withFileTypes: true })) {
    const source = join(sourcePath, entry.name);
    const destination = join(destinationPath, entry.name);
    if (isExcluded(source)) continue;

    // Backups must not follow arbitrary symlinks outside a workspace.
    if (lstatSync(source).isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      copyDirectoryWithoutCredentials(source, destination);
    } else if (entry.isFile()) {
      cpSync(source, destination, { force: false, errorOnExist: true });
    }
  }
}

function listBackupFiles(root: string): V020BackupFile[] {
  const files: V020BackupFile[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name !== BACKUP_MANIFEST_FILE) {
        files.push({ path: relative(root, path), bytes: statSync(path).size, sha256: sha256(path) });
      }
    }
  };
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Scan the old Task storage without mutating it. Remote workspaces are reported
 * explicitly because Phase 0 must not silently claim data it cannot read.
 */
export function scanLegacyTaskData(workspaces: Workspace[], scannedAt = new Date()): LegacyTaskScanReport {
  const results = workspaces.map((workspace): LegacyTaskWorkspaceScan => {
    if (workspace.remoteServer) {
      return { workspaceId: workspace.id, location: 'remote', status: 'remote_preflight_required', taskCount: 0, runCount: 0 };
    }
    const workspaceRoot = resolveWorkspaceDataPath(workspace.rootPath);
    if (!existsSync(workspaceRoot)) {
      return { workspaceId: workspace.id, location: 'local', status: 'root_missing', taskCount: 0, runCount: 0 };
    }

    const tasksPath = join(workspaceRoot, 'tasks');
    let taskCount = 0;
    let runCount = 0;
    if (existsSync(tasksPath)) {
      for (const task of readdirSync(tasksPath, { withFileTypes: true })) {
        if (!task.isDirectory()) continue;
        const taskPath = join(tasksPath, task.name);
        if (existsSync(join(taskPath, 'task.yaml'))) taskCount += 1;
        const runsPath = join(taskPath, 'runs');
        if (existsSync(runsPath)) {
          runCount += readdirSync(runsPath, { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
        }
      }
    }
    return { workspaceId: workspace.id, location: 'local', status: 'scanned', taskCount, runCount };
  });

  return {
    scannedAt: scannedAt.toISOString(),
    workspaces: results,
    totalTaskCount: results.reduce((total, item) => total + item.taskCount, 0),
    totalRunCount: results.reduce((total, item) => total + item.runCount, 0),
  };
}

/** Creates a complete non-secret workspace snapshot and writes its manifest last. */
export function createV020Backup(options: CreateV020BackupOptions): { backupPath: string; manifest: V020BackupManifest } {
  const configDir = resolve(options.configDir ?? CONFIG_DIR);
  const backupRoot = resolve(options.backupRoot ?? join(configDir, BACKUP_DIR_NAME, 'v0.20.0'));
  const backupPath = join(backupRoot, stamp(options.now ?? new Date()));
  if (existsSync(backupPath)) throw new Error(`v0.20 backup already exists: ${backupPath}`);
  mkdirSync(backupPath, { recursive: true });

  const configPath = join(configDir, 'config.json');
  const configDestination = join(backupPath, 'config', 'config.json');
  if (existsSync(configPath)) {
    mkdirSync(join(backupPath, 'config'), { recursive: true });
    cpSync(configPath, configDestination, { force: false, errorOnExist: true });
  }

  const workspaces: V020WorkspaceBackup[] = options.workspaces.map(workspace => {
    const backupWorkspacePath = join(backupPath, 'workspaces', workspace.id);
    const sourcePath = resolveWorkspaceDataPath(workspace.rootPath);
    if (workspace.remoteServer) {
      return { workspaceId: workspace.id, sourcePath, backupPath: backupWorkspacePath, status: 'remote_not_backed_up' };
    }
    if (!existsSync(sourcePath)) {
      return { workspaceId: workspace.id, sourcePath, backupPath: backupWorkspacePath, status: 'root_missing' };
    }
    copyDirectoryWithoutCredentials(sourcePath, backupWorkspacePath);
    return { workspaceId: workspace.id, sourcePath, backupPath: backupWorkspacePath, status: 'copied' };
  });

  const manifest: V020BackupManifest = {
    formatVersion: V020_BACKUP_FORMAT_VERSION,
    createdAt: (options.now ?? new Date()).toISOString(),
    appVersion: options.appVersion,
    dataSchemaVersion: options.dataSchemaVersion,
    migrationStepId: V020_BASELINE_STEP_ID,
    excludesCredentials: true,
    excludedFileNames: [...EXCLUDED_FILE_NAMES].sort(),
    configIncluded: existsSync(configDestination),
    workspaces,
    files: listBackupFiles(backupPath),
  };
  writeFileSync(join(backupPath, BACKUP_MANIFEST_FILE), JSON.stringify(manifest, null, 2), 'utf-8');
  return { backupPath, manifest };
}

/** Verifies that every file listed in a backup manifest is still readable and unchanged. */
export function verifyV020Backup(backupPath: string): V020BackupManifest {
  const manifestPath = join(backupPath, BACKUP_MANIFEST_FILE);
  if (!existsSync(manifestPath)) throw new Error(`v0.20 backup manifest is missing: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as V020BackupManifest;
  if (manifest.formatVersion !== V020_BACKUP_FORMAT_VERSION) throw new Error('Unsupported v0.20 backup format');
  for (const file of manifest.files) {
    const filePath = join(backupPath, file.path);
    if (!existsSync(filePath) || statSync(filePath).size !== file.bytes || sha256(filePath) !== file.sha256) {
      throw new Error(`v0.20 backup verification failed: ${file.path}`);
    }
  }
  return manifest;
}

/**
 * Phase 0 entry point. It records the Task preflight next to a verified backup,
 * making later destructive migrations detectable and repeatable.
 */
export function establishV020MigrationBaseline(options: CreateV020BackupOptions): V020MigrationBaseline {
  const now = options.now ?? new Date();
  const taskScan = scanLegacyTaskData(options.workspaces, now);
  const { backupPath, manifest } = createV020Backup({ ...options, now });
  writeFileSync(join(backupPath, BASELINE_STATE_FILE), JSON.stringify({
    stepId: V020_BASELINE_STEP_ID,
    status: 'completed',
    completedAt: now.toISOString(),
    taskScan,
  }, null, 2), 'utf-8');
  // The state is part of the recovery evidence, so include it in the verified manifest.
  manifest.files = listBackupFiles(backupPath);
  writeFileSync(join(backupPath, BACKUP_MANIFEST_FILE), JSON.stringify(manifest, null, 2), 'utf-8');
  verifyV020Backup(backupPath);
  return { backupPath, manifest, taskScan };
}
