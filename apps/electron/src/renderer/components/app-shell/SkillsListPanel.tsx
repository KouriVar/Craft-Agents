import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { SkillAvatar } from '@/components/ui/skill-avatar'
import { PluginAvatar } from '@/components/ui/plugin-avatar'
import { EntityPanel } from '@/components/ui/entity-panel'
import { EntityListEmptyScreen } from '@/components/ui/entity-list-empty'
import { skillSelection } from '@/hooks/useEntitySelection'
import { SkillMenu } from './SkillMenu'
import { SendResourceToWorkspaceDialog } from './SendResourceToWorkspaceDialog'
import { EditPopover, getEditConfig } from '@/components/ui/EditPopover'
import { useActiveWorkspace, useAppShellContext } from '@/context/AppShellContext'
import { getFileManagerName } from '@/lib/platform'
import type { LoadedSkill } from '../../../shared/types'
import { buildSkillListItems, type SkillListItem } from './skill-list-items'

export interface SkillsListPanelProps {
  skills: LoadedSkill[]
  onDeleteSkill: (skillSlug: string) => void
  onSkillClick: (skill: LoadedSkill) => void
  selectedSkillSlug?: string | null
  workspaceId?: string
  workspaceRootPath?: string
  className?: string
}

export function SkillsListPanel({
  skills,
  onDeleteSkill,
  onSkillClick,
  selectedSkillSlug,
  workspaceId,
  workspaceRootPath,
  className,
}: SkillsListPanelProps) {
  const { t } = useTranslation()
  const activeWorkspace = useActiveWorkspace()
  const canRevealLocally = !activeWorkspace?.remoteServer
  const { workspaces, activeWorkspaceId } = useAppShellContext()
  const hasOtherWorkspaces = workspaces.length > 1
  const [expandedPlugins, setExpandedPlugins] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    if (!selectedSkillSlug) return
    const selected = skills.find(skill => skill.slug === selectedSkillSlug)
    if (!selected?.pluginName) return
    setExpandedPlugins(current => {
      if (current.has(selected.pluginName!)) return current
      const next = new Set(current)
      next.add(selected.pluginName!)
      return next
    })
  }, [selectedSkillSlug, skills])

  const items = React.useMemo<SkillListItem[]>(() => {
    return buildSkillListItems(skills, expandedPlugins)
  }, [expandedPlugins, skills])

  // Send to Workspace dialog state
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false)
  const [sendResourceSlug, setSendResourceSlug] = React.useState<string | null>(null)
  const [sendResourceLabel, setSendResourceLabel] = React.useState('')

  return (
    <>
    <EntityPanel<SkillListItem>
      items={items}
      getId={(item) => item.id}
      selection={skillSelection}
      selectedId={selectedSkillSlug}
      onItemClick={(item) => {
        if (item.kind === 'skill') {
          onSkillClick(item.skill)
          return
        }
        setExpandedPlugins(current => {
          const next = new Set(current)
          if (next.has(item.pluginName)) next.delete(item.pluginName)
          else next.add(item.pluginName)
          return next
        })
      }}
      className={className}
      containerProps={{ 'data-list-role': 'skills' }}
      emptyState={
        <EntityListEmptyScreen
          icon={<Zap />}
          title={t('skillsList.noSkillsConfigured')}
          description={t('skillsList.emptyDescription')}
          docKey="skills"
        >
          {workspaceRootPath && (
            <EditPopover
              align="center"
              trigger={
                <button className="inline-flex items-center h-7 px-3 text-xs font-medium rounded-[8px] bg-background shadow-minimal hover:bg-foreground/[0.03] transition-colors">
                  {t('skillsList.addSkill')}
                </button>
              }
              {...getEditConfig('add-skill', workspaceRootPath)}
            />
          )}
        </EntityListEmptyScreen>
      }
      mapItem={(item) => item.kind === 'plugin' ? {
        icon: (
          <PluginAvatar
            plugin={{ name: item.pluginName, displayName: item.displayName, iconPath: item.iconPath }}
            size="sm"
            workspaceId={workspaceId || ''}
          />
        ),
        title: item.displayName,
        badges: (
          <span className="truncate">
            {t('skillsList.pluginSkillCount', {
              defaultValue: '{{count}} skills',
              count: item.skills.length,
            })}
          </span>
        ),
        trailing: (
          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${item.expanded ? 'rotate-90' : ''}`} />
        ),
        disableSelection: true,
        dataAttributes: { 'data-skill-plugin-group': item.pluginName },
      } : {
        icon: <SkillAvatar skill={item.skill} size="sm" workspaceId={workspaceId} />,
        title: item.skill.metadata.name,
        badges: (
          <span className="flex items-center gap-1.5 min-w-0">
            {item.skill.source === 'project' && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-foreground/5 text-muted-foreground">
                {t('skillsList.projectBadge')}
              </span>
            )}
            {item.skill.source === 'builtin' && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-foreground/5 text-muted-foreground">
                {t('skillsList.builtinBadge')}
              </span>
            )}
            <span className="truncate">{item.skill.metadata.description}</span>
          </span>
        ),
        menu: (
          <SkillMenu
            skillSlug={item.skill.slug}
            skillName={item.skill.metadata.name}
            onOpenInNewWindow={() => window.electronAPI.openUrl(`craftagents://skills/skill/${item.skill.slug}?window=focused`)}
            onShowInFinder={async () => {
              if (!canRevealLocally) return
              try {
                await window.electronAPI.showInFolder(item.skill.path)
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                toast.error(t('toast.failedToReveal', { fileManager: getFileManagerName() }), {
                  description: message,
                })
              }
            }}
            canShowInFinder={canRevealLocally}
            onDelete={item.skill.source === 'workspace' ? () => onDeleteSkill(item.skill.slug) : undefined}
            canDelete={item.skill.source === 'workspace'}
            deleteLabel={item.skill.source === 'workspace'
              ? t('skillsList.deleteSkill')
              : item.skill.source === 'builtin'
                ? t('skillsList.managedByApp')
                : t('skillsList.managedByProject')}
            onSendToWorkspace={hasOtherWorkspaces && item.skill.source === 'workspace' ? () => {
              setSendResourceSlug(item.skill.slug)
              setSendResourceLabel(item.skill.metadata.name)
              setSendDialogOpen(true)
            } : undefined}
          />
        ),
        className: item.nested ? 'pl-5' : undefined,
        dataAttributes: item.nested
          ? { 'data-skill-plugin-child': item.skill.pluginName }
          : undefined,
      }}
    />

    {/* Send to Workspace dialog */}
    {sendResourceSlug && (
      <SendResourceToWorkspaceDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        resourceType="skill"
        resourceIds={[sendResourceSlug]}
        resourceLabel={sendResourceLabel}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
      />
    )}
    </>
  )
}
