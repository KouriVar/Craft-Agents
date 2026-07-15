import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
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
  RPC_CHANNELS.plugins.DIAGNOSE_MCP,
  RPC_CHANNELS.plugins.INSTALL_GIT,
  RPC_CHANNELS.plugins.LIST_MARKETPLACE_SOURCES,
  RPC_CHANNELS.plugins.ADD_MARKETPLACE_SOURCE,
  RPC_CHANNELS.plugins.REMOVE_MARKETPLACE_SOURCE,
  RPC_CHANNELS.plugins.GET_MARKETPLACE_CATALOG,
  RPC_CHANNELS.plugins.INSTALL_MARKETPLACE_PLUGIN,
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
    const { parsePluginMarketplaceCatalog } = await import('@craft-agent/shared/plugins')
    const rootPath = await prepareMarketplaceRoot(workspaceRootPath, source, refresh)
    const catalogPath = findMarketplaceFile(rootPath, source.sparsePath)
    const parsed = JSON.parse(readFileSync(catalogPath, 'utf-8')) as unknown
    return { rootPath, catalog: parsePluginMarketplaceCatalog(source, parsed) }
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
    mkdirSync(resolve(workspaceRootPath, 'plugins'), { recursive: true })
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
    const [{ listPluginEntries }, { loadAllSkills }] = await Promise.all([
      import('@craft-agent/shared/plugins'),
      import('@craft-agent/shared/skills'),
    ])
    pushTyped(server, RPC_CHANNELS.plugins.CHANGED, { to: 'workspace', workspaceId }, workspaceId, listPluginEntries(workspaceRootPath))
    pushTyped(server, RPC_CHANNELS.skills.CHANGED, { to: 'workspace', workspaceId }, workspaceId, loadAllSkills(workspaceRootPath))
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
