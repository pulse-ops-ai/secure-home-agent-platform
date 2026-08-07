#!/usr/bin/env node
/**
 * check-source-imports.mjs — dependency direction as SOURCE actually imports it.
 *
 * This check exists because manifest policy cannot prove import direction, and
 * saying otherwise would be a false claim of enforcement.
 *
 * `check-workspace.mjs` governs what a manifest may DECLARE, and it excludes
 * `devDependencies` from layering on purpose: every member devDepends on
 * `@secure-home/testing` (layer 6) and `@secure-home/eslint-config` (layer 0),
 * so treating those as architectural edges would make the layer map unusable.
 *
 * That exclusion leaves a hole, and it is the hole this file closes. Nothing
 * about a `devDependency` stops production source from importing it:
 *
 *     packages/contracts/package.json   devDependencies: @secure-home/logging
 *     packages/contracts/src/index.ts   import { log } from '@secure-home/logging'
 *
 * TypeScript resolves it, `tsc` builds it, and the manifest checker permits it —
 * an outward dependency from the innermost layer, invisible to every gate.
 *
 * So the two checks are deliberately separate and neither substitutes for the
 * other:
 *
 *   check-workspace.mjs       DECLARATION direction — runtime dependency fields
 *   check-source-imports.mjs  IMPORT direction — every field, from real source
 *
 * ## Zones
 *
 * A file's obligations depend on what it is, not only where it sits:
 *
 *   production  everything that is not test or member-root config. Full rules.
 *   test        `tests/`, `__tests__/`, `*.test.*`, `*.spec.*`. Relaxed:
 *               a test may reach a test helper above its own layer.
 *   tooling     member-root `*.config.*` (vitest.config.ts, eslint.config.js).
 *               Relaxed: configuring the build is what these are for.
 *
 * Production is the DEFAULT, not an opt-in list, so a package that puts code
 * outside `src/` does not escape the rules by accident.
 *
 * ## Known limit, closed rather than left open
 *
 * Specifiers are read statically, so a computed `import(expr)` cannot be
 * resolved. Rather than leave that as a silent bypass, a non-literal dynamic
 * import or `require` in production source is itself a failure. The blind spot
 * becomes a prohibition instead of a hole.
 *
 * Node standard library only. No dependencies, so CI can run it before install.
 *
 * Usage:
 *   node scripts/check-source-imports.mjs
 *
 * Governed by AGENTS.md and ADR-0012 §15.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename, sep } from 'node:path'

import {
  DEFAULT_ROOT,
  INTERNAL_SCOPE,
  TEST_ONLY_PACKAGES,
  BUILD_TOOLING_PACKAGES,
  DEPLOYABLE_LAYER,
  findMembers,
  readManifest,
  declaredInternalDeps,
  layerOf,
  topOf,
  packageNameOf,
} from './workspace-model.mjs'

/** Files whose imports are worth reading at all. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']

/**
 * Directories that hold generated or installed output. Scanning `dist/` would
 * report the compiled copy of a violation already reported in `src/`.
 */
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.turbo',
  '.next',
])

const TEST_DIR = /(?:^|\/)(?:tests|__tests__|__fixtures__)(?:\/|$)/
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/
/** No slash → member root; `something.config.ts` → build configuration. */
const ROOT_CONFIG = /^[^/]+\.config\.[cm]?[jt]s$/

/**
 * Module specifiers, in every syntactic position that creates an import edge.
 *
 * Only import-shaped constructs are matched, so a package name merely mentioned
 * in a doc comment is not a violation. Each character class excludes quotes and
 * backticks so a match can never span a string literal.
 */
const SPECIFIER_PATTERNS = [
  // import ... from '<spec>'  ·  export ... from '<spec>'  ·  export * from '<spec>'
  /(?:^|[\s;})])(?:import|export)\b[^'"`]*?\bfrom\s*['"]([^'"]+)['"]/g,
  // import '<spec>'  — side-effect only
  /(?:^|[\s;})])import\s*['"]([^'"]+)['"]/g,
  // import('<spec>')  ·  require('<spec>')
  /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]

/** A dynamic import or require whose specifier is not a literal. */
const NON_LITERAL_SPECIFIER = /\b(?:import|require)\s*\(\s*(?!['"])[^)\s]/g

function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === '\n') line += 1
  }
  return line
}

/** Every source file under `dir`, relative to it, with generated output skipped. */
function sourceFiles(dir) {
  const found = []
  const walk = (current, prefix) => {
    let entries
    try {
      entries = readdirSync(current)
    } catch {
      return
    }
    for (const entry of entries.sort()) {
      const full = join(current, entry)
      const rel = prefix ? `${prefix}/${entry}` : entry
      let stats
      try {
        stats = statSync(full)
      } catch {
        continue
      }
      if (stats.isDirectory()) {
        if (IGNORED_DIRS.has(entry) || entry.startsWith('.')) continue
        walk(full, rel)
      } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
        found.push(rel)
      }
    }
  }
  walk(dir, '')
  return found
}

/**
 * What a file is. Production is the default so that code placed outside `src/`
 * is still governed — an allowlist of production paths would let a package opt
 * out of the rules by choosing a directory name.
 */
export function zoneOf(relativePath) {
  const name = basename(relativePath)
  if (TEST_DIR.test(relativePath) || TEST_FILE.test(name)) return 'test'
  if (ROOT_CONFIG.test(relativePath)) return 'tooling'
  return 'production'
}

/** Every internal specifier in a file, with the line it appears on. */
function internalImports(text) {
  const found = []
  const seen = new Set()
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(text)) !== null) {
      const specifier = match[1]
      if (!specifier.startsWith(INTERNAL_SCOPE)) continue
      const index = match.index + match[0].indexOf(specifier)
      const key = `${specifier}@${index}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ specifier, line: lineOf(text, index) })
    }
  }
  return found.sort((a, b) => a.line - b.line || a.specifier.localeCompare(b.specifier))
}

/**
 * @param root repository root; parameterised so the rules can be proven against
 *             a fixture workspace rather than only against this repository
 */
export function checkSourceImports(root = DEFAULT_ROOT) {
  const problems = []
  const fail = (msg) => problems.push(msg)

  const members = findMembers(root)
  const byName = new Map()

  for (const m of members) {
    const pkg = readManifest(m)
    if (!pkg?.name) continue
    byName.set(pkg.name, { ...m, pkg, top: topOf(m.rel), layer: layerOf(m.rel) })
  }

  let scanned = 0

  for (const member of byName.values()) {
    if (member.layer === undefined) {
      fail(
        `${member.rel}: not placed in the dependency layer map — ` +
          'add it to LAYERS in scripts/workspace-model.mjs with a rationale',
      )
      continue
    }
    const declared = declaredInternalDeps(member.pkg)

    for (const file of sourceFiles(member.dir)) {
      const path = `${member.rel}/${file}`
      const zone = zoneOf(file)
      let text
      try {
        text = readFileSync(join(member.dir, file.split('/').join(sep)), 'utf8')
      } catch (error) {
        fail(`${path}: unreadable — ${error.message}`)
        continue
      }
      scanned += 1

      if (zone === 'production') {
        NON_LITERAL_SPECIFIER.lastIndex = 0
        let dynamic
        while ((dynamic = NON_LITERAL_SPECIFIER.exec(text)) !== null) {
          fail(
            `${path}:${lineOf(text, dynamic.index)}: dynamic import with a non-literal ` +
              'specifier — direction cannot be verified statically, so production source ' +
              'must import by literal specifier',
          )
        }
      }

      for (const { specifier, line } of internalImports(text)) {
        const where = `${path}:${line}`
        const name = packageNameOf(specifier)

        if (!name) {
          fail(`${where}: "${specifier}" is not a resolvable @secure-home/* package name`)
          continue
        }

        if (name === member.pkg.name) {
          if (zone === 'production') {
            fail(
              `${where}: imports its own package name "${specifier}" — ` +
                'a package addresses its own modules by relative path',
            )
          }
          continue
        }

        const target = byName.get(name)
        if (!target) {
          fail(`${where}: "${specifier}" is not a workspace member`)
          continue
        }

        if (!declared.has(name)) {
          fail(
            `${where}: imports "${name}" without declaring it — ` +
              'an undeclared import resolves only by accident of hoisting',
          )
        }

        if (target.layer === DEPLOYABLE_LAYER) {
          fail(
            `${where}: imports "${name}", which is a ${target.top.slice(0, -1)} — ` +
              'nothing may import a service or an app',
          )
          continue
        }

        if (target.layer === undefined) {
          fail(`${where}: "${name}" is not placed in the dependency layer map`)
          continue
        }

        // Beyond this point the rules apply to production source only. A test
        // may use a test helper, and a build config may load the build tooling;
        // neither ships in the compiled artifact.
        if (zone !== 'production') continue

        if (TEST_ONLY_PACKAGES.has(name)) {
          fail(
            `${where}: imports the test-only package "${name}" from production source — ` +
              'test helpers must not reach a deployed artifact',
          )
          continue
        }

        if (BUILD_TOOLING_PACKAGES.has(name)) {
          fail(
            `${where}: imports the build-tooling package "${name}" from production source — ` +
              'compiler and linter configuration is not a runtime dependency',
          )
          continue
        }

        if (target.layer >= member.layer) {
          fail(
            `${where}: ${member.rel} (layer ${member.layer}) imports ${name} ` +
              `(layer ${target.layer}) — direction is inward only, and equal layers ` +
              'are how cycles start' +
              (declared.has(name) && !(member.pkg.dependencies ?? {})[name]
                ? '. Declaring it as a devDependency does not make the import inward'
                : ''),
          )
        }
      }
    }
  }

  return { problems, scanned, members: byName.size }
}

// --- CLI -------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const root = process.argv[2] ?? DEFAULT_ROOT
  const { problems, scanned, members } = checkSourceImports(root)

  if (problems.length > 0) {
    console.error(`✗ source import direction — ${problems.length} problem(s)\n`)
    for (const p of problems) console.error(`    ${p}`)
    process.exit(1)
  }

  console.log(
    `✓ source import direction — ${scanned} source file${scanned === 1 ? '' : 's'} ` +
      `across ${members} workspace member${members === 1 ? '' : 's'}`,
  )
  console.log(`    scanned under ${relative(process.cwd(), root) || '.'}`)
}
