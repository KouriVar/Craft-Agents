import { useCallback, useEffect, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { BellOff, ExternalLink, ShieldAlert, Trash2 } from 'lucide-react'
import type { DynamicMuteRules } from '@craft-agent/shared/dynamic'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { HeaderIconButton } from '@/components/ui/HeaderIconButton'
import { navigate, routes } from '@/lib/navigate'
import { toast } from 'sonner'
import {
  dynamicCenterItemsAtom,
  dynamicCenterRefreshAtom,
  dynamicCenterSelectedIdAtom,
} from '@/atoms/dynamic-center'

export function DynamicCenterPage({ workspaceId }: { workspaceId: string }) {
  const { t, i18n } = useTranslation()
  const items = useAtomValue(dynamicCenterItemsAtom)
  const selectedId = useAtomValue(dynamicCenterSelectedIdAtom)
  const requestRefresh = useSetAtom(dynamicCenterRefreshAtom)
  const [rules, setRules] = useState<DynamicMuteRules | null>(null)
  const item = items.find(candidate => candidate.id === selectedId) ?? null

  useEffect(() => {
    if (!workspaceId) return
    void window.electronAPI.getDynamicMuteRules(workspaceId).then(setRules)
  }, [workspaceId])

  const refresh = useCallback(() => {
    requestRefresh(value => value + 1)
  }, [requestRefresh])

  const openSource = async () => {
    if (!item) return
    await window.electronAPI.markDynamicRead(workspaceId, item.id)
    const runSessionId = item.source?.sessionId ?? item.source?.runId
    if (runSessionId) navigate(routes.view.allSessions(runSessionId))
    else if (item.automationId) navigate(routes.view.automations({ automationId: item.automationId }))
    else if (item.projectId) {
      try {
        const project = await window.electronAPI.getProject(workspaceId, item.projectId) as { config?: { slug?: string } } | null
        if (project?.config?.slug) navigate(routes.view.projects(project.config.slug))
        else toast.error(t('dynamic.projectUnavailable', '项目来源已不可用'))
      } catch {
        toast.error(t('dynamic.projectOpenFailed', '无法打开项目来源，请稍后重试'))
      }
    }
    refresh()
  }

  const decidePermission = async (allowed: boolean) => {
    if (!item) return
    try {
      await window.electronAPI.respondToDynamicPermission(workspaceId, item.id, allowed)
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('dynamic.permissionExpired', '权限请求已失效'))
    }
  }

  const mute = async () => {
    if (!item || !rules || item.requiresAction) return
    const next: DynamicMuteRules = {
      projectIds: item.projectId ? [...new Set([...rules.projectIds, item.projectId])] : rules.projectIds,
      automationIds: item.automationId ? [...new Set([...rules.automationIds, item.automationId])] : rules.automationIds,
      kinds: !item.projectId && !item.automationId ? [...new Set([...rules.kinds, item.kind])] : rules.kinds,
    }
    await window.electronAPI.setDynamicMuteRules(workspaceId, next)
    setRules(next)
    refresh()
  }

  if (!item) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader title={t('dynamic.title', '动态')} />
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t('dynamic.selectOne', '从左侧选择一条动态查看详情')}
        </div>
      </div>
    )
  }

  const formattedTime = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(item.createdAt)

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={item.title}
        titleAlign="left"
        actions={
          <div className="flex items-center gap-1">
            {!item.requiresAction && (
              <HeaderIconButton icon={<BellOff className="h-4 w-4" />} tooltip={t('dynamic.mute', '静音')} onClick={() => void mute()} />
            )}
            {!item.requiresAction && (
              <HeaderIconButton
                icon={<Trash2 className="h-4 w-4" />}
                tooltip={t('dynamic.clear', '清除')}
                onClick={() => void window.electronAPI.clearDynamicItem(workspaceId, item.id).then(refresh)}
              />
            )}
            {(item.source || item.automationId || item.projectId) && (
              <HeaderIconButton icon={<ExternalLink className="h-4 w-4" />} tooltip={t('dynamic.openSource', '打开来源')} onClick={() => void openSource()} />
            )}
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto max-w-3xl px-8 py-10">
          <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldAlert className={item.requiresAction ? 'h-4 w-4 text-amber-500' : 'h-4 w-4'} />
            <span>{formattedTime}</span>
            {!item.readAt && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">{t('dynamic.unread', '未读')}</span>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
          {item.body && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-foreground/80">{item.body}</p>}
          {item.requiresAction && item.kind === 'permission' && (
            <div className="mt-8 flex gap-2">
              <Button variant="outline" onClick={() => void decidePermission(false)}>{t('dynamic.reject', '拒绝')}</Button>
              <Button onClick={() => void decidePermission(true)}>{t('dynamic.approve', '批准')}</Button>
            </div>
          )}
        </article>
      </div>
    </div>
  )
}
