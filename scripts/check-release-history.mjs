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
 * The succession RULES themselves — nothing vanishes, nothing mutates outside
 * `state`, state moves only the governed way, a lifecycle begins at Released —
 * live in `@secure-home/knowledge-toolchain` (`validateRegistrySuccession`),
 * typed against the record shape and unit-tested beside the transition rule.
 * This file is the git I/O adapter that feeds them two revisions; a semantic
 * rule that lived only here would drift silently the first time the record
 * shape grew a field.
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
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildSetReleaseCandidate,
  moduleCandidatesFromCatalog,
  validateRegistrySuccession,
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
 * AN AUTHORITATIVE BASELINE IS EXCLUSIVE, NOT PREFERRED.
 *
 * These were once one ranked list, so an explicit `--base` that did not resolve
 * fell through to `merge-base` or `HEAD~1` and the run compared against a
 * DIFFERENT revision while reporting success. That is the precise failure this
 * gate exists to prevent: CI supplies the governed baseline, and if that
 * baseline is wrong the answer must be "I could not check", never "I checked
 * something else". So when `--base` or `RELEASE_HISTORY_BASE` is supplied, it is
 * the only acceptable baseline and an unresolvable one fails.
 *
 * AN INFERRED BASELINE MAY NEVER BE HEAD.
 *
 * On `main`, `merge-base HEAD main` is HEAD, which would compare the registry
 * with itself: every record "carried", nothing detectable, exit 0. A vacuous
 * pass is worse than no check, because check.sh presents it as predicting the
 * merge gate. Any inferred candidate that resolves to HEAD is skipped.
 *
 * Inference exists so a developer gets the same check without ceremony. It is
 * not the gate.
 */
export function resolveBase(root, explicit) {
  // An empty string means "CI had no baseline to give" (first push, force-push,
  // workflow_dispatch), not "use this". Inference then applies.
  const supplied = explicit || process.env.RELEASE_HISTORY_BASE || undefined
  if (supplied !== undefined) {
    const how = explicit ? 'explicit --base' : 'RELEASE_HISTORY_BASE'
    return isCommit(root, supplied)
      ? { how, ref: supplied, authoritative: true }
      : { unresolvable: `${how} "${supplied}" is not a commit in this repository` }
  }

  const head = git(root, ['rev-parse', 'HEAD^{commit}'])?.trim()
  const candidates = []
  for (const branch of ['origin/main', 'main']) {
    const merged = git(root, ['merge-base', 'HEAD', branch])?.trim()
    if (merged) candidates.push({ how: `merge-base with ${branch}`, ref: merged })
  }
  candidates.push({ how: 'HEAD~1', ref: 'HEAD~1' })

  for (const candidate of candidates) {
    if (!isCommit(root, candidate.ref)) continue
    const resolved = git(root, ['rev-parse', `${candidate.ref}^{commit}`])?.trim()
    // Comparing HEAD with HEAD detects nothing and reports success.
    if (resolved !== undefined && resolved === head) continue
    return { ...candidate, authoritative: false }
  }
  return { unresolvable: 'no inferred baseline resolved to a commit other than HEAD' }
}

/**
 * The registry as it stood at the baseline — with ABSENCE and FAILURE apart.
 *
 * `git show` can fail for reasons that have nothing to do with the file not
 * existing: a corrupt object, an I/O error, output past the subprocess buffer.
 * Folding those into "absent" would hand the succession rules an empty prior
 * registry and make every two-revision check silently vacuous — permanently,
 * on every run, with nothing printed. So existence is probed on its own
 * (`ls-tree` of the exact path: empty output means absent, and ONLY absent),
 * and once the file is known to exist there, reading it must succeed.
 */
const registryAt = (root, ref) => {
  const listed = git(root, ['ls-tree', '--name-only', ref, '--', REGISTRY])
  if (listed === undefined) {
    return {
      failure: `git ls-tree ${ref} failed, so whether ${REGISTRY} existed there is unknown`,
    }
  }
  // Absent at the baseline means the registry was introduced here: every record
  // is new, which is the correct reading and not an error.
  if (listed.trim() === '') return { releases: [] }
  let raw
  try {
    raw = execFileSync('git', ['show', `${ref}:${REGISTRY}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // The subprocess default is 1 MiB and overflowing it THROWS. The ceiling
      // is raised so it stays unreachable — and if it is ever reached anyway,
      // the failure lands in the branch below instead of reading as absence.
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
    return {
      failure:
        `git show ${ref}:${REGISTRY} failed although the file exists at that revision` +
        (stderr === '' ? ` — ${error.message.split('\n')[0]}` : ` — ${stderr.split('\n')[0]}`),
    }
  }
  const envelope = parseRegistryEnvelope(raw)
  if (envelope.failure !== undefined) {
    return { failure: `${REGISTRY} at that revision ${envelope.failure}` }
  }
  return { releases: envelope.releases }
}

/**
 * The registry envelope, held to the same contract check-knowledge.mjs
 * enforces on the current file: `version` exactly 1 and `releases` an array
 * (other keys, like the file's `_comment`, are tolerated).
 *
 * Defaulting a broken envelope to `[]` would convert it into an EMPTY
 * history: a known-present registry indistinguishable from one that never
 * existed, every record it held reading as "new", every deletion invisible.
 * The prior side is re-validated by nothing else, so the envelope refuses
 * instead of defaulting — on both sides, because the current side must hold
 * standalone too.
 */
const parseRegistryEnvelope = (raw) => {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { failure: 'is not valid JSON' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { failure: 'is not a registry envelope (an object with "version" and "releases")' }
  }
  if (parsed.version !== 1) {
    return { failure: 'does not declare "version": 1' }
  }
  if (!Array.isArray(parsed.releases)) {
    return { failure: 'has no "releases" array' }
  }
  return { releases: parsed.releases }
}

export function checkReleaseHistory(root = DEFAULT_ROOT, explicitBase = undefined) {
  const problems = []
  const fail = (m) => problems.push(m)

  const base = resolveBase(root, explicitBase)
  if (base.unresolvable !== undefined) {
    fail(
      `no prior governed revision could be resolved — ${base.unresolvable}. Nothing ` +
        'was compared. Pass --base <ref> or set RELEASE_HISTORY_BASE. This check ' +
        'fails rather than skipping, and never falls back to a different revision: ' +
        'a comparison against nothing, or against the wrong thing, would read as ' +
        '"no violations"',
    )
    return { problems, base: undefined, added: 0, carried: 0 }
  }

  const before = registryAt(root, base.ref)
  if (before.failure !== undefined) {
    fail(
      `the prior registry at ${base.how} (${base.ref}) could not be established — ` +
        `${before.failure}. A failed read is not an absent file: treating it as "no prior ` +
        'releases" would make every two-revision rule pass while checking nothing',
    )
    return { problems, base, added: 0, carried: 0 }
  }

  const currentPath = join(root, REGISTRY)
  if (!existsSync(currentPath)) {
    fail(`${REGISTRY} is missing`)
    return { problems, base, added: 0, carried: 0 }
  }
  let rawCurrent
  try {
    rawCurrent = readFileSync(currentPath, 'utf8')
  } catch (error) {
    fail(`${REGISTRY} is unreadable — ${error.message}`)
    return { problems, base, added: 0, carried: 0 }
  }
  const currentEnvelope = parseRegistryEnvelope(rawCurrent)
  if (currentEnvelope.failure !== undefined) {
    fail(
      `${REGISTRY} ${currentEnvelope.failure} — the registry envelope is ` +
        '{ "version": 1, "releases": [...] }, and a malformed one is refused rather than ' +
        'read as empty',
    )
    return { problems, base, added: 0, carried: 0 }
  }
  const current = currentEnvelope.releases

  // --- 1./2. the succession rules, applied by their owner --------------------
  // Nothing vanishes, nothing mutates outside `state` (DEEP equality, not an
  // enumerated field list), state moves only the governed way, and a lifecycle
  // begins at Released. The rules live in the toolchain and are unit-tested
  // there; this file feeds them the two revisions and reports their refusals.
  const succession = validateRegistrySuccession(before.releases, current)
  for (const refusal of succession.refusals) fail(`${refusal.rule} — ${refusal.detail}`)
  const carried = succession.carried

  // --- 3. a NEW release must satisfy the §6 preconditions -------------------
  const catalogPath = join(root, 'knowledge', 'catalog.json')
  let catalog
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  } catch (error) {
    fail(`knowledge/catalog.json is unreadable — ${error.message}`)
    return { problems, base, added: 0, carried }
  }
  // One projection, owned by the package: it is the same mapping every other
  // caller of buildSetReleaseCandidate uses, and it is FAIL-CLOSED — a module
  // row missing a gate key counts as blocked, because these are the two gates
  // a set release explicitly must not bypass and this script must hold that
  // line standalone, without check-knowledge.mjs having run first.
  const modules = moduleCandidatesFromCatalog(catalog)

  for (const record of succession.added) {
    const id = `${record.familyId}@${record.version}`
    const family = (catalog.sets ?? []).find((s) => s.id === record.familyId)
    if (family === undefined) {
      fail(`new release "${id}": familyId names no set family in catalog.json`)
      continue
    }
    // A malformed family row is REFUSED, not crashed on: the builder iterates
    // these fields, and an uncaught TypeError would replace the problem list
    // with a stack trace — a diagnosis, not a gate.
    const notArrays = [
      ['required', family.required],
      ['optional', family.optional ?? []],
      ['deny', family.deny],
    ]
      .filter(([, value]) => !Array.isArray(value))
      .map(([name]) => `"${name}"`)
    if (notArrays.length > 0) {
      fail(
        `new release "${id}": set family "${record.familyId}" in catalog.json is ` +
          `malformed — ${notArrays.join(', ')} must be ${
            notArrays.length === 1 ? 'an array' : 'arrays'
          }, so the §6 preconditions cannot be evaluated`,
      )
      continue
    }
    // The family row is SPREAD, not hand-copied field by field: SetFamily's
    // property names match the catalog 1:1, extra catalog fields are inert to
    // the builder, and a hand-copy silently drops any field the interface
    // grows later.
    const built = buildSetReleaseCandidate(
      { ...family, optional: family.optional ?? [] },
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

  return { problems, base, added: succession.added.length, carried }
}

// process.argv[1] preserves a symlinked invocation path; the ESM loader
// realpaths import.meta.url. Compared raw, `node <symlinked-dir>/check-...`
// matches nothing, runs nothing, and exits 0 — indistinguishable from a
// passing gate. Both sides are therefore resolved to REAL paths, and an entry
// path that cannot be resolved is some other module importing this one.
const invokedDirectly = (() => {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
})()
if (invokedDirectly) {
  // An argv mistake must never demote the baseline to inference. `--base`
  // with a missing value, or a misspelled option, previously vanished into
  // "nothing supplied", so the run compared a DIFFERENT revision while
  // exiting 0 — the exact demotion resolveBase refuses for unresolvable
  // refs, surviving one layer up. A gate's CLI refuses to guess.
  const refuseUsage = (message) => {
    console.error(`✗ release history — ${message}`)
    console.error('    usage: check-release-history.mjs [--base <ref>] [--root <path>]')
    process.exit(1)
  }
  const options = new Map()
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i]
    if (flag !== '--base' && flag !== '--root') refuseUsage(`unknown option "${flag}"`)
    const value = args[i + 1]
    if (value === undefined || value.startsWith('--')) refuseUsage(`${flag} requires a value`)
    if (options.has(flag)) refuseUsage(`${flag} was supplied twice`)
    options.set(flag, value)
    i += 1
  }

  const { problems, base, added, carried } = checkReleaseHistory(
    options.get('--root') ?? DEFAULT_ROOT,
    options.get('--base'),
  )
  if (problems.length > 0) {
    console.error(`✗ release history — ${problems.length} problem(s)\n`)
    for (const problem of problems) console.error(`    ${problem}`)
    process.exit(1)
  }
  console.log(`✓ release history — ${carried} carried, ${added} new (base: ${base.how})`)
}
