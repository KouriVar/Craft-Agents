import { ExternalLink, FolderOpen, Pin, Play, Puzzle, ShieldCheck } from 'lucide-react'
import { useAtomValue } from 'jotai'
import { browserExtensionsAtom, selectedBrowserExtensionIdAtom } from '@/atoms/plugins'

export function BrowserExtensionInfoPage() {
  const extensions = useAtomValue(browserExtensionsAtom)
  const selectedId = useAtomValue(selectedBrowserExtensionIdAtom)
  const extension = extensions.find(item => item.id === selectedId) ?? null

  if (!extension) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">选择一个扩展以查看详细信息。</div>
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-[760px] space-y-4">
        <section className="rounded-[12px] border border-border/60 bg-background p-5 shadow-minimal">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-foreground/[0.05]">
              {extension.icon ? <img src={extension.icon} alt="" className="h-10 w-10 object-contain" /> : <Puzzle className="h-6 w-6 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-foreground">{extension.name}</h2>
                <span className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[11px] text-muted-foreground">v{extension.version}</span>
                <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" />已启用</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{extension.description || '该扩展没有提供说明。'}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {extension.hasAction && <button type="button" onClick={() => void window.electronAPI.browserPane.openExtensionAction(extension.id)} className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-foreground px-3 text-xs text-background hover:opacity-90"><Play className="h-3.5 w-3.5" />运行扩展</button>}
                <button type="button" onClick={() => void window.electronAPI.browserPane.setExtensionPreference(extension.id, { pinned: !extension.pinned }).then(() => window.dispatchEvent(new Event('craft-browser-extensions-changed')))} className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-foreground/[0.06] px-3 text-xs text-foreground hover:bg-foreground/[0.1]"><Pin className="h-3.5 w-3.5" />{extension.pinned ? '取消固定' : '固定到地址栏'}</button>
                {extension.homepageUrl && <button type="button" onClick={() => void window.electronAPI.openUrl(extension.homepageUrl!)} className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-foreground/[0.06] px-3 text-xs text-foreground hover:bg-foreground/[0.1]"><ExternalLink className="h-3.5 w-3.5" />官方网站</button>}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[12px] border border-border/60 bg-background p-5 shadow-minimal">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground"><ShieldCheck className="h-4 w-4" />扩展信息</h3>
          <dl className="mt-4 grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">扩展 ID</dt><dd className="break-all font-mono text-xs text-foreground/80">{extension.id}</dd>
            <dt className="text-muted-foreground">Manifest</dt><dd className="text-foreground/80">V{extension.manifestVersion ?? '—'}</dd>
            <dt className="text-muted-foreground">安装位置</dt><dd className="flex min-w-0 items-start gap-1.5 break-all text-xs text-foreground/80"><FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />{extension.path}</dd>
          </dl>
        </section>

        <section className="rounded-[12px] border border-border/60 bg-background p-5 shadow-minimal">
          <h3 className="text-sm font-medium text-foreground">权限</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {extension.permissions && extension.permissions.length > 0
              ? extension.permissions.map(permission => <span key={permission} className="rounded-[6px] bg-foreground/[0.05] px-2 py-1 text-xs text-muted-foreground">{permission}</span>)
              : <span className="text-sm text-muted-foreground">未声明额外权限。</span>}
          </div>
        </section>
      </div>
    </div>
  )
}
