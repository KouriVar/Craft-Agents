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

export interface PluginInterface {
  displayName?: string;
  shortDescription?: string;
  longDescription?: string;
  developerName?: string;
  category?: string;
  brandColor?: string;
  brandColorDark?: string;
  composerIcon?: string;
  logo?: string;
  logoDark?: string;
}

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
  interface?: PluginInterface;
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
  hookDirs: string[];
  /** Resolved package-provided composer icon or logo. */
  iconPath?: string;
}

export type PluginCompatibilityLevel =
  | 'ready'
  | 'needs-auth'
  | 'partial'
  | 'unsupported'
  | 'unknown';

export type PluginCapabilityKind = 'skills' | 'mcp' | 'connectors' | 'widgets' | 'hooks';

export type PluginCapabilityStatus =
  | 'available'
  | 'needs-auth'
  | 'native-alternative'
  | 'unsupported'
  | 'unknown';

export interface PluginCapabilitySummary {
  kind: PluginCapabilityKind;
  count: number;
  status: PluginCapabilityStatus;
  label: string;
  detail: string;
  usage?: string;
}

export interface PluginConnectorDefinition {
  name: string;
  id?: string;
  provider?: string;
  nativeSourceProvider?: 'google' | 'microsoft' | 'slack' | 'github';
  nativeSourceService?: string;
}

export interface PluginAuthRequirement {
  kind: 'mcp-oauth' | 'native-source' | 'openai-connector';
  name: string;
  sourceSlug?: string;
  provider?: string;
  service?: string;
  supported: boolean;
}

export interface PluginCompatibilityReport {
  level: PluginCompatibilityLevel;
  summary: string;
  capabilities: PluginCapabilitySummary[];
  connectors: PluginConnectorDefinition[];
  authRequirements: PluginAuthRequirement[];
  reasons: string[];
  usage: string[];
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
  iconPath?: string;
  brandColor?: string;
  source?: 'local' | 'git' | 'unknown';
  sourceUrl?: string;
  gitRef?: string;
  updatedAt: number;
  compatibility?: PluginCompatibilityReport;
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
  transport: 'stdio' | 'http';
  state: PluginMcpDiagnosticState;
  checkedAt: number;
  durationMs: number;
  tools?: string[];
  error?: string;
  errorType?: 'failed' | 'needs-auth' | 'invalid-schema' | 'missing-dependency' | 'host-not-approved' | 'unknown';
  missingDependencies?: string[];
}

export interface PluginMcpStatusFile {
  version: 1;
  checkedAt: number;
  servers: Record<string, PluginMcpServerDiagnostic>;
}

export type PluginAuthState =
  | 'not-connected'
  | 'connected'
  | 'expired'
  | 'configuration-required'
  | 'host-not-approved'
  | 'unsupported';

export interface PluginAuthStatus {
  kind: PluginAuthRequirement['kind'];
  name: string;
  sourceSlug?: string;
  state: PluginAuthState;
  error?: string;
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
  /** Resolved from the package manifest when the marketplace item is inspected. */
  version?: string;
  displayName?: string;
  description?: string;
  category?: string;
  installation?: string;
  authentication?: string;
  packageSource: PluginMarketplacePackageSource;
  compatibility: 'compatible' | 'unknown' | 'unsupported';
  compatibilityReason?: string;
  compatibilityReport?: PluginCompatibilityReport;
  iconPath?: string;
  brandColor?: string;
}

export interface PluginMarketplaceCatalog {
  source: PluginMarketplaceSource;
  displayName: string;
  plugins: PluginMarketplaceEntry[];
  refreshedAt: number;
}
