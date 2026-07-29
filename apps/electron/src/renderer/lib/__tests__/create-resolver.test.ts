import { describe, expect, it } from 'bun:test'
import { resolveCreateIntent } from '../create-resolver'

describe('Create Resolver', () => {
  it('uses the confirmed primary action for each product context', () => {
    expect(resolveCreateIntent({ navigator: 'sessions', filter: { kind: 'allSessions' }, details: null })).toMatchObject({ kind: 'session', label: '新建会话' })
    expect(resolveCreateIntent({ navigator: 'browser', details: null })).toMatchObject({ kind: 'browser-page', label: '新建网页' })
    expect(resolveCreateIntent({ navigator: 'projects', details: null })).toMatchObject({ kind: 'project', label: '新建项目' })
    expect(resolveCreateIntent({ navigator: 'automations', details: null })).toMatchObject({ kind: 'automation', label: '新建自动化' })
    expect(resolveCreateIntent({ navigator: 'library', details: null })).toMatchObject({ kind: 'knowledge-markdown', label: '新建知识文档' })
  })
})
