import * as React from "react"
import { Folder, GitBranch } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAppShellContext } from "@/context/AppShellContext"
import { cn } from "@/lib/utils"
import { getSessionPreviewText, getSessionTitle } from "@/utils/session"
import type { SessionMeta } from "@/atoms/sessions"

interface SessionHoverPreviewProps {
  item: SessionMeta
  disabled?: boolean
  children: React.ReactNode
}

function basename(path?: string): string | null {
  if (!path) return null
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function truncateText(content: string | null, maxLength: number): string | null {
  if (!content) return null
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trimEnd()}…`
}

export function SessionHoverPreview({ item, disabled, children }: SessionHoverPreviewProps) {
  const { workspaces } = useAppShellContext()
  const [open, setOpen] = React.useState(false)
  const [branch, setBranch] = React.useState<string | null>(null)
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const title = getSessionTitle(item)
  const preview = truncateText(getSessionPreviewText(item, 140), 140)
  const workspace = workspaces.find(entry => entry.id === item.workspaceId)
  const workspaceLabel = workspace?.name || basename(item.workingDirectory) || 'Workspace'

  const clearCloseTimer = React.useCallback(() => {
    if (!closeTimerRef.current) return
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }, [])

  const openPreview = React.useCallback(() => {
    clearCloseTimer()
    setOpen(true)
  }, [clearCloseTimer])

  const scheduleClose = React.useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = setTimeout(() => {
      setOpen(false)
    }, 120)
  }, [clearCloseTimer])

  React.useEffect(() => {
    return () => clearCloseTimer()
  }, [clearCloseTimer])

  React.useEffect(() => {
    if (!open || !item.workingDirectory) {
      setBranch(null)
      return
    }
    let cancelled = false
    void window.electronAPI?.getGitBranch?.(item.workingDirectory)
      .then((nextBranch) => {
        if (!cancelled) setBranch(nextBranch ?? null)
      })
      .catch(() => {
        if (!cancelled) setBranch(null)
      })
    return () => {
      cancelled = true
    }
  }, [item.workingDirectory, open])

  if (disabled) return <>{children}</>

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          onMouseEnter={openPreview}
          onMouseLeave={scheduleClose}
          onFocus={openPreview}
          onBlur={scheduleClose}
        >
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="center"
        sideOffset={14}
        collisionPadding={12}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={openPreview}
        onMouseLeave={scheduleClose}
        className={cn(
          "w-[260px] rounded-[12px] border border-border/70 bg-background/95 p-4 shadow-xl backdrop-blur-xl",
          "data-[side=right]:slide-in-from-left-1"
        )}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-snug text-foreground">
              {title}
            </div>
            {preview && (
              <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {preview}
              </div>
            )}
          </div>
          {item.messageCount ? (
            <div className="shrink-0 text-xs text-muted-foreground">
              {item.messageCount}
            </div>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2 text-sm text-foreground/80">
          <div className="flex min-w-0 items-center gap-2">
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{workspaceLabel}</span>
          </div>
          {branch && (
            <div className="flex min-w-0 items-center gap-2">
              <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{branch}</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
