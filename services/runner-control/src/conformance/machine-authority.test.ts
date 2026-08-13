/**
 * RO-EX-28…31: the machine is AUTHORITATIVE over effects, not a recorder
 * running alongside them.
 *
 * The defect this proves absent: `runner.ts` calling `machine.advance()`
 * and proceeding to the next side effect regardless of the answer. Under
 * that shape the machine can correctly reject `begin_execution`, record
 * the rejection, and the adapter runs anyway — the state machine right,
 * the orchestration wrong, and nothing failing.
 *
 * These proofs make the hypothetical real. `RunMachine` accepts the
 * transition table, so a test can DELETE a transition and assert that
 * the effects downstream of it never happen. If the walk is driven by
 * the table, narrowing the table narrows what runs; if the walk is a
 * second procedural state machine, the effects continue and these fail.
 */
import { describe, expect, it } from 'vitest'
import { Runner } from '../runner.js'
import { TRANSITIONS, type ProgressState, type TransitionKind } from '../lifecycle/index.js'
import { evidenceSinkFailing, runRequest, testPorts, type TestPorts } from '../testing-fixtures.js'

/** The declared table with exactly one transition removed. */
const withoutTransition = (from: ProgressState, kind: TransitionKind): typeof TRANSITIONS => {
  const row = { ...TRANSITIONS[from] }
  delete row[kind]
  return { ...TRANSITIONS, [from]: row }
}

/** Effects observable per phase, in walk order. */
const effects = (ports: TestPorts) => ({
  authority: ports.authority.reads.length,
  events: ports.events.eventsOf('run-20260812-0001').length,
  adapter: ports.adapter.requests.length,
  gates: ports.execution.requests.length,
  writes: ports.evidence.all.filter((w) => w.kind === 'evidence_bundle').length,
})

describe('RO-EX-28: a rejected transition stops the effects that follow it', () => {
  it('removing begin_execution keeps the ADAPTER from running', async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(runRequest(), {
      transitions: withoutTransition('SANDBOX_STARTED', 'begin_execution'),
    })

    expect(
      ports.adapter.requests,
      'the machine rejected begin_execution; the adapter must not have run',
    ).toHaveLength(0)
    expect(ports.execution.requests, 'no gate may run either').toHaveLength(0)
    expect(conclusion.state, 'the run must not be left mid-walk').not.toBe('SANDBOX_STARTED')
  })

  it('removing commit_spend keeps the run from spending at all', async () => {
    const ports = testPorts()
    await new Runner(ports).run(runRequest(), {
      transitions: withoutTransition('ELIGIBLE', 'commit_spend'),
    })

    const types = ports.events
      .eventsOf('run-20260812-0001')
      .map((event) => (event as { event_type: string }).event_type)
    expect(types, 'run.started announces a spend that the machine forbade').not.toContain(
      'run.started',
    )
    expect(ports.adapter.requests).toHaveLength(0)
  })

  it('removing seal_evidence keeps the bundle from being written', async () => {
    const ports = testPorts()
    await new Runner(ports).run(runRequest(), {
      transitions: withoutTransition('VERIFYING', 'seal_evidence'),
    })
    expect(
      ports.evidence.all.filter((write) => write.kind === 'evidence_bundle'),
      'a seal the machine did not authorize must not reach the sink',
    ).toHaveLength(0)
  })

  it('removing resolve_profile keeps everything downstream from running', async () => {
    const ports = testPorts()
    await new Runner(ports).run(runRequest(), {
      transitions: withoutTransition('REQUESTED', 'resolve_profile'),
    })
    const observed = effects(ports)
    expect(observed.adapter).toBe(0)
    expect(observed.gates).toBe(0)
    expect(observed.writes).toBe(0)
  })
})

describe('RO-EX-29: every phase boundary is table-driven', () => {
  const BOUNDARIES: readonly (readonly [ProgressState, TransitionKind])[] = [
    ['REQUESTED', 'resolve_profile'],
    ['PROFILE_RESOLVED', 'decide_eligibility'],
    ['ELIGIBLE', 'commit_spend'],
    ['SANDBOX_STARTED', 'begin_execution'],
    ['RUNNING', 'begin_verification'],
    ['VERIFYING', 'seal_evidence'],
    ['EVIDENCE_SEALED', 'complete'],
  ]

  it('narrowing ANY boundary prevents the run from completing', async () => {
    for (const [from, kind] of BOUNDARIES) {
      const ports = testPorts()
      const conclusion = await new Runner(ports).run(runRequest(), {
        transitions: withoutTransition(from, kind),
      })
      expect(
        conclusion.state,
        `removing ${from} × ${kind} still completed — the walk is not driven by the table`,
      ).not.toBe('COMPLETED')
    }
  })

  it('narrowing a boundary never leaves the run in a non-terminal state', async () => {
    const nonTerminal = new Set([
      'REQUESTED',
      'PROFILE_RESOLVED',
      'ELIGIBLE',
      'SANDBOX_STARTED',
      'RUNNING',
      'VERIFYING',
      'EVIDENCE_SEALED',
    ])
    for (const [from, kind] of BOUNDARIES) {
      const conclusion = await new Runner(testPorts()).run(runRequest(), {
        transitions: withoutTransition(from, kind),
      })
      expect(
        nonTerminal.has(conclusion.state),
        `removing ${from} × ${kind} abandoned the run in ${conclusion.state}`,
      ).toBe(false)
    }
  })

  it('the rejection is recorded, naming the state and the transition', async () => {
    const conclusion = await new Runner(testPorts()).run(runRequest(), {
      transitions: withoutTransition('RUNNING', 'begin_verification'),
    })
    const rejection = conclusion.rejections.find(
      (entry) => entry.attempted === 'begin_verification',
    )
    expect(rejection, 'a halted walk must say why').toBeDefined()
    expect(rejection?.reason).toBe('undeclared_transition')
    expect(rejection?.state).toBe('RUNNING')
  })
})

describe('RO-EX-30: the seal transition follows the seal', () => {
  it('a sink that rejects the write leaves the machine short of EVIDENCE_SEALED', async () => {
    const ports = testPorts({
      evidence: evidenceSinkFailing((request) => request.kind === 'evidence_bundle'),
    })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.transitions.map((entry) => entry.to)).not.toContain('EVIDENCE_SEALED')
  })

  it('the successful walk enters EVIDENCE_SEALED exactly once, after the write', async () => {
    const conclusion = await new Runner(testPorts()).run(runRequest())
    expect(conclusion.transitions.filter((entry) => entry.to === 'EVIDENCE_SEALED')).toHaveLength(1)
  })
})

describe('RO-EX-31: the unmodified table still completes', () => {
  it('the guard binds the walk without blocking it', async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.state).toBe('COMPLETED')
    expect(conclusion.rejections).toHaveLength(0)
    expect(effects(ports).writes).toBe(1)
  })
})
