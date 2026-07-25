import { describe, it, expect, afterEach } from 'bun:test'
import { resolveLoginShell, applyFallbackPaths } from '../shell-env'

describe('resolveLoginShell', () => {
  const origShell = process.env.SHELL
  afterEach(() => {
    if (origShell === undefined) delete process.env.SHELL
    else process.env.SHELL = origShell
  })

  it('returns the SHELL env when it is an absolute existing path', () => {
    process.env.SHELL = '/bin/zsh'
    expect(resolveLoginShell()).toBe('/bin/zsh')
  })

  it('rejects a malicious SHELL value and falls back to a known shell', () => {
    // An injection-style SHELL is absolute but does not exist as a file, so it
    // is skipped and a well-known shell is used instead — never the raw value.
    process.env.SHELL = '/bin/zsh; touch /tmp/pwned_shellenv'
    const result = resolveLoginShell()
    expect(result).not.toContain('touch')
    expect(result).not.toBe('/bin/zsh; touch /tmp/pwned_shellenv')
    expect(result === '/bin/zsh' || result === '/bin/bash' || result === '/bin/sh').toBe(true)
  })

  it('rejects a relative SHELL value', () => {
    process.env.SHELL = 'relative/path/zsh'
    const result = resolveLoginShell()
    expect(result?.startsWith('/')).toBe(true)
  })

  it('falls back when SHELL is unset', () => {
    delete process.env.SHELL
    const result = resolveLoginShell()
    expect(result === '/bin/zsh' || result === '/bin/bash' || result === '/bin/sh').toBe(true)
  })

  it('returns null when no candidate exists', () => {
    process.env.SHELL = '/nonexistent/shell'
    expect(resolveLoginShell(() => false)).toBeNull()
  })

  it('prefers SHELL when it is absolute and exists (injected exists)', () => {
    process.env.SHELL = '/custom/shell'
    expect(resolveLoginShell(() => true)).toBe('/custom/shell')
  })

  it('skips a non-absolute SHELL even when exists returns true', () => {
    process.env.SHELL = 'relative'
    expect(resolveLoginShell(() => true)).toBe('/bin/zsh')
  })
})

describe('applyFallbackPaths', () => {
  const origPath = process.env.PATH
  afterEach(() => {
    process.env.PATH = origPath
  })

  it('prepends common tool paths to PATH', () => {
    process.env.PATH = '/usr/bin:/bin'
    applyFallbackPaths()
    const entries = (process.env.PATH ?? '').split(':')
    expect(entries).toContain('/opt/homebrew/bin')
    expect(entries).toContain('/usr/local/bin')
    expect(entries).toContain('/usr/bin')
  })

  it('dedupes repeated path entries', () => {
    process.env.PATH = '/opt/homebrew/bin:/opt/homebrew/bin:/usr/bin'
    applyFallbackPaths()
    const entries = (process.env.PATH ?? '').split(':')
    const homebrewCount = entries.filter((e) => e === '/opt/homebrew/bin').length
    expect(homebrewCount).toBe(1)
  })
})
