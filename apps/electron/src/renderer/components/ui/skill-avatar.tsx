/**
 * SkillAvatar - Thin wrapper around EntityIcon for skills.
 *
 * Sets fallbackIcon={Zap} and delegates all rendering to EntityIcon.
 * Use `fluid` prop for fill-parent sizing (e.g., Info_Page.Hero).
 */

import {
  Bot,
  CalendarDays,
  Code2,
  Database,
  FileText,
  FlaskConical,
  GitBranch,
  Image,
  Mail,
  MessageSquare,
  Palette,
  Rocket,
  SearchCheck,
  Sparkles,
  Workflow,
} from 'lucide-react'
import { EntityIcon } from '@/components/ui/entity-icon'
import { useEntityIcon } from '@/lib/icon-cache'
import type { IconSize } from '@craft-agent/shared/icons'
import type { LoadedSkill } from '../../../shared/types'

interface SkillAvatarProps {
  /** LoadedSkill object */
  skill: LoadedSkill
  /** Size variant */
  size?: IconSize
  /** Fill parent container (h-full w-full). Overrides size. */
  fluid?: boolean
  /** Additional className overrides */
  className?: string
  /** Workspace ID for loading local icons */
  workspaceId?: string
}

export function SkillAvatar({ skill, size = 'md', fluid, className, workspaceId }: SkillAvatarProps) {
  const searchableName = `${skill.slug} ${skill.metadata.name} ${skill.metadata.description}`.toLowerCase()
  const fallbackIcon = searchableName.match(/design|figma|style|theme|brand|ui|ux/) ? Palette
    : searchableName.match(/review|audit|inspect|check/) ? SearchCheck
      : searchableName.match(/image|photo|visual|canvas|draw/) ? Image
        : searchableName.match(/code|develop|program|typescript|javascript|python|swift/) ? Code2
          : searchableName.match(/git|commit|branch|pull request|\bpr\b/) ? GitBranch
            : searchableName.match(/test|spec|quality/) ? FlaskConical
              : searchableName.match(/deploy|release|publish|ship/) ? Rocket
                : searchableName.match(/document|docs|pdf|word|write/) ? FileText
                  : searchableName.match(/data|database|sheet|excel|sql/) ? Database
                    : searchableName.match(/automat|workflow|pipeline/) ? Workflow
                      : searchableName.match(/calendar|schedule|event/) ? CalendarDays
                        : searchableName.match(/mail|email|gmail|outlook/) ? Mail
                          : searchableName.match(/chat|message|slack|teams/) ? MessageSquare
                            : searchableName.match(/agent|assistant|bot/) ? Bot
                              : Sparkles
  const icon = useEntityIcon({
    workspaceId: workspaceId ?? '',
    entityType: 'skill',
    identifier: skill.slug,
    iconPath: skill.iconPath ?? skill.pluginIconPath,
    iconValue: skill.metadata.icon,
  })

  return (
    <EntityIcon
      icon={icon}
      size={size}
      fallbackIcon={fallbackIcon}
      alt={skill.metadata.name}
      className={className}
      containerClassName={fluid ? 'h-full w-full' : undefined}
    />
  )
}
