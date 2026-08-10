/**
 * ADV-003 (source mutated after capture changes no decision; the digest
 * identifies the captured bytes — MUT-002 kill), RC-ADV-11 (bytes valid
 * against a DIFFERENT declared contract refuse naming both identities),
 * capture-failure semantics (refusal for invalid bytes; operational
 * failure — never an empty snapshot — for a reported acquisition fault),
 * and EX-003 seeds (refusal versus operational failure are structurally
 * distinct).
 */
import { describe, expect, it } from 'vitest'
import { ExecutionProfile, PathPolicy, type PathPolicyT } from '@secure-home/contracts'
import { captureAuthority } from './capture.js'
import { decideEligibility } from '../eligibility/index.js'
import { digestOf } from '../primitives/index.js'
import {
  bytesOf,
  capturedPolicy,
  capturedProfile,
  capturedRegistry,
  policyDocument,
  source,
} from '../testing-fixtures.js'

describe('snapshot construction (D4)', () => {
  it('a valid capture records source, digest, and contract identity', () => {
    const bytes = JSON.stringify(policyDocument())
    const captured = captureAuthority<PathPolicyT>(
      { ok: true, source: source('profiles/path-policy.json'), bytes },
      { contract_id: 'path-policy', schema: PathPolicy },
    )
    expect('kind' in captured).toBe(false)
    if ('kind' in captured || !captured.ok) throw new Error('expected ok capture')
    expect(captured.digest).toBe(digestOf(bytes))
    expect(captured.contract).toEqual({
      contract_id: 'path-policy',
      contract_version: '2.0.0',
      digest: digestOf(bytes),
    })
  })

  it('ADV-003: a source mutated after capture changes no decision', () => {
    const captured = capturedPolicy()
    if (!captured.ok) throw new Error('fixture')
    const before = decideEligibility(
      { profile: capturedProfile(), path_policy: captured, gate_registry: capturedRegistry() },
      ['lint'],
    )
    // The "source" changes afterwards — a later, different byte value
    // exists in the world. The captured snapshot is a value; the decision
    // repeated over the SAME snapshot is identical, and the digest still
    // identifies exactly the bytes that governed.
    const mutatedBytes = JSON.stringify({ ...policyDocument(), max_files: 999999 })
    expect(digestOf(mutatedBytes)).not.toBe(captured.digest)
    const after = decideEligibility(
      { profile: capturedProfile(), path_policy: captured, gate_registry: capturedRegistry() },
      ['lint'],
    )
    expect(after).toEqual(before)
    expect(captured.digest).toBe(digestOf(JSON.stringify(policyDocument())))
  })

  it('RC-ADV-11: bytes valid against a different declared contract refuse', () => {
    const captured = captureAuthority<PathPolicyT>(
      bytesOf(policyDocument(), 'profiles/should-be-a-profile.json'),
      { contract_id: 'execution-profile', schema: ExecutionProfile as never },
    )
    if ('kind' in captured) throw new Error('unexpected operational failure')
    expect(captured.ok).toBe(false)
    if (captured.ok) throw new Error('expected refusal')
    expect(captured.refusal.code).toBe('contract_mismatch')
    expect(captured.refusal.detail).toContain('execution-profile')
    expect(captured.refusal.detail).toContain('path-policy')
  })

  it('non-JSON and contract-invalid bytes refuse; no snapshot is produced', () => {
    for (const bytes of ['not json at all', JSON.stringify({ contract_id: 'path-policy' })]) {
      const captured = captureAuthority<PathPolicyT>(
        { ok: true, source: source('profiles/path-policy.json'), bytes },
        { contract_id: 'path-policy', schema: PathPolicy },
      )
      if ('kind' in captured) throw new Error('unexpected operational failure')
      expect(captured.ok).toBe(false)
      if (captured.ok) throw new Error('expected refusal')
      expect(['invalid_authority', 'contract_mismatch']).toContain(captured.refusal.code)
    }
  })

  it('a reported acquisition failure is operational — never a refusal (EX-003)', () => {
    const captured = captureAuthority<PathPolicyT>(
      { ok: false, source: source('profiles/path-policy.json'), failure: 'EACCES' },
      { contract_id: 'path-policy', schema: PathPolicy },
    )
    expect('kind' in captured && captured.kind === 'operational_failure').toBe(true)
    if (!('kind' in captured)) throw new Error('expected operational failure')
    expect(JSON.stringify(captured)).not.toContain('"code"')
  })
})
