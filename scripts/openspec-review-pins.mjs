#!/usr/bin/env node
/**
 * ENUMERATE THE HISTORICAL REVIEW PINS A CANDIDATE'S REVIEW HISTORY CITES.
 *
 * WHY THIS EXISTS. `openspec-review-gate.mjs` admits a historical review round
 * only if its `reviewed_commit` resolves to a real commit in this repository:
 *
 *     git cat-file -e <reviewed_commit>^{commit}
 *
 * That check is correct and stays. An admitted round may not cite an invented
 * Git identity. But it is a check about the OBJECT DATABASE, and the trusted
 * boundary runner's object database is deliberately minimal: it checks out the
 * live default-branch base and fetches exactly two commits, the candidate head
 * and that base.
 *
 * After a squash merge those are not enough. Squashing discards the branch
 * commits, so a reviewed commit stops being an ancestor of the default branch:
 *
 *     epoch 1 reviewed at  aae33fd…        (on the planning branch)
 *     PR squash-merged     -> aae33fd is no longer in main's ancestry
 *     epoch 1 archived     -> reviews/1-aae33fdd217d.md cites aae33fd
 *     boundary runs        -> cat-file -e aae33fd  ->  ABSENT
 *
 * The historical round would then be refused for a reason that has nothing to
 * do with its content: the runner simply never fetched the object. A developer
 * checkout can pass the same gate purely because someone once fetched that SHA
 * by hand. A trust boundary must not depend on accidental local object state.
 *
 * So the trusted workflow prefetches those objects first, and this file tells
 * it which ones — deterministically, from the candidate's own committed review
 * history, before any of it is trusted.
 *
 * WHAT THIS IS NOT. It does not decide that a review is accepted. It reads one
 * field, `reviewed_commit`, from each historical round and validates only what
 * is needed to use that field safely as a Git argument. Every other question —
 * verdict, epoch sequence, artifact manifest, scope, reviewer, body contract —
 * remains the gate's, unchanged, and runs afterwards against the same bytes.
 *
 * Being wrong here cannot admit a bad review. It can only cause the boundary to
 * fetch an object, or to refuse. Both are safe; the second is the default.
 *
 * CANDIDATE BYTES ARE DATA. The review files are read with `git cat-file` from
 * objects. Nothing is checked out, written, executed, sourced, or installed,
 * and the commits this names are fetched as objects and never materialised. A
 * historical commit may contain hooks, lifecycle scripts, or anything else; it
 * is never a working tree, so none of it runs. The only use of a fetched
 * object is to let the gate's existing `cat-file` identity proof succeed.
 *
 * FAIL CLOSED. Malformed, ambiguous, or disagreeing input is refused before any
 * `git fetch` is issued, so a candidate cannot steer the fetch step.
 *
 * Dependency-free: git, node stdlib.
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** Same identity rule the gate enforces: a full lowercase 40-hex commit. */
const FULL_SHA = /^[0-9a-f]{40}$/
/** Same review-history filename rule `admittedEpochs` enforces. */
const REVIEW_FILENAME = /^(\d+)-([0-9a-f]{12})\.md$/
const CHANGE_ID = /^[a-z0-9][a-z0-9-]*$/

export class ReviewPinError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const fail = (code, message) => {
  throw new ReviewPinError(code, message)
}

function git(repoRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

/**
 * The one gate block in a review file.
 *
 * Deliberately the same shape rule as the gate's `extractGateBlock`: exactly
 * one block. Two blocks are ambiguous about which pin is authoritative, and
 * guessing is how a candidate would smuggle a second identity past the reader.
 */
function extractReviewedCommit(text, name) {
  const matches = [...text.matchAll(/<!--\s*openspec-review-gate\s*([\s\S]*?)-->/g)]
  if (matches.length !== 1) {
    fail(
      'REVIEW_PIN_GATE_BLOCK_COUNT',
      `reviews/${name} carries ${matches.length} openspec-review-gate blocks; ` +
        'exactly one names the reviewed commit, and an ambiguous file is refused',
    )
  }

  let gate
  try {
    gate = JSON.parse(matches[0][1].trim())
  } catch (error) {
    fail('REVIEW_PIN_GATE_BLOCK_INVALID_JSON', `reviews/${name}: ${error.message}`)
  }
  if (gate === null || typeof gate !== 'object' || Array.isArray(gate)) {
    fail('REVIEW_PIN_GATE_BLOCK_INVALID_JSON', `reviews/${name}: gate block must be an object`)
  }

  const reviewedCommit = gate.reviewed_commit
  if (typeof reviewedCommit !== 'string' || !FULL_SHA.test(reviewedCommit)) {
    // Refused BEFORE the value is ever handed to git, so a crafted string
    // cannot become an option, a refspec, or anything else.
    fail(
      'REVIEW_PIN_INVALID_COMMIT',
      `reviews/${name} reviewed_commit must be a full lowercase 40-hex Git commit; ` +
        `found ${JSON.stringify(reviewedCommit)}`,
    )
  }
  return reviewedCommit
}

/**
 * Every historical reviewed commit the candidate's review history cites.
 *
 * Enumeration matches `admittedEpochs` exactly — same ls-tree, same directory,
 * same "skip non-.md", same filename rule — so the boundary prefetches
 * precisely the set the gate will later demand. A helper that saw a different
 * set would either refuse valid history or leave the gate short an object.
 */
export function reviewPins({ repoRoot, ref, change }) {
  if (!CHANGE_ID.test(change)) {
    fail('REVIEW_PIN_INVALID_CHANGE_NAME', `change name must match ${CHANGE_ID}: ${change}`)
  }
  if (git(repoRoot, ['rev-parse', '--verify', `${ref}^{commit}`]) === null) {
    fail('REVIEW_PIN_REF_UNRESOLVABLE', `--ref "${ref}" does not resolve to a commit`)
  }

  const reviewsPath = `openspec/changes/${change}/reviews`
  const listing = git(repoRoot, ['ls-tree', '-r', '-z', '--name-only', ref, '--', reviewsPath])
  if (listing === null) {
    fail('REVIEW_PIN_TREE_UNREADABLE', `could not read ${reviewsPath} at ${ref}`)
  }

  const pins = new Map()
  for (const repoPath of listing.split('\0').filter(Boolean)) {
    const name = repoPath.slice(repoPath.lastIndexOf('/') + 1)
    if (!name.endsWith('.md')) continue

    const named = REVIEW_FILENAME.exec(name)
    if (named === null) {
      fail(
        'REVIEW_PIN_MALFORMED_FILENAME',
        `reviews/${name} is not <epoch>-<reviewed-sha12>.md; a round that cannot be ` +
          'identified cannot have its pin resolved',
      )
    }
    const sha12 = named[2]

    const text = git(repoRoot, ['cat-file', 'blob', `${ref}:${repoPath}`])
    if (text === null) {
      fail('REVIEW_PIN_BLOB_UNREADABLE', `could not read ${repoPath} at ${ref}`)
    }

    const reviewedCommit = extractReviewedCommit(text, name)
    if (!reviewedCommit.startsWith(sha12)) {
      // The filename is the human-visible identity and the gate block is the
      // machine one. If they disagree the round is lying to one of its readers,
      // and prefetching either value would ratify the lie.
      fail(
        'REVIEW_PIN_FILENAME_MISMATCH',
        `reviews/${name} names ${sha12} but its gate block reviewed_commit is ` +
          `${reviewedCommit}; the filename and the pin must agree`,
      )
    }

    // Keyed by SHA, so two rounds pinned to the same commit collapse to one
    // fetch. Whether such a history is admissible at all is the gate's epoch
    // question, not this file's — here it is simply the same object twice.
    pins.set(reviewedCommit, name)
  }

  return [...pins.keys()].sort()
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  const args = process.argv.slice(2)
  const usage = () => 'usage: openspec-review-pins.mjs --ref <ref> --change <name> [--repo <dir>]'

  const refuse = (message) => {
    console.error(`✗ review pins — ${message}`)
    console.error(`    ${usage()}`)
    process.exit(1)
  }

  const FLAGS = ['--ref', '--change', '--repo']
  const values = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (!FLAGS.includes(flag)) refuse(`unknown option "${flag}"`)
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) refuse(`${flag} requires a value`)
    if (values.has(flag)) refuse(`${flag} was supplied twice`)
    values.set(flag, value)
    index += 1
  }
  for (const required of ['--ref', '--change']) {
    if (!values.has(required)) refuse(`${required} is required`)
  }

  // The repository you are STANDING IN, exactly as the gate resolves it. The
  // script's own location would be wrong the moment trusted tooling verifies a
  // repository other than its own — which is the boundary's whole shape.
  const repoRoot =
    values.get('--repo') ??
    (() => {
      const top = git(process.cwd(), ['rev-parse', '--show-toplevel'])
      if (top === null || top.trim().length === 0) refuse('not inside a git repository')
      return top.trim()
    })()

  try {
    // stdout is the machine contract: one full SHA per line, sorted, unique,
    // and empty when the candidate has no archived history yet. Everything
    // human goes to stderr so the workflow can consume stdout directly.
    const pins = reviewPins({
      repoRoot,
      ref: values.get('--ref'),
      change: values.get('--change'),
    })
    for (const sha of pins) console.log(sha)
    console.error(`✓ review pins — ${pins.length} historical reviewed commit(s)`)
  } catch (error) {
    if (error instanceof ReviewPinError) {
      console.error(`✗ review pins [${error.code}]: ${error.message}`)
      process.exit(1)
    }
    console.error(`✗ review pins — ${error instanceof Error ? error.stack : error}`)
    process.exit(2)
  }
}
