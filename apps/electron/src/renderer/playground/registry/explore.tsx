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
    mockData: () => ({
      workspaceId: 'playground-workspace',
      recentSessions: [
        { id: 'route-analysis', workspaceId: 'playground-workspace', name: '路线分析', preview: '梳理探索页导航与会话切换逻辑', lastMessageAt: Date.now() },
        { id: 'agent-framework', workspaceId: 'playground-workspace', name: 'Agent 框架实现讨论', preview: '对比 harness 设计并收敛实现方案', lastMessageAt: Date.now() - 3600000 },
        { id: 'onboarding', workspaceId: 'playground-workspace', name: '用户初始访问', preview: '整理首次使用的核心问题', lastMessageAt: Date.now() - 7200000 },
      ],
      recentTabs: [
        { id: 'docs-tab', url: 'https://docs.example.com/agents', title: 'Agent SDK Docs', favicon: null, isLoading: false, canGoBack: false, canGoForward: false, boundSessionId: null, ownerType: 'manual', ownerSessionId: null, isVisible: false, agentControlActive: false, themeColor: null },
      ],
      onOpenSession: () => {},
      onOpenTab: () => {},
      onOpenUrl: () => {},
      onNewSession: () => {},
    }),
  },
]
