import * as React from 'react'
import { ExternalLink, FolderOpen, GitBranch, Plus, Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HeaderIconButton } from '@/components/ui/HeaderIconButton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'
import type { WorkspacePluginEntry } from '@craft-agent/shared/plugins'
import { PluginMarketplaceBrowser } from './PluginMarketplaceBrowser'

interface PluginInstallMenuProps {
  workspaceId: string
  installedPluginNames: string[]
  onInstalled: (plugin: WorkspacePluginEntry) => void
}

export function PluginInstallMenu({ workspaceId, installedPluginNames, onInstalled }: PluginInstallMenuProps) {
  const { t } = useTranslation()
  const [gitOpen, setGitOpen] = React.useState(false)
  const [gitUrl, setGitUrl] = React.useState('')
  const [gitRef, setGitRef] = React.useState('')
  const [installing, setInstalling] = React.useState(false)
  const [marketplaceOpen, setMarketplaceOpen] = React.useState(false)

  const installFromGit = async () => {
    if (!gitUrl.trim() || installing) return
    setInstalling(true)
    try {
      const plugin = await window.electronAPI.installGitPlugin(workspaceId, gitUrl.trim(), {
        ref: gitRef.trim() || undefined,
        enabled: true,
      })
      toast.success(t('plugins.install.success', { defaultValue: 'Plugin installed' }))
      setGitOpen(false)
      setGitUrl('')
      setGitRef('')
      onInstalled(plugin)
    } catch (error) {
      toast.error(t('plugins.install.failed', { defaultValue: 'Plugin installation failed' }), {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setInstalling(false)
    }
  }

  const addLocal = async () => {
    try {
      const paths = await window.electronAPI.openFileDialog({
        mode: 'directory',
        title: t('plugins.install.local', { defaultValue: 'Add local plugin' }),
      })
      const pluginRootPath = paths[0]
      if (!pluginRootPath) return
      const plugin = await window.electronAPI.registerLocalPlugin(workspaceId, pluginRootPath, { enabled: true })
      toast.success(t('plugins.install.added', { defaultValue: 'Local plugin added' }))
      onInstalled(plugin)
    } catch (error) {
      toast.error(t('plugins.install.failed', { defaultValue: 'Plugin installation failed' }), {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <HeaderIconButton
            icon={<Plus className="h-4 w-4" />}
            tooltip={t('plugins.install.add', { defaultValue: 'Add plugin' })}
          />
        </DropdownMenuTrigger>
        <StyledDropdownMenuContent align="end" minWidth="min-w-[180px]">
          <StyledDropdownMenuItem onSelect={() => setMarketplaceOpen(true)}>
            <Store className="h-4 w-4" />
            <span>{t('plugins.marketplace.browse', { defaultValue: 'Browse marketplaces' })}</span>
          </StyledDropdownMenuItem>
          <StyledDropdownMenuItem onSelect={() => setGitOpen(true)}>
            <GitBranch className="h-4 w-4" />
            <span>{t('plugins.install.git', { defaultValue: 'Install from Git' })}</span>
          </StyledDropdownMenuItem>
          <StyledDropdownMenuItem onSelect={() => { void addLocal() }}>
            <FolderOpen className="h-4 w-4" />
            <span>{t('plugins.install.local', { defaultValue: 'Add local plugin' })}</span>
          </StyledDropdownMenuItem>
          <StyledDropdownMenuItem onSelect={() => { void window.electronAPI.openUrl('https://github.com/openai/plugins') }}>
            <ExternalLink className="h-4 w-4" />
            <span>{t('plugins.marketplace.openDirectory', { defaultValue: 'Open plugin directory' })}</span>
          </StyledDropdownMenuItem>
        </StyledDropdownMenuContent>
      </DropdownMenu>

      <PluginMarketplaceBrowser
        open={marketplaceOpen}
        workspaceId={workspaceId}
        installedPluginNames={installedPluginNames}
        onOpenChange={setMarketplaceOpen}
        onInstalled={onInstalled}
      />

      <Dialog open={gitOpen} onOpenChange={open => { if (!installing) setGitOpen(open) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('plugins.install.git', { defaultValue: 'Install from Git' })}</DialogTitle>
            <DialogDescription>
              {t('plugins.install.gitDescription', { defaultValue: 'Enter a Git repository containing a supported plugin manifest.' })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label htmlFor="plugin-git-url">{t('plugins.install.repository', { defaultValue: 'Repository URL' })}</Label>
              <Input
                id="plugin-git-url"
                value={gitUrl}
                onChange={event => setGitUrl(event.target.value)}
                placeholder="https://github.com/owner/plugin.git"
                autoFocus
                disabled={installing}
                onKeyDown={event => { if (event.key === 'Enter') void installFromGit() }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plugin-git-ref">{t('plugins.install.ref', { defaultValue: 'Branch or tag' })}</Label>
              <Input
                id="plugin-git-ref"
                value={gitRef}
                onChange={event => setGitRef(event.target.value)}
                placeholder={t('plugins.install.refOptional', { defaultValue: 'Optional' })}
                disabled={installing}
                onKeyDown={event => { if (event.key === 'Enter') void installFromGit() }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGitOpen(false)} disabled={installing}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => { void installFromGit() }} disabled={!gitUrl.trim() || installing}>
              {installing ? t('common.loading') : t('plugins.install.install', { defaultValue: 'Install' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
