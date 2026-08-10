/**
 * Evidence construction (requirement "Evidence is constructed only from
 * authoritative inputs"): the bundle validates against the amended v2
 * contract with the governing path-policy and gate-registry authority
 * identities populated from the captured snapshots (task 5.1); claims
 * reach only the claim fields; a missing authoritative input refuses
 * with NO partial bundle; RC-ADV-02 (for a success outcome the bound
 * refusal precedes construction); ADV-011 (evidence-establishment
 * failure classifies as failure, never success).
 */
import { describe, expect, it } from 'vitest'
import { EvidenceBundle, TERMINAL_SUCCESS, TerminalState } from '@secure-home/events'
import { deriveAuthoritativeChangeSet } from '../workspace/index.js'
import { reconcileClaims } from '../reconciliation/index.js'
import { classifyEvidenceFailure, indeterminateOutcome } from './classify.js'
import { constructEvidence, type EvidenceInputs } from './construct.js'
import {
  capturedPolicy,
  capturedProfile,
  capturedRegistry,
  digestHex,
} from '../testing-fixtures.js'

const observedOf = (changes: { path: string; bytes?: number }[]) => {
  const decision = deriveAuthoritativeChangeSet({
    ok: true,
    changes: changes.map((entry) => ({
      path: entry.path,
      kind: 'modified' as const,
      bytes: entry.bytes ?? 10,
    })),
  })
  if (decision.kind !== 'proceed') throw new Error('fixture derivation failed')
  return decision.value
}

const inputs = (overrides: Partial<EvidenceInputs> = {}): EvidenceInputs => {
  const observed = observedOf([{ path: 'packages/a.ts' }])
  return {
    snapshots: {
      profile: capturedProfile(),
      path_policy: capturedPolicy(),
      gate_registry: capturedRegistry(),
    },
    run: {
      run_id: 'run-20260810-0001',
      image_digest: digestHex('a'),
      argv_digest: digestHex('b'),
      runtime: 'runc 1.3.1',
      provider: 'example-provider',
      adapter: 'copilot-cli',
    },
    principal: { sub: 'agent:home-status', acting: { kind: 'autonomous' } },
    operations: { attempted: [], permitted: [], denied: [] },
    gate_results: { lint: { disposition: 'PASS', truncated: false } },
    artifacts: { ok: true, artifacts: [{ path: 'packages/a.ts', content: 'export {}\n' }] },
    observed,
    reconciliation: reconcileClaims(observed, [{ path: 'packages/a.ts', kind: 'modified' }]),
    outcome: { terminal_state: 'COMPLETED' },
    timing: {
      started_at: '2026-08-10T12:00:00Z',
      finished_at: '2026-08-10T12:05:00Z',
      duration_seconds: 300,
    },
    ...overrides,
  }
}

describe('construction from authoritative inputs (task 5.1)', () => {
  it('constructs a contract-valid v2 bundle with both authority identities from the snapshots', () => {
    const decision = constructEvidence(inputs())
    if (decision.kind !== 'proceed') throw new Error(JSON.stringify(decision))
    const bundle = decision.value
    expect(EvidenceBundle.safeParse(bundle).success).toBe(true)
    const policy = capturedPolicy()
    const registry = capturedRegistry()
    if (!policy.ok || !registry.ok) throw new Error('fixture')
    expect(bundle.identities.path_policy).toEqual(policy.contract)
    expect(bundle.identities.gate_registry).toEqual(registry.contract)
    expect(bundle.identities.path_policy.contract_id).toBe('path-policy')
    expect(bundle.identities.gate_registry.contract_id).toBe('gate-registry')
  })

  it('claims reach only the claim fields', () => {
    const observed = observedOf([{ path: 'packages/a.ts' }])
    const decision = constructEvidence(
      inputs({
        observed,
        reconciliation: reconcileClaims(observed, [
          { path: 'packages/a.ts', kind: 'modified' },
          { path: 'packages/ghost.ts', kind: 'created' },
        ]),
      }),
    )
    if (decision.kind !== 'proceed') throw new Error('expected proceed')
    const bundle = decision.value
    expect(bundle.change_sets.observed.map((change) => change.path)).toEqual(['packages/a.ts'])
    expect(bundle.change_sets.claimed.map((change) => change.path)).toContain('packages/ghost.ts')
    expect(bundle.artifacts.map((artifact) => artifact.path)).not.toContain('packages/ghost.ts')
    expect(bundle.change_sets.authoritative).toBe('observed')
  })

  it('a missing authoritative input refuses; no partial bundle is returned', () => {
    for (const member of ['profile', 'path_policy', 'gate_registry'] as const) {
      const full = inputs()
      const snapshots: Record<string, unknown> = { ...full.snapshots }
      delete snapshots[member]
      const decision = constructEvidence({
        ...full,
        snapshots: snapshots,
      })
      expect(decision.kind).toBe('refusal')
      expect(JSON.stringify(decision)).not.toContain('"identities"')
    }
  })

  it('an unobservable artifact surface refuses construction', () => {
    const decision = constructEvidence(inputs({ artifacts: { ok: false, failure: 'EIO' } }))
    expect(decision.kind).toBe('refusal')
  })

  it('RC-ADV-02: for a success outcome, the bound refusal precedes construction', () => {
    const observed = observedOf([{ path: 'packages/big.ts', bytes: 999999 }])
    const decision = constructEvidence(
      inputs({ observed, reconciliation: reconcileClaims(observed, undefined) }),
    )
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('over_bound')
    expect(JSON.stringify(decision)).not.toContain('"identities"')
  })

  it('a failure-classified run still constructs evidence over the same set (INV-003)', () => {
    const observed = observedOf([{ path: 'packages/big.ts', bytes: 999999 }])
    const decision = constructEvidence(
      inputs({
        observed,
        reconciliation: reconcileClaims(observed, undefined),
        outcome: {
          terminal_state: 'REFUSED',
          failure: { class: 'contract_refusal', detail: 'over_bound: max_file_bytes' },
        },
      }),
    )
    expect(decision.kind).toBe('proceed')
  })

  it('artifact digests are recomputed from observed content', () => {
    const decision = constructEvidence(inputs())
    if (decision.kind !== 'proceed') throw new Error('expected proceed')
    const artifact = decision.value.artifacts[0]
    expect(artifact?.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(artifact?.bytes).toBe(10)
  })
})

describe('failure classification is never success (ADV-011)', () => {
  it('refusals classify REFUSED; operational faults OPERATIONAL_FAILURE; neither is success', () => {
    const refusalOutcome = classifyEvidenceFailure({
      kind: 'refusal',
      code: 'missing_authority',
      violated: { element: 'execution-profile' },
      detail: 'x',
    })
    expect(refusalOutcome.terminal_state).toBe('REFUSED')
    const operationalOutcome = classifyEvidenceFailure({
      kind: 'operational_failure',
      source: 'workspace',
      detail: 'EIO',
    })
    expect(operationalOutcome.terminal_state).toBe('OPERATIONAL_FAILURE')
    for (const outcome of [refusalOutcome, operationalOutcome, indeterminateOutcome('unknown')]) {
      expect(TERMINAL_SUCCESS[outcome.terminal_state]).toBe(false)
    }
  })

  it('INDETERMINATE is the fail-closed class and maps to failure in the shared authority', () => {
    expect(indeterminateOutcome('cannot establish').terminal_state).toBe('INDETERMINATE')
    expect(TerminalState.options.filter((state) => TERMINAL_SUCCESS[state])).toEqual(['COMPLETED'])
  })
})
