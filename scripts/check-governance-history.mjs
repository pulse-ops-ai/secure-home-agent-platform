#!/usr/bin/env node
/**
 * Thin PR-2 two-revision entry point.
 *
 * It owns three things and no rules: which revisions to read, how to turn them
 * into bytes, and how to report. Both revisions are evaluated by the shared
 * current-state model, and every pairwise verdict comes from
 * scripts/governance/model/history.mjs.
 *
 * THE BASE IS EXPLICIT AND EXCLUSIVE. There is no `merge-base`, no `HEAD~1`,
 * no "best available" window, and no silent comparison of the current revision
 * against itself. A base that does not resolve is a refusal, because the
 * alternative — quietly picking another revision — produces a green check that
 * compared something nobody asked for.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { decodeUtf8, evaluateState } from './governance/model/index.mjs'
import { evaluateHistory } from './governance/model/history.mjs'
import {
  ABSENT,
  OBSERVATION_ERROR,
  PRESENT,
  createHistoryReader,
} from './governance/history/index.mjs'
import { createGitTreeObserver } from './governance/git-tree/index.mjs'

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_STATE = 'governance/state.json'

function usage() {
  return [
    'Usage: node scripts/check-governance-history.mjs --base REV [--target REV]',
    '                                                 [--root ROOT] [--state FILE] [--json]',
    '',
    '  --base    REQUIRED explicit base revision. There is no fallback.',
    '  --target  revision to validate (default: HEAD).',
  ].join('\n')
}

function parseArguments(argv) {
  const options = { root: DEFAULT_ROOT, state: DEFAULT_STATE, target: 'HEAD', json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (
      argument === '--base' ||
      argument === '--target' ||
      argument === '--root' ||
      argument === '--state'
    ) {
      const value = argv[index + 1]
      if (value === undefined) throw new Error(argument + ' requires a value')
      options[argument.slice(2)] = value
      index += 1
    } else if (argument === '--json') {
      options.json = true
    } else if (argument === '--help' || argument === '-h') {
      options.help = true
    } else {
      throw new Error('unknown argument: ' + argument)
    }
  }
  return options
}

/**
 * Read one revision into `{ resolved, present, evaluation }`.
 *
 * `present: false` means the registry genuinely is not at that revision, which
 * only the genesis rule may act on. An OBSERVATION_ERROR is never folded into
 * absence: the caller receives `undefined` presence and refuses.
 */
function readRevision(reader, root, revision, statePath) {
  const resolved = reader.resolveCommit(revision)
  if (resolved.status !== PRESENT) {
    return { resolved: false, reason: resolved.reason ?? 'revision does not resolve to a commit' }
  }
  const read = reader.readBytesAt(resolved.oid, statePath)
  if (read.status === ABSENT) {
    return { resolved: true, commit: resolved.oid, present: false }
  }
  if (read.status !== PRESENT) {
    return {
      resolved: true,
      commit: resolved.oid,
      present: undefined,
      reason: read.reason ?? 'the registry could not be read at this revision',
    }
  }
  let text
  try {
    text = decodeUtf8(read.bytes)
  } catch (error) {
    return {
      resolved: true,
      commit: resolved.oid,
      present: true,
      evaluation: {
        ok: false,
        problems: [
          {
            code: 'ADV-G01',
            path: statePath,
            message: 'state is not valid UTF-8: ' + error.message,
          },
        ],
      },
    }
  }
  // EVERY CONTEXT IS BOUND TO THE REVISION BEING EVALUATED, not to the working
  // tree. A base revision validated against today's checkout would refuse a
  // perfectly legal history the moment a later commit moved a file — the model
  // would be asked "did this evidence hold?" and answer about a different
  // repository state. `observe` is the exception on purpose: Git objects are
  // global, so reachability and object presence are the same question at any
  // revision.
  const observer = createGitTreeObserver(root, { head: resolved.oid })
  return {
    resolved: true,
    commit: resolved.oid,
    present: true,
    evaluation: evaluateState(text, {
      stateBytes: read.bytes,
      readBytes: (repoPath) => {
        const bytes = reader.readBytesAt(resolved.oid, repoPath)
        if (bytes.status === PRESENT) return bytes.bytes
        if (bytes.status === ABSENT) return undefined
        // An unreadable artifact is not a missing one; throwing keeps the
        // distinction the model relies on.
        throw new Error(bytes.reason ?? 'artifact could not be read at this revision')
      },
      observe: observer,
      // "The checkout", at a historical revision, is that revision's tree.
      checkout: {
        tree: (rootPath) => {
          const tree = observer.treeAt(resolved.oid, rootPath)
          return tree.status === PRESENT ? tree.entries : undefined
        },
        pathExists: (repoPath) => observer.pathExistsAt(resolved.oid, repoPath) === PRESENT,
      },
      hasLocalGitObject: (identity) => reader.resolveCommit(identity).status === PRESENT,
    }),
  }
}

export function checkGovernanceHistory({
  root = DEFAULT_ROOT,
  base,
  target = 'HEAD',
  statePath = DEFAULT_STATE,
} = {}) {
  const resolvedRoot = resolve(root)
  const reader = createHistoryReader(resolvedRoot)

  if (base === undefined || base === null || base === '') {
    return {
      ok: false,
      comparison: 'refused',
      problems: [
        {
          code: 'ADV-G21',
          path: '$.base',
          message:
            'no explicit base revision was supplied; history validation requires one and infers ' +
            'none',
        },
      ],
    }
  }

  const baseRevision = readRevision(reader, resolvedRoot, base, statePath)
  const targetRevision = readRevision(reader, resolvedRoot, target, statePath)

  for (const [label, revision] of [
    ['base', baseRevision],
    ['target', targetRevision],
  ]) {
    if (revision.resolved && revision.present === undefined) {
      return {
        ok: false,
        comparison: 'refused',
        problems: [
          {
            code: 'ADV-G21',
            path: '$.' + label,
            message:
              'the registry at the ' +
              label +
              ' revision could not be observed (' +
              String(revision.reason) +
              '); an unanswered repository question is a refusal, not ' +
              'an absent registry',
          },
        ],
      }
    }
  }

  // Only asked when it can matter: a registry-less base is either the one bound
  // activation or a revert, and the difference is whether the registry ever
  // existed in that base's ancestry.
  let ancestry = { status: ABSENT, commits: [] }
  if (baseRevision.resolved && baseRevision.present === false) {
    const seen = reader.pathEverExistedInAncestry(baseRevision.commit, statePath)
    ancestry =
      seen.status === PRESENT
        ? { status: PRESENT, commits: seen.commits }
        : seen.status === ABSENT
          ? { status: PRESENT, commits: [] }
          : { status: OBSERVATION_ERROR, commits: [] }
  }

  const result = evaluateHistory({
    base: baseRevision,
    target: targetRevision,
    baseCommit: baseRevision.commit,
    targetCommit: targetRevision.commit,
    ancestry,
  })

  return {
    ...result,
    baseCommit: baseRevision.commit,
    targetCommit: targetRevision.commit,
  }
}

function main() {
  let options
  try {
    options = parseArguments(process.argv.slice(2))
  } catch (error) {
    console.error('✗ governance history — ' + error.message)
    console.error(usage())
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log(usage())
    return
  }

  const result = checkGovernanceHistory({
    root: options.root,
    base: options.base,
    target: options.target,
    statePath: options.state,
  })

  if (options.json) {
    console.log(
      JSON.stringify({
        ok: result.ok,
        comparison: result.comparison,
        baseCommit: result.baseCommit,
        targetCommit: result.targetCommit,
        problems: result.problems,
      }),
    )
    if (!result.ok) process.exitCode = 1
    return
  }

  if (!result.ok) {
    console.error('✗ governance history — ' + result.problems.length + ' refusal(s)')
    for (const problem of result.problems) {
      console.error('    ' + problem.code + ' ' + problem.path + ' — ' + problem.message)
    }
    process.exitCode = 1
    return
  }
  console.log(
    '✓ governance history — ' +
      (result.comparison === 'genesis'
        ? 'bound genesis activation; comparison not applicable'
        : 'pairwise comparison clean') +
      ' (' +
      String(result.baseCommit).slice(0, 12) +
      ' → ' +
      String(result.targetCommit).slice(0, 12) +
      ')',
  )
}

const invokedDirectly = (() => {
  if (process.argv[1] === undefined) return false
  try {
    return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()

if (invokedDirectly) main()
