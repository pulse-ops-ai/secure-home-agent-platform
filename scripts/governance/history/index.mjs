/**
 * REVISION OBSERVATIONS, CARRYING NO RULES.
 *
 * This adapter answers three questions about the repository's history: does a
 * name resolve to a commit, what bytes does a path hold at a commit, and has a
 * path ever existed in a commit's ancestry. It decides nothing about what those
 * answers mean — not which base a comparison may use, not whether a missing
 * registry is a genesis or a deletion, not whether a lifecycle moved
 * backwards. Those are governance rules and live in
 * `scripts/governance/model/history.mjs`, so a reader looking for "why was this
 * refused" has exactly one place to look.
 *
 * The sibling `git-tree` adapter owns tree and path observations and is used
 * here rather than reimplemented. What is genuinely new is revision
 * resolution, bytes at a revision, and ancestry enumeration.
 *
 * ABSENCE AND FAILURE ARE DIFFERENT ANSWERS, for the same reason they are in
 * `git-tree`: the history rules include required absences — a genesis base
 * carries no registry — and a checker that satisfies a required absence by
 * failing to look is worse than one that crashes.
 */
import { execFileSync } from 'node:child_process'

import { ABSENT, OBSERVATION_ERROR, PRESENT, createGitTreeObserver } from '../git-tree/index.mjs'

export { ABSENT, OBSERVATION_ERROR, PRESENT }

/**
 * Git's own vocabulary for "that name does not resolve".
 *
 * Deliberately the same source text as the `git-tree` adapter's: two adapters
 * questioning one Git must not disagree about which failures are answers and
 * which are outages. A conformance test compares this exported pattern against
 * that module's source, so a divergence is caught rather than discovered.
 */
export const EXPECTED_MISS_PATTERN =
  '(?:does not exist in|not a valid object name|Not a valid object name|exists on disk, but not in|unknown revision or path not in the working tree|no such path)'

const EXPECTED_MISS = new RegExp(EXPECTED_MISS_PATTERN, 'i')

const COMMIT_OID = /^[0-9a-f]{40}$/u

function run(repoRoot, args, { buffer = false } = {}) {
  try {
    const stdout = execFileSync('git', args, {
      cwd: repoRoot,
      encoding: buffer ? undefined : 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: PRESENT, stdout }
  } catch (error) {
    const stderr = String(error?.stderr ?? '')
    // A spawn failure has no stderr from Git at all: Git never ran, so nothing
    // was observed and nothing may be concluded.
    if (error?.code === 'ENOENT' || stderr === '') {
      return { status: OBSERVATION_ERROR, reason: error?.message ?? 'git could not be executed' }
    }
    if (EXPECTED_MISS.test(stderr)) return { status: ABSENT, reason: stderr.trim() }
    return { status: OBSERVATION_ERROR, reason: stderr.trim() }
  }
}

/**
 * History observations over one repository.
 *
 * Every method returns `{ status, … }`. `PRESENT` carries the observation,
 * `ABSENT` means the repository genuinely does not hold it, and
 * `OBSERVATION_ERROR` means the question could not be answered — which the
 * model must treat as a refusal, never as an absence.
 */
export function createHistoryReader(repoRoot) {
  const trees = createGitTreeObserver(repoRoot)

  const reader = {
    /**
     * Does this name resolve to a COMMIT?
     *
     * A tag, tree, blob, or branch name that resolves to a non-commit is
     * `ABSENT` as a commit, not an error: Git answered, and the answer is no.
     * The caller decides that an unresolvable base is fatal.
     */
    resolveCommit(revision) {
      if (typeof revision !== 'string' || revision === '') {
        return { status: ABSENT, reason: 'no revision supplied' }
      }
      const result = run(repoRoot, [
        'rev-parse',
        '--verify',
        '--end-of-options',
        `${revision}^{commit}`,
      ])
      if (result.status !== PRESENT) return result
      const oid = result.stdout.trim()
      if (!COMMIT_OID.test(oid)) {
        return { status: OBSERVATION_ERROR, reason: 'git returned an unrecognized object id' }
      }
      return { status: PRESENT, oid }
    },

    /** What object type does this name resolve to? Reported, never judged. */
    objectType(revision) {
      if (typeof revision !== 'string' || revision === '') {
        return { status: ABSENT, reason: 'no revision supplied' }
      }
      const result = run(repoRoot, ['cat-file', '-t', '--end-of-options', revision])
      if (result.status !== PRESENT) return result
      return { status: PRESENT, type: result.stdout.trim() }
    },

    /** The exact bytes of a path at a revision. */
    readBytesAt(oid, repoPath) {
      const resolved = reader.resolveCommit(oid)
      // Absence of a PATH may only be concluded from a revision that resolves.
      if (resolved.status !== PRESENT) {
        return { status: resolved.status === ABSENT ? OBSERVATION_ERROR : resolved.status }
      }
      const blob = run(repoRoot, ['cat-file', 'blob', `${resolved.oid}:${repoPath}`], {
        buffer: true,
      })
      if (blob.status !== PRESENT) return { status: blob.status, reason: blob.reason }
      return { status: PRESENT, bytes: new Uint8Array(blob.stdout) }
    },

    /** Does a path exist at a revision? Delegated to the tree observer. */
    pathExistsAt(oid, repoPath) {
      return trees.pathExistsAt(oid, repoPath)
    },

    /**
     * Has this path ever existed anywhere in this commit's ancestry?
     *
     * `--full-history` because history SIMPLIFICATION hides exactly the commits
     * this question is about: a path added on one side of a merge and later
     * removed can vanish from the simplified log while remaining in the graph.
     * The answer is an enumeration of commits, not a verdict.
     */
    pathEverExistedInAncestry(oid, repoPath) {
      const resolved = reader.resolveCommit(oid)
      if (resolved.status !== PRESENT) {
        return { status: resolved.status === ABSENT ? OBSERVATION_ERROR : resolved.status }
      }
      const listed = run(repoRoot, [
        'rev-list',
        '--full-history',
        '--max-count=64',
        resolved.oid,
        '--',
        repoPath,
      ])
      if (listed.status !== PRESENT) return { status: listed.status, reason: listed.reason }
      const commits = listed.stdout.split('\n').filter((line) => COMMIT_OID.test(line.trim()))
      return { status: PRESENT, commits }
    },
  }

  return reader
}
