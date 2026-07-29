/** v0.20 automation creation contract. A draft is never runnable until confirmed. */
export type AutomationKind = 'scheduled' | 'event' | 'webhook' | 'workflow'
export type AutomationEventSource = 'session-status' | 'file-change' | 'project-change' | 'messaging' | 'webhook' | 'webpage-change'
export type AutomationTrigger =
  | { type: 'schedule'; cadence: 'interval' | 'at' | 'cron'; value: string; timezone?: string }
  | { type: 'event'; source: AutomationEventSource; rule?: string; url?: string; frequencyMinutes?: number }

export interface AutomationDraft {
  kind: AutomationKind
  name: string
  trigger: AutomationTrigger
  execution: string
  permissionMode: 'safe' | 'ask' | 'allow-all'
  retryLimit: number
  confirmed: boolean
}

/**
 * Deterministic fallback for the AI proposal endpoint. The UI must present the
 * returned type/trigger/execution and require confirmAutomationDraft() before
 * persisting it; callers may replace this inference with an LLM proposal.
 */
export function inferAutomationDraft(description: string): AutomationDraft {
  const text = description.trim()
  const lower = text.toLowerCase()
  const isWebhook = /webhook|回调/.test(lower)
  const isPage = /网页|页面|website|web page/.test(lower) && /变化|change|监控|monitor/.test(lower)
  const isEvent = isWebhook || isPage || /文件|file|项目|project|消息|messaging|会话|session/.test(lower)
  const isCron = /cron|每[天周月]|daily|weekly|hourly/.test(lower)
  const kind: AutomationKind = /工作流|workflow/.test(lower) ? 'workflow' : isWebhook ? 'webhook' : isEvent ? 'event' : 'scheduled'
  const trigger: AutomationTrigger = isPage
    ? { type: 'event', source: 'webpage-change', rule: 'Content changed', url: '', frequencyMinutes: 60 }
    : isWebhook ? { type: 'event', source: 'webhook', rule: 'Incoming webhook' }
    : isEvent ? { type: 'event', source: /文件|file/.test(lower) ? 'file-change' : /项目|project/.test(lower) ? 'project-change' : /消息|messaging/.test(lower) ? 'messaging' : 'session-status' }
    : { type: 'schedule', cadence: isCron ? 'cron' : 'interval', value: isCron ? '0 9 * * *' : 'daily' }
  return { kind, name: text.slice(0, 80) || 'Untitled automation', trigger, execution: text, permissionMode: 'ask', retryLimit: 2, confirmed: false }
}

export function validateAutomationDraft(draft: AutomationDraft): string[] {
  const errors: string[] = []
  if (!draft.name.trim()) errors.push('Automation name is required')
  if (!draft.execution.trim()) errors.push('Execution content is required')
  if (!Number.isInteger(draft.retryLimit) || draft.retryLimit < 0 || draft.retryLimit > 5) errors.push('Retry limit must be a finite value from 0 to 5')
  if (draft.trigger.type === 'schedule' && !draft.trigger.value.trim()) errors.push('Schedule value is required')
  if (draft.trigger.type === 'event' && draft.trigger.source === 'webpage-change') {
    if (!draft.trigger.url?.trim()) errors.push('Web page monitoring requires a URL')
    if (!draft.trigger.rule?.trim()) errors.push('Web page monitoring requires a detection rule')
    if (!draft.trigger.frequencyMinutes || draft.trigger.frequencyMinutes < 1) errors.push('Web page monitoring requires a frequency')
  }
  return errors
}

export function confirmAutomationDraft(draft: AutomationDraft): AutomationDraft {
  const errors = validateAutomationDraft(draft)
  if (errors.length) throw new Error(`Invalid automation draft: ${errors.join('; ')}`)
  return { ...draft, confirmed: true }
}
