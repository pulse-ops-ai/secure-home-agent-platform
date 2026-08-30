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
import { fileURLToPath } from 'node:url'

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))
const CHANGES = 'openspec/changes/'
const ARCHIVE = 'openspec/changes/archive/'
const REVIEW_RE = /^openspec\/changes\/.+\/reviews\/[^/]+\.md$/

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

/** The change directory a review path belongs to, or undefined. */
const changeOf = (path) => {
  const match = /^(openspec\/changes\/.+?)\/reviews\//.exec(path)
  return match?.[1]
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
  const raw =
    git(root, ['diff', '--name-status', '-M', '--find-renames=50%', `${base.ref}..HEAD`]) ?? ''

  let added = 0
  let carried = 0
  let archived = 0

  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue
    const parts = line.split('\t')
    const status = parts[0]
    const from = parts[1]
    const to = parts[2]

    if (status.startsWith('R')) {
      if (!REVIEW_RE.test(from) && !REVIEW_RE.test(to)) continue
      const intoArchive = to.startsWith(ARCHIVE) && !from.startsWith(ARCHIVE)
      if (!intoArchive) {
        fail(
          `review history "${from}" was renamed to "${to}". An admitted round is ` +
            'append-only: add a new round, never rewrite one in place',
        )
        continue
      }
      // Archiving relocates a change wholesale. Relocation preserves the round;
      // relocation plus an edit does not, so compare the bytes.
      const before = blobId(root, base.ref, from)
      const after = blobId(root, 'HEAD', to)
      if (before === undefined || after === undefined || before !== after) {
        fail(
          `review history "${from}" was archived to "${to}" with modified bytes. ` +
            'An archive move may relocate a round; it may not rewrite one',
        )
        continue
      }
      archived += 1
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
      // archive operation that rename detection did not pair up.
      const relative = from.slice(CHANGES.length)
      const archivedPath = `${ARCHIVE}${relative}`
      const before = blobId(root, base.ref, from)
      const after = blobId(root, 'HEAD', archivedPath)
      if (before !== undefined && after !== undefined && before === after) {
        archived += 1
        continue
      }
      if (after !== undefined) {
        // It IS at the archive path, with different bytes. Say that, rather
        // than "deleted" -- the fix is to restore the bytes, not the file.
        fail(
          `review history "${from}" was archived to "${archivedPath}" with modified ` +
            'bytes. An archive move may relocate a round; it may not rewrite one',
        )
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

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  const args = process.argv.slice(2)
  const baseIndex = args.indexOf('--base')
  const explicitBase = baseIndex === -1 ? undefined : args[baseIndex + 1]
  const rootIndex = args.indexOf('--root')
  const root = rootIndex === -1 ? DEFAULT_ROOT : args[rootIndex + 1]

  const { problems, base, added, archived } = checkReviewHistory(root, explicitBase)
  if (problems.length > 0) {
    console.error(`✗ openspec review history — ${problems.length} problem(s)\n`)
    for (const problem of problems) console.error(`    ${problem}`)
    process.exit(1)
  }
  console.log(
    `✓ openspec review history — ${added} added, ${archived} archived (base: ${base.how})`,
  )
}
