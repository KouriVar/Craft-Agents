import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('ExploreHome Phase C contracts', () => {
  const homePath = join(import.meta.dir, '../../components/explore/ExploreHome.tsx')
  const source = readFileSync(homePath, 'utf8')

  it('does not call generateExploreBrief / getOrGenerateExploreBrief on home', () => {
    expect(source.includes('getOrGenerateExploreBrief')).toBe(false)
    expect(source.includes('generateExploreBrief')).toBe(false)
  })

  it('does not render GuidanceSection / TodaySection / work brief blocks', () => {
    expect(source.includes("from './GuidanceSection'")).toBe(false)
    expect(source.includes("from './TodaySection'")).toBe(false)
    expect(source.includes('explore.workBrief')).toBe(false)
    expect(source.includes('explore.nextSteps')).toBe(false)
  })

  it('uses a single completeAndArchive RPC helper', () => {
    const matches = source.match(/completeAndArchiveSession/g) ?? []
    expect(matches.length).toBe(1)
  })
})
