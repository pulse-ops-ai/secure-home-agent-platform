#!/usr/bin/env node
/**
 * REAL RELEASE RECORDS, HANDED TO THE PACKAGE.
 *
 * The defect this closes is one this repository has hit before: a mechanism is
 * implemented and tested, and the REAL repository bytes are never handed to it.
 * `validateSetReleaseRecord` existed and nothing in the live tree called it.
 *
 * The division, exactly:
 *
 *   check-knowledge.mjs          registry and scaffold coherence
 *   check-knowledge-content.mjs  MODULE content admission
 *   this file                    real release records and manifest bytes
 *   check-release-history.mjs    what changed since the last governed revision
 *
 * THIS FILE IS DELIBERATELY SINGLE-REVISION, AND THAT IS ONLY HALF THE STORY.
 *
 * Everything here proves a record is internally coherent: canonical bytes, a
 * digest that hashes them, a review bound to that digest. It does NOT re-derive
 * the release from the catalog, and must not — a historical release pins an
 * older revision of a mutable family on purpose, so rebuilding it from today's
 * catalog would fail precisely because the mechanism is working.
 *
 * The consequence is that a NEW record could be canonical, correctly hashed, and
 * still pin an unreviewed, rollout-blocked, or non-composable module. That gap
 * is real and is closed by check-release-history.mjs, which knows which records
 * are new and applies the §6 preconditions to exactly those.
 *
 * Every semantic rule — canonical form, digest, review binding, family and
 * version agreement — belongs to `@secure-home/knowledge-toolchain` and is
 * reported here with the package's own refusal rule. Nothing is reimplemented:
 * a second copy of the canonicalization would be a second grammar.
 */
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { releaseManifestPath, validateSetReleaseRecord } from '@secure-home/knowledge-toolchain'

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))

export function checkSetReleases(root = DEFAULT_ROOT) {
  const problems = []
  const fail = (message) => problems.push(message)

  const catalogPath = join(root, 'knowledge', 'catalog.json')
  const registryPath = join(root, 'knowledge', 'set-releases.json')
  if (!existsSync(registryPath)) {
    fail('knowledge/set-releases.json is missing')
    return { problems, evaluated: 0 }
  }

  let catalog
  let registry
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
    registry = JSON.parse(readFileSync(registryPath, 'utf8'))
  } catch (error) {
    fail(`unreadable — ${error.message}`)
    return { problems, evaluated: 0 }
  }

  const families = new Set((catalog.sets ?? []).map((s) => s.id))
  const releases = Array.isArray(registry.releases) ? registry.releases : []
  let evaluated = 0

  for (const record of releases) {
    const id = `${record?.familyId ?? '(unnamed)'}@${record?.version ?? '?'}`
    // The path is DERIVED, never trusted from the record: a record that could
    // name its own file could point at bytes nobody reviewed.
    const relative =
      typeof record?.familyId === 'string' && typeof record?.version === 'string'
        ? releaseManifestPath(record.familyId, record.version)
        : undefined
    if (relative === undefined) {
      fail(`${id}: familyId and version must both be strings`)
      continue
    }
    const absolute = join(root, relative)

    // lstat, never stat: a symlinked manifest is bytes chosen by whoever made
    // the link rather than by the reviewer.
    let stats
    try {
      stats = lstatSync(absolute)
    } catch {
      fail(`${id}: manifest "${relative}" does not exist`)
      continue
    }
    if (stats.isSymbolicLink()) {
      fail(`${id}: manifest "${relative}" is a symbolic link; a release names real bytes`)
      continue
    }
    if (!stats.isFile()) {
      fail(`${id}: manifest "${relative}" is not a regular file`)
      continue
    }

    const bytes = new Uint8Array(readFileSync(absolute))
    const outcome = validateSetReleaseRecord(record, bytes, families)
    evaluated += 1
    if (!outcome.ok) {
      for (const refusal of outcome.refusals) {
        fail(`${id}: ${refusal.rule} — ${refusal.detail}`)
      }
    }
  }

  return { problems, evaluated }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  // An explicit root lets a test point the REAL checker at a fixture tree,
  // rather than testing a reimplementation of it.
  const { problems, evaluated } = checkSetReleases(process.argv[2] ?? DEFAULT_ROOT)
  if (problems.length > 0) {
    console.error(`\u2717 set releases \u2014 ${problems.length} problem(s)\n`)
    for (const problem of problems) console.error(`    ${problem}`)
    process.exit(1)
  }
  console.log(
    evaluated === 0
      ? '\u2713 set releases \u2014 no releases recorded'
      : `\u2713 set releases \u2014 ${evaluated} release(s) validated by @secure-home/knowledge-toolchain`,
  )
}
