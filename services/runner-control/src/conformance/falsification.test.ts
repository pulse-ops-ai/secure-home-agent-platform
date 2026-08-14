/**
 * FALSIFICATION PROOFS — RO-EX-98…114.
 *
 * Three independent falsification rounds against this landing, kept in
 * one place because they share a single lesson rather than a single
 * concern.
 *
 * Every round found the same shape of defect: a fix that closed the
 * counterexample it was handed and stopped at the edge of the class.
 * The signal preserved at two boundaries of three. The walk halted at
 * the next phase but not inside the current one. The prototype closed
 * and the mutable reference left open. The caller routed through the
 * owner while the mutator stayed public. A guard scanning the wrappers
 * and not the method they delegate to.
 *
 * A counterexample is a SAMPLE of a class, not the class. These proofs
 * exist to keep each class closed rather than each example.
 *
 * Round 3 (RO-EX-109…114) is the reviewer's own file, adopted verbatim —
 * no assertion edited, no fixture adjusted to suit the implementation.
 * Rounds 1 and 2 were reconstructed from the reviewers' counterexamples
 * and verified to fail with the assertion text they reported; that is
 * one degree removed from their evidence, and recorded as such.
 */
import { describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RunMachine, TRANSITIONS, type TransitionTable } from '../lifecycle/index.js'
import { narrowingOnly } from '../orchestration/controls.js'
import { Runner } from '../runner.js'
import { InMemoryRunJournal, InMemoryRunLease, SteppingClock } from '../adapters/index.js'
import {
  CountingAuthoritySource,
  journalFailing,
  ObservingAdapter,
  RecordingSession,
  RecordingWorkspaceLifecycle,
  PINNED_BASE,
  runRequest,
  seizeLease,
  sharedPorts,
  StaticWorkspaceObserver,
  testPorts,
  withoutConsent,
  HangingAdapter,
} from '../testing-fixtures.js'
import type {
  ApplyBackOutcome,
  ApplyBackRequest,
  ExecutionSessionPort,
  FenceOutcome,
  SessionClosure,
  SessionPreparation,
  SessionStart,
} from '../ports/index.js'

const RUN = 'run-20260812-0001'
const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ======================================================================
// pr82-falsification.test.ts
// ======================================================================

/** Nothing for the first `checks` consultations, then cancel. */
const cancelAfter = (checks: number) => {
  let seen = 0
  return () => {
    seen += 1
    return seen > checks ? ('cancel' as const) : undefined
  }
}

describe('RO-EX-98: a cancelled run interrupts its session at EVERY boundary', () => {
  // The earlier proof had exactly one session fixture, and it cancelled
  // at SANDBOX_STARTED — the boundary that had just been fixed. Three
  // later boundaries still reached `finish`, which closes a session
  // without ever asking it to stop.
  const boundaries = [
    [4, 'running'],
    [5, 'verifying, before'],
    [6, 'verifying, during'],
  ] as const

  for (const [checks, where] of boundaries) {
    it(`cancelling at ${where} interrupts, not merely closes`, async () => {
      const session = new RecordingSession()
      const conclusion = await new Runner(testPorts({ session })).run(runRequest(), {
        interrupt: cancelAfter(checks),
      })

      // Controls first: the run really was cancelled here, with a
      // session really open. Without these the assertion below could
      // pass on a run that never got this far.
      expect(conclusion.state).toBe('CANCELLED')
      expect(session.calls, 'the session was open').toContain('start')

      expect(session.calls, 'an open session must be interrupted, not merely closed').toContain(
        'interrupt',
      )
    })
  }
})

/** A journal that refuses the fence on its first acquisition append. */
const fenceRefusingJournal = () => {
  const inner = new InMemoryRunJournal()
  let refused = false
  return {
    ...inner,
    appendTransition: inner.appendTransition.bind(inner),
    appendRejection: inner.appendRejection.bind(inner),
    appendHold: inner.appendHold.bind(inner),
    stageTransitions: inner.stageTransitions.bind(inner),
    readCurrentState: inner.readCurrentState.bind(inner),
    appendAcquisition: () => {
      refused = true
      return Promise.resolve({
        ok: false as const,
        reason: 'stale_fence' as const,
        detail: `run ${RUN} moved on`,
      })
    },
    get didRefuse() {
      return refused
    },
  }
}

describe('RO-EX-99: a fence refusal stops the run before the next phase', () => {
  it('a dispossessed run does not go on to spend', async () => {
    const session = new RecordingSession()
    const ports = testPorts({ journal: fenceRefusingJournal(), session })
    const conclusion = await new Runner(ports).run(runRequest())

    // The run noticed: its own conclusion says so.
    expect(conclusion.detail).toMatch(/moved on/i)

    // `beforePhase` consulted only `lease.renew`, so a fence refusal —
    // the other way ownership is lost — did not halt the walk. The run
    // provisioned, opened a session, invoked the provider and ran gates,
    // and only the final commit was refused.
    expect(session.calls, 'a dispossessed run must not open a session').not.toContain('start')
    expect(ports.adapter.requests, 'nor reach the provider').toHaveLength(0)
    expect(ports.execution.requests, 'nor run a gate').toHaveLength(0)
  })
})

describe('RO-EX-100: a dispossessed run writes no governed record', () => {
  it('the conclusion and the sink agree', async () => {
    const ports = testPorts({
      journal: fenceRefusingJournal(),
      authority: new CountingAuthoritySource({
        profile: { ok: false, source: { source: 'profile' }, failure: 'gone' },
      }),
    })
    const conclusion = await new Runner(ports).run(runRequest())

    // `writeEarlyTerminalRecord` had no fence guard — the one `finish`
    // has — so the record was written strictly AFTER ownership moved,
    // and then the conclusion said nothing further was written.
    expect(conclusion.detail).toMatch(/no further write was made/i)
    expect(
      ports.evidence.all.map((write) => write.kind),
      'the run reported that it wrote nothing further; the sink says otherwise',
    ).toEqual([])
  })
})

describe('RO-EX-101: a widening table is refused however it is carried', () => {
  const widened = {
    ...TRANSITIONS,
    ELIGIBLE: { ...TRANSITIONS.ELIGIBLE, commit_spend: 'COMPLETED' as const },
  }

  it('as an own property — the control', () => {
    expect(narrowingOnly(widened).ok).toBe(false)
  })

  it('and carried on a prototype', () => {
    // `Object.entries` sees own enumerable properties; `declaredNext`
    // resolves `table[state]?.[kind]` through the prototype chain. The
    // validator and the consumer disagreed about what the table IS.
    expect(narrowingOnly(Object.create(widened) as typeof TRANSITIONS).ok).toBe(false)
  })

  it('a run handed the prototype form does not report COMPLETED', async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports, {
      transitions: Object.create(widened) as typeof TRANSITIONS,
    }).run(runRequest())

    expect(ports.adapter.requests, 'it invoked no provider').toHaveLength(0)
    expect(conclusion.state, 'a run that did none of this must not report COMPLETED').not.toBe(
      'COMPLETED',
    )
  })
})

describe('RO-EX-102: the lost-lease exit releases what the run held', () => {
  it('no timer outlives a run whose lease was stolen', async () => {
    vi.useFakeTimers()
    try {
      const control = testPorts()
      await new Runner(control).run(runRequest())
      expect(vi.getTimerCount(), 'control: an ordinary run leaves nothing armed').toBe(0)

      const lease = new InMemoryRunLease()
      const ports = testPorts({ lease })
      // Steal after the spend, so the wall clock is already armed. The
      // `lost` case returns directly — the one exit that never reaches
      // `conclude`, and so never reaches `scope.release`.
      const conclusion = await new Runner(ports).run(runRequest(), {
        interrupt: (() => {
          let seen = 0
          return () => {
            seen += 1
            if (seen === 4) seizeLease(lease, RUN)
            return undefined
          }
        })(),
      })

      expect(conclusion.detail).toMatch(/lease/i)
      expect(vi.getTimerCount(), 'the wall-clock timer outlived the run').toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('RO-EX-103: only the declared owners advance the machine', () => {
  it('every mutating entry point is covered, not just advance()', () => {
    // The guard scanned `.advance(` alone. `commitProjected` also sets
    // the state, appends a transition and bumps the version — with no
    // claim check, no terminal check and no table lookup. Scanning one
    // name is the same weakness the landing rejected when it made
    // RO-EX-90 a field scan.
    const owners = ['lifecycle/walk.ts', 'lifecycle/machine.ts', 'run/scope.ts']
    // `.apply(` and `.claim(` added: `advance` is `this.apply(this.claim(),
    // …)`, so this scanned the wrappers and not the wrapped — the very
    // one-name weakness the block above was written to close.
    const mutators = ['.advance(', '.commitProjected(', '.hold(', '.apply(', '.claim(']
    const files: string[] = []
    for (const entry of readdirSync(srcRoot, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
      if (entry.name.endsWith('.test.ts') || entry.name === 'testing-fixtures.ts') continue
      files.push(join(entry.parentPath, entry.name))
    }
    const offenders = files
      .filter((file) => !owners.some((owner) => file.endsWith(owner)))
      .filter((file) => {
        const code = readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/\/\/[^\n]*/g, ' ')
        // Scoped by RECEIVER: `ports.lease.claim(` is not a machine
        // mutation, and matching bare names reports the engine itself.
        return new RegExp(
          `\\b(?:machine|#machine)\\s*\\.\\s*(?:${mutators.map((m) => m.slice(1, -1)).join('|')})\\s*\\(`,
        ).test(code)
      })
      .map((file) => relative(srcRoot, file))

    expect(offenders, 'a machine advance outside the declared owners').toEqual([])
  })
})

describe('RO-EX-103: the escape scans cover the forms actually used here', () => {
  it('the terminal-classification scan is not evaded by bracket access', () => {
    // `code()` strips string literals, so `observation['exit_code']`
    // reads as `observation[""]` and the field scan sees nothing.
    // RO-MUT-47 claims re-implementation "under any function name" is
    // killed; bracket access survived it.
    const architecture = readFileSync(join(srcRoot, 'conformance/architecture.test.ts'), 'utf8')
    expect(
      architecture.includes('bracket') || architecture.includes("\\['"),
      'the field scan must account for bracket access',
    ).toBe(true)
  })

  it('the definite-assignment scan sees private class fields', () => {
    // `#profile!: Authority` is the dominant field style in this tree
    // and the pattern required start-or-whitespace before an identifier
    // character, so `#` broke the match.
    const structure = readFileSync(join(srcRoot, 'conformance/structure.test.ts'), 'utf8')
    expect(structure.includes('#'), 'the assertion scan must match private fields').toBe(true)
  })
})

// ======================================================================
// pr82-round2.test.ts
// ======================================================================

/** Nothing for the first `checks` consultations, then a cancellation. */
const pollAfter = (checks: number) => {
  let seen = 0
  return () => {
    seen += 1
    return seen > checks ? ('cancel' as const) : undefined
  }
}

describe('RO-EX-104: a timeout keeps its own terminal at every boundary', () => {
  // REWRITTEN BY THE AUTHOR, and this note is the reason.
  //
  // These two drove a timeout through `interrupt: () => 'timeout'` — a
  // POLLED reason with no raise behind it, which is exactly the defect
  // round 5's finding 7 reports: `runner-lifecycle` makes TIMED_OUT what
  // happens when the governed wall clock elapses, and a requester that
  // can return it authors the provenance of a terminal it has no
  // authority over. `RunSignals.interrupt` returns cancellation only
  // now, so the vehicle these tests used no longer exists.
  //
  // The PROPERTY they proved is untouched and still proved below: a
  // boundary must carry the reason forward rather than flatten it to
  // 'cancel'. It is driven by the wall clock, which is the only thing
  // that may produce a timeout.
  //
  // Worth stating plainly: the hazard is now structural rather than
  // guarded. `abortRun` defaults to `deadline.reason`, and a reason can
  // only exist if it was raised — so there is no longer a signal that
  // can be polled but not raised, which is what a boundary used to drop.
  it('SANDBOX_STARTED records TIMED_OUT, not CANCELLED', async () => {
    const session = new RecordingSession()
    const conclusion = await new Runner(testPorts({ session, adapter: new HangingAdapter() }), {
      deadline_ms: 40,
    }).run(runRequest())

    expect(session.calls, 'the session was open at this boundary').toContain('start')
    expect(session.calls, 'and the boundary interrupted it').toContain('interrupt')
    expect(conclusion.state, 'a timeout must not be recorded as a cancellation').toBe('TIMED_OUT')
  })

  it('a polled cancellation still records CANCELLED — the control', async () => {
    const conclusion = await new Runner(testPorts()).run(runRequest(), {
      interrupt: pollAfter(4),
    })
    expect(conclusion.state).toBe('CANCELLED')
  })
})

/** A journal that refuses the fence on its FIRST acquisition append. */
const fenceRefusingAcquisitionJournal = () => {
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
    const ports = testPorts({ journal: fenceRefusingAcquisitionJournal() })
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
          if (seen === 2) seizeLease(lease, RUN)
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

// ======================================================================
// pr82-round3.test.ts
// ======================================================================

const observation = (terminal: Record<string, unknown>) => ({
  calls: [],
  claims: [],
  events: [],
  terminal,
  usage: [],
})

/**
 * FINDING 1 — the fourth terminal observation is classified by nobody.
 *
 * `runner-execution-boundary` names THREE observations that are carried
 * apart so that they may disagree: "the provider's exit code, its
 * self-reported outcome, and its transcript's terminal event ... Where
 * they disagree the run's terminal state cannot be established and SHALL
 * be `INDETERMINATE`, which is a failure class." RO-INV-36 restates it.
 *
 * `TerminalObservations` declares all four fields.
 * `classifyTerminalObservations` destructures three:
 *
 *     const { exit_code, reported_outcome, signalled } = observations
 *
 * `transcript_terminal` is never read, by the classifier or by the field
 * scan that guards against orchestration re-implementing it. So the one
 * observation the spec names by its own words — the transcript's terminal
 * event — can contradict the other two and the run seals COMPLETED.
 *
 * RO-EX-46 does not catch this: its own comment says "exit code,
 * self-reported outcome and transcript terminal are OBSERVATIONS", and
 * then it exercises only the exit/signal pair.
 */
describe('a transcript terminal that disagrees is not classified at all', () => {
  it('two observations say success, the transcript says error, and the run COMPLETES', async () => {
    const adapter = new ObservingAdapter(
      observation({ exit_code: 0, reported_outcome: 'success', transcript_terminal: 'error' }),
    )
    const conclusion = await new Runner(testPorts({ adapter })).run(runRequest())

    expect(
      conclusion.state,
      'the transcript terminal contradicts the exit code and the claim; nothing establishes this run',
    ).toBe('INDETERMINATE')
  })

  it('agreeing observations complete — the control that proves the fixture reaches the seal', async () => {
    const adapter = new ObservingAdapter(
      observation({ exit_code: 0, reported_outcome: 'success', transcript_terminal: 'success' }),
    )
    const conclusion = await new Runner(testPorts({ adapter })).run(runRequest())
    expect(conclusion.state).toBe('COMPLETED')
  })
})

/**
 * FINDING 2 — a transition whose append failed is dropped, not retried.
 *
 * RO-INV-49: "A journal append that fails leaves its entry PENDING for
 * retry; the cursor advances only for what landed." `#flushJournal`
 * honours that — it confirms only the appends that landed.
 *
 * `commitProjected` then overrides it unconditionally:
 *
 *     this.#journaledTransitions = this.#transitions.length
 *
 * Every transition is marked journaled because the COMMIT wrote the tail
 * — but the commit wrote only the tail. An entry still pending when
 * finalization succeeds is marked as durable without ever having been
 * appended, and the next `journalTick` finds nothing to retry.
 *
 * RO-EX-67 fails the append of `PROFILE_RESOLVED`, which is retried
 * mid-walk three transitions before the commit, so it never reaches the
 * cursor overwrite. The last transition before finalization does.
 */
describe('a failed journal append is lost when the commit overwrites the cursor', () => {
  const failingVerifyingAppend = () => {
    const shared = sharedPorts()
    let failures = 0
    const journal = journalFailing((transition) => {
      // The FIRST append of VERIFYING only — exactly RO-EX-67's shape,
      // moved to the last transition before the commit.
      if (transition.to === 'VERIFYING' && failures === 0) {
        failures += 1
        return true
      }
      return false
    }, shared.journal)
    return {
      ports: testPorts({
        journal,
        events: shared.events,
        evidence: shared.evidence,
        visibility: shared.visibility,
      }),
      failed: () => failures,
    }
  }

  it('the run completes and its journal never records the transition it took', async () => {
    const { ports, failed } = failingVerifyingAppend()
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state, 'the run itself completed').toBe('COMPLETED')
    expect(failed(), 'the injected failure fired exactly once').toBe(1)
    expect(
      conclusion.transitions.map((entry) => entry.to),
      'the machine took the transition',
    ).toContain('VERIFYING')

    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(
      journaled?.transitions.map((entry) => entry.to),
      'a rejected append must stay in the retry set, not be marked journaled by the commit',
    ).toContain('VERIFYING')
    // Stated as the whole record too: the durable walk of a run that
    // concluded is the walk it took, not that walk minus what a
    // transient fault happened to interrupt.
    expect(
      journaled?.transitions.map((entry) => entry.to),
      'the journal is the durable transition record of every transition',
    ).toEqual(conclusion.transitions.map((entry) => entry.to))
  })
})

/**
 * FINDING 3 — the "one owner" scan enumerates three of four mutators.
 *
 * RO-EX-103 claims "EVERY machine-mutating entry point is owned —
 * `advance`, `commitProjected` and `hold`". `RunMachine.apply()` is
 * public, mutates `#state`, appends a transition and bumps `#version`;
 * `advance()` is literally `this.apply(this.claim(), kind, cause)`.
 *
 * So the entry point that does the mutating is the one neither guard
 * scans for. A module calling `machine.apply(machine.claim(), ...)`
 * bypasses `RunScope.reachTerminal` — the owner whose whole purpose is
 * the INDETERMINATE fallback when the machine refuses a terminal — and
 * both structural guards pass. RO-MUT-53 registers exactly this mutation
 * ("mutate the machine through an entry point the owner does not
 * expose") and names RO-EX-103 as its kill.
 */
describe('the one-owner scan does not name the mutator the owners call', () => {
  // Path updated only: the three review files were merged into this one
  // when the pr82-* naming was retired. The assertion is the reviewer's,
  // unchanged.
  const guards = ['conformance/structure.test.ts', 'conformance/falsification.test.ts']

  it('apply() is a public machine mutator — the premise', async () => {
    const { RunMachine } = await import('../lifecycle/index.js')
    const machine = new RunMachine(RUN, { now: () => '2026-08-13T00:00:00.000Z' })
    const before = machine.state
    machine.apply(machine.claim(), 'resolve_profile', 'proof')

    expect(before).toBe('REQUESTED')
    expect(machine.state, 'apply() advances the machine on its own').toBe('PROFILE_RESOLVED')
    expect(machine.transitionRecord, 'and appends to the durable record').toHaveLength(1)
  })

  it('and no structural guard scans for it', () => {
    const scanned = guards.map((guard) => readFileSync(join(srcRoot, guard), 'utf8')).join('\n')

    // Each of the three the claim enumerates is present, which is what
    // makes the fourth's absence a gap rather than a different design.
    for (const owned of ['.advance(', '.commitProjected(', '.hold(']) {
      expect(scanned.includes(`'${owned}'`), `${owned} is scanned`).toBe(true)
    }
    expect(
      scanned.includes("'.apply('"),
      'the guard that claims EVERY mutating entry point omits the one advance() delegates to',
    ).toBe(true)
  })
})

/**
 * FINDING 4 — the last cancellation check precedes the last effects.
 *
 * RO-INV-22: cancellation and timeout are honoured "at every non-terminal
 * boundary, verification included". RO-INV-60: "at EVERY declared
 * boundary". `runner-lifecycle` makes cancel and timeout declared
 * transitions "available from `PROFILE_RESOLVED` and every later
 * non-terminal state", and VERIFYING is one.
 *
 * `verifying.ts` consults the interrupt twice — before the verification
 * epoch, and after the fresh artifact observation. Nothing after that
 * does. Between the second check and the terminal commit the run still
 * performs `lease.renew` and `workspace.applyBack`: the apply-back is the
 * write that escapes isolation, and it is the last await before the seal.
 *
 * A cancellation that becomes active there is never observed. The run
 * seals COMPLETED, and the terminal event announces a completion for a
 * run that was cancelled while still in a non-terminal state.
 */
describe('a cancellation raised during apply-back is never seen', () => {
  const permitted = { path: 'packages/a.ts', kind: 'modified' as const, bytes: 12 }

  /** Cancels the run at the moment the changes leave the workspace. */
  class CancellingApplyBack extends RecordingWorkspaceLifecycle {
    cancelled = false
    override applyBack(request: ApplyBackRequest): Promise<ApplyBackOutcome> {
      this.cancelled = true
      return super.applyBack(request)
    }
  }

  it('the run seals COMPLETED for a run cancelled before its terminal transition', async () => {
    const workspace = new CancellingApplyBack()
    const ports = testPorts({
      workspace,
      observer: new StaticWorkspaceObserver(
        { ok: true, changes: [permitted] },
        { ok: true, digest: `sha256:${'b'.repeat(64)}` },
      ),
    })
    const conclusion = await new Runner(ports).run(runRequest(), {
      interrupt: () => (workspace.cancelled ? 'cancel' : undefined),
    })

    expect(workspace.calls, 'the fixture reached the apply-back').toContain('applyBack')
    expect(
      conclusion.state,
      'a run cancelled while still in VERIFYING must not report a completion',
    ).toBe('CANCELLED')
  })
})

/**
 * FINDING 5 — a session port that hangs leaves the run in ELIGIBLE forever.
 *
 * `runner-lifecycle`: "Every run SHALL carry a deadline derived from its
 * profile's declared wall clock; there is no unbounded run", and "The
 * lifecycle SHALL never abandon a run in a non-terminal state." RO-INV-41
 * and RO-INV-22 restate both.
 *
 * `RunDeadline.until()` is applied to exactly two calls — `adapter.invoke`
 * and `execution.runGate` — and `RunDeadline.arm()` runs at the END of the
 * ELIGIBLE phase, after `session.start()` has returned. Every await before
 * that point is unbounded: the three authority reads, the workspace
 * provision, the session prepare, and the session start.
 *
 * The profile's declared wall clock is already captured and in hand when
 * `eligible` calls `session.prepare()` — `authority.profile.value.limits`
 * is read a few lines later to arm the timer. So this is not the
 * chicken-and-egg case of a budget that is not yet known: the budget is
 * known, and is applied only after the call that can hang.
 *
 * A `prepare()` that never settles therefore holds the run open with no
 * deadline, no interrupt consulted, and no terminal ever recorded. RO-EX-53
 * and RO-EX-54 prove the hung PROVIDER and the hung GATE; the session port
 * has the same shape and no proof.
 */
describe('a hung session port holds the run open past its declared budget', () => {
  /** A session whose prepare never settles. `start` is never reached. */
  class HangingSession implements ExecutionSessionPort {
    readonly calls: string[] = []
    prepare(): Promise<SessionPreparation> {
      this.calls.push('prepare')
      return new Promise<SessionPreparation>(() => {
        // Deliberately never settles: the orchestrator must not depend on
        // a session implementation being well behaved either.
      })
    }
    start(): Promise<SessionStart> {
      return new Promise<SessionStart>(() => {})
    }
    interrupt(): Promise<FenceOutcome> {
      return Promise.resolve({ ok: true })
    }
    close(): Promise<SessionClosure> {
      return Promise.resolve({ torn_down: true })
    }
  }

  const HUNG = 'the run never resolved'

  it('the run resolves on its own budget rather than hanging in ELIGIBLE', async () => {
    const session = new HangingSession()
    const ports = testPorts({ session })
    // A one-millisecond wall clock: a control may only SHORTEN the
    // profile's grant, so this is the shortest budget the run can have.
    const runner = new Runner(ports, { deadline_ms: 1 })

    const outcome = await Promise.race([
      runner.run(runRequest()).then((conclusion) => conclusion.state),
      new Promise<string>((resolve) => setTimeout(() => resolve(HUNG), 250)),
    ])

    expect(session.calls, 'the fixture reached the session port').toContain('prepare')
    expect(outcome, 'a run whose budget has elapsed is not still waiting on a port').not.toBe(HUNG)
  })

  it('a hung PROVIDER does resolve — the control that proves the race exists elsewhere', async () => {
    const { HangingAdapter } = await import('../testing-fixtures.js')
    const ports = testPorts({ adapter: new HangingAdapter() })
    const conclusion = await new Runner(ports, { deadline_ms: 5 }).run(runRequest())
    expect(conclusion.state).toBe('TIMED_OUT')
  })
})

/**
 * FINDING 6 — the lease's test seam is on the production surface.
 *
 * `RunLeasePort` declares `claim`, `renew`, `release`, and `claim` refuses
 * a run that is already leased — that refusal is the whole of the
 * one-owner rule (RO-INV-30). `seizeLease(InMemoryRunLease, )` is the same
 * capability with the refusal removed: it takes a `run_id`, bumps the
 * generation and seizes the run, with no claim, no generation to present
 * and no fence to satisfy.
 *
 * It is annotated "Test seam", but it is declared in production source
 * (`run-state/in-memory.ts`), exported from the package root, and emitted
 * into `dist`. This landing ships no other lease implementation, so it is
 * THE lease. A holder of the port instance can dispossess a live run
 * without ever having owned it.
 *
 * A seam is not safe because tests are its main consumer.
 */
describe('the lease exposes a dispossession capability its port does not declare', () => {
  it('a caller that never claimed can seize a live run — the premise', async () => {
    const { InMemoryRunLease } = await import('../index.js')
    const lease = new InMemoryRunLease()
    const owner = await lease.claim({ run_id: RUN })
    expect(owner.ok).toBe(true)
    if (!owner.ok) return

    // A second CLAIM is refused: that is the one-owner rule working.
    expect((await lease.claim({ run_id: RUN })).ok).toBe(false)

    // The seam is the same act with the refusal taken out.
    seizeLease(lease, RUN)
    expect(
      await lease.renew({ run_id: RUN, generation: owner.generation }),
      'the legitimate holder was dispossessed by a caller that never claimed',
    ).toBe(false)
  })

  it('and the exported surface is exactly the port', async () => {
    const { InMemoryRunLease } = await import('../index.js')
    const declared = ['claim', 'renew', 'release']
    const exposed = Object.getOwnPropertyNames(InMemoryRunLease.prototype).filter(
      (name) => name !== 'constructor',
    )

    expect(
      exposed.sort(),
      'a method the port does not declare is authority no composition granted',
    ).toEqual(declared.sort())
  })
})

// ======================================================================
// RO-EX-115…117 — the second reviewer's round, closed at the class
// ======================================================================

describe('RO-EX-115: a commit capability is frozen, one-shot and version-bound', () => {
  it('a minted capability cannot be edited before it is committed', () => {
    // `readonly` is erased at runtime, so a legitimately held capability
    // could be authorized against one set of entries and applied with
    // another. Identity said "this machine minted it"; it said nothing
    // about what it still contains.
    const machine = new RunMachine(RUN, new SteppingClock())
    const projected = machine.project([{ kind: 'resolve_profile', cause: 'ok' }])
    expect(projected.ok).toBe(true)
    if (!projected.ok) return

    expect(() => {
      ;(projected.capability.entries[0] as { to: string }).to = 'COMPLETED'
    }).toThrow()
    machine.commitProjected(projected.capability)
    expect(machine.state, 'the machine took the transition it authorized').toBe('PROFILE_RESOLVED')
  })

  it('a second projection from the same version is stale once the first commits', () => {
    // Two capabilities minted at one version both committed, the second
    // walking the machine out of a terminal — which the totality rule
    // forbids outright. A capability describes a transition FROM a state;
    // once the machine has moved it describes nothing.
    const machine = new RunMachine(RUN, new SteppingClock())
    const first = machine.project([{ kind: 'resolve_profile', cause: 'first' }])
    const second = machine.project([{ kind: 'resolve_profile', cause: 'second' }])
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    machine.commitProjected(first.capability)
    expect(() => {
      machine.commitProjected(second.capability)
    }).toThrow(/stale projection/)
    expect(machine.state).toBe('PROFILE_RESOLVED')
  })
})

describe('RO-EX-116: the canonical table is immutable authority', () => {
  it('mutating the exported table does not widen a default run', () => {
    // `TRANSITIONS` is exported from the package root and `RunMachine`
    // defaults to it directly, so an ordinary object here is lifecycle
    // authority any holder can widen mid-run. Freezing inside `Runner`
    // would not have reached the public machine path.
    expect(Object.isFrozen(TRANSITIONS), 'the table itself').toBe(true)
    expect(Object.isFrozen(TRANSITIONS.ELIGIBLE), 'and every row').toBe(true)
    expect(() => {
      ;(TRANSITIONS.ELIGIBLE as Record<string, string>)['commit_spend'] = 'COMPLETED'
    }).toThrow()
  })
})

describe('RO-EX-117: a conclusion cannot state an impossible pairing', () => {
  it('a dispossessed attempt does not terminalize its own machine', async () => {
    // The write guard caught the RECORD and not the TRANSITION, so a run
    // that already knew it was dispossessed minted OPERATIONAL_FAILURE
    // locally and reported `ownership_lost` carrying it. Declaring the
    // logical run's terminal is the one thing a stale holder may not do.
    const ports = testPorts({
      journal: fenceRefusingAcquisitionJournal(),
      authority: new CountingAuthoritySource({
        profile: { ok: false, source: { source: 'profile' }, failure: 'gone' },
      }),
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.kind).toBe('ownership_lost')
    expect(
      conclusion.transitions.map((entry) => entry.to),
      'a stale holder mints no terminal',
    ).not.toContain('OPERATIONAL_FAILURE')
  })

  it('a machine granted no terminal reports unterminated, not terminal', async () => {
    // RO-EX-89 constructs a RUNNING state from which every terminal is
    // removed, and its whole purpose is proving none was granted — while
    // the conclusion said `kind: 'terminal'` alongside `state: 'RUNNING'`.
    let table = TRANSITIONS
    for (const kind of [
      'indeterminate',
      'operational_fault',
      'refuse',
      'cancel',
      'timeout',
    ] as const) {
      const row = { ...table.RUNNING }
      delete row[kind]
      table = { ...table, RUNNING: row }
    }
    const conclusion = await new Runner(testPorts({ observer: explodingObserver }), {
      transitions: table,
    }).run(runRequest())

    expect(conclusion.kind).toBe('unterminated')
    expect(conclusion.produced).toBe('none')
  })

  it('an ordinary run is terminal and a consent-held run is held', async () => {
    // The controls. Without them "never say terminal" would be satisfied
    // by a conclusion that never says it at all.
    const completed = await new Runner(testPorts()).run(runRequest())
    expect(completed.kind).toBe('terminal')

    const held = await new Runner(testPorts()).run(withoutConsent(runRequest()))
    expect(held.kind).toBe('held')
  })
})

/** An observer that explodes at the workspace read inside RUNNING. */
const explodingObserver = {
  observe: () => {
    throw new Error('the observer exploded')
  },
  observeBase: () => Promise.resolve({ ok: true as const, digest: PINNED_BASE }),
}
