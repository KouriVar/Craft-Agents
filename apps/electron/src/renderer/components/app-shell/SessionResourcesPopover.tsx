import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  File,
  FileCode,
  FileText,
  Folder,
  ExternalLink,
  Globe,
  Image,
  Info,
  ListTree,
  Plus,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PanelHeaderCenterButton } from '@/components/ui/PanelHeaderCenterButton'
import { Input } from '@/components/ui/input'
import { SourceAvatar } from '@/components/ui/source-avatar'
import { SkillAvatar } from '@/components/ui/skill-avatar'
import { useAppShellContext } from '@/context/AppShellContext'
import { getFileManagerName } from '@/lib/platform'
import { cn } from '@/lib/utils'
import type { Message, Session, SessionFile } from '../../../shared/types'

export type ResourceKind = 'context' | 'output' | 'attachment' | 'folder' | 'source' | 'skill' | 'url'

export interface ResourceItem {
  id: string
  kind: ResourceKind
  name: string
  description?: string
  path?: string
  url?: string
  sourceSlug?: string
  skillSlug?: string
}

interface SessionResourcesPopoverProps {
  session: Session
  open: boolean
  onOpenChange: (open: boolean) => void
  alignOffset?: number
}

const INTERNAL_FILE_NAMES = new Set([
  'api-error.json',
  'tool-metadata.json',
  'session.jsonl',
  'session.jsonl.tmp',
  'notes.md',
  'config.json',
])

const INTERNAL_DIR_NAMES = new Set([
  'meta',
  'tmp',
  'logs',
  'attachments',
])

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function dirnameLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 1) return path
  return parts.slice(-2).join('/')
}

function formatFileSize(bytes?: number): string | undefined {
  if (bytes === undefined) return undefined
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function shortUrlLabel(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname === '/' ? '' : parsed.pathname}`
  } catch {
    return url
  }
}

function urlDescription(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function fileIconForName(name: string, className = 'h-4 w-4 text-muted-foreground') {
  const ext = name.split('.').pop()?.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'heic'].includes(ext || '')) {
    return <Image className={className} />
  }
  if (['md', 'markdown', 'txt', 'pdf', 'doc', 'docx'].includes(ext || '')) {
    return <FileText className={className} />
  }
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'yaml', 'yml', 'py', 'go', 'rs', 'css', 'html', 'sh'].includes(ext || '')) {
    return <FileCode className={className} />
  }
  return <File className={className} />
}

function flattenOutputFiles(files: SessionFile[], output: ResourceItem[] = [], parentNames: string[] = []): ResourceItem[] {
  for (const file of files) {
    if (file.name.startsWith('.')) continue
    if (file.type === 'directory') {
      if (INTERNAL_DIR_NAMES.has(file.name)) continue
      if (file.children?.length) flattenOutputFiles(file.children, output, [...parentNames, file.name])
      continue
    }

    if (INTERNAL_FILE_NAMES.has(file.name)) continue
    output.push({
      id: `output:${file.path}`,
      kind: 'output',
      name: file.name,
      description: [parentNames.join('/'), formatFileSize(file.size)].filter(Boolean).join(' - '),
      path: file.path,
    })
  }
  return output
}

function flattenSessionFiles(files: SessionFile[], output: ResourceItem[] = [], parentNames: string[] = []): ResourceItem[] {
  for (const file of files) {
    if (file.name.startsWith('.') || file.type === 'directory') {
      if (file.type === 'directory' && file.children?.length) {
        flattenSessionFiles(file.children, output, [...parentNames, file.name])
      }
      continue
    }

    output.push({
      id: `session-file:${file.path}`,
      kind: 'output',
      name: file.name,
      description: [parentNames.join('/'), formatFileSize(file.size)].filter(Boolean).join(' - '),
      path: file.path,
    })
  }
  return output
}

function collectAttachments(messages: Message[]): ResourceItem[] {
  const seen = new Set<string>()
  const items: ResourceItem[] = []

  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      const path = attachment.storedPath || attachment.thumbnailPath || attachment.markdownPath
      const key = path || attachment.id || attachment.name
      if (!key || seen.has(key)) continue
      seen.add(key)
      items.push({
        id: `attachment:${key}`,
        kind: 'attachment',
        name: attachment.name,
        description: formatFileSize(attachment.size) ?? attachment.mimeType,
        path,
      })
    }
  }

  return items
}

function collectUrls(session: Session): ResourceItem[] {
  const seen = new Set<string>()
  const items: ResourceItem[] = []
  const urlRegex = /https?:\/\/[^\s<>"')\]}]+/gi
  const texts = [
    session.name,
    session.preview,
    ...session.messages.map((message) => message.content),
    ...session.messages.flatMap((message) => (message.badges ?? []).map((badge) => badge.rawText)),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  for (const text of texts) {
    for (const match of text.matchAll(urlRegex)) {
      const url = match[0].replace(/[.,;:!?]+$/, '')
      if (!url || seen.has(url)) continue
      seen.add(url)
      items.push({
        id: `url:${url}`,
        kind: 'url',
        name: shortUrlLabel(url),
        description: urlDescription(url),
        url,
      })
    }
  }

  return items
}

export function ResourceIcon({ item }: { item: ResourceItem }) {
  const { enabledSources, skills, activeWorkspaceId } = useAppShellContext()

  if (item.kind === 'context') return <Info className="h-4 w-4 text-muted-foreground" />
  if (item.kind === 'url') return <Globe className="h-4 w-4 text-muted-foreground" />
  if (item.kind === 'folder') return <Folder className="h-4 w-4 text-muted-foreground" />
  if (item.kind === 'skill') {
    const skill = skills?.find((entry) => entry.slug === item.skillSlug)
    if (skill) return <SkillAvatar skill={skill} size="sm" workspaceId={activeWorkspaceId ?? undefined} />
    return <Zap className="h-4 w-4 text-muted-foreground" />
  }
  if (item.kind === 'source') {
    const source = enabledSources?.find((entry) => entry.config.slug === item.sourceSlug)
    if (source) return <SourceAvatar source={source} size="sm" />
    return <Sparkles className="h-4 w-4 text-muted-foreground" />
  }
  return fileIconForName(item.name)
}

export function ResourceRow({ item, onOpen }: { item: ResourceItem; onOpen: (item: ResourceItem) => void }) {
  const clickable = !!item.path || !!item.url

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => onOpen(item)}
      className={cn(
        'grid h-9 w-full grid-cols-[22px_minmax(0,1fr)] items-center gap-2 rounded-[7px] px-2 text-left transition-colors',
        clickable ? 'hover:bg-sidebar-hover text-foreground/85' : 'text-foreground/75 cursor-default',
      )}
      title={item.path ?? item.url ?? item.name}
    >
      <span className="flex h-5 w-5 items-center justify-center">
        <ResourceIcon item={item} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm leading-tight">{item.name}</span>
        {item.description && (
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">
            {item.description}
          </span>
        )}
      </span>
    </button>
  )
}

function ResourceSection({
  title,
  empty,
  items,
  onOpen,
  actionLabel,
  onAction,
  actionIcon,
  visibleCount = 4,
  viewAllLabel,
  onViewAll,
}: {
  title: string
  empty: string
  items: ResourceItem[]
  onOpen: (item: ResourceItem) => void
  actionLabel?: string
  onAction?: () => void
  actionIcon?: React.ReactNode
  visibleCount?: number
  viewAllLabel?: string
  onViewAll?: () => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = React.useState(false)
  const visibleItems = expanded && !onViewAll ? items : items.slice(0, visibleCount)
  const hiddenCount = Math.max(0, items.length - visibleItems.length)
  const handleViewMore = React.useCallback(() => {
    if (onViewAll) {
      onViewAll()
      return
    }
    setExpanded(true)
  }, [onViewAll])

  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between px-1 pb-1">
        <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            disabled={!onAction}
            className="flex h-6 w-6 items-center justify-center rounded-[5px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            aria-label={actionLabel}
            title={actionLabel}
          >
            {actionIcon ?? <Plus className="h-4 w-4" />}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="px-2 py-2 text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="grid gap-0.5">
          {visibleItems.map((item) => (
            <ResourceRow key={item.id} item={item} onOpen={onOpen} />
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={handleViewMore}
              className="flex h-8 items-center gap-2 rounded-[7px] px-2 text-left text-sm text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
            >
              <ListTree className="h-4 w-4" />
              <span>{viewAllLabel ?? t('resources.viewMore', { count: hiddenCount })}</span>
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function TitleSection({ session }: { session: Session }) {
  const { t } = useTranslation()
  const { onRenameSession } = useAppShellContext()
  const [name, setName] = React.useState(session.name || '')
  const renameTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    setName(session.name || '')
  }, [session.name])

  React.useEffect(() => {
    return () => {
      if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current)
    }
  }, [])

  const handleNameChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextName = event.target.value
    setName(nextName)

    if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current)
    renameTimeoutRef.current = setTimeout(() => {
      const trimmed = nextName.trim()
      if (trimmed) onRenameSession(session.id, trimmed)
    }, 500)
  }, [onRenameSession, session.id])

  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between px-1 pb-1">
        <h3 className="text-xs font-semibold text-muted-foreground">{t('chat.title')}</h3>
      </div>
      <div className="rounded-[8px] bg-foreground-2 has-[:focus]:bg-background shadow-minimal transition-colors">
        <Input
          value={name}
          onChange={handleNameChange}
          placeholder={t('chat.titlePlaceholder')}
          className="h-9 border-0 bg-transparent px-3 py-2 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
    </section>
  )
}

export function SessionResourcesPopover({ session, open, onOpenChange, alignOffset = 0 }: SessionResourcesPopoverProps) {
  const { t } = useTranslation()
  const { activeWorkspaceId, enabledSources, onOpenFile, onOpenUrl, workspaces } = useAppShellContext()
  const [files, setFiles] = React.useState<SessionFile[]>([])
  const [loadingFiles, setLoadingFiles] = React.useState(false)
  const activeWorkspace = React.useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  )

  const loadFiles = React.useCallback(async () => {
    setLoadingFiles(true)
    try {
      const sessionFiles = await window.electronAPI.getSessionFiles(session.id)
      setFiles(sessionFiles)
    } catch (error) {
      console.error('[SessionResourcesPopover] Failed to load session files:', error)
      setFiles([])
    } finally {
      setLoadingFiles(false)
    }
  }, [session.id])

  React.useEffect(() => {
    if (!open) return
    void loadFiles()
  }, [loadFiles, open, session.id])

  const outputs = React.useMemo(() => flattenOutputFiles(files), [files])
  const sessionFileItems = React.useMemo(() => flattenSessionFiles(files), [files])

  const contextItems = React.useMemo<ResourceItem[]>(() => {
    const title = session.name || session.preview || session.id
    return [{
      id: `context:${session.id}`,
      kind: 'context',
      name: title,
      description: session.id,
    }]
  }, [session.id, session.name, session.preview])

  const sourceItems = React.useMemo<ResourceItem[]>(() => {
    const items: ResourceItem[] = []
    const seen = new Set<string>()
    const push = (item: ResourceItem) => {
      if (seen.has(item.id)) return
      seen.add(item.id)
      items.push(item)
    }

    for (const attachment of collectAttachments(session.messages)) push(attachment)
    for (const url of collectUrls(session)) push(url)

    const directory = session.workingDirectory || activeWorkspace?.rootPath
    if (directory) {
      push({
        id: `folder:${directory}`,
        kind: 'folder',
        name: basename(directory),
        description: dirnameLabel(directory),
        path: directory,
      })
    }

    for (const slug of session.enabledSourceSlugs ?? []) {
      const source = enabledSources?.find((entry) => entry.config.slug === slug)
      push({
        id: `source:${slug}`,
        kind: 'source',
        name: source?.config.name ?? slug,
        description: source?.config.type,
        sourceSlug: slug,
      })
    }

    const badgeItems = session.messages.flatMap((message) => message.badges ?? [])
    for (const badge of badgeItems) {
      if (badge.type === 'source') {
        push({
          id: `source-badge:${badge.rawText}`,
          kind: 'source',
          name: badge.label,
          description: badge.rawText,
        })
      }
      if (badge.type === 'skill') {
        push({
          id: `skill-badge:${badge.rawText}`,
          kind: 'skill',
          name: badge.label,
          description: badge.rawText,
        })
      }
      if ((badge.type === 'file' || badge.type === 'folder') && badge.filePath) {
        push({
          id: `${badge.type}:${badge.filePath}`,
          kind: badge.type === 'folder' ? 'folder' : 'attachment',
          name: badge.label,
          description: badge.rawText,
          path: badge.filePath,
        })
      }
    }

    return items
  }, [activeWorkspace?.rootPath, enabledSources, session.enabledSourceSlugs, session.messages, session.workingDirectory])

  const handleOpen = React.useCallback((item: ResourceItem) => {
    if (item.url) {
      onOpenUrl(item.url)
      return
    }
    if (!item.path) return
    if (item.kind === 'folder') {
      void window.electronAPI.openFile(item.path)
      return
    }
    onOpenFile(item.path)
  }, [onOpenFile, onOpenUrl])

  const fileManagerName = getFileManagerName()
  const handleShowSessionFolder = React.useCallback(() => {
    if (session.sessionFolderPath) void window.electronAPI.showInFolder(session.sessionFolderPath)
  }, [session.sessionFolderPath])

  const insertPrompt = React.useCallback((text: string) => {
    window.dispatchEvent(new CustomEvent('craft:insert-text', {
      detail: { sessionId: session.id, text },
    }))
    onOpenChange(false)
  }, [onOpenChange, session.id])

  const handleCreateOutput = React.useCallback(() => {
    insertPrompt(t('resources.createOutputPrompt'))
  }, [insertPrompt, t])

  const handleAddSource = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent('craft:open-source-selector', {
      detail: { sessionId: session.id },
    }))
    onOpenChange(false)
  }, [onOpenChange, session.id])

  const handleViewAllSources = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent('craft:right-sidebar-open-sources', {
      detail: { sessionId: session.id, items: sourceItems },
    }))
    onOpenChange(false)
  }, [onOpenChange, session.id, sourceItems])

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <PanelHeaderCenterButton
          icon={<ListTree className="h-4 w-4" />}
          tooltip={t('resources.openPanel')}
          aria-label={t('resources.openPanel')}
          className={open ? 'opacity-100 text-accent' : undefined}
        />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        alignOffset={alignOffset}
        sideOffset={10}
        collisionPadding={14}
        className="w-[var(--resources-panel-width,360px)] max-w-[calc(100vw-28px)] max-h-[min(560px,calc(100vh-72px))] overflow-hidden rounded-[14px] border border-border/70 bg-background/95 p-0 shadow-modal-small backdrop-blur-xl"
        style={{
          '--resources-panel-width': 'min(360px, calc(100vw - 28px))',
        } as React.CSSProperties}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <TitleSection session={session} />

            <div className="my-3 h-px bg-border/50" />

            <ResourceSection
              title={t('resources.title')}
              empty=""
              items={contextItems}
              onOpen={handleOpen}
            />

            <div className="my-3 h-px bg-border/50" />

            <ResourceSection
              title={t('chat.sessionFiles')}
              empty={loadingFiles ? t('chat.sessionFilesLoading') : t('chat.sessionFilesEmpty')}
              items={sessionFileItems}
              onOpen={handleOpen}
              actionLabel={session.sessionFolderPath ? t('chat.viewInFileManager', { fileManager: fileManagerName }) : undefined}
              actionIcon={<ExternalLink className="h-3.5 w-3.5" />}
              onAction={session.sessionFolderPath ? handleShowSessionFolder : undefined}
            />

            <div className="my-3 h-px bg-border/50" />

            <ResourceSection
              title={t('resources.outputs')}
              empty={loadingFiles ? t('chat.sessionFilesLoading') : t('resources.noOutputs')}
              items={outputs}
              onOpen={handleOpen}
              actionLabel={t('resources.createOutput')}
              onAction={handleCreateOutput}
            />

            <div className="my-3 h-px bg-border/50" />

            <ResourceSection
              title={t('resources.sources')}
              empty={t('resources.noSources')}
              items={sourceItems}
              onOpen={handleOpen}
              visibleCount={3}
              viewAllLabel={t('resources.viewAll')}
              onViewAll={sourceItems.length > 3 ? handleViewAllSources : undefined}
              actionLabel={t('resources.addSource')}
              onAction={handleAddSource}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
