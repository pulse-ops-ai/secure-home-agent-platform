#!/usr/bin/env node
/** Read-only complete temporal audit; the shared model owns all decisions. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { auditDecisionEvidence } from '../model/decision-evidence.mjs'
import { createCommitReader, createGenesisReader } from './observations.mjs'

export function auditHistoricalAcceptances({
  root,
  sourceRevision,
  selectionRevision = sourceRevision,
}) {
  if (!/^[0-9a-f]{40}$/u.test(sourceRevision))
    throw new Error('explicit full source commit required')
  const readSnapshot = createGenesisReader(root)
  return auditDecisionEvidence(readSnapshot(sourceRevision), {
    readSnapshot,
    selectionSnapshot: readSnapshot(selectionRevision),
    ...createCommitReader(root),
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        root: { type: 'string' },
        source: { type: 'string' },
        'selection-source': { type: 'string' },
      },
    })
    if (!values.root || !values.source) throw new Error('explicit --root and --source required')
    const result = auditHistoricalAcceptances({
      root: resolve(values.root),
      sourceRevision: values.source,
      selectionRevision: values['selection-source'] ?? values.source,
    })
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
