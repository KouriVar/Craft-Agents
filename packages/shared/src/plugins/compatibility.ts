import { existsSync, readdirSync } from 'node:fs';
import { basename, join, sep } from 'node:path';
import { readJsonFileSync } from '../utils/files.ts';
import type { CreateSourceInput } from '../sources/types.ts';
import type {
  LoadedPluginPackage,
  PluginCapabilityStatus,
  PluginCapabilitySummary,
  PluginCompatibilityLevel,
  PluginCompatibilityReport,
  PluginConnectorDefinition,
} from './types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeSlug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'plugin';
}

function countSkillFiles(rootPath: string): number {
  if (!existsSync(rootPath)) return 0;
  let count = 0;
  const visit = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name === 'SKILL.md') count += 1;
    }
  };
  visit(rootPath);
  return count;
}

function extractMcpServers(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  if (isRecord(value.mcpServers)) return value.mcpServers;
  if (isRecord(value.servers)) return value.servers;
  return {};
}

function readMcpServers(pluginPackage: LoadedPluginPackage): Record<string, unknown> {
  const servers: Record<string, unknown> = {
    ...extractMcpServers({ mcpServers: pluginPackage.manifest.mcpServers }),
  };
  for (const configPath of pluginPackage.mcpConfigPaths) {
    try {
      Object.assign(servers, extractMcpServers(readJsonFileSync(configPath)));
    } catch {
      // Malformed optional config is reported as unknown during installation.
    }
  }
  return servers;
}

const CONNECTOR_MAPPINGS: Record<string, Pick<PluginConnectorDefinition, 'nativeSourceProvider' | 'nativeSourceService'>> = {
  gmail: { nativeSourceProvider: 'google', nativeSourceService: 'gmail' },
  'google-calendar': { nativeSourceProvider: 'google', nativeSourceService: 'calendar' },
  'google-drive': { nativeSourceProvider: 'google', nativeSourceService: 'drive' },
  slack: { nativeSourceProvider: 'slack', nativeSourceService: 'full' },
  'outlook-email': { nativeSourceProvider: 'microsoft', nativeSourceService: 'outlook' },
  'outlook-calendar': { nativeSourceProvider: 'microsoft', nativeSourceService: 'microsoft-calendar' },
  teams: { nativeSourceProvider: 'microsoft', nativeSourceService: 'teams' },
  sharepoint: { nativeSourceProvider: 'microsoft', nativeSourceService: 'sharepoint' },
};

export function createNativeConnectorSourceInput(
  connector: PluginConnectorDefinition,
): CreateSourceInput | null {
  const provider = connector.nativeSourceProvider;
  const service = connector.nativeSourceService;
  if (!provider || !service) return null;

  if (provider === 'google') {
    const baseUrls: Record<string, string> = {
      gmail: 'https://gmail.googleapis.com/gmail/v1',
      calendar: 'https://www.googleapis.com/calendar/v3',
      drive: 'https://www.googleapis.com/drive/v3',
    };
    const baseUrl = baseUrls[service];
    if (!baseUrl) return null;
    return {
      name: connector.name,
      provider,
      type: 'api',
      enabled: true,
      api: {
        baseUrl,
        authType: 'oauth',
        googleService: service as 'gmail' | 'calendar' | 'drive',
      },
    };
  }

  if (provider === 'slack') {
    return {
      name: connector.name,
      provider,
      type: 'api',
      enabled: true,
      api: {
        baseUrl: 'https://slack.com/api',
        authType: 'oauth',
        slackService: 'full',
      },
    };
  }

  if (provider === 'microsoft') {
    return {
      name: connector.name,
      provider,
      type: 'api',
      enabled: true,
      api: {
        baseUrl: 'https://graph.microsoft.com/v1.0',
        authType: 'oauth',
        microsoftService: service as 'outlook' | 'microsoft-calendar' | 'teams' | 'sharepoint',
      },
    };
  }

  return null;
}

export function loadPluginConnectors(pluginPackage: LoadedPluginPackage): PluginConnectorDefinition[] {
  const connectors = new Map<string, PluginConnectorDefinition>();
  for (const configPath of pluginPackage.appConfigPaths) {
    try {
      const value = readJsonFileSync(configPath);
      if (!isRecord(value)) continue;
      const apps = isRecord(value.apps) ? value.apps : isRecord(value.app) ? value.app : {};
      for (const [name, raw] of Object.entries(apps)) {
        const config = isRecord(raw) ? raw : {};
        const key = name.trim().toLowerCase();
        const mapping = CONNECTOR_MAPPINGS[key];
        connectors.set(key, {
          name,
          id: stringValue(config.id),
          provider: stringValue(config.provider),
          ...mapping,
        });
      }
    } catch {
      // Ignore malformed optional app config and let the report remain partial.
    }
  }
  return [...connectors.values()];
}

function capability(
  kind: PluginCapabilitySummary['kind'],
  count: number,
  status: PluginCapabilityStatus,
  label: string,
  detail: string,
  usage?: string,
): PluginCapabilitySummary {
  return { kind, count, status, label, detail, usage };
}

function overallLevel(capabilities: PluginCapabilitySummary[]): PluginCompatibilityLevel {
  const active = capabilities.filter(item => item.count > 0);
  if (active.length === 0) return 'unsupported';
  const usable = active.some(item => item.status === 'available' || item.status === 'needs-auth' || item.status === 'native-alternative');
  const unsupported = active.some(item => item.status === 'unsupported');
  if (!usable) return unsupported ? 'unsupported' : 'unknown';
  if (unsupported) return 'partial';
  if (active.some(item => item.status === 'unknown')) return 'partial';
  if (active.some(item => item.status === 'needs-auth' || item.status === 'native-alternative')) return 'needs-auth';
  return 'ready';
}

export function assessPluginCompatibility(pluginPackage: LoadedPluginPackage): PluginCompatibilityReport {
  const skillCount = pluginPackage.skillDirs.reduce((total, path) => total + countSkillFiles(path), 0);
  const mcpServers = readMcpServers(pluginPackage);
  const mcpEntries = Object.entries(mcpServers);
  const oauthMcpCount = mcpEntries.filter(([, raw]) => {
    if (!isRecord(raw)) return false;
    const auth = stringValue(raw.auth)?.toLowerCase();
    return auth === 'oauth' || Boolean(stringValue(raw.oauth_resource) || stringValue(raw.oauthResource));
  }).length;
  const chatGptMcpCount = mcpEntries.filter(([, raw]) => {
    return isRecord(raw) && stringValue(raw.auth)?.toLowerCase() === 'chatgpt';
  }).length;
  const connectors = loadPluginConnectors(pluginPackage);
  const mcpNames = new Set(mcpEntries.map(([name]) => name.toLowerCase()));
  const mcpBackedConnectors = connectors.filter(item =>
    mcpEntries.length > 0
    && (mcpNames.has(item.name.toLowerCase()) || item.name.toLowerCase() === pluginPackage.manifest.name.toLowerCase())
  );
  const mappedConnectors = connectors.filter(item => !mcpBackedConnectors.includes(item) && item.nativeSourceProvider);
  const unmappedConnectors = connectors.filter(item => !mcpBackedConnectors.includes(item) && !item.nativeSourceProvider);
  const capabilities: PluginCapabilitySummary[] = [];
  const usage: string[] = [];
  const reasons: string[] = [];
  const authRequirements: PluginCompatibilityReport['authRequirements'] = [];

  if (skillCount > 0) {
    const instruction = `在对话框输入 @${pluginPackage.manifest.displayName ?? pluginPackage.manifest.interface?.displayName ?? pluginPackage.manifest.name} 调用插件工作流。`;
    capabilities.push(capability('skills', skillCount, 'available', '技能', `包含 ${skillCount} 个内部技能，由插件统一入口自动路由。`, instruction));
    usage.push(instruction);
  }

  if (mcpEntries.length > 0) {
    const supportedMcpCount = mcpEntries.length - chatGptMcpCount;
    const status: PluginCapabilityStatus = chatGptMcpCount === mcpEntries.length
      ? 'unsupported'
      : chatGptMcpCount > 0
        ? 'unknown'
        : oauthMcpCount > 0
          ? 'needs-auth'
          : 'available';
    const detail = chatGptMcpCount > 0
      ? `包含 ${chatGptMcpCount} 个仅支持 OpenAI ChatGPT 会话认证的 MCP；其余 ${supportedMcpCount} 个按标准 MCP 运行。`
      : oauthMcpCount > 0
      ? `包含 ${mcpEntries.length} 个 MCP 服务，其中 ${oauthMcpCount} 个需要登录对应服务；第三方宿主能否登录取决于服务商的 OAuth 策略。`
      : `包含 ${mcpEntries.length} 个可直接连接的 MCP 服务。`;
    const instruction = oauthMcpCount > 0
      ? '安装后在插件详情中完成 MCP 登录；若服务商仅允许审核宿主，技能仍可用，但 MCP 工具需要服务商批准 CA。'
      : '安装启用后，MCP 工具会自动加入会话。';
    capabilities.push(capability('mcp', mcpEntries.length, status, 'MCP 工具', detail, instruction));
    usage.push(instruction);
    const pluginSlug = safeSlug(pluginPackage.manifest.name);
    for (const [serverName, raw] of mcpEntries) {
      if (!isRecord(raw)) continue;
      const declaredAuth = stringValue(raw.auth)?.toLowerCase();
      const oauthResource = stringValue(raw.oauth_resource) ?? stringValue(raw.oauthResource);
      const serverSlug = safeSlug(serverName);
      const runtimeSlug = mcpEntries.length === 1 && serverSlug === pluginSlug
        ? pluginSlug
        : `${pluginSlug}_${serverSlug}`;
      if (declaredAuth === 'oauth' || oauthResource) {
        authRequirements.push({
          kind: 'mcp-oauth',
          name: serverName,
          sourceSlug: `plugin-mcp-${runtimeSlug}`,
          supported: true,
        });
      } else if (declaredAuth === 'chatgpt') {
        authRequirements.push({
          kind: 'openai-connector',
          name: serverName,
          supported: false,
        });
        reasons.push(`${serverName} 依赖 OpenAI ChatGPT 会话认证，CA 不会复用模型登录令牌。`);
      }
    }
  }

  if (connectors.length > 0) {
    if (mappedConnectors.length > 0) {
      capabilities.push(capability(
        'connectors',
        mappedConnectors.length,
        'native-alternative',
        '应用连接器',
        `${mappedConnectors.length} 个 OpenAI Connector 可映射到 CA 原生数据源授权。`,
        '安装后连接对应的 CA 数据源账号。',
      ));
      usage.push('在插件详情中连接对应的 CA 原生数据源账号。');
      for (const connector of mappedConnectors) {
        authRequirements.push({
          kind: 'native-source',
          name: connector.name,
          provider: connector.nativeSourceProvider,
          service: connector.nativeSourceService,
          supported: true,
        });
      }
    }
    if (unmappedConnectors.length > 0) {
      capabilities.push(capability(
        'connectors',
        unmappedConnectors.length,
        'unsupported',
        '专有连接器',
        `${unmappedConnectors.length} 个 Connector 依赖 OpenAI 托管能力，CA 暂无等价实现。`,
      ));
      reasons.push(`无法直接使用 OpenAI Connector：${unmappedConnectors.map(item => item.name).join(', ')}`);
      for (const connector of unmappedConnectors) {
        authRequirements.push({
          kind: 'openai-connector',
          name: connector.name,
          supported: false,
        });
      }
    }
  }

  const widgetDirs = pluginPackage.widgetAssetDirs.filter(path =>
    basename(path) === 'widgets' || path.includes(`${sep}.scatter${sep}`)
  );
  if (widgetDirs.length > 0 && mcpEntries.length > 0) {
    capabilities.push(capability('widgets', widgetDirs.length, 'available', '交互组件', '包含可由 MCP 工具返回的 Widget 资源。'));
  }
  if (pluginPackage.hookDirs.length > 0) {
    capabilities.push(capability('hooks', pluginPackage.hookDirs.length, 'unknown', '生命周期 Hooks', '检测到 Hooks；具体事件兼容性将在安装后校验。'));
    reasons.push('Hooks 事件需要按 CA 支持列表逐项验证。');
  }

  const level = overallLevel(capabilities);
  const summary = level === 'ready'
    ? '可直接使用'
    : level === 'needs-auth'
      ? '安装后需要授权或连接数据源'
      : level === 'partial'
        ? '部分能力可用'
        : level === 'unsupported'
          ? '当前无法在 CA 中运行'
          : '需要安装后进一步检测';

  if (capabilities.length === 0) {
    reasons.push(`插件 ${basename(pluginPackage.rootPath)} 没有 CA 可识别的技能、MCP、Connector、Widget 或 Hook。`);
  }

  return { level, summary, capabilities, connectors, authRequirements, reasons, usage: [...new Set(usage)] };
}
