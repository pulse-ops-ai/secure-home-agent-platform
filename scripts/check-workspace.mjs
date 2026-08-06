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
 *   5. internal dependencies use workspace:*, external ones use catalog:;
 *   6. dependency direction points inward only (ADR-0012 §15);
 *   7. TypeScript members extend the shared tsconfig.
 *
 * Node standard library only — no dependencies, so it runs before install.
 *
 * Governed by AGENTS.md and ADR-0012.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Directory role → what may live there, and which layer it sits at. */
const TAXONOMY = {
  services: { role: 'deployable backend processes', layer: 3 },
  apps: { role: 'human-facing applications', layer: 3 },
  packages: { role: 'reusable libraries with no runtime identity', layer: 2 },
  agents: { role: 'agent implementations and profiles', layer: 2 },
}

/**
 * Dependency direction (ADR-0012 §15): contracts ← domain ← application ←
 * adapters ← apps. Expressed as a layer number; a member may depend only on a
 * member with a layer strictly lower than, or equal to, its own — and nothing
 * may depend on a service or an app.
 */
const LAYER_OF_PACKAGE = { 'packages/tsconfig': 1, 'packages/eslint-config': 1 }

const REQUIRED_SCRIPTS = ['lint', 'typecheck', 'test', 'build']

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
  const ownLayer = LAYER_OF_PACKAGE[m.rel] ?? TAXONOMY[top].layer
  for (const field of ['dependencies', 'devDependencies']) {
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
          fail(`${m.rel}: depends on ${dep}, but nothing may depend on a service or an app`)
        }
        const depLayer = LAYER_OF_PACKAGE[depMember.rel] ?? TAXONOMY[depTop].layer
        if (depLayer > ownLayer) {
          fail(`${m.rel}: depends on ${dep}, which is an outer layer — direction is inward only`)
        }
      } else if (spec !== 'catalog:') {
        fail(`${m.rel}: ${field}.${dep} must be "catalog:" (got ${JSON.stringify(spec)})`)
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
