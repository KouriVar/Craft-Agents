import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff, FileArchive, FolderPlus, Pin, Puzzle, ShoppingBag, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { BrowserExtensionEntry } from '../../../shared/types'
import { EntityListEmptyScreen } from '@/components/ui/entity-list-empty'

export function BrowserExtensionsListPanel() {
  const { t } = useTranslation()
  const [extensions, setExtensions] = useState<BrowserExtensionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [storeInput, setStoreInput] = useState('')
  const [storeInstalling, setStoreInstalling] = useState(false)

  const refresh = useCallback(async () => {
    const next = await window.electronAPI.browserPane.listExtensions()
    setExtensions(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh().catch(() => setLoading(false))
  }, [refresh])

  const install = useCallback(async (mode: 'directory' | 'files') => {
    const [path] = await window.electronAPI.openFileDialog({
      mode,
      title: mode === 'directory'
        ? t('plugins.installBrowserExtension', { defaultValue: 'Select unpacked Chrome extension' })
        : t('plugins.installBrowserExtensionPackage', { defaultValue: 'Select Chrome extension ZIP package' }),
    })
    if (!path) return
    try {
      await window.electronAPI.browserPane.installExtension(path)
      await refresh()
      toast.success(t('plugins.browserExtensionInstalled', { defaultValue: 'Browser extension installed' }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('plugins.browserExtensionInstallFailed', { defaultValue: 'Could not install extension' }))
    }
  }, [refresh, t])

  const installActions = (
    <div className="flex items-center justify-end gap-3 px-3 py-2">
      <button type="button" onClick={() => void install('directory')} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <FolderPlus className="h-3.5 w-3.5" />
        {t('plugins.installBrowserExtension', { defaultValue: 'Unpacked' })}
      </button>
      <button type="button" onClick={() => void install('files')} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <FileArchive className="h-3.5 w-3.5" />
        {t('plugins.installBrowserExtensionPackage', { defaultValue: 'ZIP package' })}
      </button>
    </div>
  )

  const installFromStore = useCallback(async () => {
    if (!storeInput.trim() || storeInstalling) return
    setStoreInstalling(true)
    try {
      await window.electronAPI.browserPane.installExtensionFromStore(storeInput)
      setStoreInput('')
      await refresh()
      toast.success(t('plugins.browserExtensionInstalled', { defaultValue: 'Browser extension installed' }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('plugins.browserExtensionInstallFailed', { defaultValue: 'Could not install extension' }))
    } finally {
      setStoreInstalling(false)
    }
  }, [refresh, storeInput, storeInstalling, t])

  const storeInstaller = (
    <div className="flex items-center gap-1.5 px-3 pt-2">
      <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[7px] bg-foreground/[0.04] px-2 py-1.5 text-muted-foreground">
        <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
        <input
          value={storeInput}
          onChange={(event) => setStoreInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void installFromStore() }}
          placeholder={t('plugins.chromeWebStoreLink', { defaultValue: 'Chrome Web Store link or extension ID' })}
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/70"
        />
      </label>
      <button type="button" disabled={!storeInput.trim() || storeInstalling} onClick={() => void installFromStore()} className="rounded-[7px] bg-foreground/[0.06] px-2 py-1.5 text-xs text-foreground hover:bg-foreground/[0.1] disabled:opacity-40">
        {storeInstalling ? t('common.installing', { defaultValue: 'Installing…' }) : t('common.install', { defaultValue: 'Install' })}
      </button>
    </div>
  )

  const updatePreference = useCallback(async (
    extension: BrowserExtensionEntry,
    preference: { pinned?: boolean; hidden?: boolean },
  ) => {
    await window.electronAPI.browserPane.setExtensionPreference(extension.id, preference)
    await refresh()
    window.dispatchEvent(new Event('craft-browser-extensions-changed'))
  }, [refresh])

  const moveExtension = useCallback(async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    const current = extensions[index]
    const target = extensions[targetIndex]
    if (!current || !target) return
    await window.electronAPI.browserPane.setExtensionPreference(current.id, { order: targetIndex })
    await window.electronAPI.browserPane.setExtensionPreference(target.id, { order: index })
    await refresh()
    window.dispatchEvent(new Event('craft-browser-extensions-changed'))
  }, [extensions, refresh])

  if (!loading && extensions.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {storeInstaller}
        {installActions}
        <EntityListEmptyScreen
          icon={<Puzzle />}
          title={t('plugins.browserExtensionsEmpty')}
          description={t('plugins.browserExtensionsEmptyDescription')}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {storeInstaller}
      {installActions}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {extensions.map((extension, index) => (
          <div key={extension.id} className="group mb-1 flex items-center gap-2 rounded-[10px] px-3 py-2 hover:bg-foreground/[0.04]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-foreground/[0.05]"><Puzzle className="h-4 w-4" /></span>
            <button
              type="button"
              disabled={!extension.hasAction}
              onClick={() => void window.electronAPI.browserPane.openExtensionAction(extension.id)}
              className="min-w-0 flex-1 text-left disabled:cursor-default"
            >
              <span className="block truncate text-sm text-foreground">{extension.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                v{extension.version} · {extension.hasAction
                  ? t('plugins.openBrowserExtension', { defaultValue: 'Open extension' })
                  : t('plugins.noBrowserExtensionPopup', { defaultValue: 'No popup or options page' })}
              </span>
            </button>
            <span className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => void moveExtension(index, -1)}
                className="rounded p-0.5 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-20"
                title={t('plugins.moveBrowserExtensionUp', { defaultValue: 'Move up' })}
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                disabled={index === extensions.length - 1}
                onClick={() => void moveExtension(index, 1)}
                className="rounded p-0.5 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-20"
                title={t('plugins.moveBrowserExtensionDown', { defaultValue: 'Move down' })}
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </span>
            <button
              type="button"
              disabled={!extension.hasAction}
              onClick={() => void updatePreference(extension, { pinned: !extension.pinned, hidden: false })}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-20 group-hover:opacity-100"
              title={extension.pinned
                ? t('plugins.unpinBrowserExtension', { defaultValue: 'Unpin extension' })
                : t('plugins.pinBrowserExtension', { defaultValue: 'Pin extension' })}
            >
              <Pin className={extension.pinned ? 'h-3.5 w-3.5 fill-current' : 'h-3.5 w-3.5'} />
            </button>
            <button
              type="button"
              onClick={() => void updatePreference(extension, { hidden: !extension.hidden, pinned: extension.hidden ? extension.pinned : false })}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/[0.06] hover:text-foreground group-hover:opacity-100"
              title={extension.hidden
                ? t('plugins.showBrowserExtension', { defaultValue: 'Show extension' })
                : t('plugins.hideBrowserExtension', { defaultValue: 'Hide extension' })}
            >
              {extension.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => void window.electronAPI.browserPane.removeExtension(extension.id).then(refresh)}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/[0.06] hover:text-foreground group-hover:opacity-100"
              title={t('plugins.removeBrowserExtension', { defaultValue: 'Remove extension' })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
