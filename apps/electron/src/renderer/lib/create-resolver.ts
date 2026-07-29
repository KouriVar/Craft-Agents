import type { NavigationState } from '../../shared/types'

export type CreateIntent =
  | { kind: 'session'; label: '新建会话'; projectId?: string }
  | { kind: 'browser-page'; label: '新建网页' }
  | { kind: 'project'; label: '新建项目' }
  | { kind: 'automation'; label: '新建自动化' }
  | { kind: 'knowledge-markdown'; label: '新建知识文档' }
  | { kind: 'capability'; label: '新建专家' }
  | { kind: 'dynamic'; label: '新建会话' }
  | { kind: 'none'; label: '新建' }

/** Resolves the primary creation action from the current product context. */
export function resolveCreateIntent(state: NavigationState, context?: { projectId?: string }): CreateIntent {
  switch (state.navigator) {
    case 'sessions': return { kind: 'session', label: '新建会话', projectId: context?.projectId }
    case 'browser': return { kind: 'browser-page', label: '新建网页' }
    case 'projects': return { kind: 'project', label: '新建项目' }
    case 'automations': return { kind: 'automation', label: '新建自动化' }
    case 'library': return { kind: 'knowledge-markdown', label: '新建知识文档' }
    case 'skills':
    case 'sources': return { kind: 'capability', label: '新建专家' }
    case 'dynamic': return { kind: 'dynamic', label: '新建会话' }
    default: return { kind: 'none', label: '新建' }
  }
}
