/**
 * Deterministic Observation rules — no model required.
 */

import { randomUUID } from 'crypto'
import { truncateText } from '../events/event-sanitizer.ts'
import { buildEvidenceFingerprint } from '../evidence-fingerprint.ts'
import { COGNITION_SCHEMA_VERSION, type CognitionEvent, type CognitionEvidenceRef } from '../types.ts'
import type { CognitionObservation, CognitionObservationCategory } from './types.ts'

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function evidenceFromEvent(event: CognitionEvent, extras: CognitionEvidenceRef[] = []): CognitionEvidenceRef[] {
  const refs: CognitionEvidenceRef[] = [...(event.evidenceRefs ?? []), ...extras]
  if (event.sessionId && !refs.some((r) => r.type === 'session' && r.id === event.sessionId)) {
    refs.unshift({ type: 'session', id: event.sessionId, label: 'Session' })
  }
  return refs.slice(0, 12)
}

function baseObservation(
  event: CognitionEvent,
  partial: {
    title: string
    summary: string
    category: CognitionObservationCategory
    confidence: number
    importance: number
    evidenceRefs?: CognitionEvidenceRef[]
  },
): CognitionObservation {
  const now = Date.now()
  const title = truncateText(partial.title, 160)
  return {
    id: `obs_${randomUUID().slice(0, 12)}`,
    workspaceId: event.workspaceId,
    projectId: event.projectId,
    sessionId: event.sessionId,
    title,
    summary: truncateText(partial.summary, 480),
    category: partial.category,
    confidence: clamp01(partial.confidence),
    importance: clamp01(partial.importance),
    sourceEventIds: [event.id],
    evidenceRefs: partial.evidenceRefs ?? evidenceFromEvent(event),
    evidenceFingerprint: buildEvidenceFingerprint({
      sessionId: event.sessionId,
      eventIds: [event.id],
      subject: event.subject ? `${event.subject.kind}:${event.subject.id}` : undefined,
      topic: title,
      category: partial.category,
    }),
    createdAt: now,
    updatedAt: now,
    schemaVersion: COGNITION_SCHEMA_VERSION,
  }
}

function fromCheckpoint(event: CognitionEvent): CognitionObservation[] {
  if (event.type !== 'checkpoint.created') return []
  const payload = event.payload
  const out: CognitionObservation[] = []

  if (payload.nextSteps?.length) {
    const step = payload.nextSteps[0]!
    out.push(
      baseObservation(event, {
        title: truncateText(`${step}仍需继续`, 160),
        summary: truncateText(
          `检查点提示下一步：${payload.nextSteps.join('；')}${event.summary ? `。摘要：${event.summary}` : ''}`,
          480,
        ),
        category: 'progress',
        confidence: 0.85,
        importance: 0.7,
        evidenceRefs: evidenceFromEvent(event, [
          { type: 'checkpoint', id: payload.checkpointId, label: 'Checkpoint' },
        ]),
      }),
    )
  }

  if (payload.blockers?.length) {
    const blocker = payload.blockers[0]!
    out.push(
      baseObservation(event, {
        title: truncateText(`${blocker}`, 160),
        summary: truncateText(`检查点记录阻塞：${payload.blockers.join('；')}`, 480),
        category: 'blocker',
        confidence: 0.9,
        importance: 0.85,
        evidenceRefs: evidenceFromEvent(event, [
          { type: 'checkpoint', id: payload.checkpointId, label: 'Checkpoint' },
        ]),
      }),
    )
  }

  if (!payload.nextSteps?.length && !payload.blockers?.length && payload.outcome === 'completed') {
    out.push(
      baseObservation(event, {
        title: '本轮检查点已保存',
        summary: truncateText(event.summary || '自动检查点已创建', 480),
        category: 'result',
        confidence: 0.6,
        importance: 0.4,
      }),
    )
  }

  return out
}

function fromSessionStopped(event: CognitionEvent): CognitionObservation[] {
  if (event.type !== 'session.stopped') return []
  const payload = event.payload
  const out: CognitionObservation[] = []

  if (payload.reason === 'failed') {
    const blockerText = payload.blockers?.[0] || payload.errorCode || '会话以失败结束'
    out.push(
      baseObservation(event, {
        title: truncateText(blockerText, 160),
        summary: truncateText(
          `会话失败${payload.blockers?.length ? `，阻塞：${payload.blockers.join('；')}` : ''}${payload.errorCode ? `（${payload.errorCode}）` : ''}`,
          480,
        ),
        category: 'blocker',
        confidence: 0.88,
        importance: 0.8,
      }),
    )
  } else if (payload.reason === 'interrupted' || payload.reason === 'cancelled') {
    out.push(
      baseObservation(event, {
        title: '任务回合被中断',
        summary: truncateText(
          `会话${payload.reason === 'cancelled' ? '取消' : '中断'}，${payload.nextSteps?.[0] ? `建议继续：${payload.nextSteps[0]}` : '可稍后恢复'}`,
          480,
        ),
        category: 'context',
        confidence: 0.8,
        importance: 0.65,
      }),
    )
  } else if (payload.reason === 'completed') {
    if (payload.blockers?.length) {
      out.push(
        baseObservation(event, {
          title: truncateText(payload.blockers[0]!, 160),
          summary: truncateText(`完成后仍有阻塞：${payload.blockers.join('；')}`, 480),
          category: 'blocker',
          confidence: 0.75,
          importance: 0.7,
        }),
      )
    } else if (payload.nextSteps?.length) {
      out.push(
        baseObservation(event, {
          title: truncateText(`${payload.nextSteps[0]}仍需推进`, 160),
          summary: truncateText(`回合完成，下一步：${payload.nextSteps.join('；')}`, 480),
          category: 'progress',
          confidence: 0.8,
          importance: 0.65,
        }),
      )
    } else {
      out.push(
        baseObservation(event, {
          title: '会话回合已完成',
          summary: truncateText(event.summary || '会话回合正常结束', 480),
          category: 'result',
          confidence: 0.7,
          importance: 0.45,
        }),
      )
    }
  }

  return out
}

function fromTaskDetails(event: CognitionEvent): CognitionObservation[] {
  if (event.type !== 'task.details_updated') return []
  const payload = event.payload
  const parts: string[] = []
  if (payload.fields.includes('priority') && payload.priority) {
    parts.push(`优先级变为 ${payload.priority}`)
  }
  if (payload.fields.includes('goal')) parts.push('目标已更新')
  if (payload.fields.includes('dueAt')) {
    parts.push(payload.dueAt ? `截止时间设为 ${new Date(payload.dueAt).toISOString().slice(0, 10)}` : '截止时间已清除')
  }
  if (payload.fields.includes('reminderAt')) parts.push('提醒已更新')
  if (payload.fields.includes('acknowledgeReminder')) parts.push('提醒已确认')
  if (!parts.length) return []

  const priorityBoost = payload.priority === 'high' ? 0.85 : 0.55
  return [
    baseObservation(event, {
      title: truncateText(parts[0]!, 160),
      summary: truncateText(`任务详情变更：${parts.join('；')}`, 480),
      category: 'change',
      confidence: 0.95,
      importance: priorityBoost,
    }),
  ]
}

function fromGitEvent(event: CognitionEvent): CognitionObservation[] {
  switch (event.type) {
    case 'git.committed':
      return [
        baseObservation(event, {
          title: truncateText(`已提交 ${event.payload.commitSha.slice(0, 7)}`, 160),
          summary: truncateText(
            `分支 ${event.payload.branch} 提交：${event.payload.messageSummary}`,
            480,
          ),
          category: 'result',
          confidence: 0.95,
          importance: 0.65,
        }),
      ]
    case 'git.branch_switched':
      return [
        baseObservation(event, {
          title: truncateText(`切换到分支 ${event.payload.branch}`, 160),
          summary: truncateText(
            event.payload.previousBranch
              ? `从 ${event.payload.previousBranch} 切换到 ${event.payload.branch}`
              : `当前分支为 ${event.payload.branch}`,
            480,
          ),
          category: 'change',
          confidence: 0.9,
          importance: 0.45,
        }),
      ]
    case 'git.pushed':
    case 'git.synced':
      return [
        baseObservation(event, {
          title: truncateText(
            event.type === 'git.synced'
              ? `已同步分支 ${event.payload.branch}`
              : `已推送分支 ${event.payload.branch}`,
            160,
          ),
          summary: truncateText(event.summary, 480),
          category: 'result',
          confidence: 0.9,
          importance: 0.6,
        }),
      ]
    case 'git.pr_created':
      return [
        baseObservation(event, {
          title: truncateText(`已创建 PR（${event.payload.branch}）`, 160),
          summary: truncateText(`Pull request: ${event.payload.prUrl}`, 480),
          category: 'result',
          confidence: 0.95,
          importance: 0.7,
        }),
      ]
    case 'git.failed':
      return [
        baseObservation(event, {
          title: truncateText(`Git ${event.payload.action} 失败`, 160),
          summary: truncateText(`Git 操作失败：${event.payload.errorCode}`, 480),
          category: 'blocker',
          confidence: 0.85,
          importance: 0.8,
        }),
      ]
    case 'git.changes_present':
      return [
        baseObservation(event, {
          title: truncateText(`未提交变更仍需处理（${event.payload.dirtyFileCount}）`, 160),
          summary: truncateText(
            `分支 ${event.payload.branch} 有 ${event.payload.dirtyFileCount} 个未提交文件` +
              (event.payload.ahead || event.payload.behind
                ? `；ahead ${event.payload.ahead} / behind ${event.payload.behind}`
                : ''),
            480,
          ),
          category: 'progress',
          confidence: 0.85,
          importance: event.payload.dirtyFileCount >= 5 ? 0.7 : 0.55,
        }),
      ]
    default:
      return []
  }
}

function fromBrowserEvent(event: CognitionEvent): CognitionObservation[] {
  switch (event.type) {
    case 'browser.page_opened':
      return [
        baseObservation(event, {
          title: truncateText(`正在研究 ${event.payload.title}`, 160),
          summary: truncateText(
            `浏览 ${event.payload.hostname}${event.payload.pathname}：${event.payload.title}`,
            480,
          ),
          category: 'context',
          confidence: 0.75,
          importance: event.payload.boundSessionId || event.payload.ownerType === 'session' ? 0.55 : 0.4,
        }),
      ]
    case 'browser.bookmark_created':
      return [
        baseObservation(event, {
          title: truncateText(`保存研究资料：${event.payload.title}`, 160),
          summary: truncateText(
            `书签 ${event.payload.hostname}${event.payload.pathname}`,
            480,
          ),
          category: 'context',
          confidence: 0.9,
          importance: 0.65,
        }),
      ]
    case 'browser.tab_attached':
      return [
        baseObservation(event, {
          title: truncateText(
            event.payload.title
              ? `浏览器已关联当前工作：${event.payload.title}`
              : '浏览器标签已关联当前会话',
            160,
          ),
          summary: truncateText(
            `Tab ${event.payload.tabId} 绑定到会话 ${event.payload.boundSessionId}`,
            480,
          ),
          category: 'context',
          confidence: 0.9,
          importance: 0.6,
        }),
      ]
    case 'browser.page_closed':
      return [] // low priority — no observation noise
    default:
      return []
  }
}

/** Build observations for a single event (pure, deterministic). */
export function buildObservationsFromEvent(event: CognitionEvent): CognitionObservation[] {
  switch (event.type) {
    case 'checkpoint.created':
      return fromCheckpoint(event)
    case 'session.stopped':
      return fromSessionStopped(event)
    case 'task.details_updated':
      return fromTaskDetails(event)
    case 'git.branch_switched':
    case 'git.committed':
    case 'git.pushed':
    case 'git.synced':
    case 'git.pr_created':
    case 'git.failed':
    case 'git.changes_present':
      return fromGitEvent(event)
    case 'browser.page_opened':
    case 'browser.tab_attached':
    case 'browser.bookmark_created':
    case 'browser.page_closed':
      return fromBrowserEvent(event)
    default:
      return []
  }
}

export function buildObservationsFromEvents(events: CognitionEvent[]): CognitionObservation[] {
  return events.flatMap(buildObservationsFromEvent)
}
