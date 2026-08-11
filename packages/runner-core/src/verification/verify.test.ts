/**
 * Independent verification (EX-006, INV-011; MUT-003 and RC-MUT-06
 * kills): the verifier re-derives expected state from independently
 * supplied values and agrees with an untampered bundle naming the
 * artifacts consumed; PROP-005 (any single-artifact mutation is
 * flagged); RC-ADV-07 (an extra unaccounted artifact fails closed);
 * missing artifact; RC-ADV-08 (irreconcilable statements); absent and
 * malformed bundles fail closed; authority-identity divergence is
 * caught by re-capture; an unreadable surface is operational failure —
 * not verified, and not a contract decision.
 */
import { describe, expect, it } from 'vitest'
import type { EvidenceBundleT } from '@secure-home/events'
import { deriveAuthoritativeChangeSet } from '../workspace/index.js'
import { reconcileClaims } from '../reconciliation/index.js'
import { constructEvidence } from '../evidence/index.js'
import { verifyEvidence, type IndependentInputs } from './verify.js'
import {
  bytesOf,
  capturedPolicy,
  capturedProfile,
  capturedRegistry,
  digestHex,
  mulberry32,
  policyDocument,
  profileDocument,
  registryDocument,
} from '../testing-fixtures.js'

const artifactSet = (
  entries: readonly { path: string; content: string }[],
): { ok: true; artifacts: { path: string; content: string }[] } => ({
  ok: true,
  artifacts: entries.map((entry) => ({ ...entry })),
})

const producerBundle = (
  artifacts: readonly { path: string; content: string }[],
): EvidenceBundleT => {
  const observed = (() => {
    const decision = deriveAuthoritativeChangeSet({
      ok: true,
      changes: artifacts.map((artifact) => ({
        path: artifact.path,
        kind: 'modified' as const,
        bytes: 10,
      })),
    })
    if (decision.kind !== 'proceed') throw new Error('fixture')
    return decision.value
  })()
  const constructed = constructEvidence({
    snapshots: {
      profile: capturedProfile(),
      path_policy: capturedPolicy(),
      gate_registry: capturedRegistry(),
    },
    run: {
      run_id: 'run-20260810-0003',
      image_digest: digestHex('a'),
      argv_digest: digestHex('b'),
      runtime: 'runc 1.3.1',
      provider: 'example-provider',
      adapter: 'copilot-cli',
    },
    principal: { sub: 'agent:home-status', acting: { kind: 'autonomous' } },
    operations: { attempted: [], permitted: [], denied: [] },
    gate_results: { lint: { disposition: 'PASS', truncated: false } },
    artifacts: artifactSet(artifacts),
    observed,
    reconciliation: reconcileClaims(observed, undefined),
    outcome: { terminal_state: 'COMPLETED' },
    timing: {
      started_at: '2026-08-10T12:00:00Z',
      finished_at: '2026-08-10T12:05:00Z',
      duration_seconds: 300,
    },
  })
  if (constructed.kind !== 'proceed') throw new Error(JSON.stringify(constructed))
  return constructed.value
}

/** Independently acquired inputs — distinct VALUES from the producer's. */
const independent = (
  artifacts: readonly { path: string; content: string }[],
): IndependentInputs => ({
  profile: bytesOf(profileDocument(), 'profiles/coding/home-status-read.json'),
  path_policy: bytesOf(policyDocument(), 'profiles/path-policy.json'),
  gate_registry: bytesOf(registryDocument(), 'profiles/gate-registry.json'),
  artifacts: artifactSet(artifacts),
})

const ARTIFACTS = [
  { path: 'packages/a.ts', content: 'export const a = 1\n' },
  { path: 'packages/b.ts', content: 'export const b = 2\n' },
]

describe('EX-006: the verifier re-derives and agrees with an untampered bundle', () => {
  it('verifies and names the exact artifacts consumed', () => {
    const result = verifyEvidence(producerBundle(ARTIFACTS), independent(ARTIFACTS))
    if (!('verified' in result) || result.verified !== true) throw new Error(JSON.stringify(result))
    expect(result.artifacts_consumed.map((artifact) => artifact.path).sort()).toEqual([
      'packages/a.ts',
      'packages/b.ts',
    ])
    for (const artifact of result.artifacts_consumed) {
      expect(artifact.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
  })
})

describe('PROP-005: any single-artifact mutation is flagged (MUT-003 kill)', () => {
  it('holds across 60 generated artifact sets', () => {
    const random = mulberry32(54)
    for (let round = 0; round < 60; round += 1) {
      const size = 1 + Math.floor(random() * 5)
      const artifacts = Array.from({ length: size }, (_, index) => ({
        path: `packages/gen${String(index)}.ts`,
        content: `export const v${String(index)} = ${String(Math.floor(random() * 100000))}\n`,
      }))
      const bundle = producerBundle(artifacts)
      expect(verifyEvidence(bundle, independent(artifacts))).toHaveProperty('verified', true)
      const target = Math.floor(random() * size)
      const mutated = artifacts.map((artifact, index) =>
        index === target ? { ...artifact, content: `${artifact.content} ` } : artifact,
      )
      const result = verifyEvidence(bundle, independent(mutated))
      if (!('verified' in result)) throw new Error('expected a verification result')
      expect(result.verified).toBe(false)
      if (result.verified) throw new Error('unreachable')
      expect(result.failures.join('\n')).toContain(`packages/gen${String(target)}.ts`)
    }
  })
})

describe('fail-closed conditions', () => {
  it('RC-ADV-07: an extra unaccounted artifact fails naming it', () => {
    const result = verifyEvidence(
      producerBundle(ARTIFACTS),
      independent([...ARTIFACTS, { path: 'packages/extra.ts', content: 'x' }]),
    )
    if (!('verified' in result) || result.verified) throw new Error('expected failure')
    expect(result.failures.join('\n')).toContain('unaccounted')
    expect(result.failures.join('\n')).toContain('packages/extra.ts')
  })

  it('an artifact the bundle names but the surface lacks fails naming it', () => {
    const result = verifyEvidence(
      producerBundle(ARTIFACTS),
      independent([ARTIFACTS[0] ?? { path: 'packages/a.ts', content: '' }]),
    )
    if (!('verified' in result) || result.verified) throw new Error('expected failure')
    expect(result.failures.join('\n')).toContain('missing from the observed surface')
  })

  it('RC-ADV-08: two irreconcilable digests for one artifact fail naming the ambiguity', () => {
    const bundle = producerBundle(ARTIFACTS)
    const contradictory = {
      ...bundle,
      artifacts: [
        ...bundle.artifacts,
        {
          ...(bundle.artifacts[0] ?? { path: 'packages/a.ts', bytes: 1, digest: digestHex('f') }),
          digest: digestHex('e'),
        },
      ],
    }
    const result = verifyEvidence(contradictory, independent(ARTIFACTS))
    if (!('verified' in result) || result.verified) throw new Error('expected failure')
    expect(result.failures.join('\n')).toContain('irreconcilable')
  })

  it('absent and malformed bundles fail closed naming the condition', () => {
    for (const claimed of [undefined, null, { contract_id: 'evidence-bundle' }]) {
      const result = verifyEvidence(claimed, independent(ARTIFACTS))
      if (!('verified' in result) || result.verified) throw new Error('expected failure')
      expect(result.failures.length).toBeGreaterThan(0)
    }
  })

  it('a lied profile name or version with the ORIGINAL digest fails (review P1)', () => {
    const bundle = producerBundle(ARTIFACTS)
    for (const lie of [{ version: '9.9.9' }, { name: 'impersonated-profile' }]) {
      const tampered = {
        ...bundle,
        identities: {
          ...bundle.identities,
          profile: { ...bundle.identities.profile, ...lie },
        },
      }
      const result = verifyEvidence(tampered, independent(ARTIFACTS))
      if (!('verified' in result) || result.verified) throw new Error('expected failure')
      expect(result.failures.join('\n')).toContain('profile identity diverges')
    }
  })

  it('a lied authority contract version with the ORIGINAL digest fails (review P1)', () => {
    const bundle = producerBundle(ARTIFACTS)
    const tampered = {
      ...bundle,
      identities: {
        ...bundle.identities,
        path_policy: { ...bundle.identities.path_policy, contract_version: '3.0.0' },
      },
    }
    const result = verifyEvidence(tampered, independent(ARTIFACTS))
    if (!('verified' in result) || result.verified) throw new Error('expected failure')
    expect(result.failures.join('\n')).toContain(
      'path-policy identity diverges on contract_version',
    )
  })

  it('a diverging governing authority is caught by independent re-capture', () => {
    const swapped = {
      ...independent(ARTIFACTS),
      path_policy: bytesOf({ ...policyDocument(), max_files: 9999 }, 'profiles/path-policy.json'),
    }
    const result = verifyEvidence(producerBundle(ARTIFACTS), swapped)
    if (!('verified' in result) || result.verified) throw new Error('expected failure')
    expect(result.failures.join('\n')).toContain('path-policy identity diverges')
  })

  it('an unreadable artifact surface is operational failure — not verified, no decision', () => {
    const result = verifyEvidence(producerBundle(ARTIFACTS), {
      ...independent(ARTIFACTS),
      artifacts: { ok: false, failure: 'EIO' },
    })
    expect('kind' in result && result.kind === 'operational_failure').toBe(true)
    expect(JSON.stringify(result)).not.toContain('"verified"')
  })
})
