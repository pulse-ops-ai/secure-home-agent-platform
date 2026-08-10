/**
 * Seal eligibility (design D7; RC-MUT-07 kill): complete inputs are
 * eligible with the prerequisites named; an undecided or invalid
 * prerequisite refuses naming it; an outcome inconsistent with the
 * bundle is irreconcilable; the predicate returns a decision only and is
 * identical on repeated evaluation (it sequences nothing).
 */
import { describe, expect, it } from 'vitest'
import { deriveAuthoritativeChangeSet } from '../workspace/index.js'
import { reconcileClaims } from '../reconciliation/index.js'
import { constructEvidence } from './construct.js'
import { decideSealEligibility } from './seal.js'
import {
  capturedPolicy,
  capturedProfile,
  capturedRegistry,
  digestHex,
} from '../testing-fixtures.js'

const bundle = () => {
  const observed = (() => {
    const decision = deriveAuthoritativeChangeSet({ ok: true, changes: [] })
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
      run_id: 'run-20260810-0002',
      image_digest: digestHex('a'),
      argv_digest: digestHex('b'),
      runtime: 'runc 1.3.1',
      provider: 'example-provider',
      adapter: 'copilot-cli',
    },
    principal: { sub: 'agent:home-status', acting: { kind: 'autonomous' } },
    operations: { attempted: [], permitted: [], denied: [] },
    gate_results: {},
    artifacts: { ok: true, artifacts: [] },
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

describe('seal eligibility (D7)', () => {
  it('complete, consistent inputs are eligible, naming the prerequisites checked', () => {
    const doc = bundle()
    const decision = decideSealEligibility({ bundle: doc, outcome: doc.outcome })
    if (decision.kind !== 'proceed') throw new Error('expected proceed')
    expect(decision.value.prerequisites_checked).toEqual([
      'evidence_bundle',
      'terminal_outcome',
      'outcome_consistency',
    ])
  })

  it('an undecided bundle prerequisite refuses naming it (RC-MUT-07)', () => {
    const decision = decideSealEligibility({
      bundle: undefined,
      outcome: { terminal_state: 'COMPLETED' },
    })
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('seal_prerequisite')
    expect(decision.violated.element).toBe('evidence_bundle')
  })

  it('an invalid bundle is never seal-eligible', () => {
    const decision = decideSealEligibility({
      bundle: { contract_id: 'evidence-bundle' },
      outcome: { terminal_state: 'COMPLETED' },
    })
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('seal_prerequisite')
  })

  it('an undecided outcome prerequisite refuses naming it', () => {
    const decision = decideSealEligibility({ bundle: bundle(), outcome: undefined })
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.violated.element).toBe('terminal_outcome')
  })

  it('an outcome inconsistent with the bundle is irreconcilable', () => {
    const decision = decideSealEligibility({
      bundle: bundle(),
      outcome: { terminal_state: 'CANCELLED', detail: 'operator cancel' },
    })
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('inconsistent_evidence')
  })

  it('the predicate is pure: repeated evaluation is identical and returns a decision only', () => {
    const doc = bundle()
    const first = decideSealEligibility({ bundle: doc, outcome: doc.outcome })
    const second = decideSealEligibility({ bundle: doc, outcome: doc.outcome })
    expect(second).toEqual(first)
  })
})
