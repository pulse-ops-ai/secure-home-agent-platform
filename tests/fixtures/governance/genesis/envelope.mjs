/** Explicitly TEST-ONLY. Prints a copy; never writes or claims owner authorship. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  canonicalSerialize,
  genesisAttestationDigest,
  genesisCompletionEnvelopeDigest,
  genesisRelationshipRows,
  primitiveDigest,
  relationshipEquivalenceDigest,
} from '../../../../scripts/governance/model/index.mjs'
import { evaluateCandidateFreshness } from '../../../../scripts/governance/genesis/freshness.mjs'

const subjectRoot = fileURLToPath(new URL('../../../../', import.meta.url))

export function testEnvelope(root, base) {
  if (resolve(root) === resolve(subjectRoot))
    throw new Error('test envelopes require an isolated copy')
  const state = JSON.parse(
    readFileSync(resolve(root, 'tests/fixtures/governance/candidate/state.json'), 'utf8'),
  )
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'tests/fixtures/governance/candidate/source-manifest.json'), 'utf8'),
  )
  const freshness = evaluateCandidateFreshness({ root, activationBaseCommit: base })
  if (!freshness.ok) throw new Error(JSON.stringify(freshness))
  return fixtureEnvelopes(state, manifest, base, freshness.result)
}

/** Shape construction only, also used to construct rehashed HOSTILE test inputs.
 * This helper performs no validation and is never production attestation code.
 */
export function fixtureEnvelopes(state, manifest, base, freshness) {
  const humanShapeOnly = {
    actor: 'fixture:genesis-mechanism',
    at: '2026-09-16T00:00:00Z',
    outcome: 'attested',
    authority: {
      type: 'task-contract',
      repository: 'fixture/isolated-repository',
      id: 'mechanical-test-only',
    },
  }
  const genesis = {
    ...humanShapeOnly,
    seedDigest: primitiveDigest(state),
    relationshipEquivalenceDigest: relationshipEquivalenceDigest(genesisRelationshipRows(manifest)),
    sourceSnapshotIdentity: manifest.sourceSnapshotIdentity,
    candidateFreezeIdentity: freshness.candidateFreezeIdentity,
    activationBaseCommit: base,
    activationIdentity: {
      type: 'github-pull-request',
      repository: 'fixture/isolated-repository',
      number: 1,
    },
    activationFreshness: {
      outcome: 'equivalent',
      digest: freshness.activationFreshnessDigest,
    },
  }
  genesis.digest = genesisAttestationDigest(genesis)
  const members = state.landings
    .filter((node) => node.delivery.lifecycle === 'Complete')
    .map((node) => ({ landingId: node.id, digest: node.delivery.completion.digest }))
  state.attestations = {
    genesis,
    genesisCompletion: {
      ...humanShapeOnly,
      members,
      envelopeDigest: genesisCompletionEnvelopeDigest(members),
    },
  }
  return state
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(canonicalSerialize(testEnvelope(process.argv[2], process.argv[3])))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
