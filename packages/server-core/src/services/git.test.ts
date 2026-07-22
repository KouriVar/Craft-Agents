import { afterEach, describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getGitRepositoryStatus, runGitAction } from './git'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'craft-agent-git-'))
  dirs.push(dir)
  return dir
}

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' })
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('git workspace service', () => {
  it('returns a safe non-repository status', async () => {
    const status = await getGitRepositoryStatus(tempDir())
    expect(status.isRepository).toBe(false)
    expect(status.files).toEqual([])
  })

  it('supports status, staging, commits, branches, and diffs', async () => {
    const dir = tempDir()
    git(dir, 'init', '-b', 'main')
    git(dir, 'config', 'user.email', 'test@craft.local')
    git(dir, 'config', 'user.name', 'Craft Test')
    writeFileSync(join(dir, 'note.txt'), 'one\n')

    expect((await getGitRepositoryStatus(dir)).files[0]?.path).toBe('note.txt')
    expect((await runGitAction(dir, { type: 'stageAll' })).ok).toBe(true)
    expect((await getGitRepositoryStatus(dir)).files[0]?.staged).toBe(true)
    expect((await runGitAction(dir, { type: 'commit', message: 'initial' })).ok).toBe(true)
    expect((await runGitAction(dir, { type: 'createBranch', branch: 'feature/test' })).ok).toBe(true)

    writeFileSync(join(dir, 'note.txt'), 'two\n')
    const diff = await runGitAction(dir, { type: 'diff', path: 'note.txt' })
    expect(diff.ok).toBe(true)
    expect(diff.output).toContain('+two')
    expect((await getGitRepositoryStatus(dir)).branch).toBe('feature/test')
  })

  it('rejects option-like branch names', async () => {
    const result = await runGitAction(tempDir(), { type: 'createBranch', branch: '--help' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Invalid branch name')
  })
})
