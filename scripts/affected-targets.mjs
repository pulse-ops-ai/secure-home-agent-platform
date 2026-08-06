#!/usr/bin/env node
/**
 * affected-targets.mjs — decide which CI target gates must run.
 *
 * Implements the ADR-0012 §20 execution model:
 *
 *     always-on repository governance gates
 *   + path-aware service / package / application gates
 *   + root configuration changes fan out to all affected gates
 *
 * Governance gates are NOT computed here. They are unconditional in the
 * workflow, so a bug in this file can never skip them — that separation is the
 * point. This file only ever *adds* target gates.
 *
 * Selection is by DEPENDENCY GRAPH, not by directory. A change to
 * `packages/contracts` runs every TypeScript target that depends on it,
 * transitively. Selecting by directory alone would silently skip dependents,
 * which is the specific way path filtering becomes dangerous.
 *
 * Usage:
 *   node scripts/affected-targets.mjs <changed-file>...
 *   node scripts/affected-targets.mjs --stdin      # newline-separated on stdin
 *
 * Output: JSON on stdout —
 *   { "typescript": [names], "python": bool, "reason": {...} }
 *
 * Node standard library only. No dependencies, so CI can run it before install.
 *
 * Governed by AGENTS.md and ADR-0012 §20.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Root configuration whose change affects EVERY TypeScript target.
 *
 * This list is the safety valve for path filtering. A change to shared
 * compiler, lint, workspace, or dependency configuration alters behaviour
 * everywhere, so validating only the directory it lives in would validate
 * nothing that actually changed.
 */
const TS_FANOUT = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.syncpackrc.json',
  '.npmrc',
  'tsconfig.json',
  'tsconfig.base.json',
  'eslint.config.js',
  '.prettierrc.json',
  '.prettierignore',
  'scripts/affected-targets.mjs',
  'scripts/check-workspace.mjs',
  '.github/workflows/checks.yml',
]

/**
 * Shared tooling packages: a change fans out to every TypeScript target.
 *
 * `packages/testing` is here because every member's vitest.config.ts imports
 * its shared configuration — a change to test defaults changes how every
 * package's tests run, so validating only that package would validate nothing
 * that actually changed.
 */
const TS_FANOUT_PREFIXES = ['packages/tsconfig/', 'packages/eslint-config/', 'packages/testing/']

/** Root configuration whose change affects the Python target. */
const PY_FANOUT = ['pyproject.toml', 'uv.lock', '.github/workflows/checks.yml']

/**
 * Dependency fields that make one member a dependent of another. All four
 * count: a peer or optional dependency is still an edge in the graph, and
 * missing an edge means a required check is silently skipped.
 */
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/** Discover pnpm workspace members exactly as pnpm-workspace.yaml does. */
function discoverTypescriptTargets(ROOT) {
  const globs = ['services', 'services/workers', 'apps', 'packages', 'agents']
  const targets = new Map() // name -> { name, dir, deps: Set<string> }

  for (const g of globs) {
    const dir = join(ROOT, g)
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (!statSync(full).isDirectory()) continue
      const manifest = join(full, 'package.json')
      if (!existsSync(manifest)) continue
      let pkg
      try {
        pkg = JSON.parse(readFileSync(manifest, 'utf8'))
      } catch {
        continue
      }
      if (!pkg.name) continue
      // EVERY dependency field. A dependent declared through peerDependencies
      // or optionalDependencies is still a dependent — omitting them would let
      // CI silently skip it, which is the failure this whole file exists to
      // prevent.
      const deps = new Set(
        DEP_FIELDS.flatMap((f) => Object.keys(pkg[f] ?? {})).filter((d) =>
          d.startsWith('@secure-home/'),
        ),
      )
      targets.set(pkg.name, { name: pkg.name, dir: `${g}/${entry}`, deps })
    }
  }
  return targets
}

/** Python members come from the explicit uv member list, not a glob. */
function discoverPythonDirs(ROOT) {
  const pyproject = join(ROOT, 'pyproject.toml')
  if (!existsSync(pyproject)) return []
  const text = readFileSync(pyproject, 'utf8')
  const block = text.match(/\[tool\.uv\.workspace\][\s\S]*?members\s*=\s*\[([\s\S]*?)\]/)
  if (!block) return []
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => `${m[1]}/`)
}

/** Everything that depends on `name`, transitively. */
function dependentsOf(name, targets) {
  const found = new Set()
  let frontier = [name]
  while (frontier.length > 0) {
    const next = []
    for (const [candidate, t] of targets) {
      if (found.has(candidate)) continue
      if (frontier.some((f) => t.deps.has(f))) {
        found.add(candidate)
        next.push(candidate)
      }
    }
    frontier = next
  }
  return found
}

/**
 * @param changedFiles paths relative to the repository root
 * @param root repository root; parameterised so the calculation itself is
 *             testable against a fixture workspace rather than only this repo
 */
export function computeAffected(changedFiles, root = DEFAULT_ROOT) {
  const targets = discoverTypescriptTargets(root)
  const pythonDirs = discoverPythonDirs(root)

  const selected = new Set()
  const reason = { fanout: [], direct: [], dependents: [] }
  let python = false

  for (const raw of changedFiles) {
    const file = raw.trim().replace(/^\.\//, '')
    if (!file) continue

    // Root TypeScript configuration → every TypeScript target.
    if (TS_FANOUT.includes(file) || TS_FANOUT_PREFIXES.some((p) => file.startsWith(p))) {
      for (const name of targets.keys()) selected.add(name)
      reason.fanout.push(file)
    }

    // Root Python configuration → the Python target.
    if (PY_FANOUT.includes(file)) {
      python = true
      reason.fanout.push(file)
    }

    // A Python workspace member.
    if (pythonDirs.some((d) => file.startsWith(d))) {
      python = true
      reason.direct.push(file)
    }

    // A TypeScript member — the longest matching directory wins, so
    // `services/workers/x` is not misattributed to `services/`.
    let best = null
    for (const t of targets.values()) {
      if (file.startsWith(`${t.dir}/`) && (!best || t.dir.length > best.dir.length)) best = t
    }
    if (best) {
      selected.add(best.name)
      reason.direct.push(`${file} → ${best.name}`)
      for (const dep of dependentsOf(best.name, targets)) {
        if (!selected.has(dep)) reason.dependents.push(`${best.name} → ${dep}`)
        selected.add(dep)
      }
    }
  }

  return {
    typescript: [...selected].sort(),
    python,
    reason,
  }
}

// --- CLI -------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const args = process.argv.slice(2)
  const files = args.includes('--stdin') ? readFileSync(0, 'utf8').split('\n') : args

  const result = computeAffected(files)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
