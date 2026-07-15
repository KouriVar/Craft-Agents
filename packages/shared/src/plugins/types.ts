export type PluginManifestFormat = 'craft' | 'codex' | 'claude';

export interface PluginAuthor {
  name?: string;
  email?: string;
  url?: string;
}

export interface PluginDependency {
  name: string;
  marketplace?: string;
}

export type PluginDependencyEntry = string | PluginDependency;

export interface PluginManifest {
  name: string;
  displayName?: string;
  version?: string;
  description?: string;
  author?: string | PluginAuthor;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  defaultEnabled?: boolean;
  dependencies?: PluginDependencyEntry[];
  skills?: string | string[];
  mcpServers?: unknown;
}

export interface LoadedPluginPackage {
  rootPath: string;
  manifestPath: string;
  manifestFormat: PluginManifestFormat;
  manifest: PluginManifest;
  skillDirs: string[];
  mcpConfigPaths: string[];
  appConfigPaths: string[];
  widgetAssetDirs: string[];
}

export interface WorkspacePluginEntry {
  name: string;
  enabled: boolean;
  installPath?: string;
  manifestPath?: string;
  manifestFormat?: PluginManifestFormat;
  version?: string;
  displayName?: string;
  description?: string;
  source?: 'local' | 'git' | 'unknown';
  sourceUrl?: string;
  gitRef?: string;
  updatedAt: number;
}

export interface WorkspacePluginConfig {
  version: 1;
  plugins: Record<string, WorkspacePluginEntry>;
}

export type PluginToolPolicyAction = 'inherit' | 'allow' | 'ask' | 'deny';

export interface PluginToolPolicy {
  defaultAction: PluginToolPolicyAction;
  tools: Record<string, PluginToolPolicyAction>;
}

export interface WorkspacePluginPolicyConfig {
  version: 1;
  plugins: Record<string, PluginToolPolicy>;
}

export type PluginMcpDiagnosticState = 'ready' | 'error' | 'missing-dependency';

export interface PluginMcpServerDiagnostic {
  slug: string;
  pluginName: string;
  serverName: string;
  transport: 'stdio' | 'http' | 'sse';
  state: PluginMcpDiagnosticState;
  checkedAt: number;
  durationMs: number;
  tools?: string[];
  error?: string;
  errorType?: 'failed' | 'needs-auth' | 'invalid-schema' | 'missing-dependency' | 'unknown';
  missingDependencies?: string[];
}

export interface PluginMcpStatusFile {
  version: 1;
  checkedAt: number;
  servers: Record<string, PluginMcpServerDiagnostic>;
}

export interface PluginMarketplaceSource {
  id: string;
  name: string;
  source: string;
  ref?: string;
  sparsePath?: string;
  builtin?: boolean;
}

export interface PluginMarketplaceConfig {
  version: 1;
  sources: PluginMarketplaceSource[];
}

export type PluginMarketplacePackageSource =
  | { source: 'local'; path: string }
  | { source: 'url'; url: string; ref?: string }
  | { source: 'git-subdir'; url: string; path: string; ref?: string }
  | { source: 'npm'; package: string; version?: string };

export interface PluginMarketplaceEntry {
  marketplaceId: string;
  name: string;
  displayName?: string;
  description?: string;
  category?: string;
  installation?: string;
  authentication?: string;
  packageSource: PluginMarketplacePackageSource;
  compatibility: 'compatible' | 'unknown' | 'unsupported';
  compatibilityReason?: string;
}

export interface PluginMarketplaceCatalog {
  source: PluginMarketplaceSource;
  displayName: string;
  plugins: PluginMarketplaceEntry[];
  refreshedAt: number;
}
