import { describe, expect, it } from 'bun:test'
import { isVersionedReleaseNoteFilename } from '../index'

describe('release note filename filtering', () => {
  it('includes only released semantic versions', () => {
    expect(isVersionedReleaseNoteFilename('0.11.9.md')).toBe(true)
    expect(isVersionedReleaseNoteFilename('next.md')).toBe(false)
    expect(isVersionedReleaseNoteFilename('README.md')).toBe(false)
    expect(isVersionedReleaseNoteFilename('0.11.9-local.md')).toBe(false)
  })
})
