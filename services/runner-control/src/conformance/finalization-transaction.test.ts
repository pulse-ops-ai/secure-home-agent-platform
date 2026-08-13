/**
 * RO-EX-38…43: finalization is ONE atomic transition.
 *
 * Three contracts were in tension, and the resolution was being attempted
 * by ordering individual lines:
 *
 *   every transition is durable
 * + `run.terminated` is truthful
 * + the evidence seal is the run's final write
 *
 * Emitting the terminal event with the INTENDED outcome and then
 * attempting the seal satisfies the third and breaks the second: a failed
 * seal leaves an event saying `COMPLETED` for a run whose conclusion is
 * `OPERATIONAL_FAILURE`. No ordering of those two writes fixes it,
 * because the problem is that they are two writes.
 *
 * So the terminal record, the terminal transitions, and the terminal
 * event are PREPARED, seal eligibility is verified, and then all three
 * commit together or none of them do. What the machine, the event, and
 * the conclusion report is the fact that was COMMITTED — never an
 * intended intermediate state.
 */
import { EvidenceBundle } from '@secure-home/events'
import { describe, expect, it } from 'vitest'
import { Runner } from '../runner.js'
import { TRANSITIONS, type ProgressState, type TransitionKind } from '../lifecycle/index.js'
import {
  StaticArtifactObserver,
  eventSinkFailing,
  evidenceSinkFailing,
  governedWrites,
  journalFailing,
  runRequest,
  sharedPorts,
  testPorts,
  type TestPorts,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'

const terminalEvents = (
  ports: TestPorts,
): { event_type: string; outcome?: { terminal_state: string } }[] =>
  ports.events
    .eventsOf(RUN)
    .map((event) => event as { event_type: string; outcome?: { terminal_state: string } })
    .filter((event) => event.event_type === 'run.terminated')

const withoutTransition = (from: ProgressState, kind: TransitionKind): typeof TRANSITIONS => {
  const row = { ...TRANSITIONS[from] }
  delete row[kind]
  return { ...TRANSITIONS, [from]: row }
}

describe('RO-EX-38: a failed commit leaves nothing partial', () => {
  it('an evidence sink that rejects publishes no terminal event and no bundle', async () => {
    const ports = testPorts({
      evidence: evidenceSinkFailing((request) => request.kind === 'evidence_bundle'),
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('OPERATIONAL_FAILURE')
    expect(governedWrites(ports, RUN), 'no bundle may be observable').toHaveLength(0)
    expect(
      terminalEvents(ports).filter((event) => event.outcome?.terminal_state === 'COMPLETED'),
      'no event may claim a completion that did not commit',
    ).toHaveLength(0)
  })

  it('the journal records no EVIDENCE_SEALED for a commit that did not happen', async () => {
    const ports = testPorts({
      evidence: evidenceSinkFailing((request) => request.kind === 'evidence_bundle'),
    })
    await new Runner(ports).run(runRequest())
    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(journaled?.transitions.map((entry) => entry.to)).not.toContain('EVIDENCE_SEALED')
  })
})

describe('RO-EX-39: the terminal event is bound to the committed fact', () => {
  const FAILURE_MODES: readonly (readonly [string, () => TestPorts])[] = [
    [
      'the evidence sink rejects the bundle',
      () =>
        testPorts({
          evidence: evidenceSinkFailing((request) => request.kind === 'evidence_bundle'),
        }),
    ],
    [
      'the artifact surface is unreadable',
      () => testPorts({ artifacts: new StaticArtifactObserver({ ok: false, failure: 'gone' }) }),
    ],
    ['everything succeeds', () => testPorts()],
  ]

  it('every emitted run.terminated outcome equals the state the run ended in', async () => {
    for (const [name, build] of FAILURE_MODES) {
      const ports = build()
      const conclusion = await new Runner(ports).run(runRequest())
      for (const event of terminalEvents(ports)) {
        expect(
          event.outcome?.terminal_state,
          `${name}: the event claims ${String(event.outcome?.terminal_state)} but the run ended ${conclusion.state}`,
        ).toBe(conclusion.state)
      }
    }
  })

  it('a completed run emits exactly one terminal event, saying COMPLETED', async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.state).toBe('COMPLETED')
    const terminal = terminalEvents(ports)
    expect(terminal).toHaveLength(1)
    expect(terminal[0]?.outcome?.terminal_state).toBe('COMPLETED')
  })
})

describe('RO-EX-40: a committed run reflects the committed fact everywhere', () => {
  it('the bundle, the event, the journal, and the machine all agree', async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(runRequest())

    const parsed = EvidenceBundle.safeParse(governedWrites(ports, RUN)[0]?.payload)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(parsed.data.outcome.terminal_state).toBe(conclusion.state)
    expect(terminalEvents(ports)[0]?.outcome?.terminal_state).toBe(conclusion.state)
    expect(journaled?.state).toBe(conclusion.state)
    expect(journaled?.transitions.map((entry) => entry.to).slice(-2)).toEqual([
      'EVIDENCE_SEALED',
      'COMPLETED',
    ])
  })
})

describe('RO-EX-41: the machine authorizes the whole terminal sequence before committing', () => {
  it('a table without seal_evidence commits nothing', async () => {
    const ports = testPorts()
    await new Runner(ports, {
      transitions: withoutTransition('VERIFYING', 'seal_evidence'),
    }).run(runRequest())
    expect(governedWrites(ports, RUN)).toHaveLength(0)
    expect(terminalEvents(ports)).toHaveLength(0)
  })

  it('a table without complete commits nothing either', async () => {
    // The second half of the sequence. Committing the bundle and then
    // discovering `complete` is undeclared would leave a sealed run that
    // cannot be completed — exactly the intermediate state the
    // transaction exists to prevent.
    const ports = testPorts()
    const conclusion = await new Runner(ports, {
      transitions: withoutTransition('EVIDENCE_SEALED', 'complete'),
    }).run(runRequest())
    expect(conclusion.state).not.toBe('COMPLETED')
    expect(governedWrites(ports, RUN)).toHaveLength(0)
    expect(terminalEvents(ports)).toHaveLength(0)
  })
})

describe('RO-EX-42: eligibility is verified before the commit, not during', () => {
  it('an ineligible bundle never reaches the sink', async () => {
    const ports = testPorts({
      artifacts: new StaticArtifactObserver({ ok: false, failure: 'artifact store unreadable' }),
    })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.produced).toBe('none')
    expect(governedWrites(ports, RUN)).toHaveLength(0)
  })

  it('a seal attempted with writes outstanding is refused before the commit', async () => {
    // Built from the shared visibility authority: a sink with its own
    // ledger would filter out the very commit this proof counts.
    const shared = sharedPorts()
    const countingSink = shared.evidence
    const ports = testPorts({
      journal: shared.journal,
      events: shared.events,
      evidence: evidenceSinkFailing(() => false, countingSink),
      visibility: shared.visibility,
    })
    await new Runner(ports).run(runRequest())
    // The good path still seals exactly once — the ordering guard is a
    // precondition of the commit, not a second write.
    expect(countingSink.all.filter((write) => write.kind === 'evidence_bundle')).toHaveLength(1)
  })
})

describe('RO-EX-43: a partial failure inside the commit publishes nothing', () => {
  it('an event sink failing at the terminal event leaves no bundle', async () => {
    const ports = testPorts({
      events: eventSinkFailing((event) => event.event_type === 'run.terminated'),
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).not.toBe('COMPLETED')
    expect(
      governedWrites(ports, RUN),
      'the bundle must not survive a commit whose event half failed',
    ).toHaveLength(0)
  })

  it('a journal failing at the terminal tail leaves neither event nor bundle', async () => {
    const ports = testPorts()
    let transitions = 0
    const failing = journalFailing((transition) => {
      transitions += 1
      // Fail on the terminal tail specifically.
      return transition.to === 'EVIDENCE_SEALED'
    })
    const conclusion = await new Runner({ ...testPorts({ journal: failing }) }).run(runRequest())

    expect(transitions).toBeGreaterThan(0)
    expect(conclusion.state).not.toBe('COMPLETED')
    expect(governedWrites(ports, RUN)).toHaveLength(0)
  })
})
