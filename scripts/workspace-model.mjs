#!/usr/bin/env node
/**
 * workspace-model.mjs — the single description of the workspace's shape.
 *
 * Two checks need the same facts and must never disagree about them:
 *
 *   - `check-workspace.mjs`      — what a manifest may DECLARE
 *   - `check-source-imports.mjs` — what source may IMPORT
 *
 * If each kept its own layer map, one could be updated and the other not, and
 * the pair would silently stop agreeing about what "inward" means. So the model
 * lives here once and both import it.
 *
 * This module has no side effects: importing it runs no check and exits no
 * process. Node standard library only, so it runs before install.
 *
 * Governed by AGENTS.md and ADR-0012 §15 / §19.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The scope every workspace member is published under. */
export const INTERNAL_SCOPE = '@secure-home/'

/** Directory role → what may live there. */
export const TAXONOMY = {
  services: 'deployable backend processes',
  apps: 'human-facing applications',
  packages: 'reusable libraries with no runtime identity',
  agents: 'agent implementations and profiles',
}

/**
 * Dependency direction (ADR-0012 §15): contracts ← domain ← application ←
 * adapters ← apps, inward only.
 *
 * Layering is EXPLICIT PER PACKAGE, not per directory. A per-directory layer
 * would put every package on one level, which would let `contracts` depend on
 * `logging`, `observability`, or `testing` and still pass — the rule would read
 * as enforced while enforcing nothing.
 *
 * A member may depend only on a STRICTLY LOWER layer. Equal-layer dependencies
 * are rejected because they are how a cycle starts.
 *
 * A package absent from this map is an ERROR, not a default: placing a new
 * package in the layering must be a decision. If a genuine need crosses a layer,
 * move the package in this map with a rationale — do not weaken the rule.
 */
export const LAYERS = {
  // 0 — build tooling. Imports nothing; everything may use it as a devDep.
  'packages/tsconfig': 0,
  'packages/eslint-config': 0,

  // 1 — the innermost contract source. Imports nothing from the platform.
  'packages/contracts': 1,

  // 2 — contract-shaped vocabularies built on `contracts`.
  'packages/errors': 2,
  'packages/events': 2,
  'packages/query-model': 2,

  // 3 — operation contracts and the catalog: contracts + query-model.
  'packages/api-contracts': 3,
  // 3 — the trusted runner decision core: contracts + events only. Placed at
  // 3 deliberately (runner-core design D1): the framework-dependency guard in
  // check-workspace.mjs applies to ownLayer <= CONTRACT_LAYER_MAX, so this
  // placement buys mechanical framework-neutrality enforcement.
  'packages/runner-core': 3,
  // 3 — the knowledge toolchain: compile / admit / package / query over
  // portable OKF source. NO workspace dependencies at all — its only runtime
  // dependency is a YAML parser, and it must not reach the execution or
  // authority planes (ADR-0015 §10, ADR-0016 §4). Placed at 3 for the same
  // reason as runner-core: the framework-dependency guard applies at or below
  // CONTRACT_LAYER_MAX, so this buys mechanical enforcement of that isolation.
  'packages/knowledge-toolchain': 3,

  // 4 — cross-cutting infrastructure.
  'packages/logging': 4,
  'packages/observability': 4,

  // 3 — coding-class provider adapters (L7 / #55): pure translation between
  // the frozen adapter SPI and one pinned provider CLI. Placed at 3 for the
  // same reason as runner-core (its design D1): the framework-dependency
  // guard in check-workspace.mjs applies to ownLayer <= CONTRACT_LAYER_MAX,
  // so this placement buys mechanical framework-neutrality enforcement for
  // the adapter tier. Adapters declare ZERO runtime dependencies; their only
  // internal edge is type-only, on `contracts` (layer 1, inward).
  'agents/adapters/coding/claude-code': 3,
  'agents/adapters/coding/copilot-cli': 3,

  // 5 — composes infrastructure into a worker runtime.
  'packages/worker-base': 5,

  // 6 — test helpers may reach anything below them.
  'packages/testing': 6,
}

/** Deployables sit outside every package layer, and nothing may depend on them. */
export const DEPLOYABLE_LAYER = 99

/**
 * Test-only packages. A production dependency on one would ship test helpers
 * into a running service, so they may appear in devDependencies only — and
 * production source may not import them at all.
 */
export const TEST_ONLY_PACKAGES = new Set(['@secure-home/testing'])

/**
 * Build-tooling packages. These configure the compiler and the linter. Nothing
 * resolves them at runtime, so an import from production source is a mistake
 * that would drag lint and compiler machinery into a deployed artifact.
 *
 * Their layer (0) is below everything, so the layering rule alone would happily
 * ALLOW `contracts/src` to import `@secure-home/eslint-config`. Direction is not
 * the only property that matters; role is too.
 */
export const BUILD_TOOLING_PACKAGES = new Set([
  '@secure-home/tsconfig',
  '@secure-home/eslint-config',
])

/** Dependency fields that can declare an internal edge. */
export const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

/** The pnpm-workspace.yaml globs, expanded. Members are one level deep. */
export const MEMBER_GLOBS = [
  'services',
  'services/workers',
  'apps',
  'packages',
  'agents',
  'agents/adapters/coding',
]

/** The taxonomy root a member path sits under. */
export function topOf(rel) {
  return rel.split('/')[0]
}

/**
 * The layer of a member. `undefined` means "not placed", which callers must
 * treat as an error rather than a default — see LAYERS.
 */
export function layerOf(rel, top = topOf(rel)) {
  if (top === 'services' || top === 'apps') return DEPLOYABLE_LAYER
  return LAYERS[rel]
}

/**
 * The package name a module specifier resolves to.
 *
 * `@secure-home/testing/vitest` → `@secure-home/testing`. Returns null for a
 * relative or non-internal specifier, which the callers ignore: this repository
 * governs its own boundaries, not npm's.
 */
export function packageNameOf(specifier) {
  if (!specifier.startsWith(INTERNAL_SCOPE)) return null
  const [scope, name] = specifier.split('/')
  return name ? `${scope}/${name}` : null
}

/** Find pnpm members the same way pnpm-workspace.yaml does — one level deep. */
export function findMembers(root = DEFAULT_ROOT) {
  const members = []
  for (const g of MEMBER_GLOBS) {
    const dir = join(root, g)
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (!statSync(full).isDirectory()) continue
      const manifest = join(full, 'package.json')
      if (existsSync(manifest)) members.push({ rel: `${g}/${entry}`, dir: full, manifest })
    }
  }
  return members.sort((a, b) => a.rel.localeCompare(b.rel))
}

/** Parse a member manifest. Returns null if it is missing or malformed. */
export function readManifest(member) {
  try {
    return JSON.parse(readFileSync(member.manifest, 'utf8'))
  } catch {
    return null
  }
}

/** Every internal package name declared by a manifest, across all four fields. */
export function declaredInternalDeps(pkg) {
  const declared = new Set()
  for (const field of DEP_FIELDS) {
    for (const dep of Object.keys(pkg?.[field] ?? {})) {
      if (dep.startsWith(INTERNAL_SCOPE)) declared.add(dep)
    }
  }
  return declared
}
