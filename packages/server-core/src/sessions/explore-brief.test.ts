import { describe, expect, it } from 'bun:test'
import type { ExploreBriefRequest } from '@craft-agent/shared/protocol'
import { buildExploreBriefPrompt, parseExploreBriefResult } from './explore-brief'

const request: ExploreBriefRequest = {
  workspaceId: 'workspace-1',
  locale: 'zh-Hans',
  recommendationCount: 3,
  sessions: [
    { id: 'session-1', title: '路线分析', preview: '整理当前实现' },
  ],
  tabs: [
    { id: 'tab-1', title: 'Docs', url: 'https://example.com/docs' },
  ],
}

describe('explore brief', () => {
  it('grounds the prompt in the requested locale and recommendation count', () => {
    const prompt = buildExploreBriefPrompt(request)
    expect(prompt).toContain('locale "zh-Hans"')
    expect(prompt).toContain('exactly 3')
    expect(prompt).toContain('session-1')
  })

  it('parses fenced JSON and keeps only grounded targets', () => {
    const result = parseExploreBriefResult(`\`\`\`json
      {
        "headline": "聚焦探索页",
        "summary": "正在整理探索页的信息层级。",
        "threads": [{ "title": "页面改造", "detail": "对齐现有设计系统。" }],
        "recommendations": [
          { "kind": "session", "targetId": "session-1", "title": "继续路线分析", "description": "完成当前改造。" },
          { "kind": "session", "targetId": "invented", "title": "虚构", "description": "不应保留。" },
          { "kind": "prompt", "title": "检查交互", "description": "验证状态。", "prompt": "请检查探索页交互" },
          { "kind": "tab", "targetId": "tab-1", "title": "查阅文档", "description": "核对当前实现。" }
        ]
      }
    \`\`\``, request, 'default-model')

    expect(result.headline).toBe('聚焦探索页')
    expect(result.recommendations).toHaveLength(3)
    expect(result.recommendations[0]?.targetId).toBe('session-1')
    expect(result.model).toBe('default-model')
  })

  it('rejects incomplete output', () => {
    expect(() => parseExploreBriefResult('{"headline":"x"}', request)).toThrow('incomplete')
  })

  it('keeps the AI summary and fills missing sections from grounded activity', () => {
    const result = parseExploreBriefResult(JSON.stringify({
      headline: '继续推进当前工作',
      summary: '目前主要在整理路线分析并查阅相关文档。',
      threads: [],
      recommendations: [
        { kind: 'session', targetId: 'invented', title: '无效会话', description: '不应保留。' },
      ],
    }), request)

    expect(result.headline).toBe('继续推进当前工作')
    expect(result.summary).toContain('路线分析')
    expect(result.threads).toEqual([
      { title: '路线分析', detail: '整理当前实现' },
      { title: 'Docs', detail: 'https://example.com/docs' },
    ])
    expect(result.recommendations).toHaveLength(2)
    expect(result.recommendations.map((item) => item.targetId)).toEqual(['session-1', 'tab-1'])
  })
})
