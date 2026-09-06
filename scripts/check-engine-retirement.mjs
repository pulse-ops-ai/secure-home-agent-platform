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

/** Config filenames that only the retired engine ever read. */
export const RETIRED_CONFIG_BASENAMES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  '.eslintrc.yml',
]

const isRetired = (name) =>
  RETIRED_PACKAGES.includes(name) || RETIRED_SCOPES.some((scope) => name.startsWith(scope))

export function trackedFiles(repoRoot = REPO_ROOT) {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line !== '')
}

/** Dependency edges naming a retired package. */
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
 * Lock entries resolving a retired package.
 *
 * The one that a manifest scan alone would miss: a dependency removed from
 * every manifest but left in the lockfile still describes an install.
 */
export function lockResidue(repoRoot) {
  const problems = []
  const file = path.join(repoRoot, 'pnpm-lock.yaml')
  if (!existsSync(file)) return problems
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const entry = /^\s{2,6}'?((?:@[^/'@\s]+\/)?[^/'@\s]+)@[^:'\s]*'?:\s*$/.exec(line)
    const name = entry?.[1]
    if (name !== undefined && isRetired(name)) {
      problems.push(`pnpm-lock.yaml: still resolves "${name}"`)
    }
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
 * Bare specifiers only, and only the package part: `eslint/use-at-your-own-risk`
 * counts, `packages/lint-config/src/run-lint.mjs` does not.
 */
export function importResidue(repoRoot, tracked) {
  const problems = []
  const SPECIFIER = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g
  for (const rel of tracked) {
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(rel)) continue
    let text
    try {
      text = readFileSync(path.join(repoRoot, rel), 'utf8')
    } catch {
      continue
    }
    for (const [, specifier] of text.matchAll(SPECIFIER)) {
      if (specifier.startsWith('.') || specifier.startsWith('/')) continue
      const parts = specifier.split('/')
      const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
      if (isRetired(name) || isRetired(`${name}/`)) {
        problems.push(`${rel}: imports the retired package "${name}"`)
      }
    }
  }
  return problems
}

export function checkRetirement(repoRoot = REPO_ROOT) {
  const tracked = trackedFiles(repoRoot)
  return [
    ...manifestResidue(repoRoot, tracked),
    ...catalogResidue(repoRoot),
    ...lockResidue(repoRoot),
    ...pathResidue(tracked),
    ...classificationResidue(repoRoot),
    ...importResidue(repoRoot, tracked),
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
  const root = process.argv[2] ?? REPO_ROOT
  const problems = checkRetirement(root)
  if (problems.length > 0) {
    console.error(`✗ lint-engine retirement — ${problems.length} residue(s)\n`)
    for (const problem of problems) console.error(`    ${problem}`)
    process.exit(1)
  }
  console.log(
    '✓ lint-engine retirement — no dependency, catalog, lock, path, layer or import residue',
  )
}
