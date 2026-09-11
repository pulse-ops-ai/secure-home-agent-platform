/**
 * REPOSITORY OBSERVATIONS, CARRYING NO RULES.
 *
 * This adapter answers questions about what the repository contains. It decides
 * nothing: not which identity class an evidence record is required to use, not
 * whether an unreachable object is fatal, not whether a stage rule applies to a
 * given form. Those are governance semantics and live in the model, so that a
 * reader looking for "why was this refused" has exactly one place to look.
 *
 * The split matters more than it looks. When observation and judgement share a
 * module, a rule change quietly becomes a change to what is observed, and the
 * two stop being separable — which is how a checker ends up proving that its
 * own observations agree with themselves.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const run = (repoRoot, args, { allowFailure = false } = {}) => {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch (error) {
    if (allowFailure) return undefined
    throw error
  }
}

const runBuffer = (repoRoot, args) => {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return undefined
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * Observations over one repository.
 *
 * `head` is the revision reachability is measured from. It is a parameter
 * rather than a literal so a caller can observe a specific revision, but it is
 * never a branch NAME the model reasons about — the model asks "is this
 * reachable", and the adapter answers.
 */
export function createGitTreeObserver(repoRoot, { head = 'HEAD' } = {}) {
  return {
    /** Does this object exist in the local object store at all? */
    commitExists(oid) {
      if (typeof oid !== 'string' || !/^[0-9a-f]{40}$/.test(oid)) return false
      return (
        run(repoRoot, ['cat-file', '-e', `${oid}^{commit}`], { allowFailure: true }) !== undefined
      )
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
      if (!this.commitExists(oid)) return false
      return (
        run(repoRoot, ['merge-base', '--is-ancestor', oid, head], { allowFailure: true }) !==
        undefined
      )
    },

    /** Does a path exist at a revision, as a directory or a file? */
    pathExistsAt(oid, repoPath) {
      const listed = run(repoRoot, ['ls-tree', '-z', `${oid}:${repoPath}`], { allowFailure: true })
      if (listed !== undefined) return true
      return (
        run(repoRoot, ['cat-file', '-e', `${oid}:${repoPath}`], { allowFailure: true }) !==
        undefined
      )
    },

    /**
     * Every file under a root at a revision: relative path -> mode and
     * exact-byte digest. `undefined` when the root is absent, which is an
     * ANSWER — "this stage does not exist here" — not an error.
     */
    treeAt(oid, rootPath) {
      const listed = run(repoRoot, ['ls-tree', '-r', '-z', '--full-tree', `${oid}:${rootPath}`], {
        allowFailure: true,
      })
      if (listed === undefined) return undefined

      const entries = new Map()
      for (const record of listed.split('\0')) {
        if (record === '') continue
        const [meta, relative] = record.split('\t')
        const [mode, type, objectId] = meta.split(/\s+/)
        if (type !== 'blob') {
          // A gitlink or anything else is reported WITH its real mode so the
          // model can refuse it; it is never silently dropped.
          entries.set(relative, { mode, sha256: undefined })
          continue
        }
        const bytes = runBuffer(repoRoot, ['cat-file', 'blob', objectId])
        entries.set(relative, { mode, sha256: bytes === undefined ? undefined : sha256(bytes) })
      }
      return entries
    },

    /** The same observation against the working revision. */
    currentTree(rootPath) {
      return this.treeAt(head, rootPath)
    },

    currentPathExists(repoPath) {
      return this.pathExistsAt(head, repoPath)
    },
  }
}
