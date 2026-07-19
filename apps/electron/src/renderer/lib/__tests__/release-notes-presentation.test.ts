import { describe, expect, it } from 'bun:test'
import { getReleaseNotesPresentation } from '../release-notes-presentation'

describe('getReleaseNotesPresentation', () => {
  it('does not interrupt a new installation', () => {
    expect(getReleaseNotesPresentation('0.11.9', '')).toEqual({ unseen: true, autoOpen: false })
  })

  it('opens release notes once when an existing installation upgrades', () => {
    expect(getReleaseNotesPresentation('0.11.9', '0.11.8')).toEqual({ unseen: true, autoOpen: true })
  })

  it('does nothing after the latest version has been read', () => {
    expect(getReleaseNotesPresentation('0.11.9', '0.11.9')).toEqual({ unseen: false, autoOpen: false })
    expect(getReleaseNotesPresentation(undefined, '0.11.8')).toEqual({ unseen: false, autoOpen: false })
  })
})
