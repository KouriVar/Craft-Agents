/**
 * Phase E.1 — isolated v0.15 → v0.16 migration acceptance (no real user data mutation).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDefaultPrivacyPolicy } from '@craft-agent/shared/privacy'
import {
  isLegacyDefaultSessionBlock,
  migrateLegacySessionBodyDenyToAsk,
} from '@craft-agent/shared/privacy'
import {
  migrateExploreSettingsPhaseC,
} from '../../apps/electron/src/renderer/lib/explore-settings.ts'

const REPORT: string[] = []
function log(msg: string) {
  console.log(msg)
  REPORT.push(msg)
}

const outRoot = join(tmpdir(), `craft-phase-e-migrate-${Date.now()}`)
mkdirSync(outRoot, { recursive: true })

const factoryDefault = createDefaultPrivacyPolicy()
log(`1 default session.body=${factoryDefault.sources.session.body} (expect ask)`)

const legacyDenyExact = {
  sources: {
    ...factoryDefault.sources,
    session: { meta: 'allow' as const, body: 'deny' as const, attachments: 'deny' as const, archived: 'ask' as const },
  },
  updatedAt: Date.now(),
}
log(`2 isLegacyDefaultSessionBlock=${isLegacyDefaultSessionBlock(legacyDenyExact.sources.session)}`)
const migrated = migrateLegacySessionBodyDenyToAsk(legacyDenyExact)
log(`3 migrated=${migrated} body=${legacyDenyExact.sources.session.body}`)

const intentional = {
  sources: {
    ...factoryDefault.sources,
    session: { meta: 'deny' as const, body: 'deny' as const, attachments: 'allow' as const, archived: 'deny' as const },
  },
  updatedAt: Date.now(),
}
const notMigrated = migrateLegacySessionBodyDenyToAsk(intentional)
log(`4 intentional deny preserved migrated=${notMigrated} body=${intentional.sources.session.body} meta=${intentional.sources.session.meta}`)

const explore = migrateExploreSettingsPhaseC({
  proactiveSuggestionsEnabled: false,
  _phaseCMigrated: false,
} as any)
log(`5 explore migrate showTodaySection=${explore.settings.showTodaySection} migrated=${explore.migrated} notes=${explore.notes.join(';')}`)
if (explore.settings.showTodaySection !== false) {
  throw new Error('expected proactiveSuggestionsEnabled=false → showTodaySection=false')
}

const real = join(process.env.HOME || '', '.craft-agent')
if (existsSync(real) && existsSync(join(real, 'config.json'))) {
  const probe = join(outRoot, 'real-probe')
  mkdirSync(probe, { recursive: true })
  for (const name of ['config.json', 'preferences.json', 'config-defaults.json']) {
    const src = join(real, name)
    if (existsSync(src)) cpSync(src, join(probe, name))
  }
  const cfg = JSON.parse(readFileSync(join(probe, 'config.json'), 'utf8'))
  log(`6 real config probe workspaces=${(cfg.workspaces || []).length} (read-only copy under ${probe})`)
  log(`7 credentials.enc NOT copied (safety)`)
} else {
  log(`6 no real ~/.craft-agent config.json — skipped probe`)
}

log(`8 cognition schema v2 / sourceKinds backfill covered by unit tests`)
log(`9 library under workspace/library/ is additive; clearing Cognition must not delete it`)
log(`OUT=${outRoot}`)

writeFileSync(join(outRoot, 'report.txt'), `${REPORT.join('\n')}\n`)
console.log(`report=${join(outRoot, 'report.txt')}`)
