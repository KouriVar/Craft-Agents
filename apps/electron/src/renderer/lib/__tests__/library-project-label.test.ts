import { describe, expect, it } from 'bun:test'
import { resolveLibraryProjectLabel } from '../library-project-label'

describe('resolveLibraryProjectLabel', () => {
  const projects = [
    { config: { id: 'proj_a', name: 'Alpha', color: '#112233' } },
    { config: { id: 'proj_b', name: 'Beta' } },
  ]

  it('resolves projectId to a readable project name and color', () => {
    expect(resolveLibraryProjectLabel('proj_a', projects)).toEqual({
      name: 'Alpha',
      color: '#112233',
      missing: false,
    })
  })

  it('returns null when projectId is absent', () => {
    expect(resolveLibraryProjectLabel(undefined, projects)).toBeNull()
    expect(resolveLibraryProjectLabel('   ', projects)).toBeNull()
  })

  it('uses a safe missing fallback without throwing when the project is gone', () => {
    expect(() => resolveLibraryProjectLabel('proj_gone', projects)).not.toThrow()
    expect(resolveLibraryProjectLabel('proj_gone', projects)).toEqual({ missing: true })
    expect(resolveLibraryProjectLabel('proj_gone', projects)?.name).toBeUndefined()
  })
})
