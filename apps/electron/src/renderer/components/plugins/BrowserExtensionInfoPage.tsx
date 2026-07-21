import { ExternalLink, FolderOpen, Pin, Play, Puzzle, ShieldCheck } from 'lucide-react'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { browserExtensionsAtom, selectedBrowserExtensionIdAtom } from '@/atoms/plugins'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function BrowserExtensionInfoPage() {
  const { t } = useTranslation()
  const extensions = useAtomValue(browserExtensionsAtom)
  const selectedId = useAtomValue(selectedBrowserExtensionIdAtom)
  const extension = extensions.find(item => item.id === selectedId) ?? null

  if (!extension) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('plugins.selectExtension', { defaultValue: '选择一个扩展以查看详细信息。' })}</div>
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-[760px] space-y-4">
        <section className="rounded-card border border-border/60 bg-background p-5 shadow-minimal">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-card bg-foreground/[0.05]">
              {extension.icon ? <img src={extension.icon} alt="" className="h-10 w-10 object-contain" /> : <Puzzle className="h-6 w-6 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-foreground">{extension.name}</h2>
                <Badge variant="secondary" className="rounded-full text-[11px] font-normal">v{extension.version}</Badge>
                <Badge variant="secondary" className="gap-1 rounded-full bg-success/10 text-[11px] font-normal text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" />{t('plugins.enabled', { defaultValue: '已启用' })}</Badge>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{extension.description || t('plugins.noDescription', { defaultValue: '该扩展没有提供说明。' })}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {extension.hasAction && (
                  <Button type="button" size="sm" onClick={() => void window.electronAPI.browserPane.openExtensionAction(extension.id)}>
                    <Play className="h-3.5 w-3.5" />{t('plugins.openBrowserExtension', { defaultValue: '打开扩展' })}
                  </Button>
                )}
                <Button type="button" variant="secondary" size="sm" onClick={() => void window.electronAPI.browserPane.setExtensionPreference(extension.id, { pinned: !extension.pinned }).then(() => window.dispatchEvent(new Event('craft-browser-extensions-changed')))}>
                  <Pin className="h-3.5 w-3.5" />{extension.pinned ? t('plugins.unpinBrowserExtension', { defaultValue: '取消固定扩展' }) : t('plugins.pinBrowserExtension', { defaultValue: '固定扩展' })}
                </Button>
                {extension.homepageUrl && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => void window.electronAPI.openUrl(extension.homepageUrl!)}>
                    <ExternalLink className="h-3.5 w-3.5" />{t('plugins.homepage', { defaultValue: '官方网站' })}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-card border border-border/60 bg-background p-5 shadow-minimal">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground"><ShieldCheck className="h-4 w-4" />{t('plugins.extensionInfo', { defaultValue: '扩展信息' })}</h3>
          <dl className="mt-4 grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">{t('plugins.extensionId', { defaultValue: '扩展 ID' })}</dt><dd className="break-all font-mono text-xs text-foreground/80">{extension.id}</dd>
            <dt className="text-muted-foreground">Manifest</dt><dd className="text-foreground/80">V{extension.manifestVersion ?? '—'}</dd>
            <dt className="text-muted-foreground">{t('plugins.installLocation', { defaultValue: '安装位置' })}</dt><dd className="flex min-w-0 items-start gap-1.5 break-all text-xs text-foreground/80"><FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />{extension.path}</dd>
          </dl>
        </section>

        <section className="rounded-card border border-border/60 bg-background p-5 shadow-minimal">
          <h3 className="text-sm font-medium text-foreground">{t('plugins.permissions', { defaultValue: '权限' })}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {extension.permissions && extension.permissions.length > 0
              ? extension.permissions.map(permission => <Badge key={permission} variant="secondary" className="rounded-control text-xs font-normal text-muted-foreground">{permission}</Badge>)
              : <span className="text-sm text-muted-foreground">{t('plugins.noPermissions', { defaultValue: '未声明额外权限。' })}</span>}
          </div>
        </section>
      </div>
    </div>
  )
}
