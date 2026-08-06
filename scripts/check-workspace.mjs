#!/usr/bin/env node
/**
 * check-workspace.mjs — workspace conformance.
 *
 * Asserts that what the workspace *declares* matches the canonical taxonomy and
 * the dependency-governance rules in ADR-0012. It covers what Syncpack does
 * not: Syncpack governs versions and manifest shape, this governs **taxonomy,
 * naming, script surface, and dependency direction**.
 *
 * Checks:
 *   1. every pnpm member sits in services/, apps/, packages/, or agents/;
 *   2. no deployable backend process is under apps/;
 *   3. every member is private and scoped @secure-home/*;
 *   4. every member declares the four standard scripts;
 *   5. internal dependencies use workspace:*, external ones use catalog: —
 *      across dependencies, devDependencies, peerDependencies, AND
 *      optionalDependencies;
 *   6. dependency direction points inward only (ADR-0012 §15), by an EXPLICIT
 *      per-package layer map rather than a per-directory one;
 *   7. TypeScript members extend the shared tsconfig;
 *   8. test-only packages are never a production dependency;
 *   9. no framework dependency enters a contract-shaped package.
 *
 * Node standard library only — no dependencies, so it runs before install.
 *
 * Governed by AGENTS.md and ADR-0012.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Directory role → what may live there. */
const TAXONOMY = {
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
const LAYERS = {
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

  // 4 — cross-cutting infrastructure.
  'packages/logging': 4,
  'packages/observability': 4,

  // 5 — composes infrastructure into a worker runtime.
  'packages/worker-base': 5,

  // 6 — test helpers may reach anything below them.
  'packages/testing': 6,
}

/** Deployables sit outside every package layer, and nothing may depend on them. */
const DEPLOYABLE_LAYER = 99

/**
 * Test-only packages. A production dependency on one would ship test helpers
 * into a running service, so they may appear in devDependencies only.
 */
const TEST_ONLY_PACKAGES = new Set(['@secure-home/testing'])

/**
 * Contract-shaped packages (layers 1–3) describe shapes and carry no runtime.
 * A framework dependency here would make the contracts unusable outside the
 * framework — the exact coupling ADR-0003's neutrality rule forbids, and the
 * reason `contracts` is the innermost layer at all.
 */
const CONTRACT_LAYER_MAX = 3
const FRAMEWORK_DEPENDENCIES = [
  /^@nestjs\//,
  /^fastify$/,
  /^@fastify\//,
  /^next$/,
  /^react(-dom)?$/,
  /^express$/,
  /^@nuxt\//,
  /^vue$/,
  /^svelte$/,
]

const REQUIRED_SCRIPTS = ['lint', 'typecheck', 'test', 'build']

/** Where internal and external dependency declarations must be checked. */
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/**
 * Fields that create a RUNTIME edge, and therefore an architectural one.
 *
 * devDependencies are excluded deliberately: they are build tooling, resolved
 * at development time and absent from a published or deployed artifact, so they
 * cannot create a runtime cycle or an outward runtime dependency. Every package
 * devDepends on @secure-home/testing (layer 6) and @secure-home/eslint-config
 * — treating those as architectural edges would make the layer map unusable
 * while preventing nothing.
 *
 * The production restriction on test-only packages is enforced separately, so a
 * test helper still cannot become a runtime dependency.
 */
const RUNTIME_DEP_FIELDS = new Set(['dependencies', 'peerDependencies', 'optionalDependencies'])

/**
 * External peer dependencies are ranges by nature, so they are exempt from the
 * `catalog:` rule. Internal peers are not — they must still be workspace:*.
 */
const CATALOG_EXEMPT_FIELDS = new Set(['peerDependencies'])

function layerOf(rel, top) {
  if (top === 'services' || top === 'apps') return DEPLOYABLE_LAYER
  return LAYERS[rel]
}

const problems = []
const fail = (msg) => problems.push(msg)

/** Find pnpm members the same way pnpm-workspace.yaml does — one level deep. */
function findMembers() {
  const globs = ['services', 'services/workers', 'apps', 'packages', 'agents']
  const members = []
  for (const g of globs) {
    const dir = join(ROOT, g)
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

const members = findMembers()
if (members.length === 0) fail('no workspace members found')

for (const m of members) {
  let pkg
  try {
    pkg = JSON.parse(readFileSync(m.manifest, 'utf8'))
  } catch (error) {
    fail(`${m.rel}: package.json is unreadable or invalid JSON — ${error.message}`)
    continue
  }

  const top = m.rel.split('/')[0]
  if (!TAXONOMY[top]) {
    fail(`${m.rel}: not under a taxonomy root (${Object.keys(TAXONOMY).join(', ')})`)
    continue
  }

  const ownLayer = layerOf(m.rel, top)
  if (ownLayer === undefined) {
    fail(
      `${m.rel}: not placed in the dependency layer map — ` +
        'add it to LAYERS in scripts/check-workspace.mjs with a rationale',
    )
    continue
  }

  // A deployable backend process must not live under apps/.
  if (top === 'apps' && /control-plane|runner-control|worker/.test(m.rel)) {
    fail(`${m.rel}: a deployable backend process must live under services/, not apps/`)
  }

  if (pkg.private !== true) fail(`${m.rel}: must set "private": true`)
  if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@secure-home/')) {
    fail(`${m.rel}: name must be scoped @secure-home/* (got ${JSON.stringify(pkg.name)})`)
  }
  if (typeof pkg.description !== 'string' || pkg.description.length === 0) {
    fail(`${m.rel}: a description is required — say what the boundary owns`)
  }

  for (const s of REQUIRED_SCRIPTS) {
    if (typeof pkg.scripts?.[s] !== 'string') {
      fail(`${m.rel}: missing "${s}" script — root \`pnpm ${s}\` must reach every member`)
    }
  }

  // Dependency declarations: internal → workspace:*, external → catalog:.
  for (const field of DEP_FIELDS) {
    for (const [dep, spec] of Object.entries(pkg[field] ?? {})) {
      if (dep.startsWith('@secure-home/')) {
        if (spec !== 'workspace:*') {
          fail(`${m.rel}: ${field}.${dep} must be "workspace:*" (got ${JSON.stringify(spec)})`)
        }
        const depMember = members.find((x) => {
          try {
            return JSON.parse(readFileSync(x.manifest, 'utf8')).name === dep
          } catch {
            return false
          }
        })
        if (!depMember) {
          fail(`${m.rel}: ${field}.${dep} is not a workspace member`)
          continue
        }
        const depTop = depMember.rel.split('/')[0]
        if (depTop === 'services' || depTop === 'apps') {
          fail(`${m.rel}: ${field}.${dep} — nothing may depend on a service or an app`)
          continue
        }
        const depLayer = layerOf(depMember.rel, depTop)
        if (depLayer === undefined) {
          fail(`${m.rel}: ${field}.${dep} is not placed in the dependency layer map`)
          continue
        }
        if (RUNTIME_DEP_FIELDS.has(field) && depLayer >= ownLayer) {
          fail(
            `${m.rel} (layer ${ownLayer}) → ${dep} (layer ${depLayer}) via ${field}: ` +
              'direction is inward only, and equal layers are how cycles start',
          )
        }
      } else if (!CATALOG_EXEMPT_FIELDS.has(field) && spec !== 'catalog:') {
        fail(`${m.rel}: ${field}.${dep} must be "catalog:" (got ${JSON.stringify(spec)})`)
      }

      // A test-only package must never be a production dependency.
      if (TEST_ONLY_PACKAGES.has(dep) && field !== 'devDependencies') {
        fail(
          `${m.rel}: ${field}.${dep} is test-only — it belongs in devDependencies, ` +
            'never in a production dependency field',
        )
      }

      // A contract-shaped package must stay framework-free.
      if (ownLayer <= CONTRACT_LAYER_MAX && FRAMEWORK_DEPENDENCIES.some((re) => re.test(dep))) {
        fail(
          `${m.rel} (layer ${ownLayer}) depends on the framework package "${dep}" — ` +
            'contract-shaped packages describe shapes and must stay framework-neutral',
        )
      }
    }
  }

  // TypeScript members extend the shared config rather than restating options.
  const tsconfig = join(m.dir, 'tsconfig.json')
  if (existsSync(tsconfig)) {
    const cfg = JSON.parse(readFileSync(tsconfig, 'utf8'))
    if (typeof cfg.extends !== 'string' || !cfg.extends.startsWith('@secure-home/tsconfig/')) {
      fail(`${m.rel}: tsconfig.json must extend @secure-home/tsconfig/*`)
    }
  }
}

const label = (n) => `${n} workspace member${n === 1 ? '' : 's'}`

if (problems.length > 0) {
  console.error(`✗ workspace conformance — ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`    ${p}`)
  process.exit(1)
}

console.log(`✓ workspace conformance — ${label(members.length)}`)
for (const m of members) console.log(`    ${relative(ROOT, m.dir)}`)
