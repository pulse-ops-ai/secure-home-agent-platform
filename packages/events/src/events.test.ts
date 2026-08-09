/**
 * C-EX-001 (run record, events, evidence fixtures), C-PROP-003 (terminal
 * and event vocabularies closed), C-ADV-006 + C-MUT-005 kill (provider
 * names never validate as event types), C-EX-005 (shared primitives are
 * the contracts exports, by instance identity — no second definition),
 * ADV-012 shape (INDETERMINATE never maps to success), runtime-as-data.
 */
import { describe, expect, it } from 'vitest'
import { CapabilityGrant, GateResultSetBase, ProfileIdentity } from '@secure-home/contracts'
import { EvidenceBundle } from './evidence.js'
import { EVENT_TYPES, RunEvent } from './run-events.js'
import { RunRecord, TERMINAL_SUCCESS, TerminalState } from './run-record.js'

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

const validRecord = () => ({
  contract_id: 'run-record' as const,
  contract_version: '1.0.0' as const,
  run_id: 'run-20260809-0001',
  profile,
  terminal_state: 'COMPLETED' as const,
  evidence: { bundle_digest: digestOf('c') },
})

describe('run record (C-EX-001, C-PROP-003)', () => {
  it('validates and requires evidence structurally', () => {
    expect(RunRecord.safeParse(validRecord()).success).toBe(true)
    const doc: Record<string, unknown> = { ...validRecord() }
    delete doc['evidence']
    expect(RunRecord.safeParse(doc).success).toBe(false)
  })

  it('the terminal vocabulary is closed and enumerated', () => {
    for (const state of TerminalState.options) {
      expect(RunRecord.safeParse({ ...validRecord(), terminal_state: state }).success).toBe(true)
    }
    for (const bad of ['SUCCEEDED', 'completed', 'DONE', 'UNKNOWN', '']) {
      expect(RunRecord.safeParse({ ...validRecord(), terminal_state: bad }).success).toBe(false)
    }
  })

  it('only COMPLETED maps to success; INDETERMINATE is failure (ADV-012 shape)', () => {
    expect(TERMINAL_SUCCESS.COMPLETED).toBe(true)
    const failures = TerminalState.options.filter((s) => !TERMINAL_SUCCESS[s])
    expect(failures).toHaveLength(TerminalState.options.length - 1)
    expect(TERMINAL_SUCCESS.INDETERMINATE).toBe(false)
  })
})

describe('run events (C-PROP-003, C-ADV-006)', () => {
  const validEvent = () => ({
    contract_id: 'run-event' as const,
    contract_version: '1.0.0' as const,
    event_type: 'capability.granted' as const,
    run_id: 'run-20260809-0001',
    sequence: 1,
    timestamp: '2026-08-09T12:00:00Z',
    adapter: 'copilot-cli',
    provider: 'example-provider',
    grant,
  })

  it('every platform event type validates with one shape', () => {
    for (const eventType of EVENT_TYPES) {
      expect(RunEvent.safeParse({ ...validEvent(), event_type: eventType }).success).toBe(true)
    }
  })

  it('provider-native names refuse in the event_type position (C-ADV-006)', () => {
    for (const providerName of [
      'tool_use',
      'assistant.turn.completed',
      'session-log',
      'run.started.v2',
      'RUN.STARTED',
    ]) {
      expect(RunEvent.safeParse({ ...validEvent(), event_type: providerName }).success).toBe(false)
    }
  })

  it('provider naming rides as opaque data', () => {
    const parsed = RunEvent.parse({
      ...validEvent(),
      event_type: 'call.attempted',
      provider_event_name: 'tool_use',
      provider_metadata: { native_id: 'toolu_123' },
    })
    expect(parsed.provider_event_name).toBe('tool_use')
  })
})

describe('shared primitives are the contracts exports (C-EX-005)', () => {
  it('the capability.granted payload IS CapabilityGrant, by instance', () => {
    const grantField = RunEvent.shape.grant
    expect(grantField.unwrap()).toBe(CapabilityGrant)
  })

  it('evidence reuses the primitives by instance — no second definition', () => {
    expect(EvidenceBundle.shape.granted_capabilities).toBe(CapabilityGrant)
    expect(EvidenceBundle.shape.gate_results).toBe(GateResultSetBase)
    expect(EvidenceBundle.shape.identities.shape.profile).toBe(ProfileIdentity)
    expect(RunRecord.shape.profile).toBe(ProfileIdentity)
  })
})

describe('evidence bundle (C-EX-001, runtime-as-data, C-ADV-002)', () => {
  const bundle = () => ({
    contract_id: 'evidence-bundle' as const,
    contract_version: '1.0.0' as const,
    identities: {
      run_id: 'run-20260809-0001',
      profile,
      image_digest: digestOf('d'),
      argv_digest: digestOf('e'),
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
      attempted: [{ name: 'household.read', target: 'garage.door' }],
      permitted: [{ name: 'household.read', target: 'garage.door' }],
      denied: [],
    },
    gate_results: {
      results: [{ gate_id: 'lint', disposition: 'PASS' as const, truncated: false }],
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
    outcome: { terminal_state: 'COMPLETED' as const },
    timing: {
      started_at: '2026-08-09T12:00:00Z',
      finished_at: '2026-08-09T12:05:00Z',
      duration_seconds: 300,
    },
  })

  it('validates a representationally complete bundle', () => {
    expect(EvidenceBundle.safeParse(bundle()).success).toBe(true)
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
