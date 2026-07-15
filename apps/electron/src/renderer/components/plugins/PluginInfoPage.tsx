import * as React from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, FolderOpen, Plug, RefreshCw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type {
  PluginMcpServerDiagnostic,
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

interface PluginInfoPageProps {
  workspaceId: string
  pluginName: string
}

export function PluginInfoPage({ workspaceId, pluginName }: PluginInfoPageProps) {
  const { t } = useTranslation()
  const [plugin, setPlugin] = React.useState<WorkspacePluginEntry | null>(null)
  const [servers, setServers] = React.useState<PluginMcpServerDiagnostic[]>([])
  const [policies, setPolicies] = React.useState<WorkspacePluginPolicyConfig>({ version: 1, plugins: {} })
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [diagnosing, setDiagnosing] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [entries, status, nextPolicies] = await Promise.all([
        window.electronAPI.listPlugins(workspaceId),
        window.electronAPI.getPluginMcpStatus(workspaceId),
        window.electronAPI.getPluginPolicies(workspaceId),
      ])
      setPlugin(entries.find(entry => entry.name === pluginName) ?? null)
      setServers(Object.values(status.servers).filter(server => server.pluginName === pluginName))
      setPolicies(nextPolicies)
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
        actions={
          <Button size="sm" variant="outline" onClick={() => { void diagnose() }} disabled={diagnosing}>
            <RefreshCw className={cn('h-3.5 w-3.5', diagnosing && 'animate-spin')} />
            {t('settings.plugins.diagnose', { defaultValue: 'Diagnose' })}
          </Button>
        }
      />
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <section className="border-b border-border/60 pb-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-foreground/[0.05]">
                <Plug className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold">{displayName}</h2>
                {plugin.description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{plugin.description}</p>}
              </div>
              <Switch checked={plugin.enabled} disabled={busy} onCheckedChange={enabled => { void setEnabled(enabled) }} />
            </div>
          </section>

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
