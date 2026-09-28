/** TEST ONLY: read frozen inputs across promotion; never write or grant authority. */
import { execFileSync } from 'node:child_process'
import { lstatSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CANDIDATE_PATHS,
  canonicalSerialize,
  candidateFreezeIdentity,
  decodeUtf8,
  genesisAttestationDigest,
  genesisAttestationPreimage,
  genesisCompletionEnvelopeDigest,
  genesisRelationshipRows,
  parseStrictJson,
  primitiveDigest,
  relationshipEquivalenceDigest,
} from '../../../../scripts/governance/model/index.mjs'
import {
  containedPath,
  readContainedBytes,
} from '../../../../scripts/governance/git-tree/contained-read.mjs'

export const PROMOTED_PATHS = [
  'governance/consumers.json',
  'governance/genesis-source-manifest.json',
  'governance/state.json',
]
const same = (a, b) => canonicalSerialize(a) === canonicalSerialize(b)
const requireFact = (condition, message) => {
  if (!condition) throw new Error('test frozen candidate: ' + message)
}
const exactCommit = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value)

export function requireIsolatedTestRepository(root) {
  const actual = realpathSync(root)
  const path = relative(realpathSync(tmpdir()), actual)
  requireFact(
    path !== '' &&
      !path.startsWith('..') &&
      !isAbsolute(path) &&
      lstatSync(join(actual, '.git')).isDirectory(),
    'synthetic envelopes/rebindings require an independent temporary test repository',
  )
}

function memberBytes(root, path) {
  const observed = containedPath(root, path)
  let stats
  try {
    stats = lstatSync(observed.absolute)
  } catch (error) {
    // An unreadable ancestor is unknown, not evidence of required absence.
    if (error.code !== 'ENOENT') throw error
    requireFact(observed.missing, 'member changed during observation: ' + path)
    return undefined
  }
  requireFact(!observed.missing && stats.isFile(), 'non-regular member: ' + path)
  return readContainedBytes(root, path)
}

export function gitBytesForTest(root, revision, path) {
  requireFact(exactCommit(revision), 'an exact commit is required')
  const options = { cwd: root, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' } }
  const entry = execFileSync('git', ['ls-tree', revision, '--', path], options).toString()
  requireFact(
    entry.startsWith('100644 blob ') && entry.endsWith('\t' + path + '\n'),
    'missing or non-regular immutable member: ' + path,
  )
  return execFileSync('git', ['show', revision + ':' + path], {
    ...options,
    maxBuffer: 64 * 1024 * 1024,
  })
}

function parsed(bytes) {
  const text = decodeUtf8(bytes)
  const value = parseStrictJson(text)
  requireFact(canonicalSerialize(value) === text, 'noncanonical JSON member')
  return value
}

function rawMembers(bytes, sourceLayout) {
  requireFact(
    bytes.length === 3 && bytes.every((value) => value !== undefined),
    'all three frozen members are required',
  )
  bytes = bytes.map((value) => Buffer.from(value))
  const [inventory, manifest, state] = bytes.map(parsed)
  requireFact(same(state.attestations, { genesis: {} }), 'raw seed must be unattested')
  requireFact(
    state.schemaVersion === 1 &&
      Array.isArray(state.adrs) &&
      Array.isArray(inventory.rows) &&
      Array.isArray(manifest.rows),
    'invalid frozen member shape',
  )
  return { consumersBytes: bytes[0], manifestBytes: bytes[1], stateBytes: bytes[2], sourceLayout }
}

export function candidateByteMapForTest(candidate) {
  return new Map(
    CANDIDATE_PATHS.map((path, index) => [
      path,
      [candidate.consumersBytes, candidate.manifestBytes, candidate.stateBytes][index],
    ]),
  )
}

/** Only hostile fixture rehashing may deliberately read a mixed test layout.
 * This is NOT lifecycle discovery or a fallback: callers name raw fixture inputs.
 */
export function readRawRebindInputsForTest(root) {
  requireIsolatedTestRepository(root)
  const bytes = CANDIDATE_PATHS.map((path) => memberBytes(root, path))
  requireFact(
    bytes.every((value) => value !== undefined),
    'all hostile fixture inputs required',
  )
  // Preserve intentionally invalid claims for the real checker to adjudicate.
  // Unlike lifecycle loading, hostile rehashing does not assert raw-seed validity.
  return {
    consumersBytes: Buffer.from(bytes[0]),
    manifestBytes: Buffer.from(bytes[1]),
    stateBytes: Buffer.from(bytes[2]),
    sourceLayout: 'hostile-fixture-inputs',
  }
}

export function loadFrozenCandidateForTest(root) {
  const candidate = CANDIDATE_PATHS.map((path) => memberBytes(root, path))
  const promoted = PROMOTED_PATHS.map((path) => memberBytes(root, path))
  const count = (values) => values.filter((value) => value !== undefined).length
  if (count(candidate)) {
    requireFact(
      count(candidate) === 3 && count(promoted) === 0,
      'partial candidate or surviving candidate beside promoted members',
    )
    return rawMembers(candidate, 'pre-promotion')
  }
  requireFact(count(promoted) === 3, 'promotion requires all canonical members')
  const state = parsed(promoted[2])
  if (same(state.attestations, { genesis: {} })) return rawMembers(promoted, 'promoted-unattested')

  requireFact(
    same(Object.keys(state.attestations ?? {}).sort(), ['genesis', 'genesisCompletion']),
    'post-attestation recovery requires exactly two envelopes',
  )
  const { genesis, genesisCompletion } = state.attestations
  requireFact(exactCommit(genesis?.activationBaseCommit), 'missing exact attested activation base')
  requireFact(
    execFileSync('git', ['ls-tree', genesis.activationBaseCommit, '--', ...PROMOTED_PATHS], {
      cwd: root,
      env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
    }).length === 0,
    'attested activation base is not pre-promotion',
  )
  const bytes = CANDIDATE_PATHS.map((path) =>
    gitBytesForTest(root, genesis.activationBaseCommit, path),
  )
  const frozen = rawMembers(bytes, 'attested-activation-base')
  requireFact(
    Buffer.from(promoted[0]).equals(bytes[0]),
    'promoted consumers differ from frozen bytes',
  )
  requireFact(
    Buffer.from(promoted[1]).equals(bytes[1]),
    'promoted manifest differs from frozen bytes',
  )
  requireFact(
    canonicalSerialize({ ...state, attestations: { genesis: {} } }) === decodeUtf8(bytes[2]),
    'canonical state changed outside the two task-8.7 envelopes',
  )
  const preimage = genesisAttestationPreimage(genesis)
  const fields = Object.keys(preimage).filter(
    (key) => !['schemaVersion', 'priorStateDigest'].includes(key),
  )
  requireFact(
    same(Object.keys(genesis).sort(), [...fields, 'digest'].sort()),
    'incomplete genesis envelope',
  )
  requireFact(genesis.digest === genesisAttestationDigest(genesis), 'genesis digest differs')
  requireFact(
    same(genesis.candidateFreezeIdentity, candidateFreezeIdentity(candidateByteMapForTest(frozen))),
    'attested freeze identity differs from recovered bytes',
  )
  const manifest = parsed(bytes[1]),
    seed = parsed(bytes[2])
  requireFact(
    genesis.seedDigest === primitiveDigest(seed) &&
      same(genesis.sourceSnapshotIdentity, manifest.sourceSnapshotIdentity) &&
      genesis.relationshipEquivalenceDigest ===
        relationshipEquivalenceDigest(genesisRelationshipRows(manifest)),
    'genesis source/seed/relationship binding differs',
  )
  const members = seed.landings
    .filter((row) => row.delivery.lifecycle === 'Complete')
    .map((row) => ({ landingId: row.id, digest: row.delivery.completion.digest }))
  requireFact(
    same(Object.keys(genesisCompletion ?? {}).sort(), [
      'actor',
      'at',
      'authority',
      'envelopeDigest',
      'members',
      'outcome',
    ]) &&
      same(genesisCompletion.members, members) &&
      genesisCompletion.envelopeDigest === genesisCompletionEnvelopeDigest(members),
    'completion envelope differs from the frozen terminal set',
  )
  // Binding/delta checks are not authentication of a human or full state validation.
  return frozen
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = loadFrozenCandidateForTest(resolve(process.argv[2]))
    console.log(
      JSON.stringify({
        ...result,
        stateBytes: result.stateBytes.toString('base64'),
        manifestBytes: result.manifestBytes.toString('base64'),
        consumersBytes: result.consumersBytes.toString('base64'),
      }),
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
