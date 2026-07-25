import { describe, expect, it } from 'bun:test'
import type { GitRepositoryStatus } from '@craft-agent/shared/protocol'
import type { SessionMeta } from '@/atoms/sessions'
import { adaptGit, resolveGitWorkingDirectory } from '../adapters/git'
import { buildContextFusionSnapshot } from '../context-provider'
import type { LoadedProject } from '@craft-agent/shared/projects/types'

function meta(partial: Partial<SessionMeta> & { id: string }): SessionMeta {
  return { workspaceId: 'ws-1', ...partial }
}

function project(id: string, workingDirectory?: string): LoadedProject {
  return {
    config: {
      id,
      slug: id,
      name: id,
      workingDirectory,
      createdAt: 1,
      updatedAt: 1,
    },
    folderPath: `/craft/projects/${id}`,
    assetsPath: `/craft/projects/${id}/assets`,
    workspaceRootPath: '/craft/ws',
    workspaceId: 'ws-1',
  }
}

function status(partial: Partial<GitRepositoryStatus> = {}): GitRepositoryStatus {
  return {
    isRepository: true,
    root: '/repo',
    branch: 'main',
    ahead: 0,
    behind: 0,
    files: [],
    branches: ['main'],
    remotes: [],
    ...partial,
  }
}

describe('Git fusion adapter (v0.16.7)', () => {
  it('resolves no workingDirectory → null cwd / none', () => {
    const resolved = resolveGitWorkingDirectory(meta({ id: 's1' }), null)
    expect(resolved).toEqual({ cwd: null, resolvedFrom: 'none' })
    expect(adaptGit({
      session: meta({ id: 's1' }),
      projectWorkingDirectory: null,
      status: status(),
    })).toBeNull()
  })

  it('prefers session.workingDirectory over project', () => {
    const resolved = resolveGitWorkingDirectory(
      meta({ id: 's1', workingDirectory: '/session/cwd' }),
      '/project/cwd',
    )
    expect(resolved).toEqual({ cwd: '/session/cwd', resolvedFrom: 'session' })
  })

  it('falls back to project.workingDirectory', () => {
    const resolved = resolveGitWorkingDirectory(meta({ id: 's1' }), '/project/cwd')
    expect(resolved).toEqual({ cwd: '/project/cwd', resolvedFrom: 'project' })
  })

  it('non-git directory yields isRepository false slice', () => {
    const slice = adaptGit({
      session: meta({ id: 's1', workingDirectory: '/not-a-repo' }),
      status: status({ isRepository: false, branch: undefined, root: undefined }),
    })
    expect(slice).toEqual({
      isRepository: false,
      dirtyCount: 0,
      stagedCount: 0,
      ahead: 0,
      behind: 0,
      hasPullRequest: false,
      resolvedFrom: 'session',
    })
  })

  it('maps dirty / staged / ahead / behind / PR from injected status', () => {
    const slice = adaptGit({
      session: meta({ id: 's1', workingDirectory: '/repo' }),
      status: status({
        branch: 'feat/git',
        ahead: 2,
        behind: 1,
        pullRequest: { url: 'https://example.com/pr/1', title: 'Git' },
        files: [
          { path: 'a.ts', indexStatus: 'M', worktreeStatus: ' ', staged: true },
          { path: 'b.ts', indexStatus: ' ', worktreeStatus: 'M', staged: false },
        ],
      }),
    })
    expect(slice).toMatchObject({
      isRepository: true,
      branch: 'feat/git',
      dirtyCount: 2,
      stagedCount: 1,
      ahead: 2,
      behind: 1,
      hasPullRequest: true,
      resolvedFrom: 'session',
    })
  })

  it('provider omits git when gitStatus dep is absent (legacy-compatible)', () => {
    const snapshot = buildContextFusionSnapshot(
      { workspaceId: 'ws-1', sessionId: 's1' },
      {
        sessions: [meta({ id: 's1', workingDirectory: '/repo', taskGoal: 'Work' })],
        projects: [project('proj_a', '/project/cwd')],
      },
    )
    expect(snapshot.git).toBeNull()
  })

  it('provider attaches git when gitStatus is injected', () => {
    const snapshot = buildContextFusionSnapshot(
      { workspaceId: 'ws-1', sessionId: 's1' },
      {
        sessions: [meta({ id: 's1', workingDirectory: '/repo' })],
        gitStatus: status({ branch: 'main', files: [
          { path: 'x.ts', indexStatus: ' ', worktreeStatus: 'M', staged: false },
        ] }),
      },
    )
    expect(snapshot.git?.isRepository).toBe(true)
    expect(snapshot.git?.dirtyCount).toBe(1)
    expect(snapshot.git?.resolvedFrom).toBe('session')
  })
})
