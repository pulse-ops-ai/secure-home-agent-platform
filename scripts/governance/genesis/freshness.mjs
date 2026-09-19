#!/usr/bin/env node
/** Read-only PR-2 freshness entry point; no attestation, activation, or writes. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { checkCandidateFreshness } from '../model/index.mjs'
import { cacheTreeObservations, createGenesisReader } from './observations.mjs'
import { createGitTreeObserver } from '../git-tree/index.mjs'
import { createHistoryReader, PRESENT } from '../history/index.mjs'
import { readContainedBytes } from '../git-tree/contained-read.mjs'

export function evaluateCandidateFreshness({ root, activationBaseCommit }) {
  const reader = createHistoryReader(root)
  return checkCandidateFreshness(activationBaseCommit, {
    readBytes: (path) => readContainedBytes(root, path),
    readSnapshot: createGenesisReader(root),
    observe: cacheTreeObservations(createGitTreeObserver(root)),
    hasLocalGitObject: (revision) => reader.resolveCommit(revision).status === PRESENT,
  })
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
