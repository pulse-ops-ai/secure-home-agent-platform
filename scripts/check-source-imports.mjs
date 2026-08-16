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
 * ## Why this parses instead of pattern-matching
 *
 * An earlier revision matched import-shaped regular expressions against raw
 * source. That is not safe for a gate that runs unconditionally, because a
 * regular expression cannot see lexical structure. It reported imports that were
 * commented out, and it missed real ones. Four constructs defeat it:
 *
 *   1. an import inside a line or block comment — reported, but inert;
 *   2. a block comment between `from` and the specifier — real, but missed;
 *   3. an import statement quoted inside a string or template — reported,
 *      but it is text;
 *   4. a regular expression literal containing a quote character, which
 *      desynchronises any scan that tracks quotes without tracking syntax.
 *
 * Masking comments and string literals by hand fixes the first two and leaves
 * the rest — regular expression literals, template substitutions, and JSX text
 * containing an apostrophe all need a real lexer. So this uses TypeScript's own
 * parser and walks the AST. A construct either is an import node or it is not;
 * there is no pattern left to defeat.
 *
 * The cost is one dependency, `typescript`, already pinned in the catalog. This
 * gate runs after `pnpm install --frozen-lockfile` in CI and in `check.sh`;
 * `validate-scaffold.sh`, `scan-secrets.sh`, `check-workspace.mjs`, and
 * `affected-targets.mjs` remain dependency-free and still run before install.
 *
 * A file whose syntax the parser rejects is a FAILURE, not a skip. A file that
 * cannot be parsed cannot be verified, and silently passing it would restore the
 * bypass this rewrite removed.
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
 * A computed specifier — `import(name)` — cannot be resolved without running the
 * program. Rather than leave that as a silent bypass, a non-literal dynamic
 * import or `require` in production source is itself a failure. The blind spot
 * becomes a prohibition instead of a hole.
 *
 * Usage:
 *   node scripts/check-source-imports.mjs [repository-root]
 *
 * Governed by AGENTS.md and ADR-0012 §15.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename, extname, sep } from 'node:path'

import ts from 'typescript'

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

/**
 * Extension → how TypeScript should parse the file.
 *
 * `ScriptKind.JS` already selects the JSX language variant, so `.js` files
 * containing JSX parse correctly. `.ts` must NOT use a JSX kind: `<T>value` is a
 * type assertion there and JSX parsing would reject it.
 */
const SCRIPT_KINDS = {
  '.ts': ts.ScriptKind.TS,
  '.mts': ts.ScriptKind.TS,
  '.cts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
}

const SOURCE_EXTENSIONS = Object.keys(SCRIPT_KINDS)

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

/**
 * KNOWLEDGE IS READ THROUGH THE QUERY SEAM, NEVER FROM DISK.
 *
 * ADR-0010: "No agent, service, or profile reads a bundle file directly."
 * Direct reads would make an unvalidated format load-bearing, and would skip
 * every admission rule the toolchain exists to apply. The only production
 * member permitted to name a `knowledge/` path is the toolchain itself, and it
 * does not read one either — `compile` and `admit` take supplied bytes.
 *
 * Enforced here rather than in a parallel scanner so it travels with the rest
 * of the import governance and cannot be forgotten by a new member.
 */
const KNOWLEDGE_PATH = /['"`][^'"`\n]*knowledge\/[^'"`\n]*['"`]/
const KNOWLEDGE_READER_EXEMPT = new Set(['packages/knowledge-toolchain'])

const TEST_DIR = /(?:^|\/)(?:tests|__tests__|__fixtures__)(?:\/|$)/
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/
/** No slash → member root; `something.config.ts` → build configuration. */
const ROOT_CONFIG = /^[^/]+\.config\.[cm]?[jt]s$/

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
      } else if (SOURCE_EXTENSIONS.includes(extname(entry))) {
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

/**
 * Every module specifier in a file, read from the AST.
 *
 * Covers each syntactic position that creates an edge: static import and
 * export-from, side-effect import, type-only import, `import x = require(...)`,
 * dynamic `import(...)`, `require(...)`, and `typeof import(...)` in a type
 * position. A comment is not a node, so a commented-out import is absent by
 * construction rather than by a pattern that tries to spot one.
 *
 * @returns {{specifiers: Array<{specifier: string, line: number}>,
 *            nonLiteral: Array<{line: number}>,
 *            syntaxErrors: Array<{line: number, message: string}>}}
 */
export function readImports(text, fileName) {
  const kind = SCRIPT_KINDS[extname(fileName)] ?? ts.ScriptKind.TS
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind)

  const lineAt = (pos) => source.getLineAndCharacterOfPosition(pos).line + 1

  const specifiers = []
  const nonLiteral = []

  const record = (node) =>
    specifiers.push({ specifier: node.text, line: lineAt(node.getStart(source)) })

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      // `export { a }` with no `from` has no moduleSpecifier — not an edge.
      const specifier = node.moduleSpecifier
      if (specifier && ts.isStringLiteral(specifier)) record(specifier)
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference
      if (ts.isExternalModuleReference(reference) && ts.isStringLiteral(reference.expression)) {
        record(reference.expression)
      }
    } else if (ts.isImportTypeNode(node)) {
      // `typeof import('x')` and `import('x').Type` in a type position.
      const argument = node.argument
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) {
        record(argument.literal)
      } else {
        nonLiteral.push({ line: lineAt(node.getStart(source)) })
      }
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'
      if (isDynamicImport || isRequire) {
        const argument = node.arguments[0]
        if (argument && ts.isStringLiteral(argument)) {
          record(argument)
        } else {
          nonLiteral.push({ line: lineAt(node.getStart(source)) })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(source, visit)

  // `parseDiagnostics` is how the parser reports syntax it could not read. It
  // is not part of the published type surface, so it is read defensively — and
  // `test_a_file_that_does_not_parse_is_reported` pins the behaviour so a future
  // TypeScript release cannot remove it silently.
  const syntaxErrors = (source.parseDiagnostics ?? []).map((diagnostic) => ({
    line: typeof diagnostic.start === 'number' ? lineAt(diagnostic.start) : 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
  }))

  return { specifiers, nonLiteral, syntaxErrors }
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

      // NO DIRECT KNOWLEDGE READ. Production source must not name a
      // `knowledge/` path: the query seam is the only read path, and a path
      // literal is how a consumer would reach around it. Tests may build
      // fixtures; the toolchain is exempt because it is the seam.
      const codeOnly = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
      if (
        zone === 'production' &&
        !KNOWLEDGE_READER_EXEMPT.has(member.rel) &&
        KNOWLEDGE_PATH.test(codeOnly)
      ) {
        fail(
          `${path}: names a "knowledge/" path from production source — ` +
            'knowledge is read through the query seam, never from disk (ADR-0010)',
        )
      }

      const { specifiers, nonLiteral, syntaxErrors } = readImports(text, file)

      // A file that does not parse cannot be verified. Failing is the only
      // honest outcome; skipping it would be a bypass anyone could reach.
      for (const error of syntaxErrors) {
        fail(
          `${path}:${error.line}: cannot be parsed, so its imports cannot be checked — ${error.message}`,
        )
      }
      if (syntaxErrors.length > 0) continue

      if (zone === 'production') {
        for (const { line } of nonLiteral) {
          fail(
            `${path}:${line}: dynamic import with a non-literal specifier — ` +
              'direction cannot be verified statically, so production source ' +
              'must import by literal specifier',
          )
        }
      }

      for (const { specifier, line } of specifiers) {
        if (!specifier.startsWith(INTERNAL_SCOPE)) continue
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
  console.log(`    parsed with TypeScript ${ts.version}`)
}
