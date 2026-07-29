import * as React from 'react'
import { AlertTriangle, CheckCircle2, CircleHelp, ExternalLink, FolderOpen, KeyRound, Link2, LogOut, RefreshCw, RotateCcw, Settings2, Trash2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type {
  PluginMcpServerDiagnostic,
  PluginAuthStatus,
  PluginToolPolicy,
  PluginToolPolicyAction,
  WorkspacePluginEntry,
  WorkspacePluginPolicyConfig,
} from '@craft-agent/shared/plugins'
import { routes } from '../../../shared/routes'
import { navigate } from '@/lib/navigate'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { PluginAvatar } from '@/components/ui/plugin-avatar'

const POLICY_ACTIONS: PluginToolPolicyAction[] = ['inherit', 'allow', 'ask', 'deny']

function PolicySelect({ value, label, onChange, disabled }: {
  value: PluginToolPolicyAction
  label: string
  onChange: (value: PluginToolPolicyAction) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Select value={value} onValueChange={value => onChange(value as PluginToolPolicyAction)} disabled={disabled}>
      <SelectTrigger className="h-8 w-[120px] px-2 text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {POLICY_ACTIONS.map(action => (
          <SelectItem key={action} value={action}>
            {t(`settings.plugins.policy.${action}`, { defaultValue: action })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ServerRow({ server }: { server: PluginMcpServerDiagnostic }) {
  const healthy = server.state === 'ready'
  return (
    <div className="flex items-start gap-3 border-t border-border/50 py-3 first:border-t-0">
      {healthy
        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">{server.serverName}</span>
          <span className="text-xs text-muted-foreground">{server.transport}</span>
          {healthy && <span className="text-xs text-muted-foreground">{server.tools?.length ?? 0} tools</span>}
        </div>
        {!healthy && (
          <p className="mt-1 break-words text-xs leading-5 text-destructive/90">
            {server.error || server.missingDependencies?.join(', ') || 'MCP server is unavailable.'}
          </p>
        )}
      </div>
    </div>
  )
}

function CompatibilityIcon({ level }: { level?: string }) {
  if (level === 'ready') return <CheckCircle2 className="h-4 w-4 text-success" />
  if (level === 'needs-auth') return <KeyRound className="h-4 w-4 text-warning" />
  if (level === 'partial') return <AlertTriangle className="h-4 w-4 text-warning" />
  if (level === 'unsupported') return <XCircle className="h-4 w-4 text-destructive" />
  return <CircleHelp className="h-4 w-4 text-muted-foreground" />
}

interface PluginInfoPageProps {
  workspaceId: string
  pluginName: string
}

export function PluginInfoPage({ workspaceId, pluginName }: PluginInfoPageProps) {
  const { t } = useTranslation()
  const [plugin, setPlugin] = React.useState<WorkspacePluginEntry | null>(null)
  const [servers, setServers] = React.useState<PluginMcpServerDiagnostic[]>([])
  const [authStatuses, setAuthStatuses] = React.useState<PluginAuthStatus[]>([])
  const [policies, setPolicies] = React.useState<WorkspacePluginPolicyConfig>({ version: 1, plugins: {} })
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [diagnosing, setDiagnosing] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [updateOpen, setUpdateOpen] = React.useState(false)
  const [updatePreview, setUpdatePreview] = React.useState<Awaited<ReturnType<typeof window.electronAPI.previewPluginUpdate>>>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [entries, status, nextPolicies, nextAuthStatuses] = await Promise.all([
        window.electronAPI.listPlugins(workspaceId),
        window.electronAPI.getPluginMcpStatus(workspaceId),
        window.electronAPI.getPluginPolicies(workspaceId),
        window.electronAPI.getPluginAuthStatus(workspaceId, pluginName),
      ])
      setPlugin(entries.find(entry => entry.name === pluginName) ?? null)
      setServers(Object.values(status.servers).filter(server => server.pluginName === pluginName))
      setPolicies(nextPolicies)
      setAuthStatuses(nextAuthStatuses)
    } catch (error) {
      toast.error(t('plugins.loadFailed', { defaultValue: 'Plugin details could not be loaded' }), {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }, [pluginName, t, workspaceId])

  React.useEffect(() => { void load() }, [load])
  React.useEffect(() => window.electronAPI.onPluginsChanged((changedWorkspaceId, entries) => {
    if (changedWorkspaceId !== workspaceId) return
    setPlugin(entries.find(entry => entry.name === pluginName) ?? null)
  }), [pluginName, workspaceId])

  const setEnabled = async (enabled: boolean) => {
    if (!plugin || busy) return
    const previous = plugin
    setPlugin({ ...plugin, enabled })
    setBusy(true)
    try {
      setPlugin(await window.electronAPI.setPluginEnabled(workspaceId, plugin.name, enabled))
    } catch (error) {
      setPlugin(previous)
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const diagnose = async () => {
    if (diagnosing) return
    setDiagnosing(true)
    try {
      const status = await window.electronAPI.diagnosePluginMcp(workspaceId)
      setServers(Object.values(status.servers).filter(server => server.pluginName === pluginName))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setDiagnosing(false)
    }
  }

  const setPolicy = async (patch: Partial<PluginToolPolicy>) => {
    if (busy) return
    setBusy(true)
    try {
      const updated = await window.electronAPI.setPluginPolicy(workspaceId, pluginName, patch)
      setPolicies(current => ({ ...current, plugins: { ...current.plugins, [pluginName]: updated } }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const removePlugin = async () => {
    if (!plugin || busy) return
    setBusy(true)
    try {
      if (plugin.source === 'git') {
        await window.electronAPI.removeManagedPlugin(workspaceId, plugin.name)
      } else {
        await window.electronAPI.unregisterPlugin(workspaceId, plugin.name)
      }
      setDeleteOpen(false)
      navigate(routes.view.plugins())
      toast.success(t('plugins.removed', { defaultValue: 'Plugin removed' }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const checkForUpdate = async () => {
    if (!plugin || busy) return
    setBusy(true)
    try {
      const preview = await window.electronAPI.previewPluginUpdate(workspaceId, plugin.name)
      if (!preview) { toast.message('未在已配置市场中找到可更新的安装包'); return }
      setUpdatePreview(preview)
      if (!preview.hasUpdate) { toast.success('当前已是最新版本'); return }
      setUpdateOpen(true)
    } catch (error) {
      toast.error('检查插件更新失败', { description: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false) }
  }

  const updatePlugin = async () => {
    if (!plugin || !updatePreview || busy) return
    setBusy(true)
    try {
      await window.electronAPI.installMarketplacePlugin(workspaceId, updatePreview.marketplaceId, updatePreview.pluginName, { enabled: plugin.enabled })
      setUpdateOpen(false)
      await load()
      await diagnose()
      toast.success('插件包已检查并更新')
    } catch (error) {
      toast.error('插件包更新失败', { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const authenticateRequirement = async (
    requirement: NonNullable<WorkspacePluginEntry['compatibility']>['authRequirements'][number],
  ) => {
    if (!plugin || busy || !requirement.supported) return
    setBusy(true)
    try {
      let sourceSlug = requirement.sourceSlug
      if (requirement.kind === 'native-source') {
        const connected = await window.electronAPI.connectPluginNativeSource(
          workspaceId,
          plugin.name,
          requirement.name,
        )
        sourceSlug = connected.sourceSlug
      }
      if (!sourceSlug) throw new Error('No authentication source is available for this capability.')
      const result = await window.electronAPI.performOAuth({ sourceSlug })
      if (!result.success) throw new Error(result.error || 'Authentication failed')
      toast.success(t('plugins.authSuccess', { defaultValue: 'Account connected' }))
      await diagnose()
      await load()
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error)
      const description = rawMessage.includes('Google OAuth not configured')
        ? t('plugins.googleOAuthSetupRequired', {
            defaultValue: 'This connector needs a Google OAuth app configured for Craft Agent. Add a Google client ID and client secret before connecting the account.',
          })
        : rawMessage.includes('only allows approved OAuth host applications')
          ? t('plugins.oauthHostNotApproved', {
              defaultValue: 'This service only authorizes approved host applications. The plugin skills still work, but its MCP tools require the provider to approve Craft Agent.',
            })
          : rawMessage
      toast.error(t('plugins.authFailed', { defaultValue: 'Account could not be connected' }), {
        description,
      })
      try {
        setAuthStatuses(await window.electronAPI.getPluginAuthStatus(workspaceId, pluginName))
      } catch {
        // Keep the previous state if status refresh also fails.
      }
    } finally {
      setBusy(false)
    }
  }

  const disconnectRequirement = async (status: PluginAuthStatus) => {
    if (!status.sourceSlug || busy) return
    setBusy(true)
    try {
      await window.electronAPI.oauthRevoke(status.sourceSlug)
      toast.success(t('plugins.disconnected', { defaultValue: 'Account disconnected' }))
      await load()
      await diagnose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('common.loading')}</div>
  }

  if (!plugin) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('plugins.notFound', { defaultValue: 'Plugin not found' })}</div>
  }

  const policy = policies.plugins[plugin.name] ?? { defaultAction: 'inherit' as const, tools: {} }
  const toolNames = [...new Set(servers.flatMap(server => server.tools ?? []))].sort()
  const displayName = plugin.displayName || plugin.name

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={displayName}
        badge={plugin.version ? <span className="text-xs text-muted-foreground">v{plugin.version}</span> : undefined}
        actions={<div className="flex gap-2">{plugin.source === 'git' && <Button size="sm" variant="outline" onClick={() => void checkForUpdate()} disabled={busy}>检查更新</Button>}<Button size="sm" variant="outline" onClick={() => { void diagnose() }} disabled={diagnosing}><RefreshCw className={cn('h-3.5 w-3.5', diagnosing && 'animate-spin')} />{t('settings.plugins.diagnose', { defaultValue: 'Diagnose' })}</Button></div>}
      />
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <section className="border-b border-border/60 pb-6">
            <div className="flex items-start gap-4">
              <PluginAvatar plugin={plugin} workspaceId={workspaceId} size="xl" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold">{displayName}</h2>
                {plugin.description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{plugin.description}</p>}
              </div>
              <Switch checked={plugin.enabled} disabled={busy} onCheckedChange={enabled => { void setEnabled(enabled) }} />
            </div>
          </section>

          {plugin.compatibility && (
            <section className="border-b border-border/60 py-6">
              <div className="flex items-center gap-2">
                <CompatibilityIcon level={plugin.compatibility.level} />
                <h3 className="text-sm font-medium">{plugin.compatibility.summary}</h3>
              </div>
              <div className="mt-4 border-y border-border/50">
                {plugin.compatibility.capabilities.map((capability, index) => (
                  <div key={`${capability.kind}-${index}`} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-t border-border/40 py-3 text-sm first:border-t-0">
                    <span className="text-muted-foreground">{capability.label}</span>
                    <span>
                      <span className="block">{capability.detail}</span>
                      {capability.usage && <span className="mt-1 block text-xs text-muted-foreground">{capability.usage}</span>}
                    </span>
                  </div>
                ))}
              </div>
              {plugin.compatibility.authRequirements.length > 0 && (
                <div className="mt-4 grid gap-2">
                  {plugin.compatibility.authRequirements.map(requirement => {
                    const authStatus = authStatuses.find(status =>
                      status.kind === requirement.kind && status.name === requirement.name
                    )
                    const state = authStatus?.state ?? (requirement.supported ? 'not-connected' : 'unsupported')
                    return (
                    <div key={`${requirement.kind}-${requirement.name}`} className="flex items-center justify-between gap-4 border-b border-border/40 py-2 last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{requirement.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {requirement.kind === 'mcp-oauth'
                            ? t('plugins.mcpOAuthRequired', { defaultValue: 'Sign in to the MCP service with its own account.' })
                            : requirement.kind === 'native-source'
                              ? requirement.provider === 'google'
                                ? t('plugins.googleNativeSourceMapping', {
                                    defaultValue: 'Uses a CA native Google data source. A Google OAuth app must be configured for Craft Agent before sign-in.',
                                  })
                                : t('plugins.nativeSourceMapping', { defaultValue: 'Uses a CA native data source instead of the OpenAI Connector.' })
                              : t('plugins.openAiOnly', { defaultValue: 'Requires OpenAI hosted Connector infrastructure.' })}
                        </p>
                        <p className={cn(
                          'mt-1 text-xs',
                          state === 'connected' && 'text-success',
                          (state === 'expired' || state === 'configuration-required') && 'text-warning',
                          (state === 'host-not-approved' || state === 'unsupported') && 'text-destructive',
                          state === 'not-connected' && 'text-muted-foreground',
                        )}>
                          {t(`plugins.authState.${state}`, { defaultValue: state })}
                        </p>
                      </div>
                      {state === 'configuration-required' ? (
                        <Button size="sm" variant="outline" onClick={() => navigate(routes.view.settings('accounts'))}>
                          <Settings2 className="h-3.5 w-3.5" />
                          {t('plugins.configureOAuth', { defaultValue: 'Configure OAuth' })}
                        </Button>
                      ) : state === 'connected' && authStatus ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => { void authenticateRequirement(requirement) }}>
                            <RotateCcw className="h-3.5 w-3.5" />
                            {t('plugins.reconnect', { defaultValue: 'Reconnect' })}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { void disconnectRequirement(authStatus) }}>
                            <LogOut className="h-3.5 w-3.5" />
                            {t('plugins.disconnect', { defaultValue: 'Disconnect' })}
                          </Button>
                        </div>
                      ) : state === 'expired' ? (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => { void authenticateRequirement(requirement) }}>
                          <RotateCcw className="h-3.5 w-3.5" />
                          {t('plugins.reconnect', { defaultValue: 'Reconnect' })}
                        </Button>
                      ) : state === 'host-not-approved' ? (
                        <span className="max-w-[180px] text-right text-xs text-destructive">
                          {t('plugins.hostApprovalRequired', { defaultValue: 'Provider approval required' })}
                        </span>
                      ) : requirement.supported ? (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => { void authenticateRequirement(requirement) }}>
                          {requirement.kind === 'native-source' ? <Link2 className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
                          {requirement.kind === 'native-source'
                            ? t('plugins.connectSource', { defaultValue: 'Connect source' })
                            : t('plugins.signIn', { defaultValue: 'Sign in' })}
                        </Button>
                      ) : (
                        <span className="shrink-0 text-xs text-destructive">{t('plugins.unsupported', { defaultValue: 'Not supported' })}</span>
                      )}
                    </div>
                  )})}
                </div>
              )}
              {plugin.compatibility.usage.length > 0 && (
                <div className="mt-4 text-xs leading-5 text-muted-foreground">
                  {plugin.compatibility.usage.map(item => <p key={item}>{item}</p>)}
                </div>
              )}
              {plugin.compatibility.reasons.length > 0 && (
                <div className="mt-3 text-xs leading-5 text-muted-foreground">
                  {plugin.compatibility.reasons.map(item => <p key={item}>{item}</p>)}
                </div>
              )}
            </section>
          )}

          <section className="border-b border-border/60 py-6">
            <h3 className="mb-4 text-sm font-medium">{t('plugins.details', { defaultValue: 'Details' })}</h3>
            <dl className="grid gap-3 text-sm">
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                <dt className="text-muted-foreground">{t('plugins.source', { defaultValue: 'Source' })}</dt>
                <dd className="truncate">{plugin.source === 'git' ? plugin.sourceUrl : plugin.installPath}</dd>
              </div>
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                <dt className="text-muted-foreground">{t('plugins.format', { defaultValue: 'Manifest' })}</dt>
                <dd>{plugin.manifestFormat || 'unknown'}</dd>
              </div>
              {plugin.gitRef && (
                <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                  <dt className="text-muted-foreground">{t('plugins.ref', { defaultValue: 'Branch or tag' })}</dt>
                  <dd>{plugin.gitRef}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {plugin.installPath && (
                <Button size="sm" variant="outline" onClick={() => { void window.electronAPI.showInFolder(plugin.installPath!) }}>
                  <FolderOpen className="h-3.5 w-3.5" />
                  {t('plugins.showInFolder', { defaultValue: 'Show in folder' })}
                </Button>
              )}
              {plugin.sourceUrl && (
                <Button size="sm" variant="outline" onClick={() => { void window.electronAPI.openUrl(plugin.sourceUrl!) }}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('plugins.openRepository', { defaultValue: 'Open repository' })}
                </Button>
              )}
            </div>
          </section>

          <section className="border-b border-border/60 py-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium">{t('settings.plugins.defaultPolicy', { defaultValue: 'Default tool policy' })}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t('plugins.policyDescription', { defaultValue: 'Controls how this plugin may execute tools.' })}</p>
              </div>
              <PolicySelect
                value={policy.defaultAction}
                label={`${plugin.name} default tool policy`}
                disabled={busy}
                onChange={defaultAction => { void setPolicy({ defaultAction }) }}
              />
            </div>
            {toolNames.map(toolName => (
              <div key={toolName} className="mt-3 flex items-center justify-between gap-4 border-t border-border/40 pt-3 text-xs">
                <span className="min-w-0 truncate font-mono text-muted-foreground">{toolName}</span>
                <PolicySelect
                  value={policy.tools[toolName] ?? 'inherit'}
                  label={`${toolName} policy`}
                  disabled={busy}
                  onChange={toolAction => { void setPolicy({ tools: { ...policy.tools, [toolName]: toolAction } }) }}
                />
              </div>
            ))}
          </section>

          <section className="border-b border-border/60 py-6">
            <h3 className="text-sm font-medium">MCP</h3>
            {servers.length > 0
              ? <div className="mt-3">{servers.map(server => <ServerRow key={server.slug} server={server} />)}</div>
              : <p className="mt-2 text-xs text-muted-foreground">{t('plugins.noMcpServers', { defaultValue: 'This plugin does not expose an MCP server.' })}</p>}
          </section>

          <section className="pt-6">
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              {plugin.source === 'git'
                ? t('plugins.delete', { defaultValue: 'Delete plugin' })
                : t('plugins.unregister', { defaultValue: 'Unregister plugin' })}
            </Button>
          </section>
        </div>
      </ScrollArea>
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}><DialogContent><DialogHeader><DialogTitle>确认更新插件包</DialogTitle><DialogDescription>发现 {updatePreview?.currentVersion || '未声明'} → {updatePreview?.nextVersion || '新版本'}；更新不会静默执行。</DialogDescription></DialogHeader><div className="space-y-2 text-sm text-muted-foreground"><p>市场：{updatePreview?.marketplaceId}</p><p>能力：{updatePreview?.compatibility?.capabilities.map(item => item.label).join('、') || '待安装后检测'}</p><p>凭据：{updatePreview?.compatibility?.authRequirements.map(item => item.name).join('、') || '未声明额外凭据'}</p><p>确认后会重新安装并保留当前启用状态。</p></div><DialogFooter><Button variant="outline" onClick={() => setUpdateOpen(false)} disabled={busy}>取消</Button><Button onClick={() => void updatePlugin()} disabled={busy}>{busy ? '更新中…' : '确认更新'}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('plugins.removeTitle', { defaultValue: 'Remove plugin?' })}</DialogTitle>
            <DialogDescription>
              {plugin.source === 'git'
                ? t('plugins.deleteDescription', { defaultValue: 'The managed plugin files will be deleted from this workspace.' })
                : t('plugins.unregisterDescription', { defaultValue: 'The local files will remain on disk.' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={busy}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={() => { void removePlugin() }} disabled={busy}>
              {t('common.remove', { defaultValue: 'Remove' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
