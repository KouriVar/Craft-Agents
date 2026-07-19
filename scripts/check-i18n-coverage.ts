import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const roots = ['apps/electron/src', 'packages/ui/src']
const canonical = JSON.parse(readFileSync('packages/shared/src/i18n/locales/en.json', 'utf8')) as Record<string, string>
const baseline = new Set(JSON.parse(readFileSync('scripts/i18n-coverage-baseline.json', 'utf8')) as string[])
const missing = new Map<string, Set<string>>()
let literalReferences = 0

function sourceFiles(dir: string): string[] {
  const result: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      if (!['dist', 'release', 'node_modules'].includes(entry)) result.push(...sourceFiles(path))
    } else if (/\.(?:ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      result.push(path)
    }
  }
  return result
}

function hasDefaultValue(call: ts.CallExpression): boolean {
  return call.arguments.slice(1).some((argument) =>
    ts.isObjectLiteralExpression(argument)
    && argument.properties.some((property) => {
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return false
      return property.name.getText().replace(/^['"]|['"]$/g, '') === 'defaultValue'
    }),
  )
}

function isTranslationCall(node: ts.CallExpression): boolean {
  if (ts.isIdentifier(node.expression)) return node.expression.text === 't'
  return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 't'
}

for (const file of roots.flatMap(sourceFiles)) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTranslationCall(node)) {
      const key = node.arguments[0]
      if (key && (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key))) {
        literalReferences += 1
        if (!(key.text in canonical) && !hasDefaultValue(node)) {
          const files = missing.get(key.text) ?? new Set<string>()
          files.add(file)
          missing.set(key.text, files)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

const regressions = [...missing].filter(([key]) => !baseline.has(key))
const staleBaseline = [...baseline].filter((key) => !missing.has(key))

if (regressions.length > 0 || staleBaseline.length > 0) {
  console.error('i18n coverage check failed; add the key or an explicit defaultValue fallback:')
  for (const [key, files] of regressions.sort(([a], [b]) => a.localeCompare(b))) {
    console.error(`- ${key}: ${[...files].join(', ')}`)
  }
  for (const key of staleBaseline.sort()) {
    console.error(`- remove resolved key from scripts/i18n-coverage-baseline.json: ${key}`)
  }
  process.exit(1)
}

console.log(`i18n coverage OK (${literalReferences} literal references checked; ${missing.size} documented legacy gaps, no new gaps)`)
