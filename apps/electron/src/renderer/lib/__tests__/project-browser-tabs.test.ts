import { describe, expect, it } from 'bun:test'
import type { SessionMeta } from '@/atoms/sessions'
import type { BrowserWorkspaceTab } from '@/atoms/browser-workspace'
import { findProjectBrowserTabs, tabHostname } from '../project-browser-tabs'

function meta(partial: Partial<SessionMeta> & { id: string }): SessionMeta {
  return { workspaceId: 'ws', ...partial }
}

function tab(partial: Partial<BrowserWorkspaceTab> & { id: string; url: string }): BrowserWorkspaceTab {
  return {
    title: 'Page',
    favicon: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    boundSessionId: null,
    ownerType: 'manual',
    ownerSessionId: null,
    isVisible: false,
    agentControlActive: false,
    themeColor: null,
    ...partial,
  }
}

describe('project-browser-tabs', () => {
  it('parses hostname from http(s) urls', () => {
    expect(tabHostname('https://docs.example.com/agents?x=1')).toBe('docs.example.com')
    expect(tabHostname('not-a-url')).toBeUndefined()
  })

  it('attributes tabs via ownerSessionId → session.projectId', () => {
    const sessions = new Map([
      ['sess-a', meta({ id: 'sess-a', projectId: 'proj_a' })],
      ['sess-b', meta({ id: 'sess-b', projectId: 'proj_b' })],
    ])
    const tabs = [
      tab({ id: 't1', url: 'https://a.example/1', title: 'A1', ownerSessionId: 'sess-a' }),
      tab({ id: 't2', url: 'https://b.example/1', title: 'B1', ownerSessionId: 'sess-b' }),
      tab({ id: 't3', url: 'https://a.example/2', title: 'A2', ownerSessionId: 'sess-a' }),
      tab({ id: 't4', url: 'about:blank', ownerSessionId: 'sess-a' }),
      tab({ id: 't5', url: 'https://orphan.example', ownerSessionId: 'missing' }),
    ]

    const result = findProjectBrowserTabs(tabs, sessions, 'proj_a', { limit: 5 })
    expect(result.map((item) => item.id)).toEqual(['t1', 't3'])
    expect(result[0]?.hostname).toBe('a.example')
  })

  it('falls back to boundSessionId when ownerSessionId is null', () => {
    const sessions = [meta({ id: 'sess-bound', projectId: 'proj_a' })]
    const tabs = [
      tab({
        id: 't-bound',
        url: 'https://bound.example',
        title: 'Bound',
        ownerSessionId: null,
        boundSessionId: 'sess-bound',
        ownerType: 'session',
      }),
    ]
    expect(findProjectBrowserTabs(tabs, sessions, 'proj_a')).toHaveLength(1)
    expect(findProjectBrowserTabs(tabs, sessions, 'proj_a')[0]?.id).toBe('t-bound')
  })

  it('prefers ownerSessionId over boundSessionId for attribution', () => {
    const sessions = new Map([
      ['sess-owner', meta({ id: 'sess-owner', projectId: 'proj_a' })],
      ['sess-bound', meta({ id: 'sess-bound', projectId: 'proj_b' })],
    ])
    const tabs = [
      tab({
        id: 't1',
        url: 'https://example.com',
        ownerSessionId: 'sess-owner',
        boundSessionId: 'sess-bound',
      }),
    ]
    expect(findProjectBrowserTabs(tabs, sessions, 'proj_a').map((t) => t.id)).toEqual(['t1'])
    expect(findProjectBrowserTabs(tabs, sessions, 'proj_b')).toHaveLength(0)
  })

  it('promotes visible tabs and respects limit', () => {
    const sessions = new Map([['s', meta({ id: 's', projectId: 'proj_a' })]])
    const tabs = [
      tab({ id: 't1', url: 'https://example.com/1', ownerSessionId: 's', isVisible: false }),
      tab({ id: 't2', url: 'https://example.com/2', ownerSessionId: 's', isVisible: true }),
      tab({ id: 't3', url: 'https://example.com/3', ownerSessionId: 's', isVisible: false }),
    ]
    const result = findProjectBrowserTabs(tabs, sessions, 'proj_a', { limit: 2 })
    expect(result.map((item) => item.id)).toEqual(['t2', 't1'])
  })

  it('returns empty when no tabs match the project', () => {
    expect(findProjectBrowserTabs(
      [tab({ id: 't', url: 'https://example.com', ownerSessionId: 's' })],
      [meta({ id: 's', projectId: 'other' })],
      'proj_a',
    )).toEqual([])
  })
})
