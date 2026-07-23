import { describe, expect, it } from 'bun:test'
import {
  buildTaskReflection,
  buildDailyReflection,
  buildGuidanceFromLoops,
  rankGuidance,
  scoreGuidance,
  type CognitionObservation,
  type CognitionLoop,
  type CognitionGuidance,
} from '../index.ts'

function obs(partial: Partial<CognitionObservation> & Pick<CognitionObservation, 'title' | 'category'>): CognitionObservation {
  const now = Date.now()
  return {
    id: partial.id ?? `obs_${partial.title}`,
    sessionId: partial.sessionId ?? 'sess-1',
    title: partial.title,
    summary: partial.summary ?? partial.title,
    category: partial.category,
    confidence: partial.confidence ?? 0.8,
    importance: partial.importance ?? 0.7,
    sourceEventIds: partial.sourceEventIds ?? ['evt-1'],
    evidenceRefs: partial.evidenceRefs ?? [{ type: 'session', id: 'sess-1', label: 'Session' }],
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    schemaVersion: 1,
  }
}

function loop(partial: Partial<CognitionLoop> & Pick<CognitionLoop, 'title' | 'status'>): CognitionLoop {
  const now = Date.now()
  return {
    id: partial.id ?? `loop_${partial.title}`,
    sessionId: partial.sessionId ?? 'sess-1',
    title: partial.title,
    summary: partial.summary ?? partial.title,
    status: partial.status,
    nextAction: partial.nextAction,
    blocker: partial.blocker,
    waitingFor: partial.waitingFor,
    importance: partial.importance ?? 0.7,
    confidence: partial.confidence ?? 0.8,
    observationIds: partial.observationIds ?? ['obs_1'],
    evidenceRefs: partial.evidenceRefs ?? [{ type: 'session', id: 'sess-1', label: 'Session' }],
    firstSeenAt: partial.firstSeenAt ?? now,
    lastUpdatedAt: partial.lastUpdatedAt ?? now,
    resolvedAt: partial.resolvedAt,
    userManaged: partial.userManaged,
    schemaVersion: 1,
  }
}

describe('reflection rules', () => {
  it('aggregates observations and loops with evidence', () => {
    const observations = [
      obs({ title: '插件协议设计完成', category: 'result', sourceEventIds: ['e1'] }),
      obs({ title: 'OAuth认证失败', category: 'blocker', sourceEventIds: ['e2'] }),
      obs({ title: '优先级变为 high', category: 'change', sourceEventIds: ['e3'] }),
    ]
    const loops = [
      loop({
        id: 'loop-oauth',
        title: '处理OAuth认证失败',
        status: 'blocked',
        blocker: 'OAuth认证失败',
        nextAction: '排查OAuth',
      }),
      loop({
        id: 'loop-market',
        title: '继续完善插件市场搜索',
        status: 'open',
        nextAction: '完成插件市场搜索验证',
      }),
    ]

    const reflection = buildTaskReflection({
      sessionId: 'sess-1',
      observations,
      loops,
    })
    expect(reflection).toBeTruthy()
    expect(reflection!.completed).toContain('插件协议设计完成')
    expect(reflection!.blockers.some((b) => b.includes('OAuth'))).toBe(true)
    expect(reflection!.unresolved.length).toBeGreaterThan(0)
    expect(reflection!.nextActions.some((a) => a.includes('插件市场') || a.includes('OAuth'))).toBe(true)
    expect(reflection!.sourceObservationIds).toHaveLength(3)
    expect(reflection!.sourceLoopIds).toHaveLength(2)
    expect(reflection!.evidenceRefs.length).toBeGreaterThan(0)
    expect(reflection!.changes.some((c) => c.includes('优先级'))).toBe(true)
  })

  it('builds daily reflection from recent facts', () => {
    const now = Date.now()
    const reflection = buildDailyReflection({
      observations: [
        obs({ title: '完成 MCP Widget', category: 'result', createdAt: now - 1000 }),
        obs({ title: '插件协议完成', category: 'result', createdAt: now - 2000 }),
      ],
      loops: [
        loop({ title: 'OAuth阻塞', status: 'blocked', blocker: 'OAuth阻塞', lastUpdatedAt: now }),
        loop({ title: '插件市场验证', status: 'open', nextAction: '继续完成插件市场测试', lastUpdatedAt: now }),
      ],
      now,
    })
    expect(reflection).toBeTruthy()
    expect(reflection!.type).toBe('daily')
    expect(reflection!.dayKey).toBeTruthy()
    expect(reflection!.completed.length).toBeGreaterThan(0)
    expect(reflection!.blockers.length).toBeGreaterThan(0)
    expect(reflection!.nextActions.length).toBeGreaterThan(0)
    expect(reflection!.summary).toContain('需要关注')
  })
})

describe('guidance rules + ranker', () => {
  it('builds guidance from loops and ranks blockers first', () => {
    const loops = [
      loop({
        id: 'l-open',
        title: '继续完善插件市场',
        status: 'open',
        nextAction: '运行安装卸载搜索测试',
        importance: 0.5,
      }),
      loop({
        id: 'l-block',
        title: '处理OAuth认证失败',
        status: 'blocked',
        blocker: 'OAuth认证失败',
        importance: 0.9,
      }),
      loop({
        id: 'l-resume',
        title: '恢复中断任务',
        status: 'open',
        nextAction: '打开会话并继续上次工作',
        importance: 0.7,
      }),
    ]
    const guidance = buildGuidanceFromLoops({ loops })
    expect(guidance.length).toBe(3)
    expect(guidance[0]!.type).toBe('resolve_blocker')
    expect(guidance[0]!.sourceLoopIds).toContain('l-block')
    expect(guidance.some((g) => g.type === 'resume')).toBe(true)
    expect(guidance.every((g) => g.sourceLoopIds.length > 0)).toBe(true)
  })

  it('skips resolved and dismissed loops', () => {
    const loops = [
      loop({ id: 'l1', title: '已解决', status: 'resolved', resolvedAt: Date.now(), userManaged: true }),
      loop({ id: 'l2', title: '已忽略', status: 'dismissed', resolvedAt: Date.now(), userManaged: true }),
      loop({ id: 'l3', title: '继续事项', status: 'open', nextAction: '继续' }),
    ]
    const guidance = buildGuidanceFromLoops({ loops })
    expect(guidance).toHaveLength(1)
    expect(guidance[0]!.targetLoopId).toBe('l3')
  })

  it('skips dismissed target loop ids on rebuild', () => {
    const loops = [
      loop({ id: 'l-a', title: '继续A', status: 'open' }),
      loop({ id: 'l-b', title: '继续B', status: 'open' }),
    ]
    const guidance = buildGuidanceFromLoops({ loops, dismissedLoopIds: ['l-a'] })
    expect(guidance).toHaveLength(1)
    expect(guidance[0]!.targetLoopId).toBe('l-b')
  })

  it('ranker scores blockers above continue', () => {
    const now = Date.now()
    const items: CognitionGuidance[] = [
      {
        id: 'g1',
        type: 'continue',
        title: '继续',
        reason: 'r',
        action: 'a',
        importance: 0.9,
        confidence: 0.9,
        sourceObservationIds: [],
        sourceLoopIds: ['x'],
        createdAt: now,
        schemaVersion: 1,
      },
      {
        id: 'g2',
        type: 'resolve_blocker',
        title: '阻塞',
        reason: 'r',
        action: 'a',
        importance: 0.6,
        confidence: 0.8,
        sourceObservationIds: [],
        sourceLoopIds: ['y'],
        createdAt: now,
        schemaVersion: 1,
      },
    ]
    const ranked = rankGuidance(items, { now })
    expect(ranked[0]!.type).toBe('resolve_blocker')
    expect(scoreGuidance(ranked[0]!, { now })).toBeGreaterThan(scoreGuidance(ranked[1]!, { now }))
  })
})
