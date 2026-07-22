import type { ComponentEntry } from './types'
import { ExploreHome } from '@/components/explore/ExploreHome'

export const exploreComponents: ComponentEntry[] = [
  {
    id: 'explore-home',
    name: 'Explore Home',
    category: 'Browser',
    description: 'Unified Explore landing page with input, AI work briefing, and next-step recommendations.',
    component: ExploreHome,
    props: [],
    layout: 'full',
    previewOverflow: 'hidden',
    mockData: () => {
      const sessions = [
        { id: 'release-failed', workspaceId: 'playground-workspace', name: 'v0.13.0 打包与发布', preview: '检查构建失败原因并恢复发布流程', lastMessageAt: Date.now(), lastMessageRole: 'error' as const },
        { id: 'route-analysis', workspaceId: 'playground-workspace', name: '探索页导航收敛', preview: '梳理探索页导航与会话切换逻辑', lastMessageAt: Date.now() - 3600000, taskDueAt: Date.now() + 7200000 },
        { id: 'agent-framework', workspaceId: 'playground-workspace', name: 'Agent 框架实现讨论', preview: '对比 harness 设计并收敛实现方案', lastMessageAt: Date.now() - 7200000, taskCheckpoints: [{ id: 'cp', createdAt: Date.now(), source: 'auto' as const, outcome: 'completed' as const, summary: '执行层已经稳定', nextSteps: ['完成错误恢复验证'] }] },
      ]
      return {
        workspaceId: 'playground-workspace',
        recentSessions: sessions,
        taskSessions: sessions,
        recentTabs: [
          { id: 'docs-tab', url: 'https://docs.example.com/agents', title: 'Agent SDK Docs', favicon: null, isLoading: false, canGoBack: false, canGoForward: false, boundSessionId: null, ownerType: 'manual', ownerSessionId: null, isVisible: false, agentControlActive: false, themeColor: null },
        ],
        onOpenSession: () => {},
        onOpenTab: () => {},
        onOpenUrl: () => {},
        onNewSession: () => {},
      }
    },
  },
]
