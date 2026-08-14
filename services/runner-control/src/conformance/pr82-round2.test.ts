/**
 * RO-EX-104…107: the second falsification round.
 *
 * The lesson of this round is about the SHAPE of the previous one. Each
 * earlier fix repaired the counterexample it was given and stopped at
 * the edge of the class:
 *
 *   the signal was preserved at two boundaries of three
 *   the walk halted at the next phase but not inside the current one
 *   the prototype was closed and the mutable reference was not
 *   the caller was routed through the owner and the mutator stayed open
 *
 * A counterexample is a sample of a class, not the class.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RunMachine, TRANSITIONS, type TransitionTable } from '../lifecycle/index.js'
import { narrowingOnly } from '../orchestration/controls.js'
import { Runner } from '../runner.js'
import { InMemoryRunJournal, InMemoryRunLease, SteppingClock } from '../adapters/index.js'
import { RecordingSession, runRequest, testPorts, withoutConsent } from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'
const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Nothing for the first `checks` consultations, then `signal`. */
const pollAfter = (checks: number, signal: 'cancel' | 'timeout') => {
  let seen = 0
  return () => {
    seen += 1
    return seen > checks ? signal : undefined
  }
}

describe('RO-EX-104: a polled timeout keeps its own terminal at every boundary', () => {
  it('SANDBOX_STARTED records TIMED_OUT, not CANCELLED', async () => {
    // `RunDeadline.reason` is set only by `raise()`. A POLLED interrupt
    // is merely returned by `interrupted()`, so a boundary that discards
    // the returned signal leaves `abortRun` defaulting to 'cancel' — and
    // the sealed terminal evidence then says a timed-out run was
    // cancelled. Two boundaries preserve the signal; this one did not.
    const session = new RecordingSession()
    const conclusion = await new Runner(testPorts({ session })).run(runRequest(), {
      interrupt: pollAfter(3, 'timeout'),
    })

    expect(session.calls, 'the session was open at this boundary').toContain('start')
    expect(conclusion.state, 'a polled timeout must not be recorded as a cancellation').toBe(
      'TIMED_OUT',
    )
  })

  it('the other boundaries still keep theirs — the control', async () => {
    const conclusion = await new Runner(testPorts()).run(runRequest(), {
      interrupt: pollAfter(4, 'timeout'),
    })
    expect(conclusion.state).toBe('TIMED_OUT')
  })
})

/** A journal that refuses the fence on its FIRST acquisition append. */
const fenceRefusingJournal = () => {
  const inner = new InMemoryRunJournal()
  return {
    ...inner,
    appendTransition: inner.appendTransition.bind(inner),
    appendRejection: inner.appendRejection.bind(inner),
    appendHold: inner.appendHold.bind(inner),
    stageTransitions: inner.stageTransitions.bind(inner),
    readCurrentState: inner.readCurrentState.bind(inner),
    appendAcquisition: () =>
      Promise.resolve({
        ok: false as const,
        reason: 'stale_fence' as const,
        detail: `run ${RUN} moved on`,
      }),
  }
}

describe('RO-EX-105: a fence refusal stops the CURRENT phase, not just the next', () => {
  it('no authority is read after the loss is known', async () => {
    // `runEpoch` reads profile → path_policy → gate_registry, journaling
    // each. The callback learns with certainty that this generation was
    // refused — and the loop read the next two sources anyway. The
    // ownership requirement is "no authority read, no invocation, no
    // write", and the first of those was still happening.
    const ports = testPorts({ journal: fenceRefusingJournal() })
    await new Runner(ports).run(runRequest())

    expect(
      ports.authority.reads.map((read) => read.source),
      'authority reads must stop at the refusal, not at the next phase',
    ).toEqual(['profile'])
  })
})

describe('RO-EX-106: a validated table cannot widen afterwards', () => {
  const widenable = (): TransitionTable => ({
    ...TRANSITIONS,
    ELIGIBLE: { ...TRANSITIONS.ELIGIBLE },
  })

  it('the machine does not retain the caller’s object', () => {
    // TOCTOU. `narrowingOnly` returned the caller's own table and the
    // machine kept the reference, so a table valid at validation could
    // widen at any later moment — mid-run mutable authority, which is
    // the thing the runner model exists to remove.
    const table = widenable()
    const check = narrowingOnly(table)
    expect(check.ok).toBe(true)
    if (!check.ok) return

    ;(table.ELIGIBLE as Record<string, string>)['commit_spend'] = 'COMPLETED'
    expect(
      (check.table as Record<string, Record<string, string>>)['ELIGIBLE']?.['commit_spend'],
      'the validated table must be a copy, not the caller’s object',
    ).toBe('SANDBOX_STARTED')
  })

  it('a non-enumerable widening is refused', () => {
    // `for...in` skips non-enumerable properties; `declaredNext` reads
    // by plain lookup. Validation and consumption disagreed again — the
    // same class as the prototype case, a different representation.
    const row: Record<string, string> = { ...TRANSITIONS.ELIGIBLE }
    Object.defineProperty(row, 'commit_spend', { value: 'COMPLETED', enumerable: false })
    const forged = { ...TRANSITIONS, ELIGIBLE: row } as unknown as TransitionTable

    expect(narrowingOnly(forged).ok, 'a hidden widening is still a widening').toBe(false)
  })

  it('the validated table is frozen', () => {
    const check = narrowingOnly(widenable())
    expect(check.ok).toBe(true)
    if (!check.ok) return
    expect(Object.isFrozen(check.table), 'the retained table must not be mutable').toBe(true)
  })
})

describe('RO-EX-107: the machine cannot be advanced without the owner', () => {
  it('committing a projection requires the capability project() mints', () => {
    // `commitProjected` was public and unchecked: it set the state,
    // appended a transition and bumped the version for any array handed
    // to it, with no claim, no terminal check and no table lookup. The
    // guard proved only that no file in THIS repository calls it from
    // the wrong place — which is a fact about the source tree, not about
    // the class, and `RunMachine` is exported from the package root.
    const machine = new RunMachine(RUN, new SteppingClock())
    const forged = [
      {
        run_id: RUN,
        from: 'REQUESTED' as const,
        to: 'COMPLETED' as const,
        kind: 'complete' as const,
        cause: 'forged',
        at: '2026-01-01T00:00:00.000Z',
      },
    ]

    const mutate = machine as unknown as { commitProjected: (entries: unknown) => void }
    let threw = false
    try {
      mutate.commitProjected(forged)
    } catch {
      threw = true
    }

    expect(
      threw || machine.state === 'REQUESTED',
      'an unprojected entry list must not move the machine',
    ).toBe(true)
  })

  it('the guard does not rely on a source scan alone', () => {
    // A structural scan can only speak about this repository. The
    // property has to be enforced by the class.
    const machineSource = readFileSync(join(srcRoot, 'lifecycle/machine.ts'), 'utf8')
    expect(
      machineSource.includes('CommitCapability') || machineSource.includes('#capability'),
      'commitProjected must be capability-bound, not merely conventionally owned',
    ).toBe(true)
  })
})

describe('RO-EX-108: a conclusion says what it IS, not only where it stopped', () => {
  it('a dispossessed attempt is ownership_lost, not a lifecycle terminal', async () => {
    // The vocabulary problem, resolved rather than papered over. A stale
    // holder has no authority to declare what happened to the logical
    // run, so it declares what happened to ITS ATTEMPT. Manufacturing
    // INDETERMINATE would be exactly the verdict it may not give.
    const lease = new InMemoryRunLease()
    const ports = testPorts({ lease })
    const conclusion = await new Runner(ports).run(runRequest(), {
      interrupt: (() => {
        let seen = 0
        return () => {
          seen += 1
          if (seen === 2) lease.steal(RUN)
          return undefined
        }
      })(),
    })

    expect(conclusion.kind).toBe('ownership_lost')
    expect(conclusion.produced).toBe('none')
    // `state` still reports the last state this attempt observed — a
    // fact it does own — without claiming the run ended there.
    expect(conclusion.state).not.toBe('COMPLETED')
  })

  it('an ordinary run is terminal, and a held one is held', async () => {
    const completed = await new Runner(testPorts()).run(runRequest())
    expect(completed.kind).toBe('terminal')
    expect(completed.state).toBe('COMPLETED')

    const held = await new Runner(testPorts()).run(withoutConsent(runRequest()))
    expect(held.kind).toBe('held')
    expect(held.state).toBe('ELIGIBLE')
  })
})
