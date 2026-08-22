#!/usr/bin/env node
/**
 * THE REGISTRY, COMPARED WITH ITS PRIOR GOVERNED REVISION.
 *
 * Everything else that reads `knowledge/set-releases.json` reads ONE revision of
 * it. That is enough to prove a record is internally coherent, and not enough to
 * prove anything about identity over time — because every claim ADR-0019 makes
 * about a release is a claim about two revisions:
 *
 *   "(familyId, version) resolves to one digest FOREVER"   two revisions
 *   "Released -> Deprecated -> Retired, no reverse"        two revisions
 *   "a release pins modules that passed the preconditions" the revision it
 *                                                          was created in
 *
 * A single-revision check cannot see a record deleted, a digest swapped under a
 * reused version, or a state jumped straight from Released to Retired. The
 * hard-coded historical pins in tests/test_set_releases.py cover exactly three
 * releases and nothing added later. This closes that.
 *
 * The division, exactly:
 *
 *   check-knowledge.mjs        registry shape and scaffold coherence, one revision
 *   check-set-releases.mjs     real manifest bytes vs the record, one revision
 *   this file                  what changed since the last governed revision
 *
 * WHY NEW RECORDS ARE TREATED DIFFERENTLY FROM OLD ONES.
 *
 * A NEW release must be derivable from today's catalog: its members must exist,
 * be reviewed, be composable, and pass their own gates. That is the §6
 * precondition set, and `buildSetReleaseCandidate` is the only implementation of
 * it — so it is called, not reimplemented.
 *
 * A HISTORICAL release must NOT be re-derived. Its family is mutable and has
 * moved on; re-deriving it from today's catalog would fail precisely because the
 * release is immutable and the family is not. That is the family/release split
 * working, not a defect. So historical records are checked for identity only,
 * against bytes, never against the catalog.
 */
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildSetReleaseCandidate,
  releaseTransitionDecision,
} from '@secure-home/knowledge-toolchain'

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))
const REGISTRY = 'knowledge/set-releases.json'

const git = (root, args) => {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return undefined
  }
}

const isCommit = (root, ref) =>
  ref !== undefined && git(root, ['cat-file', '-e', `${ref}^{commit}`]) !== undefined

/**
 * Which revision is "before".
 *
 * Explicit beats inferred: CI knows the PR base or the push-before SHA and can
 * say so. The local fallbacks exist so a developer gets the same check without
 * ceremony, and the whole thing FAILS rather than skipping when no baseline can
 * be established — a comparison that quietly compared nothing would read as
 * "no violations".
 */
export function resolveBase(root, explicit) {
  const candidates = []
  if (explicit) candidates.push({ how: 'explicit', ref: explicit })
  const env = process.env.RELEASE_HISTORY_BASE
  if (env) candidates.push({ how: 'RELEASE_HISTORY_BASE', ref: env })
  for (const branch of ['origin/main', 'main']) {
    const merged = git(root, ['merge-base', 'HEAD', branch])?.trim()
    if (merged) candidates.push({ how: `merge-base with ${branch}`, ref: merged })
  }
  candidates.push({ how: 'HEAD~1', ref: 'HEAD~1' })

  for (const candidate of candidates) {
    if (isCommit(root, candidate.ref)) return candidate
  }
  return undefined
}

const registryAt = (root, ref) => {
  // Absent at the baseline means the registry was introduced here: every record
  // is new, which is the correct reading and not an error.
  const raw = ref === undefined ? undefined : git(root, ['show', `${ref}:${REGISTRY}`])
  if (raw === undefined) return { releases: [] }
  try {
    const parsed = JSON.parse(raw)
    return { releases: Array.isArray(parsed.releases) ? parsed.releases : [] }
  } catch {
    return undefined
  }
}

const key = (record) => `${record?.familyId ?? '(unnamed)'}@${record?.version ?? '?'}`

/** The identity a release carries forever. `state` is deliberately not in it. */
const identityOf = (r) => ({
  manifestPath: r?.manifestPath,
  releaseDigest: r?.releaseDigest,
  policy: r?.releaseReview?.policy,
  by: r?.releaseReview?.by,
  at: r?.releaseReview?.at,
  reviewDigest: r?.releaseReview?.releaseDigest,
})

export function checkReleaseHistory(root = DEFAULT_ROOT, explicitBase = undefined) {
  const problems = []
  const fail = (m) => problems.push(m)

  const base = resolveBase(root, explicitBase)
  if (base === undefined) {
    fail(
      'no prior governed revision could be resolved, so nothing was compared. ' +
        'Pass --base <ref> or set RELEASE_HISTORY_BASE. This check fails rather ' +
        'than skipping: a comparison against nothing would read as "no violations"',
    )
    return { problems, base: undefined, added: 0, carried: 0 }
  }

  const before = registryAt(root, base.ref)
  if (before === undefined) {
    fail(`${REGISTRY} at ${base.how} (${base.ref}) is not valid JSON`)
    return { problems, base, added: 0, carried: 0 }
  }

  const currentPath = join(root, REGISTRY)
  if (!existsSync(currentPath)) {
    fail(`${REGISTRY} is missing`)
    return { problems, base, added: 0, carried: 0 }
  }
  let current
  try {
    const parsed = JSON.parse(readFileSync(currentPath, 'utf8'))
    current = Array.isArray(parsed.releases) ? parsed.releases : []
  } catch (error) {
    fail(`${REGISTRY} is not valid JSON — ${error.message}`)
    return { problems, base, added: 0, carried: 0 }
  }

  const priorByKey = new Map(before.releases.map((r) => [key(r), r]))
  const currentByKey = new Map()
  for (const r of current) currentByKey.set(key(r), r)

  // --- 1. nothing that existed may vanish or be re-identified ---------------
  let carried = 0
  for (const [id, prior] of priorByKey) {
    const now = currentByKey.get(id)
    if (now === undefined) {
      fail(
        `release "${id}" existed at ${base.how} and is gone. A released identity is ` +
          'permanent: deleting the record would let the version be minted again ' +
          "with different bytes, and an old run's evidence would become ambiguous",
      )
      continue
    }
    carried += 1
    const was = identityOf(prior)
    const is = identityOf(now)
    for (const field of Object.keys(was)) {
      if (was[field] !== is[field]) {
        fail(
          `release "${id}": ${field} changed from ${JSON.stringify(was[field])} to ` +
            `${JSON.stringify(is[field])}. A release is immutable — publish a new version`,
        )
      }
    }

    // --- 2. state may move, but only the governed way ----------------------
    const decision = releaseTransitionDecision(prior.state, now.state)
    if (!decision.allowed) {
      fail(`release "${id}": ${decision.because}`)
    }
  }

  // --- 3. a NEW release must satisfy the §6 preconditions -------------------
  const catalogPath = join(root, 'knowledge', 'catalog.json')
  let catalog
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  } catch (error) {
    fail(`knowledge/catalog.json is unreadable — ${error.message}`)
    return { problems, base, added: 0, carried }
  }
  const modules = (catalog.modules ?? []).map((m) => ({
    id: m.id,
    version: m.version ?? null,
    sourceDigest: m.contentReview?.sourceDigest ?? null,
    status: m.status,
    blockedByToolchain: m.blockedByToolchain,
    blockedByRollout: m.blockedByRollout,
  }))

  let added = 0
  for (const [id, record] of currentByKey) {
    if (priorByKey.has(id)) continue
    added += 1
    const family = (catalog.sets ?? []).find((s) => s.id === record.familyId)
    if (family === undefined) {
      fail(`new release "${id}": familyId names no set family in catalog.json`)
      continue
    }
    const built = buildSetReleaseCandidate(
      {
        id: family.id,
        runnerClass: family.runnerClass,
        required: family.required,
        optional: family.optional ?? [],
        deny: family.deny,
        allowTaskAdditions: family.allowTaskAdditions,
        allowTaskNarrowing: family.allowTaskNarrowing,
        maxBytes: family.maxBytes,
        maxFreshnessDays: family.maxFreshnessDays,
        requiredFailure: family.requiredFailure,
        optionalFailure: family.optionalFailure,
        overrideAuthority: family.overrideAuthority,
      },
      record.version,
      modules,
    )
    if (!built.ok) {
      // The §6 member preconditions, reported with the package's own rules: a
      // new release may not pin an unreviewed, blocked, unversioned, or
      // non-composable module just because its own digest happens to be correct.
      for (const refusal of built.refusals) {
        fail(`new release "${id}": ${refusal.rule} — ${refusal.detail}`)
      }
      continue
    }
    if (built.value.releaseDigest !== record.releaseDigest) {
      fail(
        `new release "${id}": rebuilding it from the current catalog gives ` +
          `${built.value.releaseDigest}, but the record claims ${record.releaseDigest}. ` +
          'A new release must be derivable from the catalog it pins',
      )
    }
  }

  return { problems, base, added, carried }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  const args = process.argv.slice(2)
  const baseIndex = args.indexOf('--base')
  const explicitBase = baseIndex === -1 ? undefined : args[baseIndex + 1]
  const rootIndex = args.indexOf('--root')
  const root = rootIndex === -1 ? DEFAULT_ROOT : args[rootIndex + 1]

  const { problems, base, added, carried } = checkReleaseHistory(root, explicitBase)
  if (problems.length > 0) {
    console.error(`✗ release history — ${problems.length} problem(s)\n`)
    for (const problem of problems) console.error(`    ${problem}`)
    process.exit(1)
  }
  console.log(`✓ release history — ${carried} carried, ${added} new (base: ${base.how})`)
}
