import * as React from 'react'
import {
  Activity,
  Brain,
  Clock3,
  Database,
  Eraser,
  RefreshCw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MemoryGatewayStatus, MemorySettings } from '../../../shared/memory-settings'

const STATUS_LABEL: Record<MemoryGatewayStatus, string> = {
  ok: '运行中',
  degraded: '部分可用',
  unreachable: '不可达',
  stopped: '已停止',
}

const STATUS_CLASS: Record<MemoryGatewayStatus, string> = {
  ok: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  unreachable: 'bg-rose-500',
  stopped: 'bg-muted-foreground',
}

interface MemoryCardsSidebarProps {
  selectedSessionId: string | null
  selectedSessionTitle?: string
  onClose: () => void
  onOpenSettings: () => void
  onSendPrompt: (prompt: string) => void
}

interface MemoryCardProps {
  icon: React.ReactNode
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}

function MemoryCard({ icon, title, action, children }: MemoryCardProps) {
  return (
    <section className="rounded-[8px] border border-border bg-background/65 shadow-minimal">
      <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-foreground/[0.04] text-muted-foreground">
          {icon}
        </div>
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="px-3 py-3">{children}</div>
    </section>
  )
}

function SmallButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-7 items-center justify-center gap-1.5 rounded-[6px] border border-border bg-background px-2 text-[12px] font-medium text-foreground shadow-minimal transition-colors hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

function MemoryPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[6px] bg-foreground/[0.05] px-2 py-1 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  )
}

function settingLabel(settings: MemorySettings | null) {
  if (!settings?.enabled) return '未启用'
  if (!settings.deepseekApiKey) return '缺少 DeepSeek Key'
  if (settings.embeddingApiKey) return 'Hybrid 召回'
  return '关键词召回'
}

export function MemoryCardsSidebar({
  selectedSessionId,
  selectedSessionTitle,
  onClose,
  onOpenSettings,
  onSendPrompt,
}: MemoryCardsSidebarProps) {
  const [settings, setSettings] = React.useState<MemorySettings | null>(null)
  const [status, setStatus] = React.useState<MemoryGatewayStatus>('stopped')

  const loadMemoryState = React.useCallback(async () => {
    const [nextSettings, nextStatus] = await Promise.all([
      window.electronAPI.getMemoryConfig(),
      window.electronAPI.getMemoryStatus(),
    ])
    setSettings(nextSettings)
    setStatus(nextStatus)
  }, [])

  React.useEffect(() => {
    void loadMemoryState()
    const id = window.setInterval(() => {
      void loadMemoryState()
    }, 5000)
    return () => window.clearInterval(id)
  }, [loadMemoryState])

  const recallPrompt = React.useMemo(() => {
    const title = selectedSessionTitle ? `「${selectedSessionTitle}」` : '当前会话'
    return `请回放一下${title}里已经被记忆系统捕捉到的项目偏好、用户偏好和关键上下文，并标出哪些适合长期保留。`
  }, [selectedSessionTitle])

  const forgetPrompt = React.useMemo(() => {
    const title = selectedSessionTitle ? `「${selectedSessionTitle}」` : '当前会话'
    return `请检查${title}里可能不应该长期保留的记忆，并给我一份建议删除清单。`
  }, [selectedSessionTitle])

  return (
    <aside
      className="h-full w-[328px] shrink-0 overflow-hidden rounded-[10px] bg-foreground-2 shadow-middle"
      data-panel-role="memory-sidebar"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-border/70 px-3">
          <Brain className="h-4 w-4 text-accent" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[13px] font-semibold text-foreground">记忆卡片</h1>
          </div>
          <button
            type="button"
            aria-label="关闭记忆卡片"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-3">
            <MemoryCard
              icon={<Activity className="h-3.5 w-3.5" />}
              title="Gateway"
              action={(
                <button
                  type="button"
                  aria-label="刷新记忆状态"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
                  onClick={() => void loadMemoryState()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', STATUS_CLASS[status])} />
                  <span className="text-[13px] font-medium text-foreground">{STATUS_LABEL[status]}</span>
                </div>
                <MemoryPill>{settingLabel(settings)}</MemoryPill>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-[6px] bg-foreground/[0.035] px-2 py-2">
                  <div className="text-muted-foreground">抽取模型</div>
                  <div className="mt-1 truncate font-medium text-foreground">{settings?.deepseekModel || 'deepseek-chat'}</div>
                </div>
                <div className="rounded-[6px] bg-foreground/[0.035] px-2 py-2">
                  <div className="text-muted-foreground">Embedding</div>
                  <div className="mt-1 truncate font-medium text-foreground">{settings?.embeddingModel || '未配置'}</div>
                </div>
              </div>
              <SmallButton className="mt-3 w-full" onClick={onOpenSettings}>
                <Settings className="h-3.5 w-3.5" />
                设置记忆
              </SmallButton>
            </MemoryCard>

            <MemoryCard
              icon={<Sparkles className="h-3.5 w-3.5" />}
              title="本轮召回"
              action={<MemoryPill>{selectedSessionId ? '当前会话' : '未选中'}</MemoryPill>}
            >
              <div className="space-y-2">
                {['项目正在做 Craft Agent 记忆系统集成', '用户偏好中文直接说明，先给结论', '本地分支有未完成改动，暂不推送'].map((item) => (
                  <div key={item} className="rounded-[6px] border border-border/70 bg-background/70 px-2.5 py-2 text-[12px] leading-5 text-foreground">
                    {item}
                  </div>
                ))}
              </div>
              <SmallButton className="mt-3 w-full" disabled={!selectedSessionId} onClick={() => onSendPrompt(recallPrompt)}>
                <Brain className="h-3.5 w-3.5" />
                回放当前记忆
              </SmallButton>
            </MemoryCard>

            <MemoryCard icon={<Clock3 className="h-3.5 w-3.5" />} title="时间线">
              <div className="space-y-3">
                {[
                  ['今天', '修复 Dock 图标、会话滚底、Memory 配置写入'],
                  ['上一轮', 'DeepSeek 和 Embedding 配置开始进入 Gateway'],
                  ['长期', '偏好本地先验证，打包前跑类型检查和构建'],
                ].map(([time, text]) => (
                  <div key={time} className="grid grid-cols-[52px_1fr] gap-2 text-[12px] leading-5">
                    <div className="text-muted-foreground">{time}</div>
                    <div className="text-foreground">{text}</div>
                  </div>
                ))}
              </div>
            </MemoryCard>

            <MemoryCard icon={<Database className="h-3.5 w-3.5" />} title="人格卡">
              <div className="flex flex-wrap gap-1.5">
                {['中文沟通', '先落地再解释', '保护本地改动', '偏好可打包验证', '少打扰'].map((item) => (
                  <MemoryPill key={item}>{item}</MemoryPill>
                ))}
              </div>
              <SmallButton className="mt-3 w-full" disabled={!selectedSessionId} onClick={() => onSendPrompt(forgetPrompt)}>
                <Eraser className="h-3.5 w-3.5" />
                检查可遗忘项
              </SmallButton>
            </MemoryCard>
          </div>
        </div>
      </div>
    </aside>
  )
}
