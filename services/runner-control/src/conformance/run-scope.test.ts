/**
 * RO-EX-85…88: the recovery path uses the run's REAL state.
 *
 * `#walkOwned` catches anything that escapes the walk, which is right —
 * a port that throws must not leave a run in no state at all. What it
 * did with the exception was wrong, and the cause is structural: every
 * piece of the run lived in closures inside `#walk`, so the catch could
 * not reach any of it. It built a FRESH `RunMachine`, which starts in
 * `REQUESTED`, and reported that.
 *
 * A run that reached `RUNNING` and then hit a throwing port therefore:
 *
 *  - reported one fabricated transition instead of the five it took;
 *  - reported no rejections, whatever it had actually recorded;
 *  - wrote an EARLY-TERMINATION record — the shape reserved for a run
 *    that ended in `REQUESTED` before authority completed — for a run
 *    that had a captured profile, a principal, and an adapter;
 *  - never discarded its isolated workspace, because `conclude()` never
 *    ran and the leak-tracking box only held the session;
 *  - never disarmed its deadline timer;
 *  - never flushed the journal entries still pending at the throw.
 *
 * None of that is fixable inside the catch. The catch needs the run's
 * scope, which means the scope has to be an object the caller owns
 * rather than a closure the callee holds.
 */
import { describe, expect, it } from 'vitest'
import { Runner } from '../runner.js'
import {
  PINNED_BASE,
  RecordingWorkspaceLifecycle,
  runRequest,
  testPorts,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'

/** An observer that explodes at the workspace read inside RUNNING. */
const explodingObserver = {
  observe: () => {
    throw new Error('the observer exploded')
  },
  observeBase: () => Promise.resolve({ ok: true as const, digest: PINNED_BASE }),
}

describe('RO-EX-85: the conclusion reports the walk the run actually took', () => {
  it('a throw at RUNNING still reports the transitions that happened', async () => {
    const conclusion = await new Runner(testPorts({ observer: explodingObserver })).run(
      runRequest(),
    )

    expect(conclusion.state).toBe('INDETERMINATE')
    // The real walk. A fabricated machine reports only its own single
    // invented transition and calls a run that got to RUNNING a run that
    // never left REQUESTED.
    const reached = conclusion.transitions.map((entry) => entry.to)
    expect(reached).toContain('PROFILE_RESOLVED')
    expect(reached).toContain('ELIGIBLE')
    expect(reached).toContain('SANDBOX_STARTED')
    expect(reached).toContain('RUNNING')
    expect(reached.at(-1), 'and it ends where it actually ended').toBe('INDETERMINATE')
  })

  it('the durable journal carries the same walk, not a one-entry summary', async () => {
    const ports = testPorts({ observer: explodingObserver })
    await new Runner(ports).run(runRequest())

    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(
      journaled?.transitions.map((entry) => entry.to),
      'the entries pending at the throw must still be flushed',
    ).toContain('RUNNING')
  })
})

describe('RO-EX-86: the recovery record matches what the run actually was', () => {
  it('a run that HELD authority does not get the early-terminal shape', async () => {
    const ports = testPorts({ observer: explodingObserver })
    await new Runner(ports).run(runRequest())

    // The early-termination record exists for a run that ended in
    // REQUESTED with no identities to put in a bundle. Writing one for a
    // run that captured a profile, resolved a principal and named an
    // adapter describes a different run than the one that happened.
    const early = ports.evidence.all.filter(
      (write) => write.kind === 'early_termination_record' && write.run_id === RUN,
    )
    expect(early, 'this run had authority; the early-terminal shape is a lie').toHaveLength(0)
  })

  it('a run that threw BEFORE authority still gets the early-terminal shape', async () => {
    // The other side of the same rule — without this, "never write the
    // early record" would pass by never writing one at all.
    const ports = testPorts({
      authority: {
        read: () => {
          throw new Error('the authority source exploded')
        },
      },
    })
    const conclusion = await new Runner(ports).run(runRequest())

    // An authority source that throws is caught by the acquisition epoch
    // and reported as an operational fault, so it never escapes the walk
    // — the state is OPERATIONAL_FAILURE rather than INDETERMINATE. What
    // matters here is the SHAPE: a run with no captured identities has
    // nothing but the early-terminal record to produce.
    expect(conclusion.state).toBe('OPERATIONAL_FAILURE')
    expect(
      ports.evidence.all.filter((write) => write.kind === 'early_termination_record'),
      'a run with no identities has nothing else it could produce',
    ).toHaveLength(1)
  })
})

describe('RO-EX-87: resources are released on the exception path too', () => {
  it('the isolated workspace is discarded when a port throws', async () => {
    const workspace = new RecordingWorkspaceLifecycle()
    const ports = testPorts({ workspace, observer: explodingObserver })
    await new Runner(ports).run(runRequest())

    // The workspace was provisioned before execution. An exception that
    // skips `conclude()` leaves it allocated forever — the leak is
    // silent, and it is exactly the throw path where leaks happen.
    expect(workspace.calls).toContain('provision')
    expect(workspace.calls, 'a provisioned workspace must always be discarded').toContain('discard')
  })
})
