import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSession, useAppShellContext } from '@/context/AppShellContext'
import { cn } from '@/lib/utils'
import { SessionFilesSection } from '../right-sidebar/SessionFilesSection'
import { ContinueFromHereSection, UsageSection } from './SessionResourcesPopover'
import { TaskContinuitySection } from './TaskContinuitySection'
import { useLibraryGenerateFromSession } from '@/hooks/useLibraryGenerateFromSession'

interface SessionInfoPopoverProps {
  sessionId: string
  sessionFolderPath?: string
  trigger: React.ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  contentClassName?: string
  presentation?: 'popover' | 'drawer'
}

const DEFAULT_POPOVER_CONTENT_CLASS = 'w-[380px] h-[min(680px,calc(100vh-120px))] min-w-[280px] max-w-[420px] overflow-hidden rounded-[10px] bg-background text-foreground shadow-modal-small p-0'
const DEFAULT_DRAWER_CONTENT_CLASS = [
  'data-[vaul-drawer-direction=bottom]:inset-x-2',
  'data-[vaul-drawer-direction=bottom]:bottom-2',
  'data-[vaul-drawer-direction=bottom]:mt-0',
  'data-[vaul-drawer-direction=bottom]:max-h-[min(82vh,42rem)]',
  'overflow-hidden rounded-[14px] border border-border/60 bg-background shadow-modal-small',
].join(' ')

export function SessionInfoPopover({
  sessionId,
  sessionFolderPath,
  trigger,
  side = 'top',
  align = 'end',
  sideOffset = 6,
  contentClassName,
  presentation = 'popover',
}: SessionInfoPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)

    if (!nextOpen) {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('craft:focus-input', {
          detail: { sessionId },
        }))
      })
    }
  }, [sessionId])

  if (presentation === 'drawer') {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange} direction="bottom">
        <DrawerTrigger asChild>
          {trigger}
        </DrawerTrigger>
        <DrawerContent
          className={cn(DEFAULT_DRAWER_CONTENT_CLASS, contentClassName)}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
          }}
        >
          <DrawerHeader className="border-b border-border/50 px-4 py-3 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle className="text-sm font-medium">{t('chat.sessionStatus')}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <SessionInfoContent sessionId={sessionId} sessionFolderPath={sessionFolderPath} />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className={contentClassName ?? DEFAULT_POPOVER_CONTENT_CLASS}
        side={side}
        align={align}
        sideOffset={sideOffset}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
        }}
      >
        <SessionInfoContent sessionId={sessionId} sessionFolderPath={sessionFolderPath} />
      </PopoverContent>
    </Popover>
  )
}

export function SessionInfoContent({ sessionId, sessionFolderPath }: { sessionId: string; sessionFolderPath?: string }) {
  const session = useSession(sessionId)
  const { t } = useTranslation()
  const { activeWorkspaceId } = useAppShellContext()
  const libraryGenerate = useLibraryGenerateFromSession(activeWorkspaceId)

  return (
    <ScrollArea className="h-full min-h-0 [&_[data-slot=scroll-bar]]:w-1.5">
      <div className="min-h-full">
        {libraryGenerate.dialog}
        <div className="border-b border-border/50">
          <SessionFilesSection
            sessionId={sessionId}
            sessionFolderPath={sessionFolderPath}
            hideHeader={false}
            autoHeight
          />
        </div>
        {session && (
          <div className="px-3 pb-3 pt-3">
            <TaskContinuitySection session={session} />
            <ContinueFromHereSection session={session} />
            {activeWorkspaceId && (
              <button
                type="button"
                className="mt-3 w-full rounded-control border border-border/50 px-3 py-2 text-left text-xs font-medium hover:bg-foreground/[0.04]"
                onClick={() => { void libraryGenerate.start(sessionId) }}
              >
                {t('library.createFromSession')}
              </button>
            )}
            <div className="my-3 h-px bg-border/50" />
            <UsageSection session={session} />
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
