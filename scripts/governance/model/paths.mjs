/**
 * CANONICAL REPOSITORY-PATH SETS, AS ONE OWNER.
 *
 * `identity.scope[]` appears on delivered identities, policy-evidence
 * identities, withdrawal identities and both nested archive identities. Each of
 * those places used to answer "is this a valid scope" for itself, and the
 * archived-OpenSpec identity answered only "is it a non-empty array" — so
 * traversal, absolute paths, duplicates and non-strings reached the observation
 * layer through that door while every other scope refused them.
 *
 * The rule lives here so every scope gets the same answer.
 */

const BACKSLASH = String.fromCharCode(92)
const NUL = String.fromCharCode(0)

/** A repository-relative POSIX path with no traversal and no absolute form. */
export function isCanonicalRepoPath(value) {
  if (typeof value !== 'string' || value === '') return false
  if (value.startsWith('/')) return false
  if (value.includes(BACKSLASH)) return false
  if (value.includes(NUL)) return false
  return !value
    .split('/')
    .some((segment) => segment.length === 0 || segment === '.' || segment === '..')
}

/** Byte order, so canonical ordering is not locale-dependent. */
export const compareRepoPaths = (left, right) =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))

/**
 * Validate a canonical path set, returning problems as messages.
 *
 * Returns `[]` when the value is a well-formed set: an array of canonical
 * repository-relative path strings, duplicate-free and canonically ordered.
 * Emptiness is the CALLER's question — some scopes must be non-empty and some
 * need not be — so it is reported separately rather than assumed here.
 */
export function canonicalPathSetProblems(value) {
  if (!Array.isArray(value)) return ['must be an array of canonical repository-relative paths']

  const problems = []
  for (const [index, member] of value.entries()) {
    if (typeof member !== 'string') {
      problems.push(`[${index}] must be a string`)
      continue
    }
    if (!isCanonicalRepoPath(member)) {
      problems.push(`[${index}] is not a repository-relative POSIX path`)
    }
  }
  if (problems.length > 0) return problems

  const seen = new Set()
  for (const member of value) {
    if (seen.has(member)) problems.push('contains a duplicate path')
    seen.add(member)
  }
  if (problems.length > 0) return problems

  const sorted = [...value].sort(compareRepoPaths)
  if (sorted.some((member, index) => member !== value[index])) {
    problems.push('must be in canonical path order')
  }
  return problems
}
