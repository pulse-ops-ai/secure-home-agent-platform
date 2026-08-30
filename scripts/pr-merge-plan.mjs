#!/usr/bin/env node
/**
 * Deterministic pull-request merge composition and freshness planning.
 *
 * Governed image identity for a pull request must be established against the
 * tree that RESULTS FROM MERGING the live target branch with the candidate
 * head — not the isolated candidate head, and not the PR's historical
 * `base.sha`, which can lag behind the branch it names.
 *
 * This module establishes four identities, using Git plumbing only, without
 * mutating any real branch or the caller's working tree:
 *
 *   PR_HEAD_SHA    exact candidate head (an argument, re-verified here)
 *   BASE_REF       the PR target branch NAME
 *   LIVE_BASE_SHA  the CURRENT exact tip of BASE_REF, resolved from the remote
 *   MERGE_SHA      an ephemeral commit whose tree is the clean composition of
 *                  LIVE_BASE_SHA + PR_HEAD_SHA
 *
 * It fails closed. A base that cannot be resolved, a head that cannot be
 * resolved, a merge that conflicts or cannot be constructed, or a TOCTOU
 * movement of either identity aborts the proof — it never falls back to
 * verifying the isolated head.
 *
 * The previous-head incremental optimisation is preserved but bound to base
 * freshness: a previously proven head is a valid comparison origin only when
 * the live base is already incorporated into (an ancestor of) it. Otherwise the
 * comparison origin is the live base and the full composed diff is examined.
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ZERO_SHA = /^0+$/

class PlanFailure extends Error {
  constructor(message) {
    super(message)
    this.name = 'PlanFailure'
  }
}

const gitExecutable = () => process.env.PR_MERGE_GIT ?? process.env.IMAGE_IMPACT_GIT ?? 'git'

// The synthetic merge commit needs an author/committer identity. A CI runner
// does not configure one, so the module supplies its own deterministic
// identity through the environment of every git subprocess. This labels only
// the ephemeral merge commit; it mutates no branch and writes no repository
// config.
const IDENTITY_ENV = {
  GIT_AUTHOR_NAME: 'secure-home image proof',
  GIT_AUTHOR_EMAIL: 'image-proof@secure-home.invalid',
  GIT_COMMITTER_NAME: 'secure-home image proof',
  GIT_COMMITTER_EMAIL: 'image-proof@secure-home.invalid',
}

const git = (root, args, options = {}) =>
  execFileSync(gitExecutable(), args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
    env: { ...process.env, ...IDENTITY_ENV, ...(options.env ?? {}) },
  })

const tryGit = (root, args) => {
  try {
    return { ok: true, out: git(root, args) }
  } catch (error) {
    return { ok: false, error }
  }
}

const resolveCommit = (root, ref, label) => {
  if (typeof ref !== 'string' || ref.trim() === '') throw new PlanFailure(`${label} is empty`)
  const result = tryGit(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])
  if (!result.ok) throw new PlanFailure(`${label} "${ref}" cannot be resolved to a commit`)
  const sha = result.out.trim()
  if (!/^[0-9a-f]{40,64}$/.test(sha)) {
    throw new PlanFailure(
      `${label} "${ref}" resolved to an unexpected value ${JSON.stringify(sha)}`,
    )
  }
  return sha
}

// Like resolveCommit, but returns undefined when the ref is unavailable. Used
// for the OPTIONAL previous-head optimisation, whose absence must degrade to a
// full comparison rather than abort the proof.
const tryResolveCommit = (root, ref) => {
  const result = tryGit(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])
  if (!result.ok) return undefined
  const sha = result.out.trim()
  return /^[0-9a-f]{40,64}$/.test(sha) ? sha : undefined
}

const isAncestor = (root, ancestor, descendant) => {
  const result = tryGit(root, [
    'merge-base',
    '--is-ancestor',
    `${ancestor}^{commit}`,
    `${descendant}^{commit}`,
  ])
  if (result.ok) return true
  const status = result.error?.status
  // git merge-base --is-ancestor exits 1 for "no", other codes for real errors.
  if (status === 1) return false
  throw new PlanFailure(`cannot compare ancestry of ${ancestor} and ${descendant}`)
}

// The authoritative live tip of a branch on the remote, brought into the local
// object store so it can be merged. Fails closed on any resolution error.
const resolveLiveBase = (root, remote, baseRef) => {
  if (typeof baseRef !== 'string' || baseRef.trim() === '') {
    throw new PlanFailure('PR base ref is empty')
  }
  if (baseRef.startsWith('-') || /[\s~^:?*[\\]/.test(baseRef)) {
    throw new PlanFailure(`PR base ref ${JSON.stringify(baseRef)} is not a valid branch name`)
  }
  const fetch = tryGit(root, [
    'fetch',
    '--no-tags',
    '--force',
    remote,
    `refs/heads/${baseRef}:refs/remotes/${remote}/${baseRef}`,
  ])
  if (!fetch.ok) throw new PlanFailure(`cannot fetch live base ref ${baseRef} from ${remote}`)
  return resolveCommit(root, `refs/remotes/${remote}/${baseRef}`, 'live base')
}

// The authoritative current SHA a remote advertises for a ref, read WITHOUT
// fetching so it reflects live movement. Used for the end-of-run TOCTOU check.
const lsRemote = (root, remote, ref) => {
  const result = tryGit(root, ['ls-remote', '--exit-code', remote, ref])
  if (!result.ok) throw new PlanFailure(`cannot resolve ${ref} on ${remote}`)
  const line = result.out.split('\n').find((row) => row.trim() !== '')
  const sha = line?.split(/\s+/)[0]
  if (sha === undefined || !/^[0-9a-f]{40,64}$/.test(sha)) {
    throw new PlanFailure(`${remote} advertised an unexpected value for ${ref}`)
  }
  return sha
}

const resolveTree = (root, commit) => {
  const result = tryGit(root, ['rev-parse', '--verify', '--end-of-options', `${commit}^{tree}`])
  if (!result.ok) throw new PlanFailure(`cannot resolve the tree of ${commit}`)
  const tree = result.out.trim()
  if (!/^[0-9a-f]{40,64}$/.test(tree)) throw new PlanFailure(`unexpected tree for ${commit}`)
  return tree
}

// Compose merge(liveBase, prHead) into an ephemeral commit, touching no branch
// and no caller working tree. When the live base is already an ancestor of the
// head the composition is exactly the head tree; otherwise a real three-way
// merge is performed in a throwaway worktree so a genuine conflict fails
// closed. Returns the ephemeral merge commit SHA.
const composeMerge = (root, liveBase, prHead) => {
  let tree
  if (isAncestor(root, liveBase, prHead)) {
    tree = resolveTree(root, prHead)
  } else {
    const worktree = mkdtempSync(join(tmpdir(), 'pr-merge-'))
    try {
      const added = tryGit(root, ['worktree', 'add', '--detach', '--quiet', worktree, liveBase])
      if (!added.ok) throw new PlanFailure('cannot stage the live base for merge composition')
      const merged = tryGit(worktree, ['merge', '--no-commit', '--no-ff', '--no-edit', prHead])
      if (!merged.ok) {
        throw new PlanFailure(
          'merge composition of the live base and PR head conflicts; failing closed',
        )
      }
      const written = tryGit(worktree, ['write-tree'])
      if (!written.ok) throw new PlanFailure('cannot write the composed merge tree')
      tree = written.out.trim()
    } finally {
      tryGit(root, ['worktree', 'remove', '--force', worktree])
      rmSync(worktree, { recursive: true, force: true })
      tryGit(root, ['worktree', 'prune'])
    }
  }
  const commit = tryGit(root, [
    'commit-tree',
    tree,
    '-p',
    liveBase,
    '-p',
    prHead,
    '-m',
    'synthetic image-proof merge (LIVE_BASE + PR_HEAD)',
  ])
  if (!commit.ok) throw new PlanFailure('cannot create the synthetic merge commit')
  return commit.out.trim()
}

export function planPullRequest({
  root,
  remote = 'origin',
  baseRef,
  prHead,
  previous,
  action,
  previousProven = false,
}) {
  const absoluteRoot = resolve(root)
  const prHeadSha = resolveCommit(absoluteRoot, prHead, 'PR head')
  const liveBase = resolveLiveBase(absoluteRoot, remote, baseRef)
  const mergeSha = composeMerge(absoluteRoot, liveBase, prHeadSha)

  // Previous-head induction is admitted ONLY when the previous head both has a
  // successful proof (supplied) AND already incorporates the live base, so the
  // incremental diff cannot miss anything the advanced base introduced. A
  // force-pushed previous head that is not an ancestor of the current head is
  // also refused.
  let mode = 'full'
  let comparisonBase = liveBase
  let note = 'full PR comparison against the live target-branch tip'
  const hasPrevious =
    typeof previous === 'string' && previous.trim() !== '' && !ZERO_SHA.test(previous.trim())
  if (action === 'synchronize' && hasPrevious && previousProven) {
    // The incremental fast path is an OPTIMISATION. Its absence must degrade to
    // the full composed comparison — never abort the proof — so an unavailable
    // previous head or an indeterminate ancestry check falls through to `full`.
    try {
      const previousSha = tryResolveCommit(absoluteRoot, previous)
      if (previousSha === undefined) {
        note = 'previous-head proof not reused: previous head is unavailable; full comparison'
      } else if (!isAncestor(absoluteRoot, liveBase, previousSha)) {
        note = 'previous-head proof not reused: the live base advanced beyond it; full comparison'
      } else if (!isAncestor(absoluteRoot, previousSha, prHeadSha)) {
        note = 'previous-head proof not reused: it is not an ancestor of the current head'
      } else {
        mode = 'incremental'
        comparisonBase = previousSha
        note =
          'previous PR head has a successful governed image proof and incorporates the live base'
      }
    } catch {
      mode = 'full'
      comparisonBase = liveBase
      note =
        'previous-head proof not reused: its freshness could not be established; full comparison'
    }
  }

  return {
    prHead: prHeadSha,
    baseRef,
    liveBase,
    mergeSha,
    comparisonBase,
    mode,
    note,
  }
}

export function verifyStable({
  root,
  remote = 'origin',
  baseRef,
  prNumber,
  expectedLiveBase,
  expectedPrHead,
}) {
  const absoluteRoot = resolve(root)
  const liveBaseNow = lsRemote(absoluteRoot, remote, `refs/heads/${baseRef}`)
  const prHeadNow = lsRemote(absoluteRoot, remote, `refs/pull/${prNumber}/head`)
  const moved = []
  if (liveBaseNow !== expectedLiveBase) {
    moved.push(`live base ${baseRef}: ${expectedLiveBase} -> ${liveBaseNow}`)
  }
  if (prHeadNow !== expectedPrHead) {
    moved.push(`PR head #${prNumber}: ${expectedPrHead} -> ${prHeadNow}`)
  }
  return { stable: moved.length === 0, moved, liveBaseNow, prHeadNow }
}

const writeOutputs = (path, entries) => {
  appendFileSync(
    path,
    Object.entries(entries)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
  )
}

const invokedDirectly = (() => {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  const [command, ...rest] = process.argv.slice(2)
  const options = new Map()
  const BOOLEAN_FLAGS = new Set(['json'])
  for (let at = 0; at < rest.length; at += 1) {
    const flag = rest[at]
    if (!flag.startsWith('--')) {
      console.error(`✗ pr-merge-plan — unexpected argument ${JSON.stringify(flag)}`)
      process.exit(2)
    }
    const eq = flag.indexOf('=')
    if (eq !== -1) {
      options.set(flag.slice(2, eq), flag.slice(eq + 1))
    } else if (BOOLEAN_FLAGS.has(flag.slice(2))) {
      options.set(flag.slice(2), 'true')
    } else {
      const value = rest[at + 1]
      if (value === undefined) {
        console.error(`✗ pr-merge-plan — ${flag} requires a value`)
        process.exit(2)
      }
      options.set(flag.slice(2), value)
      at += 1
    }
  }

  try {
    if (command === 'plan') {
      const result = planPullRequest({
        root: options.get('root') ?? process.cwd(),
        remote: options.get('remote') ?? 'origin',
        baseRef: options.get('base-ref'),
        prHead: options.get('pr-head'),
        previous: options.get('previous') ?? '',
        action: options.get('action') ?? '',
        previousProven: options.get('previous-proven') === 'true',
      })
      const outputs = {
        head: result.mergeSha,
        merge_sha: result.mergeSha,
        comparison_base: result.comparisonBase,
        live_base: result.liveBase,
        pr_head: result.prHead,
        base_ref: result.baseRef,
        mode: result.mode,
        force_all: 'false',
        note: result.note,
      }
      if (options.has('github-output')) writeOutputs(options.get('github-output'), outputs)
      if (options.has('json')) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      } else {
        // The merge SHA on stdout lets the caller check it out immediately.
        process.stdout.write(`${result.mergeSha}\n`)
      }
      console.error(`pr-merge-plan: ${result.mode} — ${result.note}`)
      console.error(`  live base:  ${result.liveBase}`)
      console.error(`  PR head:    ${result.prHead}`)
      console.error(`  merge tree: ${result.mergeSha}`)
      console.error(`  comparison: ${result.comparisonBase}`)
    } else if (command === 'verify') {
      const result = verifyStable({
        root: options.get('root') ?? process.cwd(),
        remote: options.get('remote') ?? 'origin',
        baseRef: options.get('base-ref'),
        prNumber: options.get('pr-number'),
        expectedLiveBase: options.get('expected-live-base'),
        expectedPrHead: options.get('expected-pr-head'),
      })
      if (!result.stable) {
        console.error('✗ pr-merge-plan — identities moved during the proof; failing closed')
        for (const line of result.moved) console.error(`    ${line}`)
        process.exit(1)
      }
      console.error('pr-merge-plan: PR head and live base are unchanged since the proof began')
    } else {
      console.error('✗ pr-merge-plan — usage: pr-merge-plan.mjs <plan|verify> [--flag value]')
      process.exit(2)
    }
  } catch (error) {
    const message =
      error instanceof PlanFailure ? error.message : `unexpected failure: ${error.stack}`
    console.error(`✗ pr-merge-plan — ${message}`)
    process.exit(1)
  }
}
