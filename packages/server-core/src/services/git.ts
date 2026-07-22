import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitAction, GitActionResult, GitRepositoryStatus } from '@craft-agent/shared/protocol'

const execFileAsync = promisify(execFile)

async function run(cwd: string, command: string, args: string[], timeout = 15_000): Promise<string> {
  const result = await execFileAsync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  })
  return `${result.stdout ?? ''}`.trim()
}

async function git(cwd: string, args: string[], timeout?: number): Promise<string> {
  return run(cwd, 'git', args, timeout)
}

export async function getGitRepositoryStatus(cwd: string): Promise<GitRepositoryStatus> {
  try {
    const root = await git(cwd, ['rev-parse', '--show-toplevel'])
    const branch = await git(cwd, ['branch', '--show-current'])
    const upstream = await git(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).catch(() => '')
    const counts = upstream
      ? await git(cwd, ['rev-list', '--left-right', '--count', `${upstream}...HEAD`]).catch(() => '0\t0')
      : '0\t0'
    const [behind = 0, ahead = 0] = counts.split(/\s+/).map((value) => Number(value) || 0)
    const porcelain = await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    const entries = porcelain.split('\0').filter(Boolean)
    const files: GitRepositoryStatus['files'] = []
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      if (entry.length < 4) continue
      const indexStatus = entry[0]
      const worktreeStatus = entry[1]
      const path = entry.slice(3)
      files.push({ path, indexStatus, worktreeStatus, staged: indexStatus !== ' ' && indexStatus !== '?' })
      // In porcelain v1 -z mode, rename/copy records carry the original path
      // in the following NUL-delimited field; it is metadata, not another file.
      if (indexStatus === 'R' || indexStatus === 'C' || worktreeStatus === 'R' || worktreeStatus === 'C') index += 1
    }
    const branches = (await git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']))
      .split('\n').map((value) => value.trim()).filter(Boolean)
    const remoteLines = (await git(cwd, ['remote', '-v'])).split('\n').filter(Boolean)
    const remotes = [...new Map(remoteLines.map((line) => {
      const [name = '', url = ''] = line.split(/\s+/)
      return [name, { name, url }] as const
    })).values()].filter((item) => item.name && item.url)
    const prJson = await run(cwd, 'gh', ['pr', 'view', '--json', 'url,title,state']).catch(() => '')
    let pullRequest: GitRepositoryStatus['pullRequest']
    if (prJson) {
      try { pullRequest = JSON.parse(prJson) as GitRepositoryStatus['pullRequest'] } catch { /* ignore invalid gh output */ }
    }
    return {
      isRepository: true,
      root,
      branch: branch || 'HEAD',
      detached: !branch,
      upstream: upstream || undefined,
      ahead,
      behind,
      files,
      branches,
      remotes,
      pullRequest,
    }
  } catch (error) {
    return { isRepository: false, ahead: 0, behind: 0, files: [], branches: [], remotes: [], error: error instanceof Error ? error.message : String(error) }
  }
}

function cleanRef(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('-') || !/^[A-Za-z0-9._/-]+$/.test(trimmed)) throw new Error('Invalid branch name')
  return trimmed
}

export async function runGitAction(cwd: string, action: GitAction): Promise<GitActionResult> {
  try {
    let output = ''
    switch (action.type) {
      case 'stageAll': output = await git(cwd, ['add', '-A']); break
      case 'unstageAll': output = await git(cwd, ['reset']); break
      case 'commit':
        if (!action.message.trim()) throw new Error('Commit message is required')
        output = await git(cwd, ['commit', '-m', action.message.trim()], 60_000)
        break
      case 'checkout': output = await git(cwd, ['switch', cleanRef(action.branch)]); break
      case 'createBranch': output = await git(cwd, ['switch', '-c', cleanRef(action.branch)]); break
      case 'pull': output = await git(cwd, ['pull', '--ff-only'], 60_000); break
      case 'push': {
        const status = await getGitRepositoryStatus(cwd)
        output = status.upstream
          ? await git(cwd, ['push'], 60_000)
          : await git(cwd, ['push', '-u', 'origin', cleanRef(status.branch ?? '')], 60_000)
        break
      }
      case 'sync':
        output = `${await git(cwd, ['pull', '--ff-only'], 60_000)}\n${await git(cwd, ['push'], 60_000)}`.trim()
        break
      case 'diff': {
        const args = ['diff']
        if (action.staged) args.push('--cached')
        if (action.base) args.push(`${cleanRef(action.base)}...HEAD`)
        if (action.path) args.push('--', action.path)
        output = await git(cwd, args)
        break
      }
      case 'createPullRequest': {
        const url = await run(cwd, 'gh', ['pr', 'create', '--fill'], 60_000)
        return { ok: true, output: url, url: url.match(/https?:\/\/\S+/)?.[0] }
      }
    }
    return { ok: true, output }
  } catch (error) {
    const detail = error as { stderr?: string; stdout?: string; message?: string }
    return { ok: false, error: `${detail.stderr || detail.stdout || detail.message || error}`.trim() }
  }
}
