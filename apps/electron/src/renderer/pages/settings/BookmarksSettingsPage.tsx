import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Globe, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { SettingsCard, SettingsCardFooter, SettingsInput, SettingsSection } from '@/components/settings'
import { navigate, routes } from '@/lib/navigate'
import type { DetailsPageMeta } from '@/lib/details-page-meta'
import type { BrowserBookmarkEntry } from '../../../shared/types'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'bookmarks',
}

function normalizeBookmarkUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function bookmarkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export default function BookmarksSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  const [bookmarks, setBookmarks] = useState<BrowserBookmarkEntry[]>([])
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const normalizedUrl = useMemo(() => normalizeBookmarkUrl(url), [url])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setBookmarks(await window.electronAPI.browserPane.listBookmarks())
    } catch (error) {
      console.warn('[BookmarksSettingsPage] Failed to load bookmarks:', error)
      toast.error(t('settings.bookmarks.loadFailed', { defaultValue: '无法加载书签' }))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refresh()
    const unsubscribe = window.electronAPI.browserPane.onProfileChanged((kind) => {
      if (kind === 'bookmarks') void refresh()
    })
    return unsubscribe
  }, [refresh])

  const addBookmark = useCallback(async () => {
    if (!normalizedUrl) return
    setSaving(true)
    try {
      await window.electronAPI.browserPane.addBookmark({ url: normalizedUrl })
      setUrl('')
      await refresh()
      toast.success(t('settings.bookmarks.added', { defaultValue: '已添加书签' }))
    } catch (error) {
      console.warn('[BookmarksSettingsPage] Failed to add bookmark:', error)
      toast.error(t('settings.bookmarks.addFailed', { defaultValue: '无法添加书签，请检查链接' }))
    } finally {
      setSaving(false)
    }
  }, [normalizedUrl, refresh, t])

  const removeBookmark = useCallback(async (bookmark: BrowserBookmarkEntry) => {
    try {
      await window.electronAPI.browserPane.removeBookmark(bookmark.id)
      await refresh()
      toast.success(t('settings.bookmarks.removed', { defaultValue: '已删除书签' }))
    } catch (error) {
      console.warn('[BookmarksSettingsPage] Failed to remove bookmark:', error)
      toast.error(t('settings.bookmarks.removeFailed', { defaultValue: '无法删除书签' }))
    }
  }, [refresh, t])

  const openBookmark = useCallback(async (bookmark: BrowserBookmarkEntry) => {
    try {
      const id = await window.electronAPI.browserPane.create({
        embedded: true,
        show: false,
        initialUrl: bookmark.url,
      })
      navigate(routes.view.browser(id))
    } catch (error) {
      console.warn('[BookmarksSettingsPage] Failed to open bookmark:', error)
      toast.error(t('browser.openFailed', { defaultValue: '无法打开浏览器标签页' }))
    }
  }, [t])

  const body = (
            <div className="space-y-8">
              <SettingsSection title={t('settings.bookmarks.addSection', { defaultValue: '添加书签' })}>
                <SettingsCard>
                  <SettingsInput
                    label={t('settings.bookmarks.urlLabel', { defaultValue: '网页地址' })}
                    value={url}
                    onChange={setUrl}
                    placeholder="https://example.com"
                    type="url"
                    inCard
                  />
                  <SettingsCardFooter>
                    <span className="mr-auto text-xs text-muted-foreground">
                      {t('settings.bookmarks.autoMetadata', { defaultValue: '保存时自动读取网站图标、网页标题和域名。' })}
                    </span>
                    <Button size="sm" onClick={addBookmark} disabled={!normalizedUrl || saving}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      {saving ? t('common.saving') : t('common.add', { defaultValue: '添加' })}
                    </Button>
                  </SettingsCardFooter>
                </SettingsCard>
              </SettingsSection>

              <SettingsSection title={t('settings.bookmarks.savedSection', { defaultValue: '已保存' })}>
                <SettingsCard>
                  {loading && (
                    <div className="px-4 py-5 text-sm text-muted-foreground">{t('common.loading')}</div>
                  )}
                  {!loading && bookmarks.length === 0 && (
                    <div className="px-4 py-5 text-sm text-muted-foreground">
                      {t('settings.bookmarks.empty', { defaultValue: '还没有书签。添加后会固定显示在左侧边栏。' })}
                    </div>
                  )}
                  {!loading && bookmarks.map((bookmark) => {
                    const domain = bookmarkDomain(bookmark.url)
                    return (
                      <div key={bookmark.id} className="flex items-center gap-3 border-b border-border/40 px-4 py-3 last:border-b-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-control bg-foreground/[0.04]">
                          {bookmark.favicon ? (
                            <img src={bookmark.favicon} alt="" className="h-5 w-5 object-contain" />
                          ) : (
                            <Globe className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">{bookmark.title || domain}</div>
                          <div className="truncate text-xs text-muted-foreground">{domain}</div>
                          <div className="truncate text-[11px] text-muted-foreground/70">{bookmark.url}</div>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="size-control-compact rounded-control text-muted-foreground hover:text-foreground" onClick={() => void openBookmark(bookmark)} title={t('common.open', { defaultValue: '打开' })}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-control-compact rounded-control text-muted-foreground hover:text-destructive" onClick={() => void removeBookmark(bookmark)} title={t('common.delete')}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                </SettingsCard>
              </SettingsSection>
            </div>
  )

  if (embedded) return body

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={t('settings.bookmarks.title', { defaultValue: '书签' })}
        actions={<HeaderMenu route={routes.view.settings('bookmarks')} />}
      />
      <div className="min-h-0 flex-1 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="mx-auto max-w-3xl px-5 py-7">
            {body}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
