/**
 * REPOSITORY-WIDE POLICY AND ROLE-ASSIGNMENT INTEGRITY.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE ORACLE. `extract-legacy-policy.mjs`
 * resolves ONE representative file per role. That establishes what each role
 * MEANS, and it is the only honest way to learn the semantics — but it is blind
 * to which members actually consume which role. A member could switch from
 * `library` to `service`, quietly dropping the process restrictions from a
 * package that is not a composition root, and every representative probe would
 * still pass because `services/runner-control` still resolves `service`
 * correctly.
 *
 * So role SEMANTICS come from probes and role ASSIGNMENT is checked here,
 * across every member. `AUTH-MEMBER-ROLES` owns both halves; one without the
 * other is not the authority it claims to be.
 *
 * Dependency-free: node stdlib.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/**
 * The canonical projection: taxonomy position decides role.
 *
 * Stated as a rule rather than a per-member list, so a NEW member is covered
 * the day it appears instead of the day somebody remembers to add it.
 */
export const ROLE_PROJECTION = [
  { prefix: 'services/', role: 'service', why: 'a deployable composition root' },
  { prefix: 'apps/', role: 'application', why: 'a human-facing application' },
  { prefix: 'agents/adapters/coding/', role: 'library', why: 'a reusable adapter library' },
  { prefix: 'packages/', role: 'library', why: 'a reusable library' },
]

/**
 * Members that legitimately run no lint engine.
 *
 * A closed list, because "this one is special" is exactly the sentence that
 * turns a gate into a suggestion. Each must still declare a lint script that
 * says so out loud, so the absence is a recorded decision and not an omission.
 */
export const NON_LINTING_MEMBERS = new Set(['packages/tsconfig', 'packages/lint-config'])

/**
 * The one member allowed to lint itself with what it exports, since asking it
 * to consume a published role would be circular.
 */
export const SELF_LINTING_MEMBER = 'packages/eslint-config'

/** The one admitted process-boundary override, and the exact rules it may relax. */
export const ADAPTER_BIN_OVERRIDE = {
  prefix: 'agents/adapters/coding/',
  files: 'src/bin.ts',
  relaxes: ['no-console', 'no-restricted-globals', 'no-restricted-properties'],
}

export const MEMBER_GLOBS = [
  'packages',
  'services',
  'services/workers',
  'apps',
  'agents',
  'agents/adapters/coding',
]

export function members(repoRoot = REPO_ROOT) {
  const found = []
  for (const glob of MEMBER_GLOBS) {
    const root = path.join(repoRoot, glob)
    if (!existsSync(root)) continue
    for (const name of readdirSorted(root)) {
      const rel = `${glob}/${name}`
      if (existsSync(path.join(repoRoot, rel, 'package.json'))) found.push(rel)
    }
  }
  return [...new Set(found)].sort()
}

function readdirSorted(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

export function expectedRoleFor(rel) {
  for (const entry of ROLE_PROJECTION) {
    if (rel.startsWith(entry.prefix)) return entry
  }
  return undefined
}

/** The role a member's config actually composes, read from its own bytes. */
export function declaredRoleOf(repoRoot, rel) {
  const configPath = path.join(repoRoot, rel, 'eslint.config.js')
  if (!existsSync(configPath)) return { kind: 'absent' }
  const text = readFileSync(configPath, 'utf8')
  if (/from\s+'\.\/index\.js'/.test(text)) return { kind: 'self', text }
  const match = /@secure-home\/eslint-config\/([a-z]+)/.exec(text)
  return match === null ? { kind: 'unknown', text } : { kind: 'role', role: match[1], text }
}

/**
 * Every member's assignment, checked against the projection.
 *
 * Returns problems rather than throwing, so one run reports the whole picture.
 */
export function checkMemberRoles(repoRoot = REPO_ROOT) {
  const problems = []

  for (const rel of members(repoRoot)) {
    const declared = declaredRoleOf(repoRoot, rel)

    if (NON_LINTING_MEMBERS.has(rel)) {
      if (declared.kind !== 'absent') {
        problems.push(`${rel}: declared non-linting but ships an eslint.config.js`)
        continue
      }
      const pkg = JSON.parse(readFileSync(path.join(repoRoot, rel, 'package.json'), 'utf8'))
      if (!/no lint/.test(String(pkg.scripts?.lint ?? ''))) {
        problems.push(`${rel}: runs no lint engine but its lint script does not say so`)
      }
      continue
    }

    if (rel === SELF_LINTING_MEMBER) {
      if (declared.kind !== 'self') {
        problems.push(`${rel}: the engine config package must lint itself with what it exports`)
      }
      continue
    }

    if (declared.kind === 'absent') {
      problems.push(`${rel}: no eslint.config.js, and it is not a declared non-linting member`)
      continue
    }
    if (declared.kind !== 'role') {
      problems.push(`${rel}: eslint.config.js composes no recognisable exported role`)
      continue
    }

    const expected = expectedRoleFor(rel)
    if (expected === undefined) {
      problems.push(`${rel}: outside every taxonomy prefix, so no role can be projected for it`)
      continue
    }
    if (declared.role !== expected.role) {
      problems.push(
        `${rel}: composes the "${declared.role}" role but the projection says "${expected.role}" ` +
          `(${expected.why}). A role change alters which policies block, so it is a reviewed ` +
          `decision, not a config edit`,
      )
    }

    // The one admitted override. Anything else is an undeclared local policy.
    const overrides = [...declared.text.matchAll(/files:\s*\[([^\]]*)\]/g)].map((m) => m[1])
    for (const files of overrides) {
      const isAdapterBin =
        rel.startsWith(ADAPTER_BIN_OVERRIDE.prefix) && files.includes(ADAPTER_BIN_OVERRIDE.files)
      if (!isAdapterBin) {
        problems.push(
          `${rel}: eslint.config.js carries a local override for ${files.trim()}. Policy is ` +
            `repository-wide; the only admitted local exception is the coding-adapter ` +
            `${ADAPTER_BIN_OVERRIDE.files} process entry`,
        )
      }
    }
  }

  return problems
}

// ── referential integrity between the two authorities ───────────────────────

/**
 * The properties neither schema can express, because each validates one file.
 *
 * A schema proves a mapping row is well formed. Only a cross-file check proves
 * it points at a policy that exists, that no policy was left without an engine,
 * and that no vendor identity leaked into the semantic side.
 */
export function checkReferentialIntegrity(policy, mappings) {
  const problems = []
  const ids = new Set()

  for (const row of policy.policies) {
    if (ids.has(row.id)) problems.push(`policy "${row.id}" is declared more than once`)
    ids.add(row.id)

    if (/^@|\//.test(row.id)) {
      problems.push(`policy "${row.id}" carries a vendor-shaped identity`)
    }
    if (new Set(row.roles).size !== row.roles.length) {
      problems.push(`policy "${row.id}" repeats a role, so its applicability is ambiguous`)
    }
    const { shard, valid, invalid } = row.proof
    if (!valid.startsWith(`${shard}/`) || !invalid.startsWith(`${shard}/`)) {
      problems.push(`policy "${row.id}" points at proof outside its own shard "${shard}"`)
    }
    if (valid === invalid) {
      problems.push(`policy "${row.id}" uses one file as both its positive and negative case`)
    }
  }

  const seen = new Map()
  for (const row of mappings.mappings) {
    const key = `${row.policy}::${row.engine}`
    if (seen.has(key)) {
      problems.push(`policy "${row.policy}" has more than one ${row.engine} mapping`)
    }
    seen.set(key, row)
    if (!ids.has(row.policy)) {
      problems.push(`mapping for "${row.policy}" (${row.engine}) references no known policy`)
    }
  }

  for (const id of ids) {
    for (const engine of mappings.engines) {
      if (!seen.has(`${id}::${engine}`)) {
        problems.push(`policy "${id}" has no ${engine} mapping, so one engine would not enforce it`)
      }
    }
  }

  return problems
}

/**
 * The manifest must still describe the engine's real behaviour.
 *
 * Committed policy is a claim about a live configuration, and a claim nobody
 * re-derives is a comment. Deleting or re-scoping a rule in eslint-config
 * without regenerating shows up here as drift rather than as silence.
 */
export function checkPolicyDrift(policy, mappings, liveRows) {
  const problems = []
  const legacyById = new Map(
    mappings.mappings.filter((m) => m.engine === 'legacy').map((m) => [m.policy, m.ruleId]),
  )

  const manifestRules = new Set(legacyById.values())
  const liveRules = new Set(liveRows.map((r) => r.ruleId))

  for (const ruleId of liveRules) {
    if (!manifestRules.has(ruleId)) {
      problems.push(`the engine enforces "${ruleId}" but no policy row claims it`)
    }
  }
  for (const ruleId of manifestRules) {
    if (!liveRules.has(ruleId)) {
      problems.push(`policy claims "${ruleId}" but the engine no longer enforces it`)
    }
  }

  const liveByRule = new Map(liveRows.map((r) => [r.ruleId, r]))
  for (const row of policy.policies) {
    const ruleId = legacyById.get(row.id)
    const live = ruleId === undefined ? undefined : liveByRule.get(ruleId)
    if (live === undefined) continue
    const declared = [...row.roles].sort().join(',')
    const actual = [...live.roles].sort().join(',')
    if (declared !== actual) {
      problems.push(
        `policy "${row.id}" claims roles [${declared}] but the engine blocks it in [${actual}]`,
      )
    }
    if (row.blocking !== true) {
      problems.push(`policy "${row.id}" is not blocking, yet every current policy blocks`)
    }
  }

  return problems
}
