/**
 * PrivacyService — load/merge policy, decide, access log, cleanup, inject into Cognition.
 *
 * Hard rule: CognitionEventStore never reads preferences; it only uses injected policyGate.
 */

import { appendFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { createLogger, atomicWriteFileSync, stripBom } from '@craft-agent/shared/utils'
import { loadPreferences, savePreferences } from '@craft-agent/shared/config'
import {
  createAccessLogEntry,
  accessLogThrottleKey,
  pruneAccessLogEntries,
  createDefaultPrivacyPolicy,
  decide,
  ensurePrivacyDir,
  getPrivacyAccessLogPath,
  getPrivacyModePath,
  getPrivacyPolicyPath,
  isEntityReadableByPolicy,
  normalizePrivacyPolicy,
  resolvePrivacyPolicy,
  migrateLegacySessionBodyDenyToAsk,
  PRIVACY_MIGRATION_D1_SESSION_BODY_ASK,
  type PolicyDecision,
  type PolicyInput,
  type PrivacyAccessLogEntry,
  type PrivacyClearTarget,
  type PrivacyModeState,
  type PrivacyPolicy,
  type PrivacyPolicyGate,
  type PrivacyStorageUsage,
  type ResolvedPrivacyPolicy,
  DEFAULT_ACCESS_LOG_MAX_ENTRIES,
  DEFAULT_ACCESS_LOG_RETENTION_MS,
} from '@craft-agent/shared/privacy'
import {
  getCognitionDir,
  getCognitionEventsPath,
  getCognitionGuidancePath,
  getCognitionLoopsPath,
  getCognitionObservationsPath,
  getCognitionReflectionsPath,
  getCognitionManifestPath,
} from '@craft-agent/shared/cognition'

const log = createLogger('privacy-service')

const THROTTLE_WINDOW_MS = 60_000

function safeStatSize(path: string): number {
  try {
    if (!existsSync(path)) return 0
    return statSync(path).size
  } catch {
    return 0
  }
}

function dirSizeRecursive(dir: string, maxFiles = 5000): number {
  if (!existsSync(dir)) return 0
  let total = 0
  let count = 0
  const walk = (d: string) => {
    if (count >= maxFiles) return
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const name of entries) {
      if (count >= maxFiles) return
      const p = join(d, name)
      try {
        const st = statSync(p)
        count += 1
        if (st.isDirectory()) walk(p)
        else total += st.size
      } catch {
        /* ignore */
      }
    }
  }
  walk(dir)
  return total
}

export class PrivacyService {
  readonly workspaceDataRoot: string
  readonly workspaceId: string
  private cachedResolved: ResolvedPrivacyPolicy | null = null
  private runtimeModeOverride: PrivacyModeState | null = null
  private lastThrottle = new Map<string, number>()

  constructor(options: { workspaceDataRoot: string; workspaceId: string }) {
    this.workspaceDataRoot = options.workspaceDataRoot
    this.workspaceId = options.workspaceId
  }

  /** Invalidate cached resolved policy (after setPolicy / setPrivacyMode). */
  invalidateCache(): void {
    this.cachedResolved = null
  }

  loadUserPrivacy(): Partial<PrivacyPolicy> {
    try {
      const prefs = loadPreferences()
      const raw = prefs.privacy
      if (!raw || typeof raw !== 'object') return {}
      return normalizePrivacyPolicy(raw as Partial<PrivacyPolicy>)
    } catch (error) {
      log.warn('Failed to load user privacy preferences', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {}
    }
  }

  loadWorkspacePrivacy(): Partial<PrivacyPolicy> {
    try {
      const path = getPrivacyPolicyPath(this.workspaceDataRoot)
      if (!existsSync(path)) return {}
      const raw = JSON.parse(stripBom(readFileSync(path, 'utf8'))) as Partial<PrivacyPolicy>
      return normalizePrivacyPolicy(raw)
    } catch (error) {
      log.warn('Failed to load workspace privacy policy', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {}
    }
  }

  loadPersistedPrivacyMode(): PrivacyModeState | null {
    try {
      const path = getPrivacyModePath(this.workspaceDataRoot)
      if (!existsSync(path)) return null
      return JSON.parse(stripBom(readFileSync(path, 'utf8'))) as PrivacyModeState
    } catch {
      return null
    }
  }

  getResolvedPolicy(): ResolvedPrivacyPolicy {
    if (this.cachedResolved) return this.cachedResolved
    this.applyPhaseD1Migrations()
    const user = this.loadUserPrivacy()
    const workspace = this.loadWorkspacePrivacy()
    const persistedMode = this.loadPersistedPrivacyMode()
    const runtime =
      this.runtimeModeOverride ??
      (persistedMode?.active ? persistedMode : user.privacyMode?.active ? user.privacyMode : null)
    const resolved = resolvePrivacyPolicy({
      user,
      workspace,
      runtimePrivacyMode: runtime,
    })
    this.cachedResolved = resolved
    return resolved
  }

  /**
   * Phase D.1: upgrade legacy factory session.body=deny → ask once.
   * Skips when the stored session block no longer matches the old default (user customized).
   */
  private applyPhaseD1Migrations(): void {
    try {
      const prefs = loadPreferences()
      const applied = new Set(prefs.privacyMigrationsApplied ?? [])
      if (applied.has(PRIVACY_MIGRATION_D1_SESSION_BODY_ASK)) return

      let changed = false
      if (prefs.privacy && typeof prefs.privacy === 'object') {
        const userPartial = { ...(prefs.privacy as Partial<PrivacyPolicy>) }
        if (migrateLegacySessionBodyDenyToAsk(userPartial)) {
          prefs.privacy = userPartial as unknown as Record<string, unknown>
          changed = true
        }
      }

      // Workspace override: only migrate exact legacy default block
      const wsPath = getPrivacyPolicyPath(this.workspaceDataRoot)
      if (existsSync(wsPath)) {
        try {
          const raw = JSON.parse(stripBom(readFileSync(wsPath, 'utf8'))) as Partial<PrivacyPolicy>
          if (migrateLegacySessionBodyDenyToAsk(raw)) {
            atomicWriteFileSync(wsPath, `${JSON.stringify(normalizePrivacyPolicy(raw), null, 2)}\n`)
            changed = true
          }
        } catch {
          /* ignore corrupt workspace privacy */
        }
      }

      applied.add(PRIVACY_MIGRATION_D1_SESSION_BODY_ASK)
      savePreferences({
        ...prefs,
        privacyMigrationsApplied: [...applied],
        updatedAt: Date.now(),
      })
      if (changed) {
        log.info('Applied privacy migration d1-session-body-ask', { workspaceId: this.workspaceId })
      }
    } catch (error) {
      log.warn('Phase D.1 privacy migration failed (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  createPolicyGate(): PrivacyPolicyGate {
    return {
      decide: (input: PolicyInput) => this.decideAndLog(input),
    }
  }

  decide(input: PolicyInput): PolicyDecision {
    return decide(input, this.getResolvedPolicy())
  }

  decideAndLog(input: PolicyInput): PolicyDecision {
    const policy = this.getResolvedPolicy()
    const decision = decide(input, policy)
    try {
      this.appendAccessLog(input, decision, policy)
    } catch (error) {
      log.warn('Access log write failed (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return decision
  }

  isReadableForToday(entity: { sourceKinds?: string[] }): boolean {
    return isEntityReadableByPolicy(entity, this.getResolvedPolicy(), { forToday: true })
  }

  isReadableForProduct(entity: { sourceKinds?: string[] }): boolean {
    return isEntityReadableByPolicy(entity, this.getResolvedPolicy(), { forToday: false })
  }

  setUserPolicy(partial: Partial<PrivacyPolicy>): ResolvedPrivacyPolicy {
    const current = normalizePrivacyPolicy(this.loadUserPrivacy())
    const next = normalizePrivacyPolicy({
      ...current,
      ...partial,
      sources: partial.sources
        ? { ...current.sources, ...partial.sources, ...deepSources(current.sources, partial.sources) }
        : current.sources,
      today: partial.today ? { ...current.today, ...partial.today } : current.today,
      retention: partial.retention ? { ...current.retention, ...partial.retention } : current.retention,
      privacyMode: partial.privacyMode
        ? { ...current.privacyMode, ...partial.privacyMode }
        : current.privacyMode,
      updatedAt: Date.now(),
    })
    const prefs = loadPreferences()
    savePreferences({
      ...prefs,
      privacy: next as unknown as Record<string, unknown>,
      updatedAt: Date.now(),
    })
    this.invalidateCache()
    return this.getResolvedPolicy()
  }

  setWorkspacePolicy(partial: Partial<PrivacyPolicy>): ResolvedPrivacyPolicy {
    ensurePrivacyDir(this.workspaceDataRoot)
    const current = normalizePrivacyPolicy(this.loadWorkspacePrivacy())
    const next = normalizePrivacyPolicy({
      ...current,
      ...partial,
      sources: partial.sources
        ? { ...current.sources, ...deepSources(current.sources, partial.sources) }
        : current.sources,
      today: partial.today ? { ...current.today, ...partial.today } : current.today,
      updatedAt: Date.now(),
    })
    atomicWriteFileSync(getPrivacyPolicyPath(this.workspaceDataRoot), `${JSON.stringify(next, null, 2)}\n`)
    this.invalidateCache()
    return this.getResolvedPolicy()
  }

  setPrivacyMode(mode: Partial<PrivacyModeState> & { active: boolean }): ResolvedPrivacyPolicy {
    const prev = this.getResolvedPolicy().privacyMode
    const next: PrivacyModeState = {
      ...prev,
      ...mode,
      activatedAt: mode.active ? (mode.activatedAt ?? Date.now()) : undefined,
    }
    this.runtimeModeOverride = next
    if (next.persistAcrossRestart) {
      ensurePrivacyDir(this.workspaceDataRoot)
      atomicWriteFileSync(getPrivacyModePath(this.workspaceDataRoot), `${JSON.stringify(next, null, 2)}\n`)
      // Mirror into user prefs so restarts restore mode when persistAcrossRestart
      try {
        const user = normalizePrivacyPolicy(this.loadUserPrivacy())
        this.setUserPolicy({ privacyMode: next, schemaVersion: user.schemaVersion })
      } catch {
        /* already wrote workspace file */
      }
    } else if (!next.active && existsSync(getPrivacyModePath(this.workspaceDataRoot))) {
      try {
        unlinkSync(getPrivacyModePath(this.workspaceDataRoot))
      } catch {
        /* ignore */
      }
    }
    this.invalidateCache()
    return this.getResolvedPolicy()
  }

  listAccessLog(limit = 100): PrivacyAccessLogEntry[] {
    const path = getPrivacyAccessLogPath(this.workspaceDataRoot)
    if (!existsSync(path)) return []
    try {
      const text = stripBom(readFileSync(path, 'utf8'))
      const entries: PrivacyAccessLogEntry[] = []
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try {
          entries.push(JSON.parse(line) as PrivacyAccessLogEntry)
        } catch {
          /* skip corrupt */
        }
      }
      const policy = this.getResolvedPolicy()
      const pruned = pruneAccessLogEntries(entries, {
        maxEntries: policy.retention.accessLogMaxEntries ?? DEFAULT_ACCESS_LOG_MAX_ENTRIES,
        retentionMs: (policy.retention.accessLogDays ?? 30) * 24 * 60 * 60 * 1000,
      })
      return pruned.slice(-Math.max(1, Math.min(limit, 500))).reverse()
    } catch {
      return []
    }
  }

  private appendAccessLog(
    input: PolicyInput,
    decision: PolicyDecision,
    policy: ResolvedPrivacyPolicy,
  ): void {
    const entry = createAccessLogEntry({
      workspaceId: this.workspaceId,
      policy,
      policyInput: input,
      decision,
    })
    const key = accessLogThrottleKey(entry)
    const now = Date.now()
    const last = this.lastThrottle.get(key)
    if (last && now - last < THROTTLE_WINDOW_MS && decision.decision === 'deny') {
      return
    }
    this.lastThrottle.set(key, now)

    ensurePrivacyDir(this.workspaceDataRoot)
    const path = getPrivacyAccessLogPath(this.workspaceDataRoot)
    appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf8')

    // Opportunistic prune when file grows large
    if (safeStatSize(path) > 2_000_000) {
      this.rewritePrunedAccessLog()
    }
  }

  private rewritePrunedAccessLog(): void {
    const entries = this.listAccessLog(50_000).reverse()
    const policy = this.getResolvedPolicy()
    const pruned = pruneAccessLogEntries(entries, {
      maxEntries: policy.retention.accessLogMaxEntries ?? DEFAULT_ACCESS_LOG_MAX_ENTRIES,
      retentionMs: (policy.retention.accessLogDays ?? 30) * DEFAULT_ACCESS_LOG_RETENTION_MS / 30,
    })
    atomicWriteFileSync(
      getPrivacyAccessLogPath(this.workspaceDataRoot),
      pruned.map((e) => JSON.stringify(e)).join('\n') + (pruned.length ? '\n' : ''),
    )
  }

  getStorageUsage(): PrivacyStorageUsage {
    const cognitionBytes = dirSizeRecursive(getCognitionDir(this.workspaceDataRoot))
    const accessLogBytes = safeStatSize(getPrivacyAccessLogPath(this.workspaceDataRoot))
    const privacyDirBytes = dirSizeRecursive(join(this.workspaceDataRoot, 'privacy'))
    return {
      workspaceId: this.workspaceId,
      cognitionBytes,
      accessLogBytes,
      privacyDirBytes,
      totalBytes: cognitionBytes + privacyDirBytes,
    }
  }

  /**
   * Whitelist-based cleanup. Never deletes sessions, attachments, projects, library.
   */
  async clearData(target: PrivacyClearTarget): Promise<{ cleared: string[]; skipped: string[] }> {
    const cleared: string[] = []
    const skipped: string[] = []

    const allowDeleteFile = (path: string, label: string) => {
      if (!existsSync(path)) {
        skipped.push(`${label}:missing`)
        return
      }
      try {
        unlinkSync(path)
        cleared.push(label)
      } catch (error) {
        skipped.push(`${label}:error:${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (target.accessLog) {
      allowDeleteFile(getPrivacyAccessLogPath(this.workspaceDataRoot), 'access-log')
    }

    if (target.cognition) {
      allowDeleteFile(getCognitionEventsPath(this.workspaceDataRoot), 'cognition.events')
      allowDeleteFile(getCognitionObservationsPath(this.workspaceDataRoot), 'cognition.observations')
      allowDeleteFile(getCognitionLoopsPath(this.workspaceDataRoot), 'cognition.loops')
      allowDeleteFile(getCognitionReflectionsPath(this.workspaceDataRoot), 'cognition.reflections')
      allowDeleteFile(getCognitionGuidancePath(this.workspaceDataRoot), 'cognition.guidance')
      allowDeleteFile(getCognitionManifestPath(this.workspaceDataRoot), 'cognition.manifest')
    }

    if (target.browserCognitionEvents && !target.cognition) {
      // Without a separate browser store, browser events live in events.jsonl.
      // Selective rewrite would be expensive; mark skipped with guidance.
      skipped.push('browserCognitionEvents:use_full_cognition_clear_or_future_filter')
    }

    if (target.exploreBriefCache) {
      // Explore brief is renderer localStorage — server cannot clear it.
      skipped.push('exploreBriefCache:renderer_only')
    }

    // Hard guard: never touch these even if misconfigured
    const forbidden = [
      join(this.workspaceDataRoot, 'sessions'),
      join(this.workspaceDataRoot, 'projects'),
      join(this.workspaceDataRoot, 'library'),
    ]
    for (const f of forbidden) {
      if (!existsSync(f)) continue
      // no-op documentation
      skipped.push(`protected:${f}`)
    }

    return { cleared, skipped }
  }
}

function deepSources(
  base: PrivacyPolicy['sources'],
  patch: Partial<PrivacyPolicy['sources']>,
): PrivacyPolicy['sources'] {
  return {
    session: { ...base.session, ...(patch.session ?? {}) },
    browser: { ...base.browser, ...(patch.browser ?? {}) },
    git: { ...base.git, ...(patch.git ?? {}) },
    files: {
      ...base.files,
      ...(patch.files ?? {}),
      roots: patch.files?.roots ?? base.files.roots,
    },
    messaging: { ...base.messaging, ...(patch.messaging ?? {}) },
    automation: patch.automation ?? base.automation,
    mcpPlugins: patch.mcpPlugins ?? base.mcpPlugins,
    projectMemory: patch.projectMemory ?? base.projectMemory,
    library: { ...base.library, ...(patch.library ?? {}) },
  }
}

/** Per-workspace PrivacyService registry. */
const privacyServices = new Map<string, PrivacyService>()

export function getPrivacyService(workspaceDataRoot: string, workspaceId: string): PrivacyService {
  const key = workspaceDataRoot
  let svc = privacyServices.get(key)
  if (!svc || svc.workspaceId !== workspaceId) {
    svc = new PrivacyService({ workspaceDataRoot, workspaceId })
    privacyServices.set(key, svc)
  }
  return svc
}

export function _resetPrivacyServiceRegistryForTests(): void {
  privacyServices.clear()
}

export { createDefaultPrivacyPolicy }
