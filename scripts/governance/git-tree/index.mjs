/**
 * REPOSITORY OBSERVATIONS, CARRYING NO RULES.
 *
 * This adapter answers questions about what the repository contains. It decides
 * nothing: not which identity class an evidence record is required to use, not
 * whether an unreachable object is fatal, not whether a stage rule applies to a
 * given form. Those are governance semantics and live in the model, so that a
 * reader looking for "why was this refused" has exactly one place to look.
 *
 * ABSENCE AND FAILURE ARE DIFFERENT ANSWERS. An earlier version mapped every
 * nonzero Git exit to `undefined`, which meant a corrupt object store, a broken
 * Git, or any unexpected failure was reported as "this path is absent" — and
 * absence is exactly what several stage rules REQUIRE. A checker that satisfies
 * a required absence by failing to look is worse than one that crashes. Every
 * observation therefore returns PRESENT, ABSENT, or ERROR, and only an expected
 * miss may be ABSENT.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

/** The three answers an observation can give. */
export const PRESENT = 'PRESENT'
export const ABSENT = 'ABSENT'
export const OBSERVATION_ERROR = 'OBSERVATION_ERROR'

/**
 * Git's own vocabulary for "that name does not resolve".
 *
 * Enumerated rather than inferred from the exit code, because Git uses 128 for
 * both "this path is not in that tree" and "this repository is broken".
 */
const EXPECTED_MISS =
  /(?:does not exist in|not a valid object name|Not a valid object name|exists on disk, but not in|unknown revision or path not in the working tree|no such path)/i

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

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
 * Observations over one repository.
 *
 * `head` is the revision reachability is measured from. It is a parameter
 * rather than a literal so a caller can observe a specific revision, but it is
 * never a branch NAME the model reasons about — the model asks "is this
 * reachable", and the adapter answers.
 */
export function createGitTreeObserver(repoRoot, { head = 'HEAD' } = {}) {
  /** Does this revision resolve at all? Asked before concluding any absence. */
  const revisionResolves = (oid) => run(repoRoot, ['rev-parse', '--verify', `${oid}^{commit}`])

  const observer = {
    /** Does this object exist in the local object store at all? */
    commitExists(oid) {
      if (typeof oid !== 'string' || !/^[0-9a-f]{40}$/.test(oid)) return ABSENT
      return run(repoRoot, ['cat-file', '-e', `${oid}^{commit}`]).status
    },

    /**
     * Is it in the CURRENT history?
     *
     * Presence and reachability are different facts, and only the second is
     * durable. `git fetch origin refs/pull/<n>/head` puts a commit in the store
     * that no ref keeps alive; it can be pruned, and nothing in the repository's
     * own history depends on it. Reachability is a property of the graph, so no
     * branch name takes part in the answer.
     */
    isReachable(oid) {
      const exists = observer.commitExists(oid)
      if (exists !== PRESENT) return exists
      const result = run(repoRoot, ['merge-base', '--is-ancestor', oid, head])
      // `--is-ancestor` reports "no" with exit 1 and no stderr, which is an
      // ANSWER; only a real failure carries Git's own error text.
      if (result.status === OBSERVATION_ERROR && /^$/.test(String(result.reason ?? ''))) {
        return ABSENT
      }
      return result.status === PRESENT ? PRESENT : ABSENT
    },

    /** Does a path exist at a revision, as a directory or a file? */
    pathExistsAt(oid, repoPath) {
      const resolves = revisionResolves(oid)
      // Absence of a PATH may only be concluded from a revision that resolves.
      if (resolves.status !== PRESENT) {
        return resolves.status === ABSENT ? OBSERVATION_ERROR : resolves.status
      }
      // `ls-tree` answers for directories; a BLOB path makes it fail with "not
      // a tree object", which is neither presence nor absence. Both probes are
      // therefore inconclusive on their own, and only a failure of BOTH — with
      // the revision already known to resolve — is an unanswered question.
      const listed = run(repoRoot, ['ls-tree', '-z', `${oid}:${repoPath}`])
      if (listed.status === PRESENT) return PRESENT
      const blob = run(repoRoot, ['cat-file', '-e', `${oid}:${repoPath}`])
      if (blob.status === PRESENT) return PRESENT
      if (blob.status === ABSENT || listed.status === ABSENT) return ABSENT
      return OBSERVATION_ERROR
    },

    /**
     * Every file under a root at a revision: relative path -> mode and
     * exact-byte digest.
     *
     * Returns `{ status, entries }`. ABSENT means the root genuinely is not
     * there; ERROR means the question could not be answered and the caller must
     * refuse rather than treat it as an empty tree.
     */
    treeAt(oid, rootPath) {
      const resolves = revisionResolves(oid)
      if (resolves.status !== PRESENT) {
        return { status: resolves.status === ABSENT ? OBSERVATION_ERROR : resolves.status }
      }
      const listed = run(repoRoot, ['ls-tree', '-r', '-z', '--full-tree', `${oid}:${rootPath}`])
      if (listed.status !== PRESENT) return { status: listed.status }

      const entries = new Map()
      for (const record of listed.stdout.split('\0')) {
        if (record === '') continue
        const [meta, relative] = record.split('\t')
        const [mode, type, objectId] = meta.split(/\s+/)
        if (type !== 'blob') {
          // A gitlink or anything else is reported WITH its real mode so the
          // model can refuse it; it is never silently dropped.
          entries.set(relative, { mode, sha256: undefined })
          continue
        }
        const blob = run(repoRoot, ['cat-file', 'blob', objectId], { buffer: true })
        if (blob.status !== PRESENT) return { status: OBSERVATION_ERROR }
        entries.set(relative, { mode, sha256: sha256(blob.stdout) })
      }
      return { status: PRESENT, entries }
    },

    /** The same observations against the working revision. */
    currentTree(rootPath) {
      return observer.treeAt(head, rootPath)
    },

    currentPathExists(repoPath) {
      return observer.pathExistsAt(head, repoPath)
    },
  }

  return observer
}
