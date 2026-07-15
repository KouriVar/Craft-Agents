import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync, readJsonFileSync } from '../utils/files.ts';
import type {
  PluginToolPolicy,
  PluginToolPolicyAction,
  WorkspacePluginPolicyConfig,
} from './types.ts';

export const PLUGIN_POLICY_FILE = 'plugins/policies.json';

const ACTIONS = new Set<PluginToolPolicyAction>(['inherit', 'allow', 'ask', 'deny']);

function action(value: unknown): PluginToolPolicyAction {
  return typeof value === 'string' && ACTIONS.has(value as PluginToolPolicyAction)
    ? value as PluginToolPolicyAction
    : 'inherit';
}

function normalizePolicy(value: unknown): PluginToolPolicy {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawTools = record.tools && typeof record.tools === 'object' && !Array.isArray(record.tools)
    ? record.tools as Record<string, unknown>
    : {};
  return {
    defaultAction: action(record.defaultAction),
    tools: Object.fromEntries(Object.entries(rawTools).map(([name, value]) => [name, action(value)])),
  };
}

function normalizeConfig(value: unknown): WorkspacePluginPolicyConfig {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawPlugins = record.plugins && typeof record.plugins === 'object' && !Array.isArray(record.plugins)
    ? record.plugins as Record<string, unknown>
    : {};
  return {
    version: 1,
    plugins: Object.fromEntries(Object.entries(rawPlugins).map(([name, policy]) => [name, normalizePolicy(policy)])),
  };
}

export function loadPluginPolicies(workspaceRootPath: string): WorkspacePluginPolicyConfig {
  const path = join(workspaceRootPath, PLUGIN_POLICY_FILE);
  if (!existsSync(path)) return { version: 1, plugins: {} };
  try {
    return normalizeConfig(readJsonFileSync(path));
  } catch {
    return { version: 1, plugins: {} };
  }
}

export function savePluginPolicies(workspaceRootPath: string, config: WorkspacePluginPolicyConfig): void {
  mkdirSync(join(workspaceRootPath, 'plugins'), { recursive: true });
  atomicWriteFileSync(join(workspaceRootPath, PLUGIN_POLICY_FILE), JSON.stringify(normalizeConfig(config), null, 2));
}

export function setPluginToolPolicy(
  workspaceRootPath: string,
  pluginName: string,
  policy: Partial<PluginToolPolicy>,
): PluginToolPolicy {
  const config = loadPluginPolicies(workspaceRootPath);
  const current = config.plugins[pluginName] ?? { defaultAction: 'inherit', tools: {} };
  const next = normalizePolicy({
    defaultAction: policy.defaultAction ?? current.defaultAction,
    tools: policy.tools ?? current.tools,
  });
  config.plugins[pluginName] = next;
  savePluginPolicies(workspaceRootPath, config);
  return next;
}

export function resolvePluginToolPolicy(
  workspaceRootPath: string,
  pluginName: string,
  toolName: string,
): PluginToolPolicyAction {
  const policy = loadPluginPolicies(workspaceRootPath).plugins[pluginName];
  return policy?.tools[toolName] ?? policy?.defaultAction ?? 'inherit';
}
