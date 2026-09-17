#!/usr/bin/env node
/** Historical EX-TS-002 identity, never current-source or maintenance admission. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

// Existing historical identities, not a new capture or a mutable lifecycle flag.
export const CAPTURE_HEAD = '362c349e18cfb3c63c52fc29a5c70a947a1107f2'
export const BASELINE_WITNESS = '79e96ae7ea2e33f4daf9cabc8e666db925d9639a'
export const CUTOVER_HEAD = '4de51a4ea30a2480fb003143fc7374218689225d'
export const FROZEN_BLOBS = Object.freeze({
  'tests/evidence/ts6-emit-baseline.json': 'e97f80f94b37030f7058f831ba9eb15a89806868',
  'tests/evidence/ts6-migration-projection.json': 'd1d94422d10665a19e2a021a8c9471ce7225d599',
  'tests/evidence/ts6-migration-projection-v2.json': 'db14bbae068e97599f4391e2b9c2394ff693abda',
})

const git = (root, ...args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  }).trim()

function requireEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message)
}

const blobOf = (bytes) =>
  createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')

function readArtifacts(root) {
  const artifacts = {}
  for (const [file, expectedBlob] of Object.entries(FROZEN_BLOBS)) {
    if (!lstatSync(path.join(root, file)).isFile()) {
      throw new Error(`${file}: frozen historical artifact must be a regular file`)
    }
    const bytes = readFileSync(path.join(root, file))
    const blob = blobOf(bytes)
    requireEqual(blob, expectedBlob, `${file}: frozen historical blob changed (even if resealed)`)
    const document = JSON.parse(bytes.toString('utf8'))
    const { manifestSha256, ...body } = document
    const seal = createHash('sha256')
      .update(`${JSON.stringify(body, null, 2)}\n`)
      .digest('hex')
    requireEqual(seal, manifestSha256, `${file}: historical seal differs`)
    requireEqual(document.capturedAtHead, CAPTURE_HEAD, `${file}: original capture binding differs`)
    requireEqual(document.compiler.package, 'typescript', `${file}: compiler authority differs`)
    requireEqual(document.compiler.version, '6.0.3', `${file}: capture compiler differs`)
    requireEqual(document.compiler.tscReported, 'Version 6.0.3', `${file}: compiler report differs`)
    artifacts[file] = document
  }
  const baseline = artifacts['tests/evidence/ts6-emit-baseline.json']
  const projection = artifacts['tests/evidence/ts6-migration-projection-v2.json']
  requireEqual(projection.schemaVersion, 2, 'historical comparison requires projection v2')
  requireEqual(
    projection.boundTo.rawBaselineManifestSha256,
    baseline.manifestSha256,
    'projection is bound to a different raw baseline',
  )
  requireEqual(projection.boundTo.rawBaselineCapturedAtHead, CAPTURE_HEAD, 'source binding differs')
  requireEqual(
    projection.declarationOrdering.mechanism,
    '--stableTypeOrdering',
    'historical declaration ordering differs',
  )
  return { baseline, projection }
}

/** No compiler executes, and no current source is compared to historical output. */
export function verifyHistoricalEvidence(repoRoot = REPO_ROOT) {
  const evidence = readArtifacts(repoRoot)
  const projectionCapture = evidence.projection.boundTo.captureTreeHead
  for (const revision of [CAPTURE_HEAD, BASELINE_WITNESS, projectionCapture, CUTOVER_HEAD]) {
    requireEqual(git(repoRoot, 'cat-file', '-t', revision), 'commit', 'historical commit missing')
    git(repoRoot, 'merge-base', '--is-ancestor', revision, 'HEAD')
  }
  git(repoRoot, 'merge-base', '--is-ancestor', CAPTURE_HEAD, BASELINE_WITNESS)
  for (const revision of [CAPTURE_HEAD, BASELINE_WITNESS, projectionCapture]) {
    const catalog = git(repoRoot, 'show', `${revision}:pnpm-workspace.yaml`)
    if (!/^ {2}typescript: 6\.0\.3$/m.test(catalog)) {
      throw new Error(`${revision}: historical capture did not pin TypeScript 6.0.3`)
    }
  }
  for (const [file, blob] of Object.entries(FROZEN_BLOBS)) {
    requireEqual(
      git(repoRoot, 'rev-parse', `${CUTOVER_HEAD}:${file}`),
      blob,
      `${file}: cutover identity differs`,
    )
  }
  requireEqual(
    git(repoRoot, 'rev-parse', `${BASELINE_WITNESS}:tests/evidence/ts6-emit-baseline.json`),
    FROZEN_BLOBS['tests/evidence/ts6-emit-baseline.json'],
    'the frozen baseline was absent from its TypeScript 6 witness',
  )
  // Only emitting members' historical sources are in this proof. The lint
  // engine's own non-emitted implementation legitimately moved during cutover.
  for (const member of Object.keys(evidence.baseline.members)) {
    for (const revision of [BASELINE_WITNESS, projectionCapture, CUTOVER_HEAD]) {
      requireEqual(
        git(repoRoot, 'diff', '--name-only', CAPTURE_HEAD, revision, '--', `${member}/src`),
        '',
        `${member}: historical source differs from the TS6 capture at ${revision}`,
      )
    }
  }
  return evidence
}

/** Refuse an arbitrary current tree BEFORE its compiler or build scripts run. */
export function verifyReplaySubject(subjectRoot, authorityRoot = REPO_ROOT) {
  const evidence = verifyHistoricalEvidence(authorityRoot)
  requireEqual(
    git(subjectRoot, 'rev-parse', 'HEAD'),
    CUTOVER_HEAD,
    `replay requires cutover revision ${CUTOVER_HEAD}`,
  )
  requireEqual(
    git(subjectRoot, 'status', '--porcelain', '--untracked-files=all'),
    '',
    'replay requires a clean historical checkout (including untracked files)',
  )
  // Git status alone can hide tracked edits marked assume-unchanged or
  // skip-worktree. Read the actual input bytes against the pinned tree.
  for (const record of git(subjectRoot, 'ls-tree', '-r', '-z', CUTOVER_HEAD)
    .split('\0')
    .filter(Boolean)) {
    const [metadata, file] = record.split('\t')
    const [mode, type, expectedBlob] = metadata.split(' ')
    const input = path.join(subjectRoot, file)
    if (!['100644', '100755'].includes(mode) || type !== 'blob' || !lstatSync(input).isFile()) {
      throw new Error(`${file}: replay requires regular historical inputs`)
    }
    requireEqual(
      blobOf(readFileSync(input)),
      expectedBlob,
      `${file}: historical checkout bytes differ`,
    )
  }
  readArtifacts(subjectRoot)
  for (const member of Object.keys(evidence.baseline.members)) {
    requireEqual(
      git(
        subjectRoot,
        'ls-files',
        '--others',
        '--ignored',
        '--exclude-standard',
        '--',
        `${member}/src`,
      ),
      '',
      `${member}: ignored source is not part of the bound historical checkout`,
    )
  }
  const compiler = JSON.parse(
    readFileSync(path.join(subjectRoot, 'node_modules/typescript/package.json'), 'utf8'),
  )
  requireEqual(
    compiler.version,
    '7.0.2',
    'replay requires installed cutover compiler TypeScript 7.0.2',
  )
  const reported = execFileSync(path.join(subjectRoot, 'node_modules/.bin/tsc'), ['--version'], {
    cwd: subjectRoot,
    encoding: 'utf8',
  }).trim()
  requireEqual(reported, 'Version 7.0.2', 'replay compiler executable identity differs')
  return evidence
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('usage: check-emit-history.mjs')
    verifyHistoricalEvidence()
    console.log(
      '✓ historical emit evidence — 3 frozen blobs, seals, TS6 capture and cutover binding verified; no current-source or maintenance verdict',
    )
  } catch (error) {
    console.error(`✗ historical emit evidence refused: ${error.message}`)
    process.exitCode = 1
  }
}
