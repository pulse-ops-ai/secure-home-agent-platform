#!/usr/bin/env node
/**
 * REVIEW HISTORY, COMPARED WITH ITS PRIOR GOVERNED REVISION.
 *
 * `openspec/schemas/governed-spec-driven-v2/support/reviews/README.md` says
 * historical review rounds are append-only: "do not rewrite old rounds". That
 * was a convention with no mechanism — the pre-apply gate deliberately lets
 * `reviews/**` change, because the current review must be writable after the
 * planning pin, and nothing anywhere checked what happened to the rounds
 * already admitted.
 *
 * The split mirrors check-set-releases.mjs versus check-release-history.mjs:
 *
 *   openspec-review-gate.mjs         ONE change, ONE revision, pre-apply
 *   this file                        ALL changes, TWO revisions, always
 *
 * Append-only is a two-revision property. A single revision cannot see a round
 * edited or deleted, which is exactly what "append-only" forbids.
 *
 * The rules, over `openspec/changes/**\/reviews/**.md`:
 *
 *   added                            allowed — that is what append means
 *   modified in place                REFUSED
 *   deleted                          REFUSED
 *   renamed within the live change   REFUSED — a rewritten round wearing a new name
 *   moved into changes/archive/**    allowed IFF the bytes are identical
 *
 * The archive carve-out exists because archiving a change is a normal governed
 * operation that relocates its whole directory. Relocation preserves history;
 * relocation plus an edit does not, so the bytes are compared.
 */
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))
const CHANGES = 'openspec/changes/'
const ARCHIVE = 'openspec/changes/archive/'
/** A review inside a LIVE change. Archived paths are matched separately. */
const REVIEW_RE = /^openspec\/changes\/(?!archive\/)[^/]+\/reviews\/[^/]+\.md$/
/** `openspec/changes/archive/YYYY-MM-DD-<change-name>/reviews/<file>.md` */
const ARCHIVED_REVIEW_RE =
  /^openspec\/changes\/archive\/(\d{4}-\d{2}-\d{2})-([^/]+)\/reviews\/([^/]+\.md)$/

/**
 * A whole-repository diff can be large, and the default 1 MB would surface as a
 * subprocess FAILURE — which is now a refusal, so a legitimate large change must
 * not trip it. Set deliberately, and overridable so the regression can prove the
 * failure path refuses instead of reporting zero changes.
 */
const DIFF_MAX_BUFFER = Number(process.env.REVIEW_HISTORY_MAX_BUFFER ?? 64 * 1024 * 1024)

const git = (root, args, { maxBuffer = DIFF_MAX_BUFFER } = {}) => {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer,
    })
  } catch {
    return undefined
  }
}

const isCommit = (root, ref) =>
  ref !== undefined && git(root, ['cat-file', '-e', `${ref}^{commit}`]) !== undefined

/**
 * Which revision is "before". Identical posture to check-release-history.mjs:
 * a supplied base is EXCLUSIVE, an inferred base may never be HEAD, and an
 * unresolvable base FAILS rather than silently comparing against nothing.
 */
export function resolveBase(root, explicit) {
  const supplied = explicit || process.env.REVIEW_HISTORY_BASE || undefined
  if (supplied !== undefined) {
    const how = explicit ? 'explicit --base' : 'REVIEW_HISTORY_BASE'
    return isCommit(root, supplied)
      ? { how, ref: supplied }
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
    if (resolved !== undefined && resolved === head) continue
    return candidate
  }
  return { unresolvable: 'no inferred baseline resolved to a commit other than HEAD' }
}

const blobId = (root, ref, path) => git(root, ['rev-parse', `${ref}:${path}`])?.trim()

/** The change NAME a live review path belongs to, or undefined. */
const liveChangeOf = (path) => /^openspec\/changes\/([^/]+)\/reviews\//.exec(path)?.[1]

/**
 * Is `changeName` genuinely being ARCHIVED between the two revisions, rather
 * than merely having a review taken away from it?
 *
 * Byte equality alone was too weak: it accepted a review being reassigned into
 * any archive path, including another change's. A real archive moves the whole
 * change — so the live directory must be gone at HEAD, and the archive
 * directory must exist and carry the same change name.
 */
function isWholeChangeArchived(root, baseRef, changeName, archiveDir) {
  const liveDir = `${CHANGES}${changeName}`
  const liveAtHead = git(root, ['ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', liveDir])
  if (liveAtHead === undefined || liveAtHead.length > 0) {
    return false
  }
  const liveAtBase = git(root, ['ls-tree', '-r', '-z', '--name-only', baseRef, '--', liveDir])
  if (liveAtBase === undefined || liveAtBase.length === 0) {
    return false
  }
  const archived = git(root, ['ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', archiveDir])
  return archived !== undefined && archived.length > 0
}

/**
 * Validate one review move into the archive, in full.
 *
 * Returns undefined when the move is legitimate, or a refusal message.
 */
function archiveMoveProblem(root, baseRef, from, to) {
  const source = liveChangeOf(from)
  const destination = ARCHIVED_REVIEW_RE.exec(to)

  if (source === undefined) {
    return `"${from}" is not a review inside a live change, so it cannot be archived`
  }
  if (destination === null) {
    return (
      `"${to}" is not openspec/changes/archive/YYYY-MM-DD-<change-name>/reviews/<file>.md; ` +
      'a review leaves a live change only by archiving that change'
    )
  }

  const [, , archivedChange, archivedFile] = destination
  if (archivedChange !== source) {
    return (
      `"${from}" belongs to change "${source}" but was moved under archive identity ` +
      `"${archivedChange}"; a review may not be reassigned to another change`
    )
  }
  if (archivedFile !== from.slice(from.lastIndexOf('/') + 1)) {
    return `"${from}" was renamed to "${archivedFile}" while archiving; rounds keep their name`
  }

  const archiveDir = to.slice(0, to.indexOf('/reviews/'))
  if (!isWholeChangeArchived(root, baseRef, source, archiveDir)) {
    return (
      `"${from}" was moved into "${archiveDir}" while change "${source}" is still live. ` +
      'A review leaves a live change only as part of archiving the whole change'
    )
  }

  const before = blobId(root, baseRef, from)
  const after = blobId(root, 'HEAD', to)
  if (before === undefined || after === undefined || before !== after) {
    return (
      `"${from}" was archived to "${to}" with modified bytes. An archive move may ` +
      'relocate a round; it may not rewrite one'
    )
  }

  return undefined
}

export function checkReviewHistory(root = DEFAULT_ROOT, explicitBase = undefined) {
  const problems = []
  const fail = (message) => problems.push(message)

  const base = resolveBase(root, explicitBase)
  if (base.unresolvable !== undefined) {
    fail(
      `no prior governed revision could be resolved — ${base.unresolvable}. Nothing ` +
        'was compared. Pass --base <ref> or set REVIEW_HISTORY_BASE. This check ' +
        'fails rather than skipping, and never falls back to a different revision',
    )
    return { problems, base: undefined, added: 0, carried: 0, archived: 0 }
  }

  // -M detects renames so a "delete + add" pair is reported as the move it is.
  //
  // `?? ''` here was FAIL-OPEN: the helper returns undefined for ANY subprocess
  // failure — a broken object, a buffer overrun, git missing — and an empty
  // string means "no review file changed". A comparison that could not be
  // established was indistinguishable from one that found nothing.
  const raw = git(root, ['diff', '--name-status', '-M', '--find-renames=50%', `${base.ref}..HEAD`])

  if (raw === undefined) {
    fail(
      `the authoritative comparison ${base.ref}..HEAD could not be established, so ` +
        'NOTHING was compared. This refuses rather than reporting zero changed ' +
        'review files: an unestablished comparison is not an empty one',
    )
    return { problems, base, added: 0, carried: 0, archived: 0 }
  }

  let added = 0
  let carried = 0
  let archived = 0

  /** Archived paths seen as an added blob, so a D+A pair can be reconciled. */
  const archivedAtHead = (relative) => {
    const listing = git(root, ['ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', ARCHIVE])
    if (listing === undefined) return undefined
    return listing
      .split('\0')
      .filter(Boolean)
      .find((candidate) => candidate.endsWith(`/${relative}`))
  }

  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue
    const parts = line.split('\t')
    const status = parts[0]
    const from = parts[1]
    const to = parts[2]

    if (status.startsWith('R')) {
      const live = REVIEW_RE.test(from)
      const archivedDestination = ARCHIVED_REVIEW_RE.test(to)
      if (!live && !ARCHIVED_REVIEW_RE.test(from)) continue

      if (ARCHIVED_REVIEW_RE.test(from)) {
        fail(
          `review history "${from}" was moved out of the archive to "${to}". An ` +
            'archived change is immutable',
        )
        continue
      }

      if (!archivedDestination) {
        // A move AIMED at the archive but not matching the convention gets the
        // specific message, so the fix is "use the dated directory" rather than
        // the misleading "stop renaming rounds".
        if (to.startsWith(ARCHIVE)) {
          fail(
            `review history "${from}" was moved to "${to}", which is not ` +
              'openspec/changes/archive/YYYY-MM-DD-<change-name>/reviews/<file>.md; ' +
              'a review leaves a live change only by archiving that change',
          )
          continue
        }
        fail(
          `review history "${from}" was renamed to "${to}". An admitted round is ` +
            'append-only: add a new round, never rewrite one in place',
        )
        continue
      }

      const problem = archiveMoveProblem(root, base.ref, from, to)
      if (problem !== undefined) {
        fail(`review history ${problem}`)
        continue
      }
      archived += 1
      continue
    }

    if (status === 'A' && ARCHIVED_REVIEW_RE.test(from)) {
      // A round appearing directly inside an already-archived change is not an
      // archive move -- rename detection would have paired that. An archived
      // change is a closed historical record, so a NEW round cannot be born
      // there; it belongs to the live change that is still being reviewed.
      const relative = from.slice(from.lastIndexOf('/reviews/') + '/reviews/'.length)
      const liveSource = `${CHANGES}${ARCHIVED_REVIEW_RE.exec(from)[2]}/reviews/${relative}`
      const before = blobId(root, base.ref, liveSource)
      const after = blobId(root, 'HEAD', from)
      if (before !== undefined && after !== undefined && before === after) {
        archived += 1
        continue
      }
      fail(
        `review history "${from}" first appears inside an archived change. An ` +
          'archived change is a closed record: add the round to the live change ' +
          'before archiving it',
      )
      continue
    }

    if (!REVIEW_RE.test(from)) continue

    if (status === 'A') {
      added += 1
      continue
    }
    if (status === 'M' || status === 'T') {
      fail(
        `review history "${from}" was modified. Historical rounds are append-only: ` +
          'copy the superseded review to a new round instead of editing an admitted one',
      )
      continue
    }
    if (status === 'D') {
      // A delete whose bytes reappear under archive/ is the move half of an
      // archive operation that rename detection did not pair up. It is held to
      // exactly the same provenance rules as a detected rename.
      const relative = from.slice(from.lastIndexOf('/reviews/') + '/reviews/'.length)
      const destination = archivedAtHead(relative)
      if (destination !== undefined) {
        const problem = archiveMoveProblem(root, base.ref, from, destination)
        if (problem !== undefined) {
          fail(`review history ${problem}`)
          continue
        }
        archived += 1
        continue
      }
      fail(
        `review history "${from}" was deleted. Historical rounds are append-only; ` +
          'archiving may relocate a round byte-for-byte, but nothing may remove one',
      )
      continue
    }
    carried += 1
  }

  return { problems, base, added, carried, archived }
}

// process.argv[1] preserves a symlinked invocation path while the ESM loader
// realpaths import.meta.url. Compared raw, a symlinked invocation matches
// nothing, runs nothing, and exits 0 — a silent no-op that reads as PASS.
// Ported from openspec-review-gate.mjs rather than written a third time.
const invokedDirectly = (() => {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  const args = process.argv.slice(2)
  const refuseUsage = (message) => {
    console.error(`✗ openspec review history — ${message}`)
    console.error('    usage: check-openspec-review-history.mjs [--base <ref>] [--root <path>]')
    process.exit(1)
  }

  const options = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag !== '--base' && flag !== '--root') refuseUsage(`unknown option "${flag}"`)
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) refuseUsage(`${flag} requires a value`)
    if (options.has(flag)) refuseUsage(`${flag} was supplied twice`)
    options.set(flag, value)
    index += 1
  }

  const { problems, base, added, archived } = checkReviewHistory(
    options.get('--root') ?? DEFAULT_ROOT,
    options.get('--base'),
  )
  if (problems.length > 0) {
    console.error(`✗ openspec review history — ${problems.length} problem(s)\n`)
    for (const problem of problems) console.error(`    ${problem}`)
    process.exit(1)
  }
  console.log(
    `✓ openspec review history — ${added} added, ${archived} archived (base: ${base.how})`,
  )
}
