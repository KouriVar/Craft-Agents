/**
 * One-shot LLM call for library session→document generation (structured JSON).
 */

import { randomUUID } from 'crypto'
import {
  getDefaultThinkingLevel,
  getMiniModel,
  type Workspace,
} from '@craft-agent/shared/config'
import { loadWorkspaceConfig } from '@craft-agent/shared/workspaces'
import {
  createBackendFromResolvedContext,
  resolveBackendContext,
  type BackendHostRuntimeContext,
} from '@craft-agent/shared/agent/backend'
import { normalizeThinkingLevel } from '@craft-agent/shared/agent/thinking-levels'
import {
  analyzeSessionForLibrary,
  assembleDocumentFromStructuredResult,
  buildExcerptFallbackDocument,
  buildLibraryGenerateSystemPrompt,
  buildLibraryGenerateUserPrompt,
  LIBRARY_PROMPT_VERSION,
  parseGeneratedDocumentJson,
  qualityCheckStructured,
  type LibraryDocumentTemplateId,
  type LibraryGenerateMessage,
  type DocumentGenerationMeta,
  type DocumentSourceReference,
  type SessionContentBlock,
} from '@craft-agent/shared/library'
import { createLogger } from '@craft-agent/shared/utils'
import type { PlatformServices } from '../runtime/platform'

const log = createLogger('library-generate-llm')

function hostRuntimeFromPlatform(platform: PlatformServices): BackendHostRuntimeContext {
  return {
    appRootPath: platform.appRootPath,
    resourcesPath: platform.resourcesPath,
    isPackaged: platform.isPackaged,
  }
}

async function callModelOnce(input: {
  workspace: Workspace
  platform: PlatformServices
  sessionConnectionSlug?: string
  sessionModel?: string
  templateId: LibraryDocumentTemplateId
  sessionTitle: string
  messages: LibraryGenerateMessage[]
  blocks: SessionContentBlock[]
  locale: string
}): Promise<{ ok: true; text: string; model: string } | { ok: false; code: string; message: string; model?: string }> {
  const wsConfig = loadWorkspaceConfig(input.workspace.rootPath)
  const defaultModel = input.sessionModel || wsConfig?.defaults?.model
  const backendContext = resolveBackendContext({
    sessionConnectionSlug: input.sessionConnectionSlug,
    workspaceDefaultConnectionSlug: wsConfig?.defaults?.defaultLlmConnection,
    managedModel: defaultModel,
  })

  if (!backendContext.connection) {
    return { ok: false, code: 'model_unavailable', message: '未配置可用的文本模型连接' }
  }

  const resolvedModel = backendContext.resolvedModel
    ?? defaultModel
    ?? backendContext.connection.defaultModel
  if (!resolvedModel) {
    return { ok: false, code: 'model_unavailable', message: '未配置可用的文本模型' }
  }

  const thinkingLevel = normalizeThinkingLevel(wsConfig?.defaults?.thinkingLevel)
    ?? getDefaultThinkingLevel()
  const miniModel = getMiniModel(backendContext.connection)
    ?? backendContext.connection.defaultModel
    ?? resolvedModel

  const agent = createBackendFromResolvedContext({
    context: backendContext,
    hostRuntime: hostRuntimeFromPlatform(input.platform),
    coreConfig: {
      workspace: input.workspace,
      session: {
        id: `library-gen-${randomUUID()}`,
        workspaceRootPath: input.workspace.rootPath,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        model: resolvedModel,
        llmConnection: backendContext.connection.slug,
      },
      miniModel,
      thinkingLevel,
      envOverrides: {
        CRAFT_WORKSPACE_PATH: input.workspace.rootPath,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: miniModel,
      },
      isHeadless: true,
    },
    providerOptions: { piAuthProvider: backendContext.connection.piAuthProvider },
  })

  try {
    await agent.postInit()
    const response = await agent.queryLlm({
      prompt: buildLibraryGenerateUserPrompt({
        templateId: input.templateId,
        sessionTitle: input.sessionTitle,
        messages: input.messages,
        blocks: input.blocks,
        locale: input.locale,
      }),
      systemPrompt: buildLibraryGenerateSystemPrompt(input.locale),
      model: resolvedModel,
      maxTokens: 8192,
      temperature: 0.2,
    })
    const text = (response.text || '').trim()
    if (!text) {
      return { ok: false, code: 'invalid_output', message: '模型返回空内容', model: resolvedModel }
    }
    return { ok: true, text, model: response.model ?? resolvedModel }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn('library generate LLM failed', { message })
    return { ok: false, code: 'model_request_failed', message: message.slice(0, 300), model: resolvedModel }
  } finally {
    try {
      agent.destroy()
    } catch {
      /* ignore */
    }
  }
}

export interface LibraryGeneratePrepared {
  title: string
  body: string
  sourceReferences: DocumentSourceReference[]
  generation: DocumentGenerationMeta
  warning?: string
  errorCode?: string
}

/**
 * AI organize with JSON schema, quality gate, one retry, then excerpt fallback.
 * Preserve mode should not call this.
 */
export async function prepareLibraryDocumentFromAi(input: {
  workspace: Workspace
  platform: PlatformServices
  sessionConnectionSlug?: string
  sessionModel?: string
  documentId: string
  sessionId: string
  templateId: LibraryDocumentTemplateId
  sessionTitle: string
  messages: LibraryGenerateMessage[]
  totalMessageCount: number
  truncated: boolean
  locale?: string
}): Promise<LibraryGeneratePrepared> {
  const locale = input.locale || 'zh-Hans'
  const analysis = analyzeSessionForLibrary(input.messages)
  const blocks = analysis.blocks
  const authorizedMessageIds = input.messages.map((m) => m.id)
  const sourceMarkdown = input.messages.map((m) => m.content).join('\n\n')
  const ts = Date.now()

  const attempt = async (isRetry: boolean): Promise<{
    prepared?: LibraryGeneratePrepared
    model?: string
    parseFail?: boolean
  }> => {
    const llm = await callModelOnce({
      workspace: input.workspace,
      platform: input.platform,
      sessionConnectionSlug: input.sessionConnectionSlug,
      sessionModel: input.sessionModel,
      templateId: input.templateId,
      sessionTitle: input.sessionTitle,
      messages: input.messages,
      blocks,
      locale,
    })
    if (!llm.ok) {
      return { model: llm.model, parseFail: true }
    }
    const parsed = parseGeneratedDocumentJson(llm.text)
    if (!parsed.ok) {
      return { model: llm.model, parseFail: true }
    }
    const quality = qualityCheckStructured(
      parsed.result,
      authorizedMessageIds,
      blocks,
      sourceMarkdown,
    )
    // Soft issue all_sections_full_session is OK — assembler collapses sources
    const hardFail = !quality.ok
    if (hardFail) {
      log.warn('library generate quality gate failed', {
        issues: quality.issues.map((i) => i.code),
        retry: isRetry,
      })
      return { model: llm.model, parseFail: true }
    }
    const assembled = assembleDocumentFromStructuredResult({
      result: parsed.result,
      documentId: input.documentId,
      sessionId: input.sessionId,
      authorizedMessageIds,
      blocks,
    })
    return {
      model: llm.model,
      prepared: {
        title: assembled.title,
        body: assembled.body,
        sourceReferences: assembled.sourceReferences,
        generation: {
          mode: 'ai',
          modelId: llm.model,
          generatedAt: ts,
          promptVersion: LIBRARY_PROMPT_VERSION,
          sourceMessageCount: authorizedMessageIds.length,
          totalMessageCount: input.totalMessageCount,
          truncated: input.truncated,
          qualityStatus: isRetry ? 'retried' : 'passed',
        },
      },
    }
  }

  let first = await attempt(false)
  if (first.prepared) return first.prepared

  const second = await attempt(true)
  if (second.prepared) {
    return {
      ...second.prepared,
      generation: { ...second.prepared.generation, qualityStatus: 'retried' },
    }
  }

  const excerpt = buildExcerptFallbackDocument({
    documentId: input.documentId,
    sessionId: input.sessionId,
    sessionTitle: input.sessionTitle,
    templateId: input.templateId,
    messages: input.messages,
    blocks,
  })
  return {
    title: excerpt.title,
    body: excerpt.body,
    sourceReferences: excerpt.sourceReferences,
    generation: {
      mode: 'excerpt_fallback',
      modelId: second.model || first.model,
      generatedAt: ts,
      promptVersion: LIBRARY_PROMPT_VERSION,
      sourceMessageCount: authorizedMessageIds.length,
      totalMessageCount: input.totalMessageCount,
      truncated: input.truncated,
      qualityStatus: 'fallback',
    },
    warning: 'AI 整理失败，当前文档由基础摘录生成',
    errorCode: 'invalid_output',
  }
}

/** @deprecated Use prepareLibraryDocumentFromAi */
export async function queryLibraryDocumentMarkdown(input: {
  workspace: Workspace
  platform: PlatformServices
  sessionConnectionSlug?: string
  sessionModel?: string
  templateId: LibraryDocumentTemplateId
  sessionTitle: string
  messages: LibraryGenerateMessage[]
  locale?: string
}): Promise<{ ok: true; text: string; model: string } | { ok: false; code: string; message: string }> {
  const analysis = analyzeSessionForLibrary(input.messages)
  return callModelOnce({
    ...input,
    blocks: analysis.blocks,
    locale: input.locale || 'zh-Hans',
  })
}
