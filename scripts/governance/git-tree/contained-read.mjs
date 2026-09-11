/**
 * ONE BOUNDED FILESYSTEM OBSERVATION PRIMITIVE.
 *
 * Lexical containment is not containment. `resolve(root, p)` answers where a
 * path WOULD be if every component were a real directory, so a path that stays
 * inside the root lexically can still leave it through a symlinked ancestor —
 * and checking only the final entry for `isSymbolicLink()` catches the last
 * component while every parent is unexamined.
 *
 * Every filesystem-backed read in the governance checker goes through here, so
 * the containment rule is stated once rather than re-derived per call site.
 * Refused: a symlinked final member, a symlinked ancestor, a resolved path
 * outside the repository's REAL root, and lexical traversal or sibling escape.
 */
import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export class ContainmentError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ContainmentError'
  }
}

/** The repository's real root, resolved once so every comparison is real-path. */
export function realRoot(root) {
  try {
    return realpathSync(resolve(root))
  } catch (error) {
    throw new ContainmentError(`repository root cannot be resolved: ${error.message}`)
  }
}

const inside = (root, candidate) => {
  if (candidate === root) return true
  const rel = relative(root, candidate)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Resolve a repository-relative path, refusing any escape.
 *
 * Every ANCESTOR is resolved, not just the final entry: `realpathSync` on each
 * prefix is what makes a symlinked directory in the middle of the path visible.
 * The final component is checked with `lstat` so a symlink that points back
 * inside the root is still refused — the rule is "no symlinks on the path",
 * not "the target happens to land somewhere acceptable".
 */
export function containedPath(root, requested) {
  const base = realRoot(root)
  const absolute = isAbsolute(requested) ? resolve(requested) : resolve(base, requested)

  if (!inside(base, absolute)) {
    throw new ContainmentError(`path escapes repository root: ${requested}`)
  }

  const rel = relative(base, absolute)
  const segments = rel === '' ? [] : rel.split(sep)
  let walked = base
  for (const [index, segment] of segments.entries()) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new ContainmentError(`path contains a non-canonical segment: ${requested}`)
    }
    walked = resolve(walked, segment)
    let stats
    try {
      stats = lstatSync(walked)
    } catch {
      // A path that does not exist is ABSENT, not an escape. The caller
      // decides what absence means; containment has nothing to say about it.
      return { absolute, missing: true }
    }
    if (stats.isSymbolicLink()) {
      throw new ContainmentError(
        index === segments.length - 1
          ? `path is a symlink: ${requested}`
          : `path traverses a symlinked directory: ${requested}`,
      )
    }
    // Belt and braces: even without a symlink, the resolved prefix must stay in.
    if (!inside(base, realpathSync(walked))) {
      throw new ContainmentError(`path resolves outside the repository: ${requested}`)
    }
  }

  return { absolute, missing: false }
}

/** Exact bytes of a contained regular file, or `undefined` when absent. */
export function readContainedBytes(root, requested) {
  const { absolute, missing } = containedPath(root, requested)
  if (missing) return undefined
  const stats = lstatSync(absolute)
  if (!stats.isFile()) return undefined
  return new Uint8Array(readFileSync(absolute))
}

/**
 * The CURRENT CHECKOUT under a root: relative path -> mode and byte digest.
 *
 * A Git-tree observation answers what a COMMIT contains. Several contract rules
 * are about what the checkout contains right now — a dirty member, a deleted
 * member, an extra file staged beside the archive — and those are invisible to
 * `ls-tree`. This is the filesystem half, and it goes through the same
 * containment rule as every other read.
 *
 * Returns `undefined` when the root is absent, which is an ANSWER. A
 * containment violation throws, because an escape is never an absence.
 */
export function checkoutTree(root, rootPath) {
  const base = realRoot(root)
  const { absolute, missing } = containedPath(root, rootPath)
  if (missing) return undefined

  const entries = new Map()
  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      // Re-checked per entry, so a symlink introduced anywhere under the root is
      // refused rather than followed.
      containedPath(root, `${rootPath}/${relativePath}`)
      const child = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        walk(child, relativePath)
        continue
      }
      const stats = lstatSync(child)
      const mode = stats.isSymbolicLink()
        ? '120000'
        : (stats.mode & 0o111) !== 0
          ? '100755'
          : '100644'
      entries.set(relativePath, {
        mode,
        sha256: stats.isFile()
          ? createHash('sha256').update(readFileSync(child)).digest('hex')
          : undefined,
      })
    }
  }

  const stats = lstatSync(absolute)
  if (!stats.isDirectory()) return undefined
  void base
  walk(absolute, '')
  return entries
}

/** Does a path exist in the current checkout? Containment violations throw. */
export function checkoutPathExists(root, repoPath) {
  const { missing } = containedPath(root, repoPath)
  return !missing
}
