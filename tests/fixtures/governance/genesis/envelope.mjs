/** Explicitly TEST-ONLY. Prints a copy; never writes or claims owner authorship. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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
import {
  loadFrozenCandidateForTest,
  candidateByteMapForTest,
  requireIsolatedTestRepository,
} from './frozen.mjs'

const subjectRoot = fileURLToPath(new URL('../../../../', import.meta.url))

export function testEnvelope(root, base) {
  if (resolve(root) === resolve(subjectRoot))
    throw new Error('test envelopes require an isolated copy')
  requireIsolatedTestRepository(root)
  const frozen = loadFrozenCandidateForTest(root)
  const state = JSON.parse(frozen.stateBytes)
  const manifest = JSON.parse(frozen.manifestBytes)
  const freshness = fixtureFreshness(root, base, frozen)
  if (!freshness.ok) throw new Error(JSON.stringify(freshness))
  return fixtureEnvelopes(state, manifest, base, freshness.result)
}

function fixtureFreshness(root, base, frozen) {
  if (frozen.sourceLayout === 'pre-promotion')
    return evaluateCandidateFreshness({ root, activationBaseCommit: base })
  // Production freshness still requires its original layout. Recreate that
  // exact explicit base ONLY in a disposable fixture, never in the subject.
  if (!/^[0-9a-f]{40}$/u.test(base)) throw new Error('exact test activation base required')
  const scratch = mkdtempSync(join(tmpdir(), 'governance-test-envelope-'))
  const copy = join(scratch, 'repository')
  try {
    const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }
    execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', resolve(root), copy], {
      env,
    })
    execFileSync('git', ['checkout', '--quiet', '--detach', base], { cwd: copy, env })
    const recovered = candidateByteMapForTest(loadFrozenCandidateForTest(copy))
    for (const [path, bytes] of candidateByteMapForTest(frozen))
      if (!Buffer.from(bytes).equals(recovered.get(path)))
        throw new Error('explicit test base differs from frozen member: ' + path)
    return evaluateCandidateFreshness({ root: copy, activationBaseCommit: base })
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
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
      repository: 'pulse-ops-ai/secure-home-agent-platform',
      number: 1,
    },
    // Synthetic evidence in an isolated repository, not the owner's real comment.
    externalIndexHandoff: {
      contract: 'github-issue-conditional-handoff-v1',
      index: {
        type: 'github-issue',
        repository: 'pulse-ops-ai/secure-home-agent-platform',
        number: 19,
      },
      commentId: 1,
      commentBodySha256: '0'.repeat(64),
      canonicalRegistryPath: 'governance/state.json',
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
