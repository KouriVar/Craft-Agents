import type { LoadedSkill } from '../../../shared/types'

export type SkillListItem =
  | { kind: 'skill'; id: string; skill: LoadedSkill; nested: boolean }
  | {
      kind: 'plugin'
      id: string
      pluginName: string
      displayName: string
      iconPath?: string
      skills: LoadedSkill[]
      expanded: boolean
    }

export function buildSkillListItems(skills: LoadedSkill[], expandedPlugins: Set<string>): SkillListItem[] {
  const pluginGroups = new Map<string, LoadedSkill[]>()
  for (const skill of skills) {
    if (!skill.pluginName) continue
    const group = pluginGroups.get(skill.pluginName) ?? []
    group.push(skill)
    pluginGroups.set(skill.pluginName, group)
  }

  const output: SkillListItem[] = []
  const addedPlugins = new Set<string>()
  for (const skill of skills) {
    if (!skill.pluginName) {
      output.push({ kind: 'skill', id: skill.slug, skill, nested: false })
      continue
    }
    if (addedPlugins.has(skill.pluginName)) continue
    addedPlugins.add(skill.pluginName)
    const groupedSkills = pluginGroups.get(skill.pluginName) ?? [skill]
    const expanded = expandedPlugins.has(skill.pluginName)
    output.push({
      kind: 'plugin',
      id: `plugin:${skill.pluginName}`,
      pluginName: skill.pluginName,
      displayName: skill.pluginDisplayName || skill.pluginName,
      iconPath: skill.pluginIconPath,
      skills: groupedSkills,
      expanded,
    })
    if (expanded) {
      for (const child of groupedSkills) {
        output.push({ kind: 'skill', id: child.slug, skill: child, nested: true })
      }
    }
  }
  return output
}
