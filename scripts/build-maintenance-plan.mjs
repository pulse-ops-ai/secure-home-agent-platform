#!/usr/bin/env node
/**
 * Assemble a classification plan from two Git revisions.
 *
 * The classifier compares REVISIONS, not working trees, so both sides are read
 * out of the object database and handed over as inert file maps. Neither
 * revision is ever checked out, and nothing from the candidate is executed --
 * the candidate is the subject of the comparison, not a participant in it.
 *
 * The path universe is derived here rather than taken from either side: it is
 * the union of what actually changed and everything the predecessor's protected
 * projections cover. A candidate that could shrink the universe could hide a
 * change inside it.
 *
 * Node standard library plus git. Governed by AGENTS.md and ADR-0022 (D13/D14).
 */

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const BOUNDARIES_PATH = 'scripts/toolchain-boundaries.json'

const git = (args, quiet = false) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    // A path absent at a revision is a real answer, not a problem to report.
    stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'],
  })

const arg = (flag) => {
  const index = process.argv.indexOf(flag)
  if (index === -1 || !process.argv[index + 1]) {
    console.error(`missing required ${flag}`)
    process.exit(1)
  }
  return process.argv[index + 1]
}

function readBlob(revision, filePath) {
  try {
    return git(['cat-file', 'blob', `${revision}:${filePath}`], true)
  } catch {
    return null // absent at this revision, which is a real answer
  }
}

function listTree(revision, prefix) {
  try {
    return git(['ls-tree', '-r', '--name-only', revision, '--', prefix], true)
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

function main() {
  const predecessor = arg('--predecessor')
  const candidate = arg('--candidate')
  const classId = arg('--class')

  const policyRaw = readBlob(predecessor, BOUNDARIES_PATH)
  if (policyRaw === null) {
    console.error(`the predecessor ${predecessor} carries no ${BOUNDARIES_PATH}`)
    process.exit(1)
  }
  const policy = JSON.parse(policyRaw)

  // What actually moved between the two revisions.
  const changed = git(['diff', '--name-only', `${predecessor}..${candidate}`])
    .split('\n')
    .filter(Boolean)

  // Everything the predecessor's protected floor covers, whether it moved or
  // not: a projection can differ without its own path appearing in the diff.
  const covered = new Set(changed)
  const specs = [
    ...(policy.protectedProjections ?? []),
    ...(policy.maintenanceClasses ?? []).flatMap((c) => [
      ...(c.allowedProjections ?? []),
      ...(c.protectedProjections ?? []),
    ]),
    ...(policy.maintenanceVerifierAuthorities ?? []).map((p) => ({
      path: p,
      projection: 'bytes',
    })),
  ]
  for (const spec of specs) {
    if (spec.projection === 'tree-bytes') {
      for (const rev of [predecessor, candidate]) {
        for (const file of listTree(rev, spec.path)) covered.add(file)
      }
    } else {
      covered.add(spec.path)
    }
  }

  const universe = [...covered].sort()
  const files = (revision) =>
    Object.fromEntries(
      universe.map((file) => [file, readBlob(revision, file)]).filter(([, body]) => body !== null),
    )

  console.log(
    JSON.stringify({
      classId,
      predecessor: { id: predecessor, files: files(predecessor) },
      candidate: { id: candidate, files: files(candidate) },
      universe,
    }),
  )
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  main()
}
