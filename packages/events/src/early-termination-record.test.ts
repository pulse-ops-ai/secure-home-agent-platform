/**
 * The early-termination-record proof net (change
 * `runner-early-terminal-record`):
 *
 *  ET-EX-01 / ET-ADV-05  authority-bearing fields are unrepresentable
 *  ET-EX-02 / ET-ADV-06  requested reference is data — null or digest-free
 *  ET-EX-03              shared shapes consumed BY INSTANCE
 *  ET-EX-05 / ET-ADV-04  the requester is mandatory
 *  ET-EX-06 / ET-ADV-02  success is absent from the outcome union
 *  ET-PROP-01            every requester × reference × non-success case
 *  ET-PROP-02            every evidence-ONLY key refuses
 */
import { describe, expect, it } from 'vitest'
import { ProfileRef } from '@secure-home/contracts'
import {
  EarlyTerminationRecord,
  EARLY_TERMINATION_RECORD_VERSION,
} from './early-termination-record.js'
import { EvidenceTiming, Principal } from './evidence.js'
import { NonSuccessOutcome, RunId, RunOutcome, TERMINAL_SUCCESS } from './run-record.js'

const timing = {
  started_at: '2026-08-12T12:00:00Z',
  finished_at: '2026-08-12T12:00:03Z',
  duration_seconds: 3,
}

const nonSuccessOutcomes = [
  {
    terminal_state: 'REFUSED' as const,
    failure: { class: 'contract_refusal' as const, detail: 'profile did not resolve' },
  },
  {
    terminal_state: 'OPERATIONAL_FAILURE' as const,
    failure: { class: 'operational' as const, detail: 'policy source unreadable' },
  },
  { terminal_state: 'CANCELLED' as const, detail: 'operator cancel' },
  { terminal_state: 'TIMED_OUT' as const, detail: 'acquisition budget exceeded' },
  { terminal_state: 'INDETERMINATE' as const, detail: 'terminal state unestablishable' },
]

const record = () => ({
  contract_id: 'early-termination-record' as const,
  contract_version: EARLY_TERMINATION_RECORD_VERSION,
  run_id: 'run-20260812-0001',
  requester: { sub: 'human:mike', acting: { kind: 'autonomous' as const } },
  requested_profile: { name: 'home-status-read', version: '1.0.0' },
  outcome: nonSuccessOutcomes[0],
  timing,
})

describe('the record represents a pre-authority terminal (ET-EX-01/02)', () => {
  it('validates with a stated reference and with an explicit null', () => {
    expect(EarlyTerminationRecord.safeParse(record()).success).toBe(true)
    expect(EarlyTerminationRecord.safeParse({ ...record(), requested_profile: null }).success).toBe(
      true,
    )
  })

  it('ET-ADV-06: a digest-bearing reference refuses — the reference is data, not identity', () => {
    expect(
      EarlyTerminationRecord.safeParse({
        ...record(),
        requested_profile: {
          name: 'home-status-read',
          version: '1.0.0',
          digest: `sha256:${'a'.repeat(64)}`,
        },
      }).success,
    ).toBe(false)
  })

  it('ET-EX-01 / ET-ADV-05: no authority-bearing field is representable', () => {
    const authorityShaped: Record<string, unknown> = {
      identities: { run_id: 'x' },
      granted_capabilities: { tools: [] },
      gate_results: { lint: { disposition: 'PASS', truncated: false } },
      change_sets: { authoritative: 'observed' },
      artifacts: [],
      principal: { sub: 'agent:x', acting: { kind: 'autonomous' } },
      operations: { attempted: [], permitted: [], denied: [] },
    }
    for (const [key, value] of Object.entries(authorityShaped)) {
      expect(
        EarlyTerminationRecord.safeParse({ ...record(), [key]: value }).success,
        `${key} must be unrepresentable on an early-termination record`,
      ).toBe(false)
    }
  })
})

describe('the requester states who was refused (ET-EX-05, ET-ADV-04)', () => {
  it('is mandatory — a record omitting it does not validate', () => {
    const doc: Record<string, unknown> = { ...record() }
    delete doc['requester']
    expect(EarlyTerminationRecord.safeParse(doc).success).toBe(false)
  })

  it('accepts both an actor and an explicit autonomous marker', () => {
    for (const acting of [
      { kind: 'autonomous' as const },
      { kind: 'actor' as const, sub: 'human:mike' },
    ]) {
      expect(
        EarlyTerminationRecord.safeParse({
          ...record(),
          requester: { sub: 'agent:home-status', acting },
        }).success,
      ).toBe(true)
    }
  })

  it('carries no digest, grant, or capability field of its own', () => {
    for (const bad of [
      { sub: 'agent:x', acting: { kind: 'autonomous' }, digest: `sha256:${'a'.repeat(64)}` },
      { sub: 'agent:x', acting: { kind: 'autonomous' }, tools: ['household.read'] },
    ]) {
      expect(EarlyTerminationRecord.safeParse({ ...record(), requester: bad }).success).toBe(false)
    }
  })
})

describe('success is absent, not forbidden (ET-EX-06, ET-ADV-02)', () => {
  it('a record claiming the success state refuses at the contract', () => {
    expect(
      EarlyTerminationRecord.safeParse({
        ...record(),
        outcome: { terminal_state: 'COMPLETED' },
      }).success,
    ).toBe(false)
  })

  it('every admitted option is a failure under the shared success map', () => {
    for (const outcome of nonSuccessOutcomes) {
      expect(EarlyTerminationRecord.safeParse({ ...record(), outcome }).success).toBe(true)
      expect(TERMINAL_SUCCESS[outcome.terminal_state]).toBe(false)
    }
  })

  it('the narrowed union is the full vocabulary minus exactly the success option', () => {
    const all: string[] = RunOutcome.options.map((option) => option.shape.terminal_state.value)
    const narrowed: string[] = NonSuccessOutcome.options.map(
      (option) => option.shape.terminal_state.value,
    )
    expect(all.filter((state) => !narrowed.includes(state))).toEqual(['COMPLETED'])
  })

  it('EQ4: the narrowing REUSES the option instances — no second vocabulary exists', () => {
    for (const option of NonSuccessOutcome.options) {
      expect(
        RunOutcome.options.includes(option),
        `${option.shape.terminal_state.value} must be the same instance RunOutcome composes`,
      ).toBe(true)
    }
  })
})

describe('ET-EX-03: shared shapes are consumed by instance', () => {
  it('run id, requester, reference, outcome, and timing are the authored instances', () => {
    expect(EarlyTerminationRecord.shape.run_id).toBe(RunId)
    expect(EarlyTerminationRecord.shape.requester).toBe(Principal)
    expect(EarlyTerminationRecord.shape.timing).toBe(EvidenceTiming)
    expect(EarlyTerminationRecord.shape.outcome).toBe(NonSuccessOutcome)
    expect(EarlyTerminationRecord.shape.requested_profile.unwrap()).toBe(ProfileRef)
  })
})

describe('ET-PROP-01: every requester × reference × non-success combination', () => {
  it('validates and maps to failure', () => {
    const requesters = [
      { sub: 'human:mike', acting: { kind: 'autonomous' as const } },
      { sub: 'agent:home-status', acting: { kind: 'actor' as const, sub: 'human:mike' } },
    ]
    const references = [null, { name: 'home-status-read', version: '2.1.0' }]
    let checked = 0
    for (const requester of requesters) {
      for (const requested_profile of references) {
        for (const outcome of nonSuccessOutcomes) {
          const parsed = EarlyTerminationRecord.safeParse({
            ...record(),
            requester,
            requested_profile,
            outcome,
          })
          expect(parsed.success).toBe(true)
          expect(TERMINAL_SUCCESS[outcome.terminal_state]).toBe(false)
          checked += 1
        }
      }
    }
    expect(checked).toBe(requesters.length * references.length * nonSuccessOutcomes.length)
  })
})

describe('ET-PROP-02: every evidence-ONLY key refuses', () => {
  it('rejects the bundle keys this record must not carry, and only those', () => {
    // Deliberately scoped: contract_id, contract_version, outcome, and
    // timing are shared with the bundle and legitimate here.
    const evidenceOnly = [
      'identities',
      'principal',
      'granted_capabilities',
      'operations',
      'gate_results',
      'artifacts',
      'change_sets',
    ]
    for (const key of evidenceOnly) {
      expect(
        EarlyTerminationRecord.safeParse({ ...record(), [key]: {} }).success,
        `${key} must refuse`,
      ).toBe(false)
    }
    for (const shared of ['contract_id', 'contract_version', 'outcome', 'timing']) {
      expect(Object.keys(EarlyTerminationRecord.shape)).toContain(shared)
    }
  })
})
