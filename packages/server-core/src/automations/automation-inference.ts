import { randomUUID } from 'node:crypto'
import { getDefaultThinkingLevel, getMiniModel, type Workspace } from '@craft-agent/shared/config'
import { loadWorkspaceConfig } from '@craft-agent/shared/workspaces'
import { createBackendFromResolvedContext, resolveBackendContext, type BackendHostRuntimeContext } from '@craft-agent/shared/agent/backend'
import { normalizeThinkingLevel } from '@craft-agent/shared/agent/thinking-levels'
import { inferAutomationDraft, type AutomationDraft } from '@craft-agent/shared/automations'
import type { PlatformServices } from '../runtime/platform'

const systemPrompt = `Classify a requested automation. Return ONLY JSON matching {kind,name,trigger:{type,...},execution,permissionMode,retryLimit}. kind is scheduled,event,webhook,workflow. Event source is session-status,file-change,project-change,messaging,webhook,webpage-change. For webpage-change include url, rule, frequencyMinutes. Never set confirmed true.`
export type AutomationInference = { draft: AutomationDraft; mode: 'llm' | 'fallback'; reason?: string; model?: string }
/** Strict boundary for model text; invalid JSON never becomes an executable draft. */
export function parseAutomationInferenceJson(text: string): AutomationDraft | null {
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*|```$/g, '').trim()) as AutomationDraft
    if (!parsed || typeof parsed !== 'object' || parsed.confirmed === true) return null
    return { ...parsed, confirmed: false }
  } catch { return null }
}
export async function inferAutomationWithModel(input: { workspace: Workspace; platform: PlatformServices; description: string }): Promise<AutomationInference> {
  const fallback = (reason: string): AutomationInference => ({ draft: inferAutomationDraft(input.description), mode: 'fallback', reason })
  const cfg = loadWorkspaceConfig(input.workspace.rootPath); const context = resolveBackendContext({ workspaceDefaultConnectionSlug: cfg?.defaults?.defaultLlmConnection, managedModel: cfg?.defaults?.model })
  const model = context.resolvedModel ?? cfg?.defaults?.model ?? context.connection?.defaultModel
  if (!context.connection || !model) return fallback('未配置可用模型，已使用本地规则建议')
  const agent = createBackendFromResolvedContext({ context, hostRuntime: { appRootPath: input.platform.appRootPath, resourcesPath: input.platform.resourcesPath, isPackaged: input.platform.isPackaged } as BackendHostRuntimeContext, coreConfig: { workspace: input.workspace, session: { id: `automation-infer-${randomUUID()}`, workspaceRootPath: input.workspace.rootPath, createdAt: Date.now(), lastUsedAt: Date.now(), model, llmConnection: context.connection.slug }, miniModel: getMiniModel(context.connection) ?? model, thinkingLevel: normalizeThinkingLevel(cfg?.defaults?.thinkingLevel) ?? getDefaultThinkingLevel(), isHeadless: true }, providerOptions: { piAuthProvider: context.connection.piAuthProvider } })
  try {
    await agent.postInit(); const response = await agent.queryLlm({ prompt: input.description, systemPrompt, model, maxTokens: 700, temperature: 0.1 }); const draft = parseAutomationInferenceJson(response.text ?? '')
    if (!draft) return fallback('模型返回了不可用的自动化草案，已使用本地规则建议')
    // Validation happens before display too, so invalid model JSON never reaches runtime.
    const { validateAutomationDraft } = await import('@craft-agent/shared/automations'); if (validateAutomationDraft(draft).length) return fallback('模型草案不完整，已使用本地规则建议')
    return { draft, mode: 'llm', model: response.model ?? model }
  } catch (error) { return fallback(`模型推断失败：${error instanceof Error ? error.message.slice(0, 160) : String(error)}`) }
  finally { try { agent.destroy() } catch { /* no-op */ } }
}
