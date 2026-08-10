/**
 * The eligibility decision table, one deterministic fixture per row
 * (requirement "Eligibility refuses rather than defaults"): missing
 * profile, invalid profile, missing policy, malformed policy, missing
 * registry with gates requested, undeclared gate, duplicate gate
 * (RC-ADV-10), all-declared eligible, and the undecidable row. RC-MUT-04
 * kill: no branch defaults to eligible — every refusal fixture fails if
 * one does.
 */
import { describe, expect, it } from 'vitest'
import { PathPolicy, type PathPolicyT } from '@secure-home/contracts'
import { captureAuthority } from '../authority/index.js'
import type { AuthoritySnapshots } from '../authority/index.js'
import { decideEligibility } from './decide.js'
import {
  bytesOf,
  capturedPolicy,
  capturedProfile,
  capturedRegistry,
  policyDocument,
} from '../testing-fixtures.js'

const fullSnapshots = (): AuthoritySnapshots => ({
  profile: capturedProfile(),
  path_policy: capturedPolicy(),
  gate_registry: capturedRegistry(),
})

describe('eligibility decision table', () => {
  it('missing profile refuses before spend, naming the profile', () => {
    const { profile, ...rest } = fullSnapshots()
    void profile
    const decision = decideEligibility(rest, [])
    expect(decision.kind).toBe('refusal')
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('missing_authority')
    expect(decision.violated.element).toBe('execution-profile')
  })

  it('an invalid captured profile refuses with the capture refusal', () => {
    const invalid = captureAuthority<PathPolicyT>(
      bytesOf({ contract_id: 'execution-profile' }, 'profiles/broken.json'),
      { contract_id: 'execution-profile', schema: PathPolicy },
    )
    if ('kind' in invalid) throw new Error('unexpected operational failure')
    const decision = decideEligibility(
      { ...fullSnapshots(), profile: invalid as unknown as never },
      [],
    )
    expect(decision.kind).toBe('refusal')
  })

  it('missing policy refuses — required authority', () => {
    const { path_policy, ...rest } = fullSnapshots()
    void path_policy
    const decision = decideEligibility(rest, [])
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('missing_authority')
    expect(decision.violated.element).toBe('path-policy')
  })

  it('malformed policy refuses with the capture refusal', () => {
    const malformed = capturedPolicy({ ...policyDocument(), max_files: -1 })
    expect(malformed.ok).toBe(false)
    const decision = decideEligibility({ ...fullSnapshots(), path_policy: malformed }, [])
    expect(decision.kind).toBe('refusal')
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('invalid_authority')
  })

  it('gates requested with no registry refuses', () => {
    const { gate_registry, ...rest } = fullSnapshots()
    void gate_registry
    const decision = decideEligibility(rest, ['lint'])
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('missing_authority')
    expect(decision.violated.element).toBe('gate-registry')
  })

  it('an undeclared gate refuses naming the identity; no partial eligibility', () => {
    const decision = decideEligibility(fullSnapshots(), ['lint', 'not-declared'])
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('undeclared_gate')
    expect(decision.violated.element).toBe('not-declared')
    expect(JSON.stringify(decision)).not.toContain('"eligible"')
  })

  it('RC-ADV-10: a duplicate gate identity refuses naming the duplication', () => {
    const decision = decideEligibility(fullSnapshots(), ['lint', 'lint'])
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('duplicate_gate')
    expect(decision.violated.element).toBe('lint')
  })

  it('all declared gates are eligible, identities recorded', () => {
    const decision = decideEligibility(fullSnapshots(), ['unit-tests', 'lint'])
    expect(decision.kind).toBe('proceed')
    if (decision.kind !== 'proceed') throw new Error('expected proceed')
    expect(decision.value.gates).toEqual(['lint', 'unit-tests'])
    expect(decision.value.profile.contract_id).toBe('execution-profile')
    expect(decision.value.path_policy.contract_id).toBe('path-policy')
    expect(decision.value.gate_registry?.contract_id).toBe('gate-registry')
  })

  it('no gates requested is eligible without a registry', () => {
    const { gate_registry, ...rest } = fullSnapshots()
    void gate_registry
    const decision = decideEligibility(rest, [])
    expect(decision.kind).toBe('proceed')
    if (decision.kind !== 'proceed') throw new Error('expected proceed')
    expect(decision.value.gate_registry).toBeNull()
  })

  it('an unestablishable snapshot state refuses as undecidable — never eligible', () => {
    const forged = { ok: 'maybe' } as never
    const decision = decideEligibility({ ...fullSnapshots(), profile: forged }, [])
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('undecidable')
  })

  it('RC-MUT-04: missing authority never becomes permission, on any branch', () => {
    const complete = fullSnapshots()
    for (const member of ['profile', 'path_policy'] as const) {
      const partial: Record<string, unknown> = { ...complete }
      delete partial[member]
      const decision = decideEligibility(partial, [])
      expect(decision.kind).toBe('refusal')
    }
  })
})
