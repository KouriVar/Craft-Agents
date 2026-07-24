/**
 * Privacy / context-awareness RPC handlers (v0.16 Phase B).
 */

import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import type { PrivacyPolicy, PrivacyModeState } from '@craft-agent/shared/privacy'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { getPrivacyService } from '../../privacy'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.privacy.GET_POLICY,
  RPC_CHANNELS.privacy.SET_POLICY,
  RPC_CHANNELS.privacy.GET_PRIVACY_MODE,
  RPC_CHANNELS.privacy.SET_PRIVACY_MODE,
  RPC_CHANNELS.privacy.LIST_ACCESS_LOG,
  RPC_CHANNELS.privacy.CLEAR_DATA,
  RPC_CHANNELS.privacy.GET_STORAGE_USAGE,
] as const

function resolvePrivacy(workspaceId: string) {
  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
  return {
    workspace,
    service: getPrivacyService(workspace.rootPath, workspace.id),
  }
}

function toPolicyDto(policy: ReturnType<ReturnType<typeof getPrivacyService>['getResolvedPolicy']>) {
  return {
    schemaVersion: policy.schemaVersion,
    contextAwarenessEnabled: policy.contextAwarenessEnabled,
    today: { ...policy.today },
    privacyMode: { ...policy.privacyMode },
    sources: structuredClone(policy.sources),
    retention: { ...policy.retention },
    updatedAt: policy.updatedAt,
    resolvedFrom: [...policy.resolvedFrom],
    effectivePrivacyModeActive: policy.effectivePrivacyModeActive,
    policyVersion: policy.policyVersion,
  }
}

export function registerPrivacyHandlers(server: RpcServer, deps: HandlerDeps): void {
  const log = deps.platform.logger

  server.handle(
    RPC_CHANNELS.privacy.GET_POLICY,
    async (_ctx, request: import('@craft-agent/shared/protocol').PrivacyGetPolicyRequest) => {
      const { service } = resolvePrivacy(request.workspaceId)
      return toPolicyDto(service.getResolvedPolicy())
    },
  )

  server.handle(
    RPC_CHANNELS.privacy.SET_POLICY,
    async (_ctx, request: import('@craft-agent/shared/protocol').PrivacySetPolicyRequest) => {
      const { service } = resolvePrivacy(request.workspaceId)
      const patch = request.policy as Partial<PrivacyPolicy>
      const resolved = request.workspaceOverride
        ? service.setWorkspacePolicy(patch)
        : service.setUserPolicy(patch)
      log.info('Privacy policy updated', {
        workspaceId: request.workspaceId,
        workspaceOverride: Boolean(request.workspaceOverride),
        policyVersion: resolved.policyVersion,
      })
      return toPolicyDto(resolved)
    },
  )

  server.handle(
    RPC_CHANNELS.privacy.GET_PRIVACY_MODE,
    async (_ctx, workspaceId: string) => {
      const { service } = resolvePrivacy(workspaceId)
      const policy = service.getResolvedPolicy()
      return {
        ...policy.privacyMode,
        active: policy.effectivePrivacyModeActive,
      }
    },
  )

  server.handle(
    RPC_CHANNELS.privacy.SET_PRIVACY_MODE,
    async (_ctx, request: import('@craft-agent/shared/protocol').PrivacySetModeRequest) => {
      const { service } = resolvePrivacy(request.workspaceId)
      const resolved = service.setPrivacyMode(request.mode as Partial<PrivacyModeState> & { active: boolean })
      return toPolicyDto(resolved)
    },
  )

  server.handle(
    RPC_CHANNELS.privacy.LIST_ACCESS_LOG,
    async (_ctx, request: import('@craft-agent/shared/protocol').PrivacyListAccessLogRequest) => {
      const { service } = resolvePrivacy(request.workspaceId)
      return service.listAccessLog(request.limit ?? 100)
    },
  )

  server.handle(
    RPC_CHANNELS.privacy.CLEAR_DATA,
    async (_ctx, request: import('@craft-agent/shared/protocol').PrivacyClearDataRequest) => {
      const { service } = resolvePrivacy(request.workspaceId)
      return service.clearData(request.target)
    },
  )

  server.handle(
    RPC_CHANNELS.privacy.GET_STORAGE_USAGE,
    async (_ctx, workspaceId: string) => {
      const { service } = resolvePrivacy(workspaceId)
      return service.getStorageUsage()
    },
  )
}
