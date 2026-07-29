/**
 * Phase 0 removal-reference map generator.
 *
 * Run before each Phase 1 deletion batch. The JSON output is the authoritative
 * file-and-line inventory for the current checkout; historical release notes are
 * intentionally excluded because D-022 preserves them.
 */

type Target = { id: string; query: string; exclude?: string[] };

const targets: Target[] = [
  { id: 'legacy-task-product', query: 'create_task|tasks:getOutput|TaskEditor|TaskSpec|task\.yaml' },
  { id: 'explore-product-surfaces', query: 'ExploreHome|ExploreSettingsPage|explore-settings' },
  { id: 'today-product-surfaces', query: 'TodayStateStore|today:|task-today|TodayItem' },
  { id: 'session-notes', query: 'GET_NOTES|SET_NOTES|getSessionNotes|setSessionNotes' },
  { id: 'cli-app', query: 'apps/cli|@craft-agent/cli|craftAgentsCli', exclude: ['packages/shared/src/agent/core/__tests__/'] },
  { id: 'browser-password-vault', query: 'browser-password-vault|BrowserPasswordVault' },
  { id: 'legacy-mcp-sse', query: 'transport.*sse|sse.*transport|\\bsse\\b' },
  { id: 'builtin-source-registry', query: 'builtin-sources|BuiltinSource|builtInSource' },
  { id: 'navigation-registry', query: 'navigation-registry|NavigationRegistry|DetailsPageMeta' },
  { id: 'static-feature-flags', query: 'fastMode|craftAgentsCli|embeddedServer' },
  { id: 'workbuddy-legacy', query: '\\.workbuddy|workbuddy' },
  { id: 'nested-shared-copy', query: 'apps/electron/packages/shared' },
];

const ignoredGlobs = [
  '--glob=!node_modules/**',
  '--glob=!dist/**',
  '--glob=!build/**',
  '--glob=!apps/electron/resources/release-notes/**',
  '--glob=!bun.lock',
];

function matches(target: Target): string[] {
  const excludedGlobs = (target.exclude ?? []).map((path) => `--glob=!${path}**`);
  const command = ['rg', '-n', '--no-heading', ...ignoredGlobs, ...excludedGlobs, target.query, 'apps', 'packages', 'scripts', 'package.json'];
  const result = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    throw new Error(`rg failed for ${target.id}: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim().split('\n').filter(Boolean);
}

const generatedAt = new Date().toISOString();
const map = targets.map(target => ({ ...target, matches: matches(target) }));
console.log(JSON.stringify({
  schemaVersion: 1,
  generatedAt,
  phase: 0,
  note: 'Regenerate immediately before deletion; a zero-match result is required only after its Phase 1 batch is complete.',
  targets: map,
}, null, 2));
