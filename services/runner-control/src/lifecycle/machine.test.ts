/**
 * The lifecycle proof net:
 *
 *  PROP-002    every (state, transition) pair — declared advances,
 *              undeclared pairs rejected and recorded
 *  RO-ADV-02   a terminal state accepts nothing
 *  RO-PROP-03  any interleaving of concurrent attempts on one run
 *              serializes; every loser is a recorded rejection
 *  RO-EX-06    a held precondition records without advancing
 */
import { describe, expect, it } from 'vitest'
import { SteppingClock } from '../adapters/index.js'
import { RunMachine } from './machine.js'
import { PROGRESS_STATES, TERMINAL_STATES, isTerminal, type LifecycleState } from './states.js'
import { TRANSITIONS, TRANSITIONS_KINDS, declaredNext, type TransitionKind } from './transitions.js'

const machineAt = (state: LifecycleState): RunMachine => {
  const machine = new RunMachine('run-1', new SteppingClock())
  // Walk there through declared transitions only — a fixture that
  // assigned the state directly would prove nothing about reachability.
  const route: Partial<Record<LifecycleState, readonly TransitionKind[]>> = {
    REQUESTED: [],
    PROFILE_RESOLVED: ['resolve_profile'],
    ELIGIBLE: ['resolve_profile', 'decide_eligibility'],
    SANDBOX_STARTED: ['resolve_profile', 'decide_eligibility', 'commit_spend'],
    RUNNING: ['resolve_profile', 'decide_eligibility', 'commit_spend', 'begin_execution'],
    VERIFYING: [
      'resolve_profile',
      'decide_eligibility',
      'commit_spend',
      'begin_execution',
      'begin_verification',
    ],
    EVIDENCE_SEALED: [
      'resolve_profile',
      'decide_eligibility',
      'commit_spend',
      'begin_execution',
      'begin_verification',
      'seal_evidence',
    ],
    COMPLETED: [
      'resolve_profile',
      'decide_eligibility',
      'commit_spend',
      'begin_execution',
      'begin_verification',
      'seal_evidence',
      'complete',
    ],
    REFUSED: ['refuse'],
    OPERATIONAL_FAILURE: ['operational_fault'],
    CANCELLED: ['cancel'],
    TIMED_OUT: ['timeout'],
    INDETERMINATE: ['indeterminate'],
  }
  for (const kind of route[state] ?? []) machine.advance(kind, 'fixture')
  expect(machine.state, `fixture could not reach ${state} by declared transitions`).toBe(state)
  return machine
}

describe('PROP-002: the transition function is total over the whole space', () => {
  it('every (state, transition) pair either advances as declared or is a recorded rejection', () => {
    let declared = 0
    let rejected = 0
    for (const state of [...PROGRESS_STATES, ...TERMINAL_STATES]) {
      for (const kind of TRANSITIONS_KINDS) {
        const machine = machineAt(state)
        const before = machine.state
        const result = machine.advance(kind, 'exhaustive sweep')
        const expected = isTerminal(before) ? undefined : declaredNext(TRANSITIONS, before, kind)
        if (expected === undefined) {
          expect(result.kind, `${before} × ${kind} must be rejected`).toBe('rejected')
          expect(machine.state, `${before} × ${kind} must not change state`).toBe(before)
          expect(machine.rejections).toHaveLength(1)
          expect(machine.rejections[0]?.attempted).toBe(kind)
          expect(machine.rejections[0]?.state).toBe(before)
          rejected += 1
        } else {
          expect(result.kind, `${before} × ${kind} must advance`).toBe('advanced')
          expect(machine.state).toBe(expected)
          declared += 1
        }
      }
    }
    // The sweep is the whole space, not a sample.
    expect(declared + rejected).toBe(
      [...PROGRESS_STATES, ...TERMINAL_STATES].length * TRANSITIONS_KINDS.length,
    )
    expect(declared).toBeGreaterThan(0)
    expect(rejected).toBeGreaterThan(0)
  })

  it('a rejection names the state and the attempted transition, and is never silent', () => {
    const machine = machineAt('REQUESTED')
    const result = machine.advance('complete', 'illegal')
    expect(result.kind).toBe('rejected')
    if (result.kind !== 'rejected') return
    expect(result.entry.reason).toBe('undeclared_transition')
    expect(result.entry.detail).toContain('complete')
    expect(result.entry.detail).toContain('REQUESTED')
  })
})

describe('RO-ADV-02: a terminal state is final', () => {
  it('every terminal rejects every transition and keeps its state', () => {
    for (const terminal of TERMINAL_STATES) {
      for (const kind of TRANSITIONS_KINDS) {
        const machine = machineAt(terminal)
        const result = machine.advance(kind, 'post-terminal attempt')
        expect(result.kind, `${terminal} must reject ${kind}`).toBe('rejected')
        expect(machine.state).toBe(terminal)
      }
    }
  })

  it('no terminal state appears as a transition source in the table', () => {
    for (const terminal of TERMINAL_STATES) {
      if (terminal === 'COMPLETED') {
        // COMPLETED is in the progress vocabulary as the successful end
        // of the walk; its row exists and is deliberately empty.
        expect(Object.keys(TRANSITIONS.COMPLETED)).toEqual([])
        continue
      }
      expect(Object.keys(TRANSITIONS)).not.toContain(terminal)
    }
  })
})

describe('RO-PROP-03: concurrent transition attempts on one run serialize', () => {
  it('for every pair of declared transitions, exactly one wins and the loser is recorded', () => {
    const attempts: readonly TransitionKind[] = ['resolve_profile', 'refuse', 'cancel', 'timeout']
    for (const first of attempts) {
      for (const second of attempts) {
        const machine = new RunMachine('run-race', new SteppingClock())
        // BOTH claims are taken before either applies — the race.
        const claimA = machine.claim()
        const claimB = machine.claim()
        const a = machine.apply(claimA, first, 'racer A')
        const b = machine.apply(claimB, second, 'racer B')
        expect(a.kind).toBe('advanced')
        expect(b.kind, 'the second writer must never also advance').toBe('rejected')
        if (b.kind !== 'rejected') continue
        expect(b.entry.reason).toBe('stale_writer')
        expect(machine.transitionRecord).toHaveLength(1)
        expect(machine.transitionRecord[0]?.kind).toBe(first)
      }
    }
  })

  it('a hundred simultaneous claims yield one advance and ninety-nine recorded rejections', () => {
    const machine = new RunMachine('run-storm', new SteppingClock())
    const claims = Array.from({ length: 100 }, () => machine.claim())
    const results = claims.map((claim) => machine.apply(claim, 'resolve_profile', 'storm'))
    expect(results.filter((result) => result.kind === 'advanced')).toHaveLength(1)
    expect(results.filter((result) => result.kind === 'rejected')).toHaveLength(99)
    expect(machine.rejections).toHaveLength(99)
    expect(machine.state).toBe('PROFILE_RESOLVED')
  })
})

describe('RO-EX-06: a held precondition records without advancing', () => {
  it('hold leaves the state untouched and leaves a trace', () => {
    const machine = machineAt('ELIGIBLE')
    const result = machine.hold('commit_spend', 'no consent record for this run')
    expect(result.kind).toBe('rejected')
    expect(machine.state).toBe('ELIGIBLE')
    expect(machine.transitionRecord.filter((entry) => entry.kind === 'commit_spend')).toHaveLength(
      0,
    )
    expect(machine.rejections.at(-1)?.reason).toBe('precondition_unmet')
  })
})

describe('the transition record reconstructs the whole walk (D9)', () => {
  it('records every declared transition in order, including those with no event type', () => {
    const machine = machineAt('COMPLETED')
    expect(machine.transitionRecord.map((entry) => entry.to)).toEqual([
      'PROFILE_RESOLVED',
      'ELIGIBLE',
      'SANDBOX_STARTED',
      'RUNNING',
      'VERIFYING',
      'EVIDENCE_SEALED',
      'COMPLETED',
    ])
    for (const entry of machine.transitionRecord) {
      expect(entry.run_id).toBe('run-1')
      expect(entry.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })
})
