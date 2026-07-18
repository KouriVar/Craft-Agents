import { useCallback, useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { ChevronDown, ChevronUp, Eye, EyeOff, Pin, Play, Puzzle, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BrowserExtensionEntry } from '../../../shared/types'
import { browserExtensionsAtom, selectedBrowserExtensionIdAtom } from '@/atoms/plugins'
import { cn } from '@/lib/utils'
import { EntityListEmptyScreen } from '@/components/ui/entity-list-empty'

export function BrowserExtensionsListPanel() {
  const { t } = useTranslation()
  const [extensions, setExtensions] = useAtom(browserExtensionsAtom)
  const [selectedId, setSelectedId] = useAtom(selectedBrowserExtensionIdAtom)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const next = await window.electronAPI.browserPane.listExtensions()
    setExtensions(next)
    setSelectedId(current => current && next.some(extension => extension.id === current) ? current : (next[0]?.id ?? null))
    setLoading(false)
  }, [setExtensions, setSelectedId])

  useEffect(() => {
    void refresh().catch(() => setLoading(false))
    const handleChanged = () => { void refresh() }
    window.addEventListener('craft-browser-extensions-changed', handleChanged)
    return () => window.removeEventListener('craft-browser-extensions-changed', handleChanged)
  }, [refresh])

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

  const removeExtension = useCallback(async (extensionId: string) => {
    await window.electronAPI.browserPane.removeExtension(extensionId)
    await refresh()
    window.dispatchEvent(new Event('craft-browser-extensions-changed'))
  }, [refresh])

  if (!loading && extensions.length === 0) {
    return (
      <EntityListEmptyScreen
        icon={<Puzzle />}
        title={t('plugins.browserExtensionsEmpty')}
        description="点击右上角“＋”从商店、解压目录或扩展包添加。"
      />
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      {extensions.map((extension, index) => (
        <button
          key={extension.id}
          type="button"
          onClick={() => setSelectedId(extension.id)}
          className={cn(
            'group mb-1 flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-foreground/[0.04]',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            selectedId === extension.id && 'bg-foreground/[0.05]',
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-foreground/[0.05]">
            {extension.icon ? <img src={extension.icon} alt="" className="h-6 w-6 object-contain" /> : <Puzzle className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-foreground">{extension.name}</span>
            <span className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <span className={cn('h-1.5 w-1.5 rounded-full', extension.enabled ? 'bg-success' : 'bg-muted-foreground/40')} />
              v{extension.version} · {extension.enabled ? '已启用' : '已停用'}
            </span>
          </span>
          <span className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100">
            <span onClick={(event) => { event.stopPropagation(); void moveExtension(index, -1) }} className={cn('rounded p-0.5 text-muted-foreground hover:bg-foreground/[0.06]', index === 0 && 'pointer-events-none opacity-20')}><ChevronUp className="h-3 w-3" /></span>
            <span onClick={(event) => { event.stopPropagation(); void moveExtension(index, 1) }} className={cn('rounded p-0.5 text-muted-foreground hover:bg-foreground/[0.06]', index === extensions.length - 1 && 'pointer-events-none opacity-20')}><ChevronDown className="h-3 w-3" /></span>
          </span>
          {extension.hasAction && (
            <span onClick={(event) => { event.stopPropagation(); void window.electronAPI.browserPane.openExtensionAction(extension.id) }} className="rounded p-1 text-muted-foreground opacity-0 hover:bg-foreground/[0.06] hover:text-foreground group-hover:opacity-100"><Play className="h-3.5 w-3.5" /></span>
          )}
          <span onClick={(event) => { event.stopPropagation(); void updatePreference(extension, { pinned: !extension.pinned, hidden: false }) }} className="rounded p-1 text-muted-foreground opacity-0 hover:bg-foreground/[0.06] hover:text-foreground group-hover:opacity-100"><Pin className={extension.pinned ? 'h-3.5 w-3.5 fill-current' : 'h-3.5 w-3.5'} /></span>
          <span onClick={(event) => { event.stopPropagation(); void updatePreference(extension, { hidden: !extension.hidden, pinned: extension.hidden ? extension.pinned : false }) }} className="rounded p-1 text-muted-foreground opacity-0 hover:bg-foreground/[0.06] hover:text-foreground group-hover:opacity-100">{extension.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</span>
          <span onClick={(event) => { event.stopPropagation(); void removeExtension(extension.id) }} className="rounded p-1 text-muted-foreground opacity-0 hover:bg-foreground/[0.06] hover:text-foreground group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></span>
        </button>
      ))}
    </div>
  )
}
