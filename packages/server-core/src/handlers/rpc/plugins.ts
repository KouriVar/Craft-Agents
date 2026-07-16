import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import { pushTyped, type RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'

const execFileAsync = promisify(execFile)

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.plugins.LIST,
  RPC_CHANNELS.plugins.GET_POLICIES,
  RPC_CHANNELS.plugins.SET_POLICY,
  RPC_CHANNELS.plugins.GET_MCP_STATUS,
  RPC_CHANNELS.plugins.GET_AUTH_STATUS,
  RPC_CHANNELS.plugins.DIAGNOSE_MCP,
  RPC_CHANNELS.plugins.INSTALL_GIT,
  RPC_CHANNELS.plugins.LIST_MARKETPLACE_SOURCES,
  RPC_CHANNELS.plugins.ADD_MARKETPLACE_SOURCE,
  RPC_CHANNELS.plugins.REMOVE_MARKETPLACE_SOURCE,
  RPC_CHANNELS.plugins.GET_MARKETPLACE_CATALOG,
  RPC_CHANNELS.plugins.INSTALL_MARKETPLACE_PLUGIN,
  RPC_CHANNELS.plugins.CONNECT_NATIVE_SOURCE,
  RPC_CHANNELS.plugins.REGISTER_LOCAL,
  RPC_CHANNELS.plugins.SET_ENABLED,
  RPC_CHANNELS.plugins.UNREGISTER,
  RPC_CHANNELS.plugins.REMOVE_MANAGED,
] as const

export function registerPluginsHandlers(server: RpcServer, deps: HandlerDeps): void {
  const log = deps.platform.logger

  function managedPluginDir(workspaceRootPath: string, pluginName: string): string {
    const safeName = pluginName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'plugin'
    return resolve(workspaceRootPath, 'plugins', 'installed', safeName)
  }

  function normalizeGitSource(source: string): string {
    const value = source.trim()
    return /^[\w.-]+\/[\w.-]+$/.test(value) ? `https://github.com/${value}.git` : value
  }

  function assertPathInside(rootPath: string, candidatePath: string): string {
    const root = resolve(rootPath)
    const candidate = resolve(rootPath, candidatePath)
    const resolvedRoot = existsSync(root) ? realpathSync(root) : root
    const resolvedCandidate = existsSync(candidate) ? realpathSync(candidate) : candidate
    const relation = relative(resolvedRoot, resolvedCandidate)
    if (relation.startsWith('..') || relation.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
      throw new Error('Marketplace plugin path escapes its repository')
    }
    return candidate
  }

  function findMarketplaceFile(rootPath: string, sparsePath?: string): string {
    const candidates = [
      join(rootPath, '.agents', 'plugins', 'marketplace.json'),
      join(rootPath, '.claude-plugin', 'marketplace.json'),
    ]
    if (sparsePath) {
      const sparseRoot = assertPathInside(rootPath, sparsePath)
      candidates.unshift(
        join(sparseRoot, '.agents', 'plugins', 'marketplace.json'),
        join(sparseRoot, '.claude-plugin', 'marketplace.json'),
        join(sparseRoot, 'marketplace.json'),
      )
    }
    const found = candidates.find(path => existsSync(path))
    if (!found) throw new Error('No .agents/plugins/marketplace.json found in this source')
    return found
  }

  async function prepareMarketplaceRoot(
    workspaceRootPath: string,
    source: import('@craft-agent/shared/plugins').PluginMarketplaceSource,
    refresh = false,
  ): Promise<string> {
    const normalizedSource = normalizeGitSource(source.source)
    if (existsSync(normalizedSource) && statSync(normalizedSource).isDirectory()) return resolve(normalizedSource)

    const cacheRoot = resolve(workspaceRootPath, 'plugins', '.marketplaces', source.id)
    if (refresh) rmSync(cacheRoot, { recursive: true, force: true })
    if (existsSync(join(cacheRoot, '.git'))) return cacheRoot

    rmSync(cacheRoot, { recursive: true, force: true })
    mkdirSync(resolve(cacheRoot, '..'), { recursive: true })
    const args = ['clone', '--depth', '1', '--filter=blob:none', '--sparse']
    if (source.ref) args.push('--branch', source.ref)
    args.push(normalizedSource, cacheRoot)
    await execFileAsync('git', args, {
      cwd: workspaceRootPath,
      timeout: 180_000,
      maxBuffer: 1024 * 1024 * 8,
    })
    const sparsePaths = ['.agents/plugins', '.claude-plugin']
    if (source.sparsePath) sparsePaths.push(source.sparsePath)
    await execFileAsync('git', ['-C', cacheRoot, 'sparse-checkout', 'set', '--skip-checks', ...sparsePaths], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 8,
    })
    return cacheRoot
  }

  async function loadMarketplaceCatalog(
    workspaceRootPath: string,
    source: import('@craft-agent/shared/plugins').PluginMarketplaceSource,
    refresh = false,
  ) {
    const { assessPluginCompatibility, loadPluginPackage, parsePluginMarketplaceCatalog } = await import('@craft-agent/shared/plugins')
    const rootPath = await prepareMarketplaceRoot(workspaceRootPath, source, refresh)
    const catalogPath = findMarketplaceFile(rootPath, source.sparsePath)
    const parsed = JSON.parse(readFileSync(catalogPath, 'utf-8')) as unknown
    const catalog = parsePluginMarketplaceCatalog(source, parsed)
    const localPaths = catalog.plugins
      .filter(plugin => plugin.packageSource.source === 'local')
      .map(plugin => plugin.packageSource.source === 'local' ? plugin.packageSource.path : '')
      .filter(Boolean)

    if (localPaths.length > 0 && existsSync(join(rootPath, '.git'))) {
      const missingPaths = localPaths.filter(path => !existsSync(assertPathInside(rootPath, path)))
      if (missingPaths.length > 0) {
        await execFileAsync('git', ['-C', rootPath, 'sparse-checkout', 'add', '--skip-checks', ...missingPaths], {
          timeout: 120_000,
          maxBuffer: 1024 * 1024 * 8,
        })
      }
    }

    for (const plugin of catalog.plugins) {
      if (plugin.packageSource.source !== 'local') continue
      const packageRoot = assertPathInside(rootPath, plugin.packageSource.path)
      const pluginPackage = loadPluginPackage(packageRoot)
      if (!pluginPackage) continue
      const report = assessPluginCompatibility(pluginPackage)
      plugin.displayName = plugin.displayName
        ?? pluginPackage.manifest.displayName
        ?? pluginPackage.manifest.interface?.displayName
      plugin.description = plugin.description
        ?? pluginPackage.manifest.description
        ?? pluginPackage.manifest.interface?.shortDescription
      plugin.compatibilityReport = report
      plugin.compatibility = report.level === 'unsupported' ? 'unsupported' : 'compatible'
      plugin.compatibilityReason = report.reasons[0] ?? report.summary
      plugin.iconPath = pluginPackage.iconPath
      plugin.brandColor = pluginPackage.manifest.interface?.brandColor
    }
    return { rootPath, catalog }
  }

  async function installPreparedPackage(
    workspaceId: string,
    workspaceRootPath: string,
    packageRootPath: string,
    metadata: { sourceUrl: string; gitRef?: string; enabled?: boolean },
  ) {
    const { loadPluginPackage, registerPluginPackage } = await import('@craft-agent/shared/plugins')
    const pluginPackage = loadPluginPackage(packageRootPath)
    if (!pluginPackage) throw new Error(`No supported plugin manifest found at ${packageRootPath}`)

    const finalRoot = managedPluginDir(workspaceRootPath, pluginPackage.manifest.name)
    const stagingRoot = resolve(workspaceRootPath, 'plugins', `.installing-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(dirname(finalRoot), { recursive: true })
    rmSync(stagingRoot, { recursive: true, force: true })
    cpSync(packageRootPath, stagingRoot, { recursive: true, filter: path => basename(path) !== '.git' })
    rmSync(finalRoot, { recursive: true, force: true })
    renameSync(stagingRoot, finalRoot)

    const installedPackage = loadPluginPackage(finalRoot)
    if (!installedPackage) throw new Error(`Installed plugin manifest disappeared: ${pluginPackage.manifest.name}`)
    const entry = registerPluginPackage(workspaceRootPath, installedPackage, {
      enabled: metadata.enabled,
      source: 'git',
      sourceUrl: metadata.sourceUrl,
      gitRef: metadata.gitRef,
    })
    await broadcastChanged(workspaceId, workspaceRootPath)
    return entry
  }

  async function broadcastChanged(workspaceId: string, workspaceRootPath: string): Promise<void> {
    const [{ listPluginEntries }, { invalidateSkillsCache, loadAllSkills }] = await Promise.all([
      import('@craft-agent/shared/plugins'),
      import('@craft-agent/shared/skills'),
    ])
    invalidateSkillsCache()
    pushTyped(server, RPC_CHANNELS.plugins.CHANGED, { to: 'workspace', workspaceId }, workspaceId, listPluginEntries(workspaceRootPath))
    pushTyped(server, RPC_CHANNELS.skills.CHANGED, { to: 'workspace', workspaceId }, workspaceId, loadAllSkills(workspaceRootPath))
    try {
      await deps.sessionManager.refreshPluginRuntime?.(workspaceRootPath)
    } catch (error) {
      log.warn(`Plugin runtime hot refresh failed for workspace ${workspaceId}: ${String(error)}`)
    }
  }

  server.handle(RPC_CHANNELS.plugins.LIST, async (_ctx, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      log.error(`PLUGINS_LIST: Workspace not found: ${workspaceId}`)
      return []
    }

    const { listPluginEntries } = await import('@craft-agent/shared/plugins')
    return listPluginEntries(workspace.rootPath)
  })

  server.handle(RPC_CHANNELS.plugins.GET_POLICIES, async (_ctx, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { loadPluginPolicies } = await import('@craft-agent/shared/plugins')
    return loadPluginPolicies(workspace.rootPath)
  })

  server.handle(RPC_CHANNELS.plugins.SET_POLICY, async (
    _ctx,
    workspaceId: string,
    pluginName: string,
    policy: Partial<import('@craft-agent/shared/plugins').PluginToolPolicy>,
  ) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { setPluginToolPolicy } = await import('@craft-agent/shared/plugins')
    return setPluginToolPolicy(workspace.rootPath, pluginName, policy)
  })

  server.handle(RPC_CHANNELS.plugins.GET_MCP_STATUS, async (_ctx, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)

    const { loadPluginMcpStatus } = await import('@craft-agent/shared/plugins')
    return loadPluginMcpStatus(workspace.rootPath)
  })

  server.handle(RPC_CHANNELS.plugins.GET_AUTH_STATUS, async (
    _ctx,
    workspaceId: string,
    pluginName: string,
  ) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)

    const {
      assessPluginCompatibility,
      createNativeConnectorSourceInput,
      findPluginMcpAuthSource,
      loadPluginConnectors,
      loadPluginMcpStatus,
      loadPluginPackage,
      listPluginEntries,
    } = await import('@craft-agent/shared/plugins')
    const { getCredentialManager } = await import('@craft-agent/shared/credentials')
    const { getSourceCredentialManager, loadWorkspaceSources } = await import('@craft-agent/shared/sources')
    const entry = listPluginEntries(workspace.rootPath).find(item => item.name === pluginName)
    if (!entry?.installPath) throw new Error(`Plugin not found: ${pluginName}`)
    const pluginPackage = loadPluginPackage(entry.installPath)
    if (!pluginPackage) throw new Error(`Plugin package is unavailable: ${pluginName}`)

    const report = assessPluginCompatibility(pluginPackage)
    const diagnostics = loadPluginMcpStatus(workspace.rootPath)
    const sources = loadWorkspaceSources(workspace.rootPath)
    const sourceCredentialManager = getSourceCredentialManager()
    const googleApp = await getCredentialManager().get({ type: 'oauth_app', name: 'google' })
    const connectors = loadPluginConnectors(pluginPackage)
    const statuses: import('@craft-agent/shared/plugins').PluginAuthStatus[] = []

    for (const requirement of report.authRequirements) {
      if (!requirement.supported || requirement.kind === 'openai-connector') {
        statuses.push({ kind: requirement.kind, name: requirement.name, state: 'unsupported' })
        continue
      }

      if (requirement.kind === 'mcp-oauth' && requirement.sourceSlug) {
        const source = findPluginMcpAuthSource(workspace.rootPath, requirement.sourceSlug)
        const credential = source ? await sourceCredentialManager.load(source) : null
        if (credential) {
          statuses.push({
            kind: requirement.kind,
            name: requirement.name,
            sourceSlug: requirement.sourceSlug,
            state: sourceCredentialManager.isExpired(credential) ? 'expired' : 'connected',
          })
          continue
        }

        const diagnostic = Object.values(diagnostics.servers)
          .find(item => item.pluginName === pluginName && item.serverName === requirement.name)
        statuses.push({
          kind: requirement.kind,
          name: requirement.name,
          sourceSlug: requirement.sourceSlug,
          state: diagnostic?.errorType === 'host-not-approved' ? 'host-not-approved' : 'not-connected',
          error: diagnostic?.errorType === 'host-not-approved' ? diagnostic.error : undefined,
        })
        continue
      }

      const connector = connectors.find(item => item.name === requirement.name)
      const input = connector ? createNativeConnectorSourceInput(connector) : null
      const existing = input ? sources.find(source => {
        if (source.config.provider !== input.provider || source.config.type !== input.type) return false
        if (input.provider === 'google') return source.config.api?.googleService === input.api?.googleService
        if (input.provider === 'slack') return source.config.api?.slackService === input.api?.slackService
        if (input.provider === 'microsoft') return source.config.api?.microsoftService === input.api?.microsoftService
        return false
      }) : null

      if (!existing) {
        statuses.push({
          kind: requirement.kind,
          name: requirement.name,
          state: requirement.provider === 'google' && (!googleApp?.clientId || !googleApp.value)
            ? 'configuration-required'
            : 'not-connected',
        })
        continue
      }

      const credential = await sourceCredentialManager.load(existing)
      const canAuthorize = requirement.provider !== 'google'
        || Boolean(
          (googleApp?.clientId && googleApp.value)
          || (credential?.clientId && credential.clientSecret)
        )
      const state = credential && existing.config.isAuthenticated
        ? sourceCredentialManager.isExpired(credential) ? 'expired' : 'connected'
        : !canAuthorize
          ? 'configuration-required'
          : existing.config.connectionStatus === 'needs_auth' ? 'expired' : 'not-connected'
      statuses.push({
        kind: requirement.kind,
        name: requirement.name,
        sourceSlug: existing.config.slug,
        state,
        error: existing.config.connectionError,
      })
    }

    return statuses
  })

  server.handle(RPC_CHANNELS.plugins.DIAGNOSE_MCP, async (
    _ctx,
    workspaceId: string,
    options?: { timeout?: number },
  ) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)

    const timeout = typeof options?.timeout === 'number'
      ? Math.min(120_000, Math.max(2_000, options.timeout))
      : undefined
    const { diagnosePluginMcpServers } = await import('@craft-agent/shared/plugins')
    const status = await diagnosePluginMcpServers(workspace.rootPath, { timeout })
    log.info(`Diagnosed ${Object.keys(status.servers).length} plugin MCP server(s)`)
    return status
  })

  server.handle(RPC_CHANNELS.plugins.INSTALL_GIT, async (
    _ctx,
    workspaceId: string,
    gitUrl: string,
    options?: { ref?: string; enabled?: boolean },
  ) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    if (typeof gitUrl !== 'string' || !gitUrl.trim()) throw new Error('Git URL is required')

    const { loadPluginPackage, registerPluginPackage } = await import('@craft-agent/shared/plugins')
    const installedRoot = resolve(workspace.rootPath, 'plugins', 'installed')
    const tempRoot = resolve(workspace.rootPath, 'plugins', `.installing-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(installedRoot, { recursive: true })

    try {
      const cloneArgs = ['clone', '--depth', '1']
      const gitRef = typeof options?.ref === 'string' && options.ref.trim() ? options.ref.trim() : undefined
      if (gitRef) cloneArgs.push('--branch', gitRef)
      cloneArgs.push(normalizeGitSource(gitUrl), tempRoot)

      await execFileAsync('git', cloneArgs, {
        cwd: workspace.rootPath,
        timeout: 120_000,
        maxBuffer: 1024 * 1024 * 8,
      })

      const clonedPackage = loadPluginPackage(tempRoot)
      if (!clonedPackage) {
        throw new Error(`No supported plugin manifest found in cloned repository: ${gitUrl}`)
      }

      const finalRoot = managedPluginDir(workspace.rootPath, clonedPackage.manifest.name)
      rmSync(finalRoot, { recursive: true, force: true })
      renameSync(tempRoot, finalRoot)

      const installedPackage = loadPluginPackage(finalRoot)
      if (!installedPackage) {
        throw new Error(`Installed plugin manifest disappeared after moving package: ${clonedPackage.manifest.name}`)
      }

      const entry = registerPluginPackage(workspace.rootPath, installedPackage, {
        enabled: options?.enabled,
        source: 'git',
        sourceUrl: gitUrl.trim(),
        gitRef,
      })
      await broadcastChanged(workspaceId, workspace.rootPath)
      log.info(`Installed git plugin package: ${entry.name}`)
      return entry
    } catch (error) {
      rmSync(tempRoot, { recursive: true, force: true })
      throw error
    }
  })

  server.handle(RPC_CHANNELS.plugins.LIST_MARKETPLACE_SOURCES, async (_ctx, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { loadPluginMarketplaceSources } = await import('@craft-agent/shared/plugins')
    return loadPluginMarketplaceSources(workspace.rootPath)
  })

  server.handle(RPC_CHANNELS.plugins.ADD_MARKETPLACE_SOURCE, async (
    _ctx,
    workspaceId: string,
    input: { name?: string; source: string; ref?: string; sparsePath?: string },
  ) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    if (!input?.source?.trim()) throw new Error('Marketplace source is required')
    const { loadPluginMarketplaceSources, marketplaceSourceId, savePluginMarketplaceSources } = await import('@craft-agent/shared/plugins')
    const sourceValue = input.source.trim()
    const source = {
      id: marketplaceSourceId(sourceValue),
      name: input.name?.trim() || sourceValue.replace(/\.git$/, '').split('/').pop() || 'Marketplace',
      source: sourceValue,
      ref: input.ref?.trim() || undefined,
      sparsePath: input.sparsePath?.trim() || undefined,
    }
    await loadMarketplaceCatalog(workspace.rootPath, source, true)
    const sources = loadPluginMarketplaceSources(workspace.rootPath)
    savePluginMarketplaceSources(workspace.rootPath, [...sources.filter(item => item.id !== source.id), source])
    return source
  })

  server.handle(RPC_CHANNELS.plugins.REMOVE_MARKETPLACE_SOURCE, async (_ctx, workspaceId: string, sourceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { loadPluginMarketplaceSources, savePluginMarketplaceSources } = await import('@craft-agent/shared/plugins')
    const sources = loadPluginMarketplaceSources(workspace.rootPath)
    const source = sources.find(item => item.id === sourceId)
    if (!source || source.builtin) throw new Error('Built-in marketplace sources cannot be removed')
    savePluginMarketplaceSources(workspace.rootPath, sources.filter(item => item.id !== sourceId))
    rmSync(resolve(workspace.rootPath, 'plugins', '.marketplaces', sourceId), { recursive: true, force: true })
  })

  server.handle(RPC_CHANNELS.plugins.GET_MARKETPLACE_CATALOG, async (
    _ctx,
    workspaceId: string,
    sourceId: string,
    options?: { refresh?: boolean },
  ) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { loadPluginMarketplaceSources } = await import('@craft-agent/shared/plugins')
    const source = loadPluginMarketplaceSources(workspace.rootPath).find(item => item.id === sourceId)
    if (!source) throw new Error(`Marketplace source not found: ${sourceId}`)
    return (await loadMarketplaceCatalog(workspace.rootPath, source, options?.refresh)).catalog
  })

  server.handle(RPC_CHANNELS.plugins.INSTALL_MARKETPLACE_PLUGIN, async (
    _ctx,
    workspaceId: string,
    marketplaceId: string,
    pluginName: string,
    options?: { enabled?: boolean },
  ) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { loadPluginMarketplaceSources } = await import('@craft-agent/shared/plugins')
    const marketplace = loadPluginMarketplaceSources(workspace.rootPath).find(item => item.id === marketplaceId)
    if (!marketplace) throw new Error(`Marketplace source not found: ${marketplaceId}`)
    const { rootPath, catalog } = await loadMarketplaceCatalog(workspace.rootPath, marketplace)
    const plugin = catalog.plugins.find(item => item.name === pluginName)
    if (!plugin) throw new Error(`Marketplace plugin not found: ${pluginName}`)
    if (plugin.packageSource.source === 'npm') throw new Error('NPM marketplace plugins are not supported yet')

    let packageRootPath: string
    let sourceUrl = marketplace.source
    let gitRef = marketplace.ref
    let checkoutRoot: string | undefined
    if (plugin.packageSource.source === 'local') {
      packageRootPath = assertPathInside(rootPath, plugin.packageSource.path)
      if (!existsSync(packageRootPath) && existsSync(join(rootPath, '.git'))) {
        await execFileAsync('git', ['-C', rootPath, 'sparse-checkout', 'add', '--skip-checks', plugin.packageSource.path], {
          timeout: 120_000,
          maxBuffer: 1024 * 1024 * 8,
        })
        packageRootPath = assertPathInside(rootPath, plugin.packageSource.path)
      }
    } else {
      sourceUrl = plugin.packageSource.url
      gitRef = plugin.packageSource.ref
      checkoutRoot = resolve(workspace.rootPath, 'plugins', `.marketplace-checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`)
      const args = ['clone', '--depth', '1']
      if (gitRef) args.push('--branch', gitRef)
      args.push(normalizeGitSource(sourceUrl), checkoutRoot)
      await execFileAsync('git', args, { cwd: workspace.rootPath, timeout: 180_000, maxBuffer: 1024 * 1024 * 8 })
      packageRootPath = plugin.packageSource.source === 'git-subdir'
        ? assertPathInside(checkoutRoot, plugin.packageSource.path)
        : checkoutRoot
    }

    try {
      const entry = await installPreparedPackage(workspaceId, workspace.rootPath, packageRootPath, {
        sourceUrl,
        gitRef,
        enabled: options?.enabled,
      })
      log.info(`Installed marketplace plugin package: ${entry.name}`)
      return entry
    } finally {
      if (checkoutRoot) rmSync(checkoutRoot, { recursive: true, force: true })
    }
  })

  server.handle(RPC_CHANNELS.plugins.CONNECT_NATIVE_SOURCE, async (
    _ctx,
    workspaceId: string,
    pluginName: string,
    connectorName: string,
  ) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const {
      createNativeConnectorSourceInput,
      loadPluginPackage,
      loadPluginConnectors,
      listPluginEntries,
    } = await import('@craft-agent/shared/plugins')
    const { createSource, loadWorkspaceSources, saveSourceGuide } = await import('@craft-agent/shared/sources')
    const entry = listPluginEntries(workspace.rootPath).find(item => item.name === pluginName)
    if (!entry?.installPath) throw new Error(`Plugin not found: ${pluginName}`)
    const pluginPackage = loadPluginPackage(entry.installPath)
    if (!pluginPackage) throw new Error(`Plugin package is unavailable: ${pluginName}`)
    const connector = loadPluginConnectors(pluginPackage).find(item => item.name === connectorName)
    if (!connector) throw new Error(`Connector not found: ${connectorName}`)
    const input = createNativeConnectorSourceInput(connector)
    if (!input) throw new Error(`No CA native source mapping is available for ${connectorName}`)

    const existing = loadWorkspaceSources(workspace.rootPath).find(source => {
      if (source.config.provider !== input.provider || source.config.type !== input.type) return false
      if (input.provider === 'google') return source.config.api?.googleService === input.api?.googleService
      if (input.provider === 'slack') return source.config.api?.slackService === input.api?.slackService
      if (input.provider === 'microsoft') return source.config.api?.microsoftService === input.api?.microsoftService
      return false
    })
    if (existing) return { sourceSlug: existing.config.slug, created: false }

    const created = await createSource(workspace.rootPath, input)
    const serviceNotes = input.provider === 'google' && input.api?.googleService === 'gmail'
      ? `Use Gmail REST endpoints under users/me. Search messages with GET /users/me/messages and the q query parameter; read messages or threads by ID; use drafts and labels endpoints for write workflows.`
      : input.provider === 'google' && input.api?.googleService === 'calendar'
        ? `Use Calendar REST endpoints such as /calendars/primary/events. Prefer bounded timeMin/timeMax queries and confirm before creating, updating, or deleting events.`
        : input.provider === 'google' && input.api?.googleService === 'drive'
          ? `Use Drive REST endpoints under /files. Prefer fields and pageSize filters, and confirm before moving, sharing, or deleting files.`
          : input.provider === 'slack'
            ? `Use Slack Web API method paths such as /conversations.list, /conversations.history, /conversations.replies, /chat.postMessage, and /search.messages. Confirm before sending or modifying messages.`
            : input.provider === 'microsoft'
              ? `Use Microsoft Graph v1.0 endpoints for the configured service. Prefer /me-scoped endpoints and confirm before sending mail, changing calendars, posting messages, or modifying files.`
              : `Use the service REST API through the generated authenticated API tool.`
    saveSourceGuide(workspace.rootPath, created.slug, {
      raw: `# ${created.name}

## Guidelines

This source is managed as a CA-native compatibility adapter for the ${pluginName} plugin.
Use the \`api_${created.slug}\` tool for account-backed operations when bundled plugin skills mention OpenAI Connector tool names.
Authentication is handled automatically. Read the official service API semantics before unfamiliar write operations.

${serviceNotes}

## Context

Plugin: ${pluginName}
Connector: ${connectorName}
Provider: ${input.provider}
`,
    })
    const { loadWorkspaceConfig, saveWorkspaceConfig } = await import('@craft-agent/shared/workspaces')
    const workspaceConfig = loadWorkspaceConfig(workspace.rootPath)
    if (workspaceConfig) {
      const enabled = new Set(workspaceConfig.defaults?.enabledSourceSlugs ?? [])
      enabled.add(created.slug)
      workspaceConfig.defaults = {
        ...workspaceConfig.defaults,
        enabledSourceSlugs: [...enabled],
      }
      saveWorkspaceConfig(workspace.rootPath, workspaceConfig)
    }
    pushTyped(
      server,
      RPC_CHANNELS.sources.CHANGED,
      { to: 'workspace', workspaceId },
      workspaceId,
      loadWorkspaceSources(workspace.rootPath),
    )
    return { sourceSlug: created.slug, created: true }
  })

  server.handle(RPC_CHANNELS.plugins.REGISTER_LOCAL, async (
    _ctx,
    workspaceId: string,
    pluginRootPath: string,
    options?: { enabled?: boolean },
  ) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    if (!existsSync(pluginRootPath)) throw new Error(`Plugin path not found: ${pluginRootPath}`)

    const { loadPluginPackage, registerPluginPackage } = await import('@craft-agent/shared/plugins')
    const pluginPackage = loadPluginPackage(pluginRootPath)
    if (!pluginPackage) {
      throw new Error(`No supported plugin manifest found at ${pluginRootPath}`)
    }

    const entry = registerPluginPackage(workspace.rootPath, pluginPackage, {
      enabled: options?.enabled,
      source: 'local',
    })
    await broadcastChanged(workspaceId, workspace.rootPath)
    log.info(`Registered local plugin package: ${entry.name}`)
    return entry
  })

  server.handle(RPC_CHANNELS.plugins.SET_ENABLED, async (_ctx, workspaceId: string, pluginName: string, enabled: boolean) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)

    const { setPluginEnabled } = await import('@craft-agent/shared/plugins')
    const entry = setPluginEnabled(workspace.rootPath, pluginName, enabled)
    await broadcastChanged(workspaceId, workspace.rootPath)
    log.info(`${enabled ? 'Enabled' : 'Disabled'} plugin: ${pluginName}`)
    return entry
  })

  server.handle(RPC_CHANNELS.plugins.UNREGISTER, async (_ctx, workspaceId: string, pluginName: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)

    const { unregisterPlugin } = await import('@craft-agent/shared/plugins')
    const entry = unregisterPlugin(workspace.rootPath, pluginName)
    await broadcastChanged(workspaceId, workspace.rootPath)
    log.info(`Unregistered plugin: ${pluginName}`)
    return entry
  })

  server.handle(RPC_CHANNELS.plugins.REMOVE_MANAGED, async (_ctx, workspaceId: string, pluginName: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)

    const { removeManagedPlugin } = await import('@craft-agent/shared/plugins')
    const entry = removeManagedPlugin(workspace.rootPath, pluginName)
    await broadcastChanged(workspaceId, workspace.rootPath)
    log.info(`Removed managed plugin: ${pluginName}`)
    return entry
  })
}
