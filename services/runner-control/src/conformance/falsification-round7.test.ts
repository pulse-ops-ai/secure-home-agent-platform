/**
 * FALSIFICATION ROUND 7 — settlement provenance, terminal precedence,
 * immutable history, and the remaining coordinator carry-forwards.
 *
 * These cases are written from the review findings, not from the names
 * of the current implementation. Each behavioral fixture proves that it
 * reached the mechanism it is intended to attack. Production code is
 * deliberately untouched: this file is the RED round.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { InMemoryRunLease } from '../adapters/index.js'
import { RunMachine } from '../lifecycle/index.js'
import { ABANDON_GRACE_MS } from '../orchestration/controls.js'
import { RunDeadline } from '../orchestration/deadline.js'
import type {
  AuthorityBytes,
  CommitOutcome,
  FinalizationCommit,
  FinalizationPort,
  LeaseClaim,
  LeaseClaimRequest,
  RunJournalPort,
} from '../ports/index.js'
import { Runner } from '../runner.js'
import {
  CountingAuthoritySource,
  HangingAdapter,
  PINNED_BASE,
  RecordingSession,
  RecordingWorkspaceLifecycle,
  governedWrites,
  profileDocument,
  runRequest,
  sharedPorts,
  testPorts,
  type TestPorts,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'
const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(here, '..')
const changeRoot = resolve(srcRoot, '../../../openspec/changes/runner-control-orchestration')

const delay = (ms: number): Promise<void> =>
  new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, ms)
  })

const within = async <T>(promise: Promise<T>, ms: number): Promise<T | undefined> =>
  await Promise.race([promise, delay(ms).then(() => undefined)])

const profileWithWallClock = (seconds: number): AuthorityBytes => {
  const document = profileDocument()
  return {
    ok: true,
    source: { source: 'profile' },
    bytes: JSON.stringify({
      ...document,
      limits: {
        ...(document['limits'] as Record<string, unknown>),
        wall_clock_seconds: seconds,
      },
    }),
  }
}

const boundJournal = (journal: RunJournalPort): RunJournalPort => ({
  stageTransitions: journal.stageTransitions.bind(journal),
  appendTransition: journal.appendTransition.bind(journal),
  appendRejection: journal.appendRejection.bind(journal),
  appendAcquisition: journal.appendAcquisition.bind(journal),
  appendHold: journal.appendHold.bind(journal),
  readCurrentState: journal.readCurrentState.bind(journal),
})

const sourceFiles = (root: string): readonly string[] => {
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path))
      continue
    }
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(path)
  }
  return files
}

const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

const namedMutation = (source: string, id: string): string => {
  const start = source.indexOf(`id: '${id}'`)
  if (start < 0) return ''
  const end = source.indexOf('\n  {', start + 1)
  return source.slice(start, end < 0 ? undefined : end)
}

// Assurance aliases for this reviewer-authored round.
// RO-EX-135 RO-EX-136 RO-EX-137 RO-EX-138 RO-EX-139 RO-EX-140 RO-EX-141

// =====================================================================
// FINDING 1 — expiry of the finite settlement/cleanup ceiling is not a
// governed wall-clock timeout.
// =====================================================================

class SlowCompletionFinalization implements FinalizationPort {
  started = false
  finished = false
  readonly #inner: FinalizationPort
  readonly #delayMs: number

  constructor(inner: FinalizationPort, delayMs: number) {
    this.#inner = inner
    this.#delayMs = delayMs
  }

  async commit(commit: FinalizationCommit): Promise<CommitOutcome> {
    this.started = true
    await delay(this.#delayMs)
    this.finished = true
    return await this.#inner.commit(commit)
  }
}

describe('settlement expiry cannot fabricate governed timeout provenance', () => {
  it('a slow COMPLETED finalization outliving the cleanup ceiling is not TIMED_OUT', async () => {
    const base = testPorts()
    const finalization = new SlowCompletionFinalization(base.finalization, ABANDON_GRACE_MS + 75)
    const ports = { ...base, finalization } as unknown as TestPorts

    const conclusion = await new Runner(ports, { deadline_ms: 2_000 }).run(runRequest())

    // Controls: finalization really ran, and it really outlived the
    // short cleanup/settlement ceiling while the profile clock remained
    // healthy.
    expect(finalization.started, 'the run reached COMPLETED finalization').toBe(true)
    expect(finalization.finished, 'the finalization remained pending past the short ceiling').toBe(
      true,
    )

    expect(conclusion.state, 'only the governed wall clock may produce TIMED_OUT').toBe('COMPLETED')
  })
})

// =====================================================================
// FINDING 2 — cancellation and timeout remain available while a run is
// still VERIFYING and a COMPLETED finalization is pending.
// =====================================================================

class PendingCompletionFinalization implements FinalizationPort {
  completionStarted = false
  completionSignalAborted = false
  readonly #inner: FinalizationPort

  constructor(inner: FinalizationPort) {
    this.#inner = inner
  }

  commit(commit: FinalizationCommit): Promise<CommitOutcome> {
    if (commit.terminal !== 'COMPLETED') return this.#inner.commit(commit)

    this.completionStarted = true
    return new Promise<CommitOutcome>((resolveCommit) => {
      const answerLate = (): void => {
        this.completionSignalAborted = commit.signal.aborted
        setTimeout(() => {
          // Deliberately ignores cancellation and reports success late.
          // The coordinator must already have detached this continuation.
          resolveCommit({ ok: true })
        }, 10)
      }
      if (commit.signal.aborted) answerLate()
      else commit.signal.addEventListener('abort', answerLate, { once: true })
    })
  }
}

describe('terminalization does not disable interruption from VERIFYING', () => {
  it('cancellation while COMPLETED finalization is pending wins before publication', async () => {
    const base = testPorts()
    const finalization = new PendingCompletionFinalization(base.finalization)
    const ports = { ...base, finalization } as unknown as TestPorts

    const conclusion = await new Runner(ports, { deadline_ms: 5_000 }).run(runRequest(), {
      interrupt: () => (finalization.completionStarted ? 'cancel' : undefined),
    })

    // Controls: the run was already attempting COMPLETED from VERIFYING,
    // and that in-flight attempt observed the abort.
    expect(finalization.completionStarted, 'the run reached COMPLETED finalization').toBe(true)
    expect(finalization.completionSignalAborted, 'cancellation reached the pending commit').toBe(
      true,
    )
    expect(conclusion.transitions.at(-1)?.from).toBe('VERIFYING')

    expect(conclusion.state, 'a non-terminal VERIFYING run must still honour cancellation').toBe(
      'CANCELLED',
    )
  })

  it('the profile clock also interrupts a pending COMPLETED finalization promptly', async () => {
    vi.useFakeTimers()
    try {
      const base = testPorts()
      const finalization = new PendingCompletionFinalization(base.finalization)
      const ports = { ...base, finalization } as unknown as TestPorts
      let conclusion: Awaited<ReturnType<Runner['run']>> | undefined

      void new Runner(ports, { deadline_ms: 50 }).run(runRequest()).then((value) => {
        conclusion = value
      })

      // This is well past the governed 50 ms profile clock but still
      // before the independent 250 ms settlement ceiling.
      await vi.advanceTimersByTimeAsync(100)

      expect(finalization.completionStarted, 'the run reached pending finalization').toBe(true)
      expect(
        finalization.completionSignalAborted,
        'the governed profile clock reached the pending commit',
      ).toBe(true)
      expect(
        conclusion,
        'timeout was not postponed until the unrelated settlement ceiling',
      ).toBeDefined()
      expect(conclusion?.state).toBe('TIMED_OUT')
      expect(conclusion?.transitions.at(-1)?.from).toBe('VERIFYING')
    } finally {
      vi.useRealTimers()
    }
  })
})

// =====================================================================
// FINDING 3 — once the profile's absolute budget is exhausted, no next
// effect may be started in the same JavaScript turn.
// =====================================================================

describe('an already-exhausted profile budget starts no further effect', () => {
  it('workspace provisioning that consumes the budget cannot be followed by session.prepare', async () => {
    vi.useFakeTimers()
    try {
      const authority = new CountingAuthoritySource({ profile: profileWithWallClock(1) })
      const workspace = new RecordingWorkspaceLifecycle()
      const session = new RecordingSession()
      let provisioningStarted = false
      const delayedWorkspace = {
        provision: async (request: Parameters<RecordingWorkspaceLifecycle['provision']>[0]) => {
          provisioningStarted = true
          await delay(1_100)
          return await workspace.provision(request)
        },
        applyBack: workspace.applyBack.bind(workspace),
        discard: workspace.discard.bind(workspace),
      }
      let conclusion: Awaited<ReturnType<Runner['run']>> | undefined

      void new Runner(testPorts({ authority, workspace: delayedWorkspace, session }))
        .run(runRequest())
        .then((value) => {
          conclusion = value
        })

      await vi.advanceTimersByTimeAsync(1_250)

      // Controls: provisioning really began and its underlying operation
      // eventually returned after consuming more than the whole profile
      // budget.
      expect(provisioningStarted).toBe(true)
      expect(workspace.calls).toContain('provision')
      expect(conclusion?.state, 'the one-second profile clock really elapsed').toBe('TIMED_OUT')

      expect(
        session.calls,
        'a late provisioning answer must not resume the phase and start prepare',
      ).not.toContain('prepare')
    } finally {
      vi.useRealTimers()
    }
  })
})

// =====================================================================
// FINDING 4 — transition and rejection entries are immutable history,
// including through the journal boundary.
// =====================================================================

describe('transition history cannot be edited by reference', () => {
  it('editing transitionRecord[0] does not change the machine next time it is read', () => {
    const machine = new RunMachine(RUN, { now: () => '2026-08-14T00:00:00.000Z' })
    const applied = machine.advance('resolve_profile', 'captured authority')
    expect(applied.kind, 'the control: the machine minted a transition').toBe('advanced')

    const snapshot = machine.transitionRecord
    const original = snapshot[0]?.cause
    ;(snapshot[0] as { cause: string }).cause = 'forged by caller'

    // Control: this is a real mutation attempt against the object the
    // caller received, not an assignment TypeScript optimized away.
    expect(snapshot[0]?.cause).toBe('forged by caller')
    expect(machine.transitionRecord[0]?.cause).toBe(original)
  })

  it('a journal port editing request.transition cannot rewrite machine history', async () => {
    const base = testPorts()
    const inner = base.journal
    let attempted = false
    let editLanded = false
    const journal: RunJournalPort = {
      ...boundJournal(inner),
      appendTransition: async (request) => {
        if (!attempted) {
          attempted = true
          try {
            ;(request.transition as { cause: string }).cause = 'forged by journal'
            editLanded = request.transition.cause === 'forged by journal'
          } catch {
            editLanded = false
          }
        }
        return await inner.appendTransition(request)
      },
    }
    const ports = { ...base, journal } as unknown as TestPorts

    const conclusion = await new Runner(ports).run(runRequest())
    const durable = await inner.readCurrentState({ run_id: RUN })

    expect(conclusion.state, 'the control: the meddling journal was on the completed path').toBe(
      'COMPLETED',
    )
    expect(attempted, 'the journal received a transition entry').toBe(true)

    expect(editLanded, 'the entry should be frozen or defensively copied at the boundary').toBe(
      false,
    )
    expect(conclusion.transitions.some((entry) => entry.cause === 'forged by journal')).toBe(false)
    expect(durable?.transitions.some((entry) => entry.cause === 'forged by journal')).toBe(false)
  })

  it('a transition handed back by advance() is frozen at mint, not a live internal reference', () => {
    // The reviewer's exact remedy: freeze the entry when the machine
    // MINTS it, not merely when a getter copies it. `transitionRecord`
    // and `rejections` copy on read, so the case above them is defended;
    // the object `advance()` returns directly is not copied, and it is
    // the same reference the machine pushed into its private arrays.
    const machine = new RunMachine(RUN, { now: () => '2026-08-14T00:00:00.000Z' })

    const advanced = machine.advance('resolve_profile', 'captured authority')
    expect(advanced.kind, 'the control: the machine minted a transition').toBe('advanced')
    if (advanced.kind !== 'advanced') return
    const originalCause = machine.transitionRecord[0]?.cause
    ;(advanced.entry as { cause: string }).cause = 'forged at mint'
    // Control: the returned object really was mutated in place.
    expect(advanced.entry.cause).toBe('forged at mint')
    expect(
      machine.transitionRecord[0]?.cause,
      'a minted transition entry must not be the internal record by reference',
    ).toBe(originalCause)
  })

  it('a rejection handed back by advance() is frozen at mint too', () => {
    // The rejection route the review names, which no other case exercises.
    const machine = new RunMachine(RUN, { now: () => '2026-08-14T00:00:00.000Z' })
    expect(machine.advance('resolve_profile', 'captured authority').kind).toBe('advanced')
    const rejected = machine.advance('commit_spend', 'undeclared from PROFILE_RESOLVED')
    expect(rejected.kind, 'the control: the machine recorded a rejection').toBe('rejected')
    if (rejected.kind !== 'rejected') return
    const originalDetail = machine.rejections[0]?.detail
    ;(rejected.entry as { detail: string }).detail = 'forged rejection'
    expect(rejected.entry.detail).toBe('forged rejection')
    expect(
      machine.rejections[0]?.detail,
      'a minted rejection entry must not be the internal record by reference',
    ).toBe(originalDetail)
  })
})

// =====================================================================
// FINDING 5 — a throwing public cancellation probe is governed input,
// never an exception escaping from a naked timer callback.
// =====================================================================

describe('a throwing cancellation probe cannot escape the run boundary', () => {
  it('a throw while a port is outstanding concludes governed with no uncaught timer error', async () => {
    const adapter = new HangingAdapter()
    const uncaught: unknown[] = []
    const onUncaught = (error: unknown): void => {
      uncaught.push(error)
    }
    let threw = false
    process.prependListener('uncaughtException', onUncaught)
    try {
      const conclusion = await new Runner(testPorts({ adapter }), {
        deadline_ms: 1_000,
      }).run(runRequest(), {
        interrupt: () => {
          if (adapter.requests.length === 0) return undefined
          if (!threw) {
            threw = true
            throw new Error('signal source failed')
          }
          return 'cancel'
        },
      })
      await delay(20)

      // Controls: the provider call was outstanding and the public
      // callback really did throw from the in-flight polling window.
      expect(adapter.requests).toHaveLength(1)
      expect(threw).toBe(true)

      expect(conclusion.state, 'a broken signal source fails closed as a governed stop').toBe(
        'CANCELLED',
      )
      expect(uncaught, 'nothing escaped from the polling timer').toEqual([])
    } finally {
      process.removeListener('uncaughtException', onUncaught)
    }
  })
})

// =====================================================================
// FINDING 6 — mechanism modules do not depend back on orchestration.
// =====================================================================

describe('interruption identity lives at a neutral seam', () => {
  it('acquisition/** and events/** import no orchestration module', () => {
    const detectsOrchestrationImport = (source: string): boolean =>
      /\bfrom\s*['"][^'"]*\/orchestration(?:\/[^'"]*)?['"]/.test(codeOnly(source))

    // Control: the guard detects the forbidden direction it names.
    expect(
      detectsOrchestrationImport("import { Broken } from '../orchestration/deadline.js'"),
    ).toBe(true)

    const offenders = ['acquisition', 'events']
      .flatMap((directory) => sourceFiles(join(srcRoot, directory)))
      .filter((file) => detectsOrchestrationImport(readFileSync(file, 'utf8')))
      .map((file) => relative(srcRoot, file))

    expect(offenders, 'mechanisms must not import orchestration/**').toEqual([])
  })
})

// =====================================================================
// FINDING 7 — the proof net must describe one architecture, not certify
// both whole-walk abandonment and port-bound interruption.
// =====================================================================

describe('the active proof net has one interruption architecture', () => {
  it('invariants, D13, and mutants consistently make the port boundary authoritative', () => {
    const assurance = readFileSync(join(changeRoot, 'assurance.md'), 'utf8')
    const design = readFileSync(join(changeRoot, 'design.md'), 'utf8')
    const mutationMap = readFileSync(join(here, 'mutation-map.test.ts'), 'utf8')
    const row = (id: string): string =>
      assurance.split('\n').find((line) => line.startsWith(`| ${id} |`)) ?? ''

    const oldDesiredArchitecture = /walk is raced against the deadline/i
    expect(
      oldDesiredArchitecture.test('| RO-INV-67 | the walk is raced against the deadline |'),
      'the control: the stale normative sentence is detectable',
    ).toBe(true)

    const invariantRows = assurance.split('\n').filter((line) => /^\| RO-INV-\d+ \|/.test(line))
    expect(invariantRows.filter((line) => oldDesiredArchitecture.test(line))).toEqual([])

    expect(row('RO-INV-67')).toContain('complete asynchronous port boundary')
    expect(row('RO-MUT-58')).toContain('complete injected port surface')
    expect(row('RO-MUT-68')).toContain('racing and abandoning the whole walk')
    expect(design).toContain(
      '### D13: The call boundary owns interruption; the walk is never abandoned',
    )

    expect(namedMutation(mutationMap, 'RO-MUT-58')).toContain('complete port surface')
    expect(namedMutation(mutationMap, 'RO-MUT-68')).toContain('race and abandon the whole walk')
  })
})

// =====================================================================
// CARRY-FORWARD 1 — an aborted claim attempt cannot become ownership.
// =====================================================================

class AbortableClaimLease {
  readonly inner = new InMemoryRunLease()
  aborted = false

  claim(request: LeaseClaimRequest): Promise<LeaseClaim> {
    return new Promise<LeaseClaim>((resolveClaim) => {
      const abort = (): void => {
        this.aborted = true
        resolveClaim({
          ok: false,
          reason: 'claim_aborted',
          detail: `claim attempt ${request.attempt_id} was aborted`,
        })
      }
      if (request.signal.aborted) abort()
      else request.signal.addEventListener('abort', abort, { once: true })
    })
  }

  renew(request: Parameters<InMemoryRunLease['renew']>[0]): Promise<boolean> {
    return this.inner.renew(request)
  }

  release(request: Parameters<InMemoryRunLease['release']>[0]): Promise<void> {
    return this.inner.release(request)
  }
}

describe('an aborted lease attempt cannot become ownership', () => {
  it('the resource observes abort and the run remains immediately claimable', async () => {
    const lease = new AbortableClaimLease()
    const conclusion = await new Runner(testPorts({ lease }), { deadline_ms: 10 }).run(runRequest())

    expect(conclusion.kind, 'the control: the caller already received not_started').toBe(
      'not_started',
    )
    expect(lease.aborted, 'the pending claim observed the governed abort').toBe(true)

    const retry = await lease.inner.claim({
      run_id: RUN,
      attempt_id: 'retry',
      signal: new AbortController().signal,
    })
    expect(retry.ok, 'an aborted attempt never became ownership').toBe(true)
    if (retry.ok) await lease.inner.release({ run_id: RUN, generation: retry.generation })
  })
})

// =====================================================================
// CARRY-FORWARD 2 — journal flushing and recovery use the same bounded
// port set as ordinary phase effects.
// =====================================================================

const hangingJournal = (
  inner: RunJournalPort,
  shouldHang: (to: string) => boolean,
  reached: () => void,
): RunJournalPort => ({
  ...boundJournal(inner),
  stageTransitions: (request) => {
    if (request.transitions.some((transition) => shouldHang(transition.to))) {
      reached()
      return new Promise<never>(() => {})
    }
    return inner.stageTransitions(request)
  },
  appendTransition: (request) => {
    if (shouldHang(request.transition.to)) {
      reached()
      return new Promise<never>(() => {})
    }
    return inner.appendTransition(request)
  },
})

describe('journal and recovery work remain inside finite port boundaries', () => {
  it('a hanging ordinary journal flush cannot hold run() open', async () => {
    const base = testPorts()
    let reached = false
    const journal = hangingJournal(
      base.journal,
      (to) => to === 'PROFILE_RESOLVED',
      () => {
        reached = true
      },
    )
    const ports = { ...base, journal } as unknown as TestPorts

    const conclusion = await within(
      new Runner(ports, { deadline_ms: 20 }).run(runRequest()),
      ABANDON_GRACE_MS * 6 + 250,
    )

    expect(reached, 'the run was blocked in journal flushing').toBe(true)
    expect(conclusion, 'the flush must be rejected by a finite boundary').toBeDefined()
    expect(conclusion?.kind, 'the bounded failure has an explicit governed conclusion').toBe(
      'settlement_failed',
    )
  })

  it('a hanging recovery journal stage cannot hold the last-resort handler open', async () => {
    const shared = sharedPorts()
    let reached = false
    const journal = hangingJournal(
      shared.journal,
      (to) => to === 'INDETERMINATE',
      () => {
        reached = true
      },
    )
    const observer = {
      observe: () => {
        throw new Error('the observer exploded after authority capture')
      },
      observeBase: () => Promise.resolve({ ok: true as const, digest: PINNED_BASE }),
    }
    const ports = testPorts({
      journal,
      events: shared.events,
      evidence: shared.evidence,
      visibility: shared.visibility,
      observer,
    })

    const conclusion = await within(new Runner(ports).run(runRequest()), ABANDON_GRACE_MS + 250)

    expect(reached, 'the exception path reached its terminal journal stage').toBe(true)
    expect(conclusion, 'recovery must use bounded ports too').toBeDefined()
    expect(conclusion?.kind).toBe('settlement_failed')
    expect(conclusion?.state).toBe('RUNNING')
  })
})

// =====================================================================
// CARRY-FORWARD 3 — generic recovery after PROFILE_RESOLVED still owes
// the full-bundle shape required for every post-authority terminal.
// =====================================================================

describe('post-authority recovery satisfies the full-bundle rule', () => {
  it('an escaping RUNNING fault seals INDETERMINATE evidence, not none', async () => {
    const observer = {
      observe: () => {
        throw new Error('the observer exploded after authority capture')
      },
      observeBase: () => Promise.resolve({ ok: true as const, digest: PINNED_BASE }),
    }
    const ports = testPorts({ observer })

    const conclusion = await new Runner(ports).run(runRequest())

    // Controls: the run captured authority and reached RUNNING before
    // the generic recovery path was entered.
    expect(conclusion.transitions.map((entry) => entry.to)).toContain('PROFILE_RESOLVED')
    expect(conclusion.transitions.map((entry) => entry.to)).toContain('RUNNING')
    expect(conclusion.state).toBe('INDETERMINATE')

    expect(conclusion.produced, 'every post-authority terminal owes a full bundle').toBe(
      'evidence_bundle',
    )
    expect(governedWrites(ports, RUN).map((write) => write.kind)).toEqual(['evidence_bundle'])
  })
})

// =====================================================================
// CARRY-FORWARD 4 — settlement is a value/capability, not a mutable mode
// flag that every failure path must remember to toggle.
// =====================================================================

describe('settlement is structurally required rather than a mode flag', () => {
  it('a fresh settlement capability is distinct from the run deadline', () => {
    const deadline = new RunDeadline()
    const first = deadline.settlement()
    const second = deadline.settlement()
    try {
      expect(first).not.toBe(deadline)
      expect(second).not.toBe(first)
      expect(typeof first.call).toBe('function')

      const source = codeOnly(readFileSync(join(srcRoot, 'orchestration/deadline.ts'), 'utf8'))
      expect(source, 'no mutable settlement-mode bit may control call semantics').not.toMatch(
        /#(?:settling|settlementMode)\b/,
      )
      expect(source, 'the old mutate-in-place settle() seam must stay absent').not.toMatch(
        /\bsettle\s*\(\s*\)\s*:\s*void/,
      )
    } finally {
      first.disarm()
      second.disarm()
      deadline.disarm()
    }
  })
})

// =====================================================================
// CARRY-FORWARD 5 — once the injected port set is centrally guarded,
// call sites do not wrap the same port in a second deadline owner.
// =====================================================================

describe('ports have one timeout/cancellation owner', () => {
  it('phase code contains no local deadline wrapper around an already-guarded port', () => {
    const redundant = /\b(?:env\.)?deadline\.(?:until|call)\s*\(/
    expect(
      redundant.test('await env.deadline.call(() => ports.session.prepare(request))'),
      'the control: a redundant local wrapper is detectable',
    ).toBe(true)

    const offenders = sourceFiles(join(srcRoot, 'orchestration', 'phases'))
      .filter((file) => redundant.test(codeOnly(readFileSync(file, 'utf8'))))
      .map((file) => relative(srcRoot, file))

    expect(offenders, 'the guarded port set must have one interruption owner').toEqual([])
  })
})
