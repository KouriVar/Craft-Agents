import * as React from 'react'
import { AlertTriangle, Check, CheckCircle2, CircleHelp, ExternalLink, KeyRound, Plus, RefreshCw, Search, Trash2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type {
  PluginMarketplaceCatalog,
  PluginMarketplaceEntry,
  PluginMarketplaceSource,
  WorkspacePluginEntry,
} from '@craft-agent/shared/plugins'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { PluginAvatar } from '@/components/ui/plugin-avatar'

interface PluginMarketplaceBrowserProps {
  open: boolean
  workspaceId: string
  installedPluginNames: string[]
  onOpenChange: (open: boolean) => void
  onInstalled: (plugin: WorkspacePluginEntry) => void
  /** Normal capability surfaces must not require users to understand packages. */
  presentation?: 'plugins' | 'capabilities'
}

function packageSourceLabel(plugin: PluginMarketplaceEntry): string {
  const source = plugin.packageSource
  if (source.source === 'local') return source.path
  if (source.source === 'git-subdir') return `${source.url} / ${source.path}`
  if (source.source === 'url') return source.url
  return source.package
}

function CompatibilityIcon({ level, className }: { level?: string; className?: string }) {
  if (level === 'ready') return <CheckCircle2 className={cn('text-success', className)} />
  if (level === 'needs-auth') return <KeyRound className={cn('text-warning', className)} />
  if (level === 'partial') return <AlertTriangle className={cn('text-warning', className)} />
  if (level === 'unsupported') return <XCircle className={cn('text-destructive', className)} />
  return <CircleHelp className={cn('text-muted-foreground', className)} />
}

export function PluginMarketplaceBrowser({
  open,
  workspaceId,
  installedPluginNames,
  onOpenChange,
  onInstalled,
  presentation = 'plugins',
}: PluginMarketplaceBrowserProps) {
  const { t } = useTranslation()
  const [sources, setSources] = React.useState<PluginMarketplaceSource[]>([])
  const [sourceId, setSourceId] = React.useState('openai-official')
  const [catalog, setCatalog] = React.useState<PluginMarketplaceCatalog | null>(null)
  const [selected, setSelected] = React.useState<PluginMarketplaceEntry | null>(null)
  const [query, setQuery] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [installing, setInstalling] = React.useState(false)
  const [confirmInstall, setConfirmInstall] = React.useState(false)
  const [sourceDialogOpen, setSourceDialogOpen] = React.useState(false)
  const [sourceForm, setSourceForm] = React.useState({ name: '', source: '', ref: '', sparsePath: '' })
  const [savingSource, setSavingSource] = React.useState(false)

  const loadSources = React.useCallback(async () => {
    const next = await window.electronAPI.listPluginMarketplaceSources(workspaceId)
    setSources(next)
    if (!next.some(source => source.id === sourceId)) setSourceId(next[0]?.id || '')
  }, [sourceId, workspaceId])

  const loadCatalog = React.useCallback(async (refresh = false) => {
    if (!sourceId) return
    setLoading(true)
    try {
      const next = await window.electronAPI.getPluginMarketplaceCatalog(workspaceId, sourceId, { refresh })
      setCatalog(next)
      setSelected(current => next.plugins.find(plugin => plugin.name === current?.name) || next.plugins[0] || null)
    } catch (error) {
      setCatalog(null)
      setSelected(null)
      toast.error(t('plugins.marketplace.loadFailed', { defaultValue: 'Marketplace could not be loaded' }), {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }, [sourceId, t, workspaceId])

  React.useEffect(() => {
    if (!open) return
    void loadSources().catch(error => toast.error(error instanceof Error ? error.message : String(error)))
  }, [loadSources, open])

  React.useEffect(() => {
    if (open && sourceId) void loadCatalog()
  }, [loadCatalog, open, sourceId])

  const filteredPlugins = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return catalog?.plugins ?? []
    return (catalog?.plugins ?? []).filter(plugin => [plugin.name, plugin.displayName, plugin.description, plugin.category]
      .some(value => value?.toLowerCase().includes(needle)))
  }, [catalog, query])

  const install = async () => {
    if (!selected || installing || selected.compatibility === 'unsupported') return
    setInstalling(true)
    try {
      const plugin = await window.electronAPI.installMarketplacePlugin(workspaceId, selected.marketplaceId, selected.name, { enabled: true })
      toast.success(t('plugins.install.success', { defaultValue: 'Plugin installed' }))
      onInstalled(plugin)
    } catch (error) {
      toast.error(t('plugins.install.failed', { defaultValue: 'Plugin installation failed' }), {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setInstalling(false)
    }
  }

  const addSource = async () => {
    if (!sourceForm.source.trim() || savingSource) return
    setSavingSource(true)
    try {
      const source = await window.electronAPI.addPluginMarketplaceSource(workspaceId, {
        name: sourceForm.name.trim() || undefined,
        source: sourceForm.source.trim(),
        ref: sourceForm.ref.trim() || undefined,
        sparsePath: sourceForm.sparsePath.trim() || undefined,
      })
      setSourceForm({ name: '', source: '', ref: '', sparsePath: '' })
      setSourceDialogOpen(false)
      await loadSources()
      setSourceId(source.id)
      toast.success(t('plugins.marketplace.sourceAdded', { defaultValue: 'Marketplace added' }))
    } catch (error) {
      toast.error(t('plugins.marketplace.sourceFailed', { defaultValue: 'Marketplace could not be added' }), {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSavingSource(false)
    }
  }

  const removeSource = async () => {
    const source = sources.find(item => item.id === sourceId)
    if (!source || source.builtin) return
    try {
      await window.electronAPI.removePluginMarketplaceSource(workspaceId, source.id)
      setCatalog(null)
      setSelected(null)
      const remaining = sources.filter(item => item.id !== source.id)
      setSources(remaining)
      setSourceId(remaining[0]?.id || '')
      toast.success(t('plugins.marketplace.sourceRemoved', { defaultValue: 'Marketplace removed' }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const activeSource = sources.find(source => source.id === sourceId)
  const installed = selected ? installedPluginNames.includes(selected.name) : false
  const capabilityPresentation = presentation === 'capabilities'
  const requestedPermissions = [
    { label: '命令', detail: selected?.compatibilityReport?.capabilities.some(item => item.kind === 'hooks') ? '检测到生命周期 Hook；安装后按运行时授权执行。' : '未从清单检测到命令声明。' },
    { label: '网络', detail: selected?.compatibilityReport?.capabilities.some(item => item.kind === 'mcp') ? 'MCP 工具可能访问其已配置的远程服务。' : '未从清单检测到网络能力。' },
    { label: '文件', detail: '安装包文件将写入工作区管理目录；运行时文件访问仍受权限模式约束。' },
    { label: '凭据', detail: selected?.compatibilityReport?.authRequirements?.length ? selected.compatibilityReport.authRequirements.map(item => item.name).join('；') : '未声明额外凭据要求。' },
  ]

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(760px,calc(100vh-48px))] !w-[min(960px,calc(100vw-48px))] !max-w-none flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/60 px-5 py-4">
            <div className="flex items-center justify-between gap-4 pr-8">
              <div>
                <DialogTitle>{capabilityPresentation ? '能力市场' : t('plugins.marketplace.title', { defaultValue: 'Plugin marketplaces' })}</DialogTitle>
                <DialogDescription className="mt-1">
                  {capabilityPresentation ? '浏览可安装的专家、技能和连接器。' : t('plugins.marketplace.description', { defaultValue: 'Browse compatible plugins from OpenAI and other Git marketplaces.' })}
                </DialogDescription>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="icon" variant="ghost" title={t('common.refresh')} onClick={() => { void loadCatalog(true) }} disabled={loading}>
                  <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                </Button>
                <Button size="icon" variant="ghost" title={t('plugins.marketplace.addSource', { defaultValue: 'Add marketplace' })} onClick={() => setSourceDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
                {!activeSource?.builtin && (
                  <Button size="icon" variant="ghost" title={t('plugins.marketplace.removeSource', { defaultValue: 'Remove marketplace' })} onClick={() => { void removeSource() }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(280px,320px)_minmax(380px,1fr)]">
            <div className="flex min-h-0 min-w-0 flex-col border-r border-border/60">
              <div className="grid gap-2 border-b border-border/60 p-3">
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sources.map(source => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="h-9 pl-8" value={query} onChange={event => setQuery(event.target.value)} placeholder={capabilityPresentation ? '搜索能力' : t('plugins.marketplace.search', { defaultValue: 'Search plugins' })} />
                </div>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                {loading && !catalog ? (
                  <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{t('common.loading')}</div>
                ) : filteredPlugins.length === 0 ? (
                  <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">{capabilityPresentation ? '未找到可用能力' : t('plugins.marketplace.empty', { defaultValue: 'No plugins found' })}</div>
                ) : (
                  <div className="p-2">
                    {filteredPlugins.map(plugin => (
                      <button
                        key={plugin.name}
                        type="button"
                        className={cn('flex w-full items-start gap-3 rounded-control px-3 py-2.5 text-left hover:bg-muted/60', selected?.name === plugin.name && 'bg-muted')}
                        onClick={() => setSelected(plugin)}
                      >
                        <PluginAvatar
                          plugin={{ name: plugin.name, displayName: plugin.displayName, iconPath: plugin.iconPath }}
                          workspaceId={workspaceId}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <span className="truncate">{plugin.displayName || plugin.name}</span>
                            {installedPluginNames.includes(plugin.name) && <Check className="h-3.5 w-3.5 shrink-0 text-success" />}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <CompatibilityIcon level={plugin.compatibilityReport?.level} className="h-3 w-3 shrink-0" />
                            <span className="truncate">{plugin.compatibilityReport?.summary || plugin.category || plugin.name}</span>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            <ScrollArea className="min-h-0 min-w-0">
              {selected ? (
                <div className="min-w-0 p-6">
                  <div className="flex items-start gap-4">
                    <PluginAvatar
                      plugin={{ name: selected.name, displayName: selected.displayName, iconPath: selected.iconPath }}
                      workspaceId={workspaceId}
                      size="xl"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold">{selected.displayName || selected.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{selected.category || t('plugins.marketplace.uncategorized', { defaultValue: 'Uncategorized' })}</p>
                    </div>
                  </div>
                  {selected.description && <p className="mt-5 text-sm leading-6 text-muted-foreground">{selected.description}</p>}
                  {selected.compatibilityReport && (
                    <div className="mt-5 border-y border-border/60">
                      <div className="flex items-center gap-2 py-3 text-sm font-medium">
                        <CompatibilityIcon level={selected.compatibilityReport.level} className="h-4 w-4" />
                        <span>{selected.compatibilityReport.summary}</span>
                      </div>
                      {selected.compatibilityReport.capabilities.map((capability, index) => (
                        <div key={`${capability.kind}-${index}`} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-border/40 py-3 text-sm">
                          <span className="text-muted-foreground">{capability.label}</span>
                          <span>
                            <span className="block">{capability.detail}</span>
                            {capability.usage && <span className="mt-1 block text-xs text-muted-foreground">{capability.usage}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <dl className="mt-6 grid gap-3 border-y border-border/60 py-5 text-sm">
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">{t('plugins.marketplace.source', { defaultValue: 'Package source' })}</dt><dd className="break-all">{packageSourceLabel(selected)}</dd></div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">{t('plugins.marketplace.authentication', { defaultValue: 'Authentication' })}</dt><dd>{selected.authentication || t('plugins.marketplace.notSpecified', { defaultValue: 'Not specified' })}</dd></div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">{t('plugins.marketplace.installation', { defaultValue: 'Availability' })}</dt><dd>{selected.installation || t('plugins.marketplace.available', { defaultValue: 'Available' })}</dd></div>
                  </dl>
                  {selected.authentication && selected.authentication !== 'NONE' && (
                    <div className="mt-5 flex gap-3 rounded-control border border-warning/30 bg-warning/5 p-3 text-xs leading-5 text-muted-foreground">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <span>{t('plugins.marketplace.authWarning', { defaultValue: 'This plugin may require an OpenAI connector or external account. Skills can still work, but account-backed tools may need additional CA support.' })}</span>
                    </div>
                  )}
                  {selected.compatibilityReport?.reasons.map(reason => (
                    <p key={reason} className="mt-3 text-xs leading-5 text-muted-foreground">{reason}</p>
                  ))}
                  {selected.compatibility === 'unsupported' && <p className="mt-5 text-sm text-destructive">{selected.compatibilityReason}</p>}
                  <div className="mt-6 flex flex-wrap gap-2">
                    <Button onClick={() => setConfirmInstall(true)} disabled={installing || installed || selected.compatibility === 'unsupported'}>
                      {installed ? t('plugins.marketplace.installed', { defaultValue: 'Installed' }) : installing ? t('common.loading') : t('plugins.install.install', { defaultValue: 'Install' })}
                    </Button>
                    {activeSource && /^https?:|^[\w.-]+\/[\w.-]+$/.test(activeSource.source) && (
                      <Button variant="outline" onClick={() => { void window.electronAPI.openUrl(activeSource.source.includes('://') ? activeSource.source : `https://github.com/${activeSource.source}`) }}>
                        <ExternalLink className="h-4 w-4" />{t('plugins.marketplace.openSource', { defaultValue: 'Open source' })}
                      </Button>
                    )}
                  </div>
                </div>
              ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('plugins.marketplace.select', { defaultValue: 'Select a plugin' })}</div>}
            </ScrollArea>
          </div>
      </DialogContent>
      <Dialog open={confirmInstall} onOpenChange={setConfirmInstall}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('plugins.install.confirmTitle', { defaultValue: 'Confirm capability installation' })}</DialogTitle><DialogDescription>{t('plugins.install.confirmDescription', { defaultValue: 'Review the capabilities and permissions before enabling this package.' })}</DialogDescription></DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground"><div className="rounded-md border border-warning/30 bg-warning/5 p-3">安装并启用前，请确认以下权限清单。实际操作仍会受当前会话权限模式控制。</div><div className="divide-y rounded-md border">{requestedPermissions.map(item => <div key={item.label} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 p-3"><strong className="text-foreground">{item.label}</strong><span>{item.detail}</span></div>)}</div>{selected?.compatibilityReport?.capabilities.map(item => <p key={`${item.kind}-${item.label}`}>• {item.label}: {item.detail}</p>)}</div>
          <DialogFooter><Button variant="outline" onClick={() => setConfirmInstall(false)}>{t('common.cancel')}</Button><Button onClick={() => { setConfirmInstall(false); void install() }} disabled={installing}>{t('plugins.install.install', { defaultValue: 'Install' })}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>

      <Dialog open={sourceDialogOpen} onOpenChange={open => { if (!savingSource) setSourceDialogOpen(open) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('plugins.marketplace.addSource', { defaultValue: 'Add marketplace' })}</DialogTitle>
            <DialogDescription>{t('plugins.marketplace.addDescription', { defaultValue: 'Add a Git repository containing .agents/plugins/marketplace.json.' })}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-2"><Label htmlFor="marketplace-source">{t('plugins.marketplace.repository', { defaultValue: 'Source' })}</Label><Input id="marketplace-source" value={sourceForm.source} onChange={event => setSourceForm(form => ({ ...form, source: event.target.value }))} placeholder="owner/repo" autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="marketplace-ref">{t('plugins.install.ref', { defaultValue: 'Branch or tag' })}</Label><Input id="marketplace-ref" value={sourceForm.ref} onChange={event => setSourceForm(form => ({ ...form, ref: event.target.value }))} placeholder="main" /></div>
              <div className="grid gap-2"><Label htmlFor="marketplace-path">{t('plugins.marketplace.sparsePath', { defaultValue: 'Sparse path' })}</Label><Input id="marketplace-path" value={sourceForm.sparsePath} onChange={event => setSourceForm(form => ({ ...form, sparsePath: event.target.value }))} placeholder={t('plugins.install.refOptional', { defaultValue: 'Optional' })} /></div>
            </div>
            <div className="grid gap-2"><Label htmlFor="marketplace-name">{t('plugins.marketplace.name', { defaultValue: 'Display name' })}</Label><Input id="marketplace-name" value={sourceForm.name} onChange={event => setSourceForm(form => ({ ...form, name: event.target.value }))} placeholder={t('plugins.install.refOptional', { defaultValue: 'Optional' })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSourceDialogOpen(false)} disabled={savingSource}>{t('common.cancel')}</Button><Button onClick={() => { void addSource() }} disabled={!sourceForm.source.trim() || savingSource}>{savingSource ? t('common.loading') : t('common.add', { defaultValue: 'Add' })}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
