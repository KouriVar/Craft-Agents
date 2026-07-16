import { describe, expect, it } from 'bun:test'
import type { LoadedSkill } from '../../../shared/types'
import { buildSkillListItems } from './skill-list-items'

function skill(slug: string, pluginName?: string): LoadedSkill {
  return {
    slug,
    metadata: { name: slug, description: `${slug} description` },
    content: '',
    path: `/tmp/${slug}`,
    source: pluginName ? 'plugin' : 'workspace',
    pluginName,
    pluginDisplayName: pluginName === 'figma' ? 'Figma' : pluginName,
  }
}

describe('buildSkillListItems', () => {
  it('collapses all internal plugin skills into one parent row', () => {
    const items = buildSkillListItems([
      skill('visualize'),
      skill('figma-use', 'figma'),
      skill('figma-code-connect', 'figma'),
      skill('gmail', 'gmail'),
      skill('gmail-inbox-triage', 'gmail'),
    ], new Set())

    expect(items.map(item => item.id)).toEqual([
      'visualize',
      'plugin:figma',
      'plugin:gmail',
    ])
  })

  it('expands only the selected plugin group into nested skill rows', () => {
    const items = buildSkillListItems([
      skill('figma-use', 'figma'),
      skill('figma-code-connect', 'figma'),
      skill('gmail', 'gmail'),
    ], new Set(['figma']))

    expect(items.map(item => item.id)).toEqual([
      'plugin:figma',
      'figma-use',
      'figma-code-connect',
      'plugin:gmail',
    ])
    expect(items.filter(item => item.kind === 'skill').every(item => item.nested)).toBe(true)
  })
})
