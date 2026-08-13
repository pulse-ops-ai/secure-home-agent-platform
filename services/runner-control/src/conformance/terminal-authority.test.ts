/**
 * RO-EX-88…89: EVERY terminal goes through the machine, including the
 * ones taken because something already went wrong.
 *
 * The walk engine made the machine authoritative over the ordinary path:
 * a phase earns a transition, the engine applies it, and a rejection
 * halts the walk. The FAILURE paths were converted one by one to check
 * `advance()` too — but two were left applying a terminal and carrying
 * on regardless of the answer:
 *
 *   failClosed()  inside finish(), for an assembly, projection,
 *                 eligibility or commit failure
 *   the exception handler, for the INDETERMINATE terminal
 *
 * Both then reported `machine.state`. When the machine REFUSES the
 * transition the state is unchanged — so the run concluded in a
 * PROGRESS state, which is precisely the abandonment the lifecycle
 * requirement forbids, and it did so on the paths that only run when
 * something has already failed.
 *
 * The existing table-narrowing proofs did not catch it: they asserted
 * the run did not COMPLETE and wrote no bundle, both of which are true
 * of a run abandoned in VERIFYING.
 */
import { describe, expect, it } from 'vitest'
import { Runner } from '../runner.js'
import {
  TRANSITIONS,
  isTerminal,
  type ProgressState,
  type TransitionKind,
} from '../lifecycle/index.js'
import { PINNED_BASE, runRequest, testPorts } from '../testing-fixtures.js'

const withoutTransition = (from: ProgressState, kind: TransitionKind): typeof TRANSITIONS => {
  const row = { ...TRANSITIONS[from] }
  delete row[kind]
  return { ...TRANSITIONS, [from]: row }
}

/** An artifact surface that cannot be read, so evidence assembly refuses. */
const unreadableArtifacts = {
  observe: () => Promise.resolve({ ok: false as const, failure: 'artifact store unreadable' }),
}

describe('RO-EX-88: a refused failure terminal still ends the run', () => {
  it('the run reaches a terminal state even when its first choice is undeclared', async () => {
    const conclusion = await new Runner(testPorts({ artifacts: unreadableArtifacts })).run(
      runRequest(),
      { transitions: withoutTransition('VERIFYING', 'operational_fault') },
    )

    // The assertion the older proofs were missing. "Not COMPLETED" and
    // "no bundle" are both true of a run left sitting in VERIFYING.
    expect(
      isTerminal(conclusion.state),
      `the run was abandoned in ${conclusion.state}, which is not terminal`,
    ).toBe(true)
  })

  it('the refusal is recorded rather than passed over in silence', async () => {
    const conclusion = await new Runner(testPorts({ artifacts: unreadableArtifacts })).run(
      runRequest(),
      { transitions: withoutTransition('VERIFYING', 'operational_fault') },
    )

    expect(
      conclusion.rejections.some((entry) => entry.attempted === 'operational_fault'),
      'a terminal the machine refused must appear in the record',
    ).toBe(true)
  })

  it('and it still writes nothing', async () => {
    // The property the older proofs DID hold, kept: reaching a terminal
    // by another route must not buy the run a bundle.
    const ports = testPorts({ artifacts: unreadableArtifacts })
    await new Runner(ports).run(runRequest(), {
      transitions: withoutTransition('VERIFYING', 'operational_fault'),
    })
    expect(ports.evidence.all.filter((write) => write.kind === 'evidence_bundle')).toHaveLength(0)
  })
})

describe('RO-EX-89: the exception handler obeys the machine too', () => {
  const explodingObserver = {
    observe: () => {
      throw new Error('the observer exploded')
    },
    observeBase: () => Promise.resolve({ ok: true as const, digest: PINNED_BASE }),
  }

  it('a refused INDETERMINATE is recorded, not reported as though it happened', async () => {
    // A table with no terminal at all from RUNNING. Nothing can rescue
    // this run — the point is that it says so, rather than reporting a
    // terminal state the machine never granted.
    let table = withoutTransition('RUNNING', 'indeterminate')
    for (const kind of ['operational_fault', 'refuse', 'cancel', 'timeout'] as const) {
      const row = { ...table.RUNNING }
      delete row[kind]
      table = { ...table, RUNNING: row }
    }

    const conclusion = await new Runner(testPorts({ observer: explodingObserver })).run(
      runRequest(),
      { transitions: table },
    )

    expect(
      conclusion.rejections.some((entry) => entry.attempted === 'indeterminate'),
      'the refused terminal must be in the record',
    ).toBe(true)
    expect(
      conclusion.detail,
      'and the conclusion must say the machine granted no terminal',
    ).toMatch(/no terminal|refused/i)
  })

  it('the ordinary exception path still reaches INDETERMINATE', async () => {
    // The control. Without it, "record the refusal" would be satisfied
    // by a handler that never reached a terminal at all.
    const conclusion = await new Runner(testPorts({ observer: explodingObserver })).run(
      runRequest(),
    )
    expect(conclusion.state).toBe('INDETERMINATE')
    expect(isTerminal(conclusion.state)).toBe(true)
  })
})
