import { useCallback, useEffect, useMemo } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Bell, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EntityPanel } from '@/components/ui/entity-panel'
import { EntityListEmptyScreen } from '@/components/ui/entity-list-empty'
import {
  dynamicCenterFilterAtom,
  dynamicCenterItemsAtom,
  dynamicCenterRefreshAtom,
  dynamicCenterSelectedIdAtom,
} from '@/atoms/dynamic-center'
import { dynamicSelection } from '@/hooks/useEntitySelection'

export function DynamicListPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const filter = useAtomValue(dynamicCenterFilterAtom)
  const refreshToken = useAtomValue(dynamicCenterRefreshAtom)
  const [items, setItems] = useAtom(dynamicCenterItemsAtom)
  const [selectedId, setSelectedId] = useAtom(dynamicCenterSelectedIdAtom)
  const requestRefresh = useSetAtom(dynamicCenterRefreshAtom)

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setItems([])
      setSelectedId(null)
      return
    }
    const serverFilter = (filter === 'unread' || filter === 'read') ? 'all' : filter
    const next = await window.electronAPI.getDynamicItems(workspaceId, serverFilter)
    setItems(next)
    setSelectedId(current => current && next.some(item => item.id === current)
      ? current
      : (next[0]?.id ?? null))
  }, [filter, setItems, setSelectedId, workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh, refreshToken])

  const filteredItems = useMemo(() => {
    if (filter === 'unread') return items.filter(item => !item.readAt)
    if (filter === 'read') return items.filter(item => !!item.readAt)
    return items
  }, [items, filter])

  return (
    <EntityPanel
      items={filteredItems}
      getId={item => item.id}
      selection={dynamicSelection}
      selectedId={selectedId}
      onItemClick={item => {
        setSelectedId(item.id)
        if (!item.readAt) {
          void window.electronAPI.markDynamicRead(workspaceId, item.id).then(() => {
            requestRefresh(value => value + 1)
          })
        }
      }}
      containerProps={{ 'data-list-role': 'dynamic' }}
      emptyState={
        <EntityListEmptyScreen
          icon={<Bell />}
          title={t('dynamic.empty', '暂无动态')}
          description={t('dynamic.emptyDescription', '提醒、权限、自动化和系统状态会显示在这里。')}
        />
      }
      mapItem={item => ({
        icon: <ShieldAlert className={item.requiresAction ? 'text-amber-500' : 'text-muted-foreground'} />,
        title: item.title,
        badges: item.body ? <span className="truncate">{item.body}</span> : undefined,
        trailing: !item.readAt ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : undefined,
      })}
    />
  )
}
