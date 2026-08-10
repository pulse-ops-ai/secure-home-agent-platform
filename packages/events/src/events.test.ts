/**
 * C-EX-001 (fixtures), C-PROP-003 (closed vocabularies), C-ADV-006 +
 * C-MUT-005 kill (provider names never validate as event types),
 * C-EX-005 (shared primitives are the contracts exports, by instance —
 * no second definition), ADV-012 shape (only COMPLETED maps to success),
 * runtime-as-data, plus the review's MF4/MF5: the outcome union makes
 * contradictory terminal states unrepresentable, and every event type's
 * payload is contracted.
 */
import { describe, expect, it } from 'vitest'
import {
  CapabilityGrant,
  GateRegistryAuthorityIdentity,
  GateResults,
  PathPolicyAuthorityIdentity,
  ProfileIdentity,
} from '@secure-home/contracts'
import { EvidenceBundle } from './evidence.js'
import { EVENT_TYPES, RunEvent } from './run-events.js'
import { RunOutcome, RunRecord, TERMINAL_SUCCESS, TerminalState } from './run-record.js'

const digestOf = (letter: string) => `sha256:${letter.repeat(64)}`

const profile = {
  name: 'home-status-read',
  version: '1.0.0',
  digest: digestOf('a'),
}

const grant = {
  tools: ['household.read'],
  mounts: [{ path: '/workspace', posture: 'read_only' as const }],
  network: { default: 'deny' as const, granted_destinations: [] },
  credentials: [],
}

const outcomes = {
  COMPLETED: { terminal_state: 'COMPLETED' as const },
  REFUSED: {
    terminal_state: 'REFUSED' as const,
    failure: { class: 'contract_refusal' as const, detail: 'profile missing' },
  },
  OPERATIONAL_FAILURE: {
    terminal_state: 'OPERATIONAL_FAILURE' as const,
    failure: { class: 'operational' as const, detail: 'runtime unavailable' },
  },
  CANCELLED: { terminal_state: 'CANCELLED' as const, detail: 'operator cancel' },
  TIMED_OUT: { terminal_state: 'TIMED_OUT' as const, detail: 'wall clock exceeded' },
  INDETERMINATE: {
    terminal_state: 'INDETERMINATE' as const,
    detail: 'terminal evidence incomplete',
  },
}

const validRecord = () => ({
  contract_id: 'run-record' as const,
  contract_version: '1.0.0' as const,
  run_id: 'run-20260809-0001',
  profile,
  outcome: outcomes.COMPLETED,
  evidence: { bundle_digest: digestOf('c') },
})

describe('run outcome union (MF4: contradictions unrepresentable)', () => {
  it('every terminal state has exactly one valid outcome shape', () => {
    for (const outcome of Object.values(outcomes)) {
      expect(RunOutcome.safeParse(outcome).success).toBe(true)
    }
  })

  it('COMPLETED with a failure is unrepresentable', () => {
    expect(
      RunOutcome.safeParse({
        terminal_state: 'COMPLETED',
        failure: { class: 'operational', detail: 'x' },
      }).success,
    ).toBe(false)
  })

  it('REFUSED without contract_refusal detail is unrepresentable', () => {
    expect(RunOutcome.safeParse({ terminal_state: 'REFUSED' }).success).toBe(false)
    expect(
      RunOutcome.safeParse({
        terminal_state: 'REFUSED',
        failure: { class: 'operational', detail: 'x' },
      }).success,
    ).toBe(false)
  })

  it('OPERATIONAL_FAILURE with contract_refusal is unrepresentable', () => {
    expect(
      RunOutcome.safeParse({
        terminal_state: 'OPERATIONAL_FAILURE',
        failure: { class: 'contract_refusal', detail: 'x' },
      }).success,
    ).toBe(false)
  })

  it('cancellation/timeout/indeterminate require their explicit detail', () => {
    for (const state of ['CANCELLED', 'TIMED_OUT', 'INDETERMINATE'] as const) {
      expect(RunOutcome.safeParse({ terminal_state: state }).success).toBe(false)
    }
  })

  it('the union covers the enumerated vocabulary exactly', () => {
    const unionStates = RunOutcome.options.map((option) => option.shape.terminal_state.value).sort()
    expect(unionStates).toEqual([...TerminalState.options].sort())
  })
})

describe('run record (C-EX-001, C-PROP-003)', () => {
  it('validates and requires evidence structurally', () => {
    expect(RunRecord.safeParse(validRecord()).success).toBe(true)
    const doc: Record<string, unknown> = { ...validRecord() }
    delete doc['evidence']
    expect(RunRecord.safeParse(doc).success).toBe(false)
  })

  it('out-of-vocabulary terminal states refuse', () => {
    for (const bad of ['SUCCEEDED', 'completed', 'DONE', 'UNKNOWN', '']) {
      expect(
        RunRecord.safeParse({ ...validRecord(), outcome: { terminal_state: bad } }).success,
      ).toBe(false)
    }
  })

  it('only COMPLETED maps to success; INDETERMINATE is failure (ADV-012 shape)', () => {
    expect(TERMINAL_SUCCESS.COMPLETED).toBe(true)
    const failures = TerminalState.options.filter((s) => !TERMINAL_SUCCESS[s])
    expect(failures).toHaveLength(TerminalState.options.length - 1)
    expect(TERMINAL_SUCCESS.INDETERMINATE).toBe(false)
  })
})

describe('run events (MF5: payloads contracted per type)', () => {
  const envelope = {
    contract_id: 'run-event' as const,
    contract_version: '1.0.0' as const,
    run_id: 'run-20260809-0001',
    sequence: 1,
    timestamp: '2026-08-09T12:00:00Z',
    adapter: 'copilot-cli',
    provider: 'example-provider',
  }

  const payloads: Record<(typeof EVENT_TYPES)[number], Record<string, unknown>> = {
    'run.started': { profile },
    'capability.granted': { grant },
    'call.attempted': {
      call_id: 'call-0001',
      operation: { name: 'household.read', target: 'garage.door' },
    },
    'call.disposition': { call_id: 'call-0001', disposition: 'permitted' },
    'adapter.started': {},
    'adapter.completed': {},
    'run.terminated': { outcome: outcomes.COMPLETED },
  }

  it('every platform event type validates with its contracted payload', () => {
    for (const eventType of EVENT_TYPES) {
      expect(
        RunEvent.safeParse({ ...envelope, event_type: eventType, ...payloads[eventType] }).success,
      ).toBe(true)
    }
  })

  it('a grant event without a grant is unrepresentable', () => {
    expect(RunEvent.safeParse({ ...envelope, event_type: 'capability.granted' }).success).toBe(
      false,
    )
  })

  it('a grant on run.started is unrepresentable', () => {
    expect(
      RunEvent.safeParse({ ...envelope, event_type: 'run.started', profile, grant }).success,
    ).toBe(false)
  })

  it('call events carry correlation and structure', () => {
    expect(
      RunEvent.safeParse({
        ...envelope,
        event_type: 'call.attempted',
        operation: { name: 'household.read' },
      }).success,
    ).toBe(false)
    expect(
      RunEvent.safeParse({ ...envelope, event_type: 'call.disposition', call_id: 'call-0001' })
        .success,
    ).toBe(false)
  })

  it('run.terminated requires the shared outcome', () => {
    expect(RunEvent.safeParse({ ...envelope, event_type: 'run.terminated' }).success).toBe(false)
  })

  it('provider-native names refuse in the event_type position (C-ADV-006)', () => {
    for (const providerName of [
      'tool_use',
      'assistant.turn.completed',
      'session-log',
      'run.started.v2',
      'RUN.STARTED',
    ]) {
      expect(
        RunEvent.safeParse({ ...envelope, event_type: providerName, ...payloads['run.started'] })
          .success,
      ).toBe(false)
    }
  })

  it('provider naming rides as opaque data', () => {
    const parsed = RunEvent.parse({
      ...envelope,
      event_type: 'call.attempted',
      call_id: 'call-0001',
      operation: { name: 'household.read' },
      provider_event_name: 'tool_use',
      provider_metadata: { native_id: 'toolu_123' },
    })
    expect(parsed.provider_event_name).toBe('tool_use')
  })
})

describe('shared shapes are single instances (C-EX-005)', () => {
  const shapeFor = (eventType: string): Record<string, unknown> | undefined => {
    const option = RunEvent.options.find(
      (candidate) => candidate.shape.event_type.value === eventType,
    )
    if (option === undefined) return undefined
    return Object.fromEntries(Object.entries(option.shape))
  }

  it('the capability.granted payload IS CapabilityGrant, by instance', () => {
    expect(shapeFor('capability.granted')?.['grant']).toBe(CapabilityGrant)
  })

  it('run outcome is one instance across record, evidence, and termination event', () => {
    expect(RunRecord.shape.outcome).toBe(RunOutcome)
    expect(EvidenceBundle.shape.outcome).toBe(RunOutcome)
    expect(shapeFor('run.terminated')?.['outcome']).toBe(RunOutcome)
  })

  it('evidence reuses the primitives by instance — no second definition', () => {
    expect(EvidenceBundle.shape.granted_capabilities).toBe(CapabilityGrant)
    expect(EvidenceBundle.shape.gate_results).toBe(GateResults)
    expect(EvidenceBundle.shape.identities.shape.profile).toBe(ProfileIdentity)
    expect(RunRecord.shape.profile).toBe(ProfileIdentity)
    // CC-EX-05: the authority identities are the contracts instances too —
    // the per-contract specializations, not a redefined shape.
    expect(EvidenceBundle.shape.identities.shape.path_policy).toBe(PathPolicyAuthorityIdentity)
    expect(EvidenceBundle.shape.identities.shape.gate_registry).toBe(GateRegistryAuthorityIdentity)
  })
})

describe('evidence bundle (C-EX-001, runtime-as-data, C-ADV-002)', () => {
  const bundle = () => ({
    contract_id: 'evidence-bundle' as const,
    contract_version: '2.0.0' as const,
    identities: {
      run_id: 'run-20260809-0001',
      profile,
      image_digest: digestOf('d'),
      argv_digest: digestOf('e'),
      path_policy: {
        contract_id: 'path-policy',
        contract_version: '2.0.0',
        digest: digestOf('1'),
      },
      gate_registry: {
        contract_id: 'gate-registry',
        contract_version: '1.0.0',
        digest: digestOf('2'),
      },
      runtime: 'runc 1.3.1',
      provider: 'example-provider',
      adapter: 'copilot-cli',
    },
    principal: {
      sub: 'agent:home-status',
      acting: { kind: 'autonomous' as const },
    },
    granted_capabilities: grant,
    operations: {
      attempted: [
        {
          call_id: 'call-0001',
          operation: { name: 'household.read', target: 'garage.door' },
        },
      ],
      permitted: [
        {
          call_id: 'call-0001',
          operation: { name: 'household.read', target: 'garage.door' },
        },
      ],
      denied: [],
    },
    gate_results: {
      lint: { disposition: 'PASS' as const, truncated: false as const },
    },
    artifacts: [{ path: 'out/result.json', digest: digestOf('f'), bytes: 128 }],
    change_sets: {
      authoritative: 'observed' as const,
      observed: [{ path: 'src/a.ts', kind: 'modified' as const }],
      claimed: [
        { path: 'src/a.ts', kind: 'modified' as const },
        { path: 'src/b.ts', kind: 'modified' as const },
      ],
      reconciliation: {
        agreement: false,
        disagreements: [{ path: 'src/b.ts', detail: 'claimed but not observed' }],
      },
    },
    outcome: outcomes.COMPLETED,
    timing: {
      started_at: '2026-08-09T12:00:00Z',
      finished_at: '2026-08-09T12:05:00Z',
      duration_seconds: 300,
    },
  })

  it('validates a representationally complete bundle', () => {
    expect(EvidenceBundle.safeParse(bundle()).success).toBe(true)
  })

  it('evidence names every governing authority input (CC-EX-02, CC-MUT-02 kill)', () => {
    for (const field of ['path_policy', 'gate_registry'] as const) {
      const doc = bundle() as unknown as Record<string, unknown>
      const identities = { ...(doc['identities'] as Record<string, unknown>) }
      delete identities[field]
      expect(
        EvidenceBundle.safeParse({ ...doc, identities }).success,
        `a bundle omitting identities.${field} must not validate`,
      ).toBe(false)
    }
  })

  it('a mislabeled or swapped authority identity is unrepresentable (Codex P1)', () => {
    const doc = bundle() as unknown as Record<string, unknown>
    const identities = doc['identities'] as Record<string, unknown>
    const mislabeled = [
      { field: 'path_policy', contract_id: 'gate-registry' },
      { field: 'path_policy', contract_id: 'execution-profile' },
      { field: 'gate_registry', contract_id: 'path-policy' },
      { field: 'gate_registry', contract_id: 'anything-else' },
    ]
    for (const { field, contract_id } of mislabeled) {
      expect(
        EvidenceBundle.safeParse({
          ...doc,
          identities: {
            ...identities,
            [field]: { contract_id, contract_version: '1.0.0', digest: digestOf('9') },
          },
        }).success,
        `identities.${field} must refuse contract_id ${JSON.stringify(contract_id)}`,
      ).toBe(false)
    }
  })

  it('a value-shaped authority identity refuses (no credential-slot regression)', () => {
    const doc = bundle() as unknown as Record<string, unknown>
    const identities = doc['identities'] as Record<string, unknown>
    expect(
      EvidenceBundle.safeParse({
        ...doc,
        identities: {
          ...identities,
          path_policy: { contract_id: 'path-policy', contract_version: '2.0.0', value: 'secret' },
        },
      }).success,
    ).toBe(false)
  })

  it('gate semantics hold at the evidence boundary (B2): PASS+truncated refuses', () => {
    const doc = bundle() as unknown as Record<string, unknown>
    expect(
      EvidenceBundle.safeParse({
        ...doc,
        gate_results: { lint: { disposition: 'PASS', truncated: true } },
      }).success,
    ).toBe(false)
    expect(
      EvidenceBundle.safeParse({
        ...doc,
        gate_results: { lint: { disposition: 'FAIL', truncated: false } },
      }).success,
    ).toBe(false)
  })

  it('contradictory outcomes refuse at the evidence boundary (MF4)', () => {
    const doc = bundle() as unknown as Record<string, unknown>
    expect(
      EvidenceBundle.safeParse({
        ...doc,
        outcome: {
          terminal_state: 'COMPLETED',
          failure: { class: 'operational', detail: 'x' },
        },
      }).success,
    ).toBe(false)
  })

  it('runtime identity is data, never schema: two runtimes, one schema', () => {
    for (const runtime of ['runc 1.3.1', 'kata-runtime 4.0.2']) {
      const doc = bundle()
      doc.identities.runtime = runtime
      expect(EvidenceBundle.safeParse(doc).success).toBe(true)
    }
  })

  it('claims and observation are both representable, observation authoritative', () => {
    const doc = bundle() as unknown as Record<string, unknown>
    const changeSets = doc['change_sets'] as Record<string, unknown>
    expect(
      EvidenceBundle.safeParse({
        ...doc,
        change_sets: { ...changeSets, authoritative: 'claimed' },
      }).success,
    ).toBe(false)
  })

  it('the explicit autonomous marker is required — a bare missing actor refuses', () => {
    const doc = bundle() as unknown as Record<string, unknown>
    expect(
      EvidenceBundle.safeParse({
        ...doc,
        principal: { sub: 'agent:home-status' },
      }).success,
    ).toBe(false)
  })

  it('no designated credential-value slot in evidence structures (C-ADV-002)', () => {
    const doc = bundle() as unknown as Record<string, unknown>
    const identities = doc['identities'] as Record<string, unknown>
    expect(
      EvidenceBundle.safeParse({
        ...doc,
        identities: { ...identities, credential_value: 'gho_abcdefghijklmnop' },
      }).success,
    ).toBe(false)
  })
})
