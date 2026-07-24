/**
 * Built-in privacy defaults for upgrade users (keep cognition behavior available).
 */

import {
  PRIVACY_POLICY_SCHEMA_VERSION,
  type PrivacyPolicy,
  type PrivacyModeState,
} from './types.ts'

export function createDefaultPrivacyMode(): PrivacyModeState {
  return {
    active: false,
    resumeAt: null,
    pauseAutomations: true,
    persistAcrossRestart: true,
  }
}

export function createDefaultPrivacyPolicy(now = Date.now()): PrivacyPolicy {
  return {
    schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
    contextAwarenessEnabled: true,
    today: {
      useContext: true,
    },
    privacyMode: createDefaultPrivacyMode(),
    sources: {
      session: {
        meta: 'allow',
        /** Interactive ask; background cognition still denies via ask+background rule. */
        body: 'ask',
        attachments: 'deny',
        archived: 'ask',
      },
      browser: {
        urlTitle: 'allow',
        pageContent: 'deny',
        history: 'deny',
      },
      git: {
        statusMeta: 'allow',
        diffContent: 'deny',
        mutate: 'ask',
      },
      files: {
        metadata: 'ask',
        content: 'ask',
        roots: [],
      },
      messaging: {
        wechat: 'deny',
        lark: 'deny',
      },
      automation: 'deny',
      mcpPlugins: 'deny',
      projectMemory: 'ask',
      library: {
        generateWithModel: 'ask',
        autoDetectSync: false,
      },
    },
    retention: {
      accessLogDays: 30,
      accessLogMaxEntries: 2000,
      cognitionDays: null,
    },
    updatedAt: now,
  }
}
