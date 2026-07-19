import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'

const root = process.cwd()
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
const expected = rootPackage.version
const failures: string[] = []
const lockfile = readFileSync(join(root, 'bun.lock'), 'utf8')

if (!semver.valid(expected)) failures.push(`root package.json has invalid SemVer: ${expected}`)

const packageFiles = ['apps', 'packages'].flatMap((group) =>
  readdirSync(join(root, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(group, entry.name, 'package.json')),
)

let checked = 1
for (const relativePath of packageFiles) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, relativePath), 'utf8')) as { version?: string }
    if (!pkg.version) continue
    checked += 1
    if (pkg.version !== expected) {
      failures.push(`${relativePath}: expected ${expected}, found ${pkg.version}`)
    }
    const workspaceKey = relativePath.replace(/\/package\.json$/, '')
    const lockStart = lockfile.indexOf(`    "${workspaceKey}": {`)
    const lockSection = lockStart >= 0
      ? lockfile.slice(lockStart, lockfile.indexOf('\n    "', lockStart + 8) < 0 ? undefined : lockfile.indexOf('\n    "', lockStart + 8))
      : ''
    const lockVersion = lockSection.match(/"version":\s*"([^"]+)"/)?.[1]
    if (lockVersion !== expected) {
      failures.push(`bun.lock workspace ${workspaceKey}: expected ${expected}, found ${lockVersion ?? 'missing'}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

const readme = readFileSync(join(root, 'README.md'), 'utf8')
const badgeVersion = readme.match(/badge\/version-([0-9]+\.[0-9]+\.[0-9]+)-/)?.[1]
if (badgeVersion !== expected) {
  failures.push(`README version badge: expected ${expected}, found ${badgeVersion ?? 'missing'}`)
}

if (failures.length > 0) {
  console.error('Version consistency check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Version consistency OK (${checked} package manifests + workspace lock entries + README badge = ${expected})`)
