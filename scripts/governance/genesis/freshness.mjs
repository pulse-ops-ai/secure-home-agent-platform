#!/usr/bin/env node
/** Read-only PR-2 freshness entry point; no attestation, activation, or writes. */
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { checkCandidateFreshness, prepareProjectionState } from '../model/index.mjs'
import {
  cacheTreeObservations,
  createGenesisReader,
  createCommitReader,
  readCheckoutSnapshot,
} from './observations.mjs'
import { createGitTreeObserver } from '../git-tree/index.mjs'
import { createHistoryReader, PRESENT } from '../history/index.mjs'
import { readContainedBytes } from '../git-tree/contained-read.mjs'

export function evaluateCandidateFreshness({ root, activationBaseCommit }) {
  return checkCandidateFreshness(activationBaseCommit, preparationContext(root))
}

/** Offline observations only; the model owns the complete D7.3a proof. */
export function evaluateProjectionPreparation({ root, ...binding }) {
  return prepareProjectionState(binding, preparationContext(root))
}

function preparationContext(root) {
  const reader = createHistoryReader(root)
  return {
    hasCompleteHistory: () =>
      execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
      }).trim() === 'false',
    readBytes: (path) => readContainedBytes(root, path),
    readSnapshot: createGenesisReader(root),
    readPreparationSnapshot: () => readCheckoutSnapshot(root),
    ...createCommitReader(root),
    observe: cacheTreeObservations(createGitTreeObserver(root)),
    hasLocalGitObject: (revision) => reader.resolveCommit(revision).status === PRESENT,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: { root: { type: 'string' }, base: { type: 'string' } },
    })
    if (!values.root || !values.base) throw new Error('explicit --root and --base are required')
    const result = evaluateCandidateFreshness({
      root: resolve(values.root),
      activationBaseCommit: values.base,
    })
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
