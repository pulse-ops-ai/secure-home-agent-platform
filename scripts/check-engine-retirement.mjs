#!/usr/bin/env node
/**
 * The retired lint engine leaves NOTHING behind.
 *
 * Task 3.4 removed ESLint. "Removed" has to mean more than "the tests stopped
 * running it": a dependency still in a manifest keeps resolving into the
 * lockfile, a surviving `eslint.config.js` keeps offering a second place to
 * configure lint, and half a package left in the tree is a package.
 *
 * This scans for PACKAGE IDENTITIES and PATHS, never for the word "eslint".
 * That distinction is the whole design. The string is still legitimately
 * everywhere:
 *
 *   - `engine-mappings.json` keeps the legacy rule identities on purpose. They
 *     are the historical record of what each policy meant on the engine it was
 *     migrated FROM, and task 3.4 explicitly does not own deleting policy.
 *   - The replacement engine reports its own diagnostics as `eslint(no-var)`,
 *     because that is the rule's upstream name.
 *   - Prose explaining the retirement has to be able to name what was retired.
 *
 * A grep-for-the-word check would fail on all three, and the obvious way to
 * make it pass would be to delete the historical record. So it looks at
 * dependency edges, catalog pins, lock entries, tracked paths, layer
 * classification and import specifiers instead.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { DEP_FIELDS } from './workspace-model.mjs'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * The packages the retirement removed.
 *
 * The engine, its rule set, its TypeScript integration, the globals data it
 * consumed, and the workspace package that configured it. Anything reachable
 * only through ESLint belongs here; nothing else does.
 */
export const RETIRED_PACKAGES = [
  'eslint',
  '@eslint/js',
  'typescript-eslint',
  'globals',
  '@secure-home/eslint-config',
]

/** Scoped families whose every member went with the engine. */
export const RETIRED_SCOPES = ['@typescript-eslint/', '@eslint/']

/** Paths the retirement removed. */
export const RETIRED_PATH_PREFIX = 'packages/eslint-config/'

/**
 * Config filenames that only the retired engine ever read.
 *
 * COMPLETE for both eras, deliberately. A subset is worse than nothing here:
 * the checker's claim is that no engine configuration survives, and an
 * overlooked form is a place a candidate can keep one while the gate reports
 * clean. The flat-config era resolves six extensions and the legacy era six
 * more, so both are enumerated rather than the ones that happened to exist.
 */
export const RETIRED_CONFIG_BASENAMES = [
  // flat config, every extension ESLint resolves
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
  // legacy rc, every form -- the checker already refused some of these, so the
  // intent was always the whole surface rather than an arbitrary selection
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  // and the ignore file, which is engine configuration by another name
  '.eslintignore',
]

/**
 * Manifest keys that carry engine configuration inside `package.json`.
 *
 * The legacy era let a package configure the engine without any config FILE at
 * all, so a filename scan alone leaves a hole exactly where the checker claims
 * completeness.
 */
export const RETIRED_MANIFEST_KEYS = ['eslintConfig', 'eslintIgnore']

/** Binaries the retired engine installed. */
export const RETIRED_BINARIES = ['eslint']

/** Runners whose first non-flag argument is the executable they invoke. */
const RUNNERS = new Set(['pnpm', 'npm', 'npx', 'yarn', 'bun', 'bunx', 'node', 'corepack'])

/** Sub-commands those runners take before the executable. */
const RUNNER_SUBCOMMANDS = new Set(['exec', 'run', 'run-script', 'dlx', '--'])

const unquote = (token) => token.replace(/^['"]|['"]$/g, '')

/**
 * The executable each command in a script actually invokes.
 *
 * IDENTITY, not text. `echo "eslint is retired"` runs `echo`, and prose about
 * a retired engine is not residue -- the retirement is deliberately provable
 * without grepping for the word, because the word legitimately survives in the
 * retained legacy rule identities and in the surviving engine's own diagnostic
 * codes. What matters is whether something in the command position resolves
 * the retired binary or a path into a retired package.
 */
export function invokedExecutables(script) {
  const found = []
  for (const command of String(script).split(/&&|\|\||[;|]/)) {
    const tokens = command
      .trim()
      .split(/\s+/)
      .filter((token) => token !== '')
    for (let i = 0; i < tokens.length; i += 1) {
      const token = unquote(tokens[i])
      if (token === '') continue
      if (token.startsWith('-')) continue // a flag, not the executable
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue // VAR=value prefix
      const base = token.split('/').pop() ?? token
      if (RUNNERS.has(base) || RUNNER_SUBCOMMANDS.has(token)) continue
      found.push(token)
      break // everything after the executable is its arguments
    }
  }
  return found
}

/** The retired identity a command token resolves, if it resolves one. */
export function retiredExecutable(token) {
  const base = token.split('/').pop() ?? token
  const name = base.replace(/\.(js|mjs|cjs|ts|cmd|ps1|sh)$/, '')
  if (RETIRED_BINARIES.includes(name)) return name
  // A path INTO a retired package runs it whatever the entry file is called.
  if (token.startsWith(RETIRED_PATH_PREFIX)) return RETIRED_PATH_PREFIX
  for (const segment of token.split('/')) {
    if (RETIRED_PACKAGES.includes(segment)) return segment
  }
  return undefined
}

const isRetired = (name) =>
  RETIRED_PACKAGES.includes(name) || RETIRED_SCOPES.some((scope) => name.startsWith(scope))

export function trackedFiles(repoRoot = REPO_ROOT) {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line !== '')
}

/**
 * Everything a `package.json` can carry for the retired engine.
 *
 * Three surfaces, not one. A dependency edge installs it; a SCRIPT runs it
 * whether or not it is declared, which is why the script scan holds even for a
 * repository with no dependency on it at all; and the legacy configuration keys
 * configure it with no config file anywhere.
 */
export function manifestResidue(repoRoot, tracked) {
  const problems = []
  for (const rel of tracked) {
    if (path.basename(rel) !== 'package.json') continue
    let manifest
    try {
      manifest = JSON.parse(readFileSync(path.join(repoRoot, rel), 'utf8'))
    } catch {
      continue
    }
    for (const field of DEP_FIELDS) {
      for (const name of Object.keys(manifest[field] ?? {})) {
        if (isRetired(name)) {
          problems.push(`${rel}: ${field}.${name} is a retired lint-engine package`)
        }
      }
    }
    // EVERY script, not the canonical lint command. `lint:legacy`, `verify`,
    // `prepare` -- any of them reaching the retired engine is a second path to
    // it, and the one that was checked was the one nobody would use to hide it.
    for (const [name, script] of Object.entries(manifest.scripts ?? {})) {
      for (const token of invokedExecutables(script)) {
        const retired = retiredExecutable(token)
        if (retired !== undefined) {
          problems.push(
            `${rel}: the "${name}" script runs the retired lint engine ` +
              `("${token}" resolves ${retired})`,
          )
        }
      }
    }
    for (const key of RETIRED_MANIFEST_KEYS) {
      if (manifest[key] !== undefined) {
        problems.push(`${rel}: "${key}" is configuration for the retired engine`)
      }
    }
  }
  return problems
}

/** Catalog pins naming a retired package. */
export function catalogResidue(repoRoot) {
  const problems = []
  const file = path.join(repoRoot, 'pnpm-workspace.yaml')
  if (!existsSync(file)) return problems
  const lines = readFileSync(file, 'utf8').split('\n')
  const start = lines.findIndex((line) => /^catalog:\s*$/.test(line))
  if (start === -1) return problems
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '' || /^\s*#/.test(line)) continue
    if (!/^\s/.test(line)) break
    const entry = /^\s{2}(?:'([^']+)'|"([^"]+)"|([^\s:'"]+))\s*:/.exec(line)
    const name = entry?.[1] ?? entry?.[2] ?? entry?.[3]
    if (name !== undefined && isRetired(name)) {
      problems.push(`pnpm-workspace.yaml: the catalog still pins "${name}"`)
    }
  }
  return problems
}

/**
 * The dependency fields a lockfile importer can declare.
 *
 * All four, for the same reason the manifest scan reads all four: a retired
 * package reached through an optional or peer edge is still installed.
 */
export const LOCK_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

/** The package name in a lock key, with any version and peer suffix removed. */
export function lockPackageName(key) {
  // `oxlint@1.80.0(oxlint-tsgolint@7.0.2001)` -- the peer suffix carries its own
  // `@`, so it has to go before the version separator is located.
  const withoutPeers = key.split('(')[0]
  const at = withoutPeers.lastIndexOf('@')
  return at <= 0 ? withoutPeers : withoutPeers.slice(0, at)
}

/**
 * Every position in a pnpm-lock v9 document that names a PACKAGE.
 *
 * Four sections name packages, and they name them differently:
 *
 *   catalogs.<catalog>.<name>            a pinned version, no resolution yet
 *   importers.<path>.<field>.<name>      a declared edge from one member
 *   packages.<name@version>              a resolved package record
 *   snapshots.<name@version(peers)>      a resolved installation
 *
 * A scan that read only the last two would pass a lockfile that still pins the
 * retired engine in the catalog and still declares it from a member -- which is
 * a lockfile that reinstalls it.
 *
 * This tracks indentation and section rather than matching one line shape,
 * because the four positions differ in depth and in quoting. It is not a YAML
 * parser and does not need to be: it answers exactly one question, which is
 * where a package NAME appears, and every value line is ignored.
 */
export function lockPackageIdentities(text) {
  const found = []
  const stack = []
  for (const raw of text.split('\n')) {
    if (raw.trim() === '' || /^\s*#/.test(raw)) continue
    const indent = raw.length - raw.trimStart().length
    const key = /^(?:'([^']*)'|"([^"]*)"|([^\s:'"][^:]*?))\s*:\s*$/.exec(raw.trim())
    if (key === null) continue
    const name = key[1] ?? key[2] ?? key[3]
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop()
    stack.push({ indent, key: name })
    const at = stack.map((entry) => entry.key)

    if (at.length === 3 && at[0] === 'catalogs') {
      found.push({ name, where: `catalogs.${at[1]}` })
    } else if (at.length === 4 && at[0] === 'importers' && LOCK_DEPENDENCY_FIELDS.includes(at[2])) {
      found.push({ name, where: `importer "${at[1]}" ${at[2]}` })
    } else if (at.length === 2 && (at[0] === 'packages' || at[0] === 'snapshots')) {
      found.push({ name: lockPackageName(name), where: at[0], key: name })
    }
  }
  return found
}

/**
 * Lock entries naming a retired package.
 *
 * The one a manifest scan alone would miss: a dependency removed from every
 * manifest but left in the lockfile still describes an install.
 */
export function lockResidue(repoRoot) {
  const problems = []
  const file = path.join(repoRoot, 'pnpm-lock.yaml')
  if (!existsSync(file)) return problems
  for (const entry of lockPackageIdentities(readFileSync(file, 'utf8'))) {
    if (!isRetired(entry.name)) continue
    problems.push(
      `pnpm-lock.yaml: ${entry.where} still names the retired package "${entry.name}"` +
        (entry.key === undefined ? '' : ` (${entry.key})`),
    )
  }
  return problems
}

/** Tracked files under a retired path, or named as a retired config. */
export function pathResidue(tracked) {
  const problems = []
  for (const rel of tracked) {
    if (rel.startsWith(RETIRED_PATH_PREFIX)) {
      problems.push(`${rel}: survives inside the retired ${RETIRED_PATH_PREFIX} package`)
    }
    if (RETIRED_CONFIG_BASENAMES.includes(path.basename(rel))) {
      problems.push(`${rel}: is a configuration file for the retired engine`)
    }
  }
  return problems
}

/**
 * Layer and build-tooling classification naming a retired package.
 *
 * Read from the root UNDER TEST rather than imported statically. A static
 * import would read this repository's own model whatever root it was pointed
 * at, so the scan would report clean for any other tree -- and a test that
 * reclassified the retired package would pass while proving nothing. That is
 * exactly how this was found.
 *
 * Through a subprocess rather than a dynamic import, because a specifier built
 * from a variable is a load site nobody can resolve without running the code,
 * and the compatibility seam guard fails closed on exactly that. The model
 * emits its own classification instead, so both sides keep literal specifiers.
 */
export function classificationResidue(repoRoot) {
  const problems = []
  const model = path.join(repoRoot, 'scripts', 'workspace-model.mjs')
  if (!existsSync(model)) return problems
  const emitted = execFileSync('node', [model, '--json'], { cwd: repoRoot, encoding: 'utf8' })
  const { layers: LAYERS, buildToolingPackages: BUILD_TOOLING_PACKAGES } = JSON.parse(emitted)
  for (const rel of Object.keys(LAYERS)) {
    if (rel === 'packages/eslint-config' || rel.startsWith(RETIRED_PATH_PREFIX)) {
      problems.push(`scripts/workspace-model.mjs: LAYERS still classifies "${rel}"`)
    }
  }
  for (const name of BUILD_TOOLING_PACKAGES) {
    if (isRetired(name)) {
      problems.push(`scripts/workspace-model.mjs: BUILD_TOOLING_PACKAGES still holds "${name}"`)
    }
  }
  return problems
}

/**
 * Import specifiers resolving a retired package.
 *
 * The specifiers come from `check-source-imports.mjs --report-loads`, which is
 * this repository's one admitted structural load-site authority: it parses each
 * file with the compatibility seam and reports what the AST says, not what a
 * regular expression can find.
 *
 * This scan was regex-based and missed a whole syntactic form. `import 'eslint'`
 * has no binding and no `from`, so a pattern keyed on `from`, `import(` or
 * `require(` saw nothing -- and a side-effect import is the one that most
 * clearly executes the package. Extending the pattern would have added a second
 * import parser to maintain beside the real one, and the second parser is
 * always the one that falls behind.
 *
 * WHAT THIS DOES NOT OWN. The report also carries `nonLiteral` load sites, and
 * this must not refuse them. Whether a module may be loaded through a computed
 * specifier is `check-source-imports.mjs`'s decision, and it decides by ZONE:
 * production source must import by literal specifier, test and tooling files
 * deliberately may not have that prohibition. Refusing every non-literal site
 * here would be stricter than the authority it reads from — a second, quieter
 * module-loading policy, owned by a task about retiring a lint engine and
 * disagreeing with the real one. A non-literal load in production is already
 * refused, by the gate that owns the question, which runs in the same local and
 * hosted checks as this one.
 *
 * `syntaxErrors` DO fail closed here. That is not a second policy: a file that
 * did not parse has no specifiers at all, so the retirement is unproved over
 * it in every zone, and the source-import gate refuses it repository-wide for
 * the same reason.
 *
 * @param loads the parsed `--report-loads` document for the tree under test.
 */
export function importResidue(loads) {
  const problems = []
  for (const [file, entry] of Object.entries(loads)) {
    for (const specifier of entry.specifiers ?? []) {
      if (specifier.startsWith('.') || specifier.startsWith('/')) continue
      const parts = specifier.split('/')
      const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
      if (isRetired(name)) {
        problems.push(`${file}: loads the retired package "${name}"`)
      }
    }
    for (const site of entry.syntaxErrors ?? []) {
      problems.push(
        `${file}:${site.line} did not parse, so its module loads are unknown and the ` +
          'retirement cannot be proved over it',
      )
    }
  }
  return problems
}

/**
 * Ask the structural authority what the tree under test loads.
 *
 * The PARSER is this repository's, the SUBJECT is the given root. That split is
 * deliberate: the load-site reader is a trusted control-plane tool that resolves
 * its seam from this checkout's `node_modules`, while the tree being judged is
 * data and may have no install at all.
 *
 * It needs `@typescript/typescript6`, so it cannot run in the stdlib phase --
 * see the `--phase` flag below.
 */
export function readLoadSites(repoRoot) {
  const reader = path.join(REPO_ROOT, 'scripts', 'check-source-imports.mjs')
  const out = execFileSync('node', [reader, '--report-loads', repoRoot], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(out)
}

/**
 * The two phases, and why they are two.
 *
 * `static` reads bytes: dependency edges, catalog pins, lock identities,
 * tracked paths and layer classification. Node's standard library answers all
 * of it, so it must stay checkable on a host with no workspace installed --
 * the same argument the other governance gates in `check.sh` make for
 * themselves.
 *
 * `imports` reads an AST, through the structural load-site authority, which
 * resolves `@typescript/typescript6`. That is an installed dependency. It runs
 * after `pnpm install --frozen-lockfile` and nowhere else; pretending it were
 * available earlier would mean either a silent skip or a gate that fails for
 * the wrong reason on a clean host.
 */
export const RETIREMENT_PHASES = ['static', 'imports']

export function checkRetirement(repoRoot = REPO_ROOT, phase = 'static') {
  if (!RETIREMENT_PHASES.includes(phase)) {
    throw new Error(`unknown retirement phase "${phase}"; expected one of ${RETIREMENT_PHASES}`)
  }
  if (phase === 'imports') return importResidue(readLoadSites(repoRoot))

  const tracked = trackedFiles(repoRoot)
  return [
    ...manifestResidue(repoRoot, tracked),
    ...catalogResidue(repoRoot),
    ...lockResidue(repoRoot),
    ...pathResidue(tracked),
    ...classificationResidue(repoRoot),
  ]
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  const args = process.argv.slice(2)
  const phaseFlag = args.find((arg) => arg.startsWith('--phase='))
  const phase = phaseFlag === undefined ? 'static' : phaseFlag.slice('--phase='.length)
  const root = args.find((arg) => !arg.startsWith('--')) ?? REPO_ROOT

  const problems = checkRetirement(root, phase)
  if (problems.length > 0) {
    console.error(`✗ lint-engine retirement (${phase}) — ${problems.length} residue(s)\n`)
    for (const problem of problems) console.error(`    ${problem}`)
    process.exit(1)
  }
  console.log(
    phase === 'imports'
      ? '✓ lint-engine retirement — no source file loads the retired engine (AST load sites)'
      : '✓ lint-engine retirement — no dependency, script, manifest-config, catalog, lock, ' +
          'path or layer residue',
  )
}
