/**
 * FALSIFICATION ROUND 10 — the edges of round 9's own abstractions.
 *
 * Round 9 taught the boundary to reject late results, made the seal gate
 * derive from the pending set, and gave lease attempts identity and
 * resolution. These cases attack what each of those still misses: a
 * late REJECTION of a write that already published, two journal
 * categories living outside the outbox the gate derives from, a spent
 * attempt whose replay mints fresh ownership, and an authority record
 * whose named source is a reviewer rather than the owner.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { InMemoryRunLease, TransactionalFinalization } from '../adapters/index.js'
import type { TransitionEntry } from '../lifecycle/index.js'
import type {
  FinalizationPort,
  JournaledAcquisition,
  JournaledHold,
  RunJournalPort,
} from '../ports/index.js'
import { Runner } from '../runner.js'
import {
  governedWrites,
  runRequest,
  sharedPorts,
  testPorts,
  withoutConsent,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'

// Assurance aliases for this reviewer-authored round.
// RO-EX-153 RO-EX-154 RO-EX-155 RO-EX-156

const T0 = '2026-08-14T00:00:00.000Z'
const epoch = (offsetMs: number): number => Date.parse(T0) + offsetMs

describe('RO-EX-153: an acknowledged commit is a fact, not a candidate', () => {
  it('a commit acknowledged as wall time crosses expiry stays COMPLETED', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(T0))
      const ports = testPorts()
      const original = ports.finalization
      const crossing: FinalizationPort = {
        commit: async (commit) => {
          // Publication happens INSIDE the budget; only the
          // acknowledgement's return crosses the expiry. The write-side
          // twin of the lease grant/ack ambiguity: by the time the
          // boundary sees the result, COMPLETED is already visible.
          const outcome = await original.commit(commit)
          vi.setSystemTime(new Date(epoch(201)))
          return outcome
        },
      }
      const conclusion = await new Runner(
        { ...ports, finalization: crossing },
        {
          deadline_ms: 200,
        },
      ).run(runRequest())

      expect(
        conclusion.state,
        'a published COMPLETED cannot be re-reported as an uncommitted timeout',
      ).toBe('COMPLETED')
      expect(conclusion.kind).toBe('terminal')
      expect(
        governedWrites(ports, RUN).filter((write) => write.kind === 'evidence_bundle'),
        'a second settlement over a published commit would publish a second terminal',
      ).toHaveLength(1)
      const journaled = await ports.journal.readCurrentState({ run_id: RUN })
      expect(journaled?.transitions.at(-1)?.to).toBe('COMPLETED')
    } finally {
      vi.useRealTimers()
    }
  })

  it('the publication point itself refuses a commit whose expiry has passed', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(T0))
      const shared = sharedPorts()
      const lease = new InMemoryRunLease()
      const claim = await lease.claim({
        run_id: RUN,
        attempt_id: 'commit-proof',
        signal: new AbortController().signal,
      })
      expect(claim.ok).toBe(true)
      if (!claim.ok) return

      // Staging succeeds, but wall time crosses the commit's absolute
      // expiry while the terminal event is being prepared. The public
      // contract only carried an AbortSignal, which nothing raises here
      // — exactly the case where the publication point must consult the
      // expiry synchronously itself.
      const events = {
        emit: shared.events.emit.bind(shared.events),
        stageEmit: (request: Parameters<(typeof shared.events)['stageEmit']>[0]) => {
          vi.setSystemTime(new Date(epoch(101)))
          return shared.events.stageEmit(request)
        },
      }
      const finalization = new TransactionalFinalization({
        journal: shared.journal,
        events: events,
        evidence: shared.evidence,
        visibility: shared.visibility,
        lease,
      })
      const tail: TransitionEntry = {
        run_id: RUN,
        from: 'VERIFYING',
        to: 'EVIDENCE_SEALED',
        kind: 'seal_evidence',
        cause: 'evidence sealed',
        at: T0,
      }
      const outcome = await finalization.commit({
        run_id: RUN,
        generation: claim.generation,
        terminal: 'EVIDENCE_SEALED',
        transitions: [tail],
        event: { event_type: 'run.terminated' },
        bundle: { proof: true },
        signal: new AbortController().signal,
        expires_at_epoch_ms: epoch(100),
      })

      expect(outcome.ok, 'publication after expiry is the timeout it pretends not to be').toBe(
        false,
      )
      expect(
        await shared.journal.readCurrentState({ run_id: RUN }),
        'a refused commit leaves no observable trace at any participant',
      ).toBeUndefined()
      expect(shared.evidence.all).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('RO-EX-154: the journal outbox covers every category the journal records', () => {
  const journalWith = (
    overrides: Partial<RunJournalPort>,
  ): { journal: RunJournalPort; shared: ReturnType<typeof sharedPorts> } => {
    const shared = sharedPorts()
    return {
      shared,
      journal: {
        stageTransitions: shared.journal.stageTransitions.bind(shared.journal),
        appendTransition: shared.journal.appendTransition.bind(shared.journal),
        appendRejection: shared.journal.appendRejection.bind(shared.journal),
        appendAcquisition: shared.journal.appendAcquisition.bind(shared.journal),
        appendHold: shared.journal.appendHold.bind(shared.journal),
        readCurrentState: shared.journal.readCurrentState.bind(shared.journal),
        ...overrides,
      },
    }
  }

  it('a verification acquisition that cannot be journaled blocks the seal', async () => {
    // The reviewer counterexample: the verification authority source is
    // read, its acquisition append faults, and the INDETERMINATE bundle
    // sealed anyway — over a durable record missing an acquisition that
    // actually happened.
    const { shared, journal } = journalWith({
      appendAcquisition: (request: { acquisition: JournaledAcquisition }) =>
        request.acquisition.epoch === 'verification'
          ? Promise.reject(new Error('journal down'))
          : shared.journal.appendAcquisition(request as never),
    })
    const ports = testPorts({ ...shared, journal })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).not.toBe('COMPLETED')
    expect(
      governedWrites(ports, RUN).filter((write) => write.kind === 'evidence_bundle'),
      'sealing over a missing acquisition fact is a partial durable record',
    ).toHaveLength(0)
  })

  it('a transient acquisition append failure is retried, not fatal and not lost', async () => {
    let failures = 0
    const { shared, journal } = journalWith({
      appendAcquisition: (request: { acquisition: JournaledAcquisition }) => {
        if (request.acquisition.epoch === 'verification' && failures === 0) {
          failures += 1
          return Promise.reject(new Error('journal blip'))
        }
        return shared.journal.appendAcquisition(request as never)
      },
    })
    const ports = testPorts({ ...shared, journal })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(failures).toBe(1)
    expect(conclusion.state, 'one journal blip must not cost the run its terminal').toBe(
      'COMPLETED',
    )
    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(
      journaled?.acquisitions.some((entry) => entry.epoch === 'verification'),
      'the retried acquisition fact must land in the durable record',
    ).toBe(true)
  })

  it('a hold append that throws does not turn a held run into a sealed INDETERMINATE', async () => {
    // Round 11's owner decision sharpened what this proof may expect:
    // `held` means a DURABLE resumable identity actually exists, not
    // merely that an in-process object remembers a hold. A journal that
    // never accepts the hold fact therefore cannot yield a `held`
    // conclusion — and it still must not crash the run into recovery
    // and seal an INDETERMINATE bundle for a run that is merely
    // waiting. The conclusion claims no durability it does not have.
    const { shared, journal } = journalWith({
      appendHold: () => Promise.reject(new Error('journal down')),
    })
    const ports = testPorts({ ...shared, journal })
    const conclusion = await new Runner(ports).run(withoutConsent(runRequest()))

    expect(
      conclusion.kind,
      'an in-process hold with no durable identity is not a held run',
    ).not.toBe('held')
    expect(conclusion.state, 'and the fault does not terminalize the waiting run').toBe('ELIGIBLE')
    expect(conclusion.produced).toBe('none')
    expect(
      governedWrites(ports, RUN).filter((write) => write.kind === 'evidence_bundle'),
      'no terminal evidence may seal over the missing hold fact',
    ).toHaveLength(0)
  })

  it('a transient hold append failure still leaves the run findable', async () => {
    let failures = 0
    const { shared, journal } = journalWith({
      appendHold: (request: { hold: JournaledHold }) => {
        if (failures === 0) {
          failures += 1
          return Promise.reject(new Error('journal blip'))
        }
        return shared.journal.appendHold(request as never)
      },
    })
    const ports = testPorts({ ...shared, journal })
    const conclusion = await new Runner(ports).run(withoutConsent(runRequest()))

    expect(conclusion.kind).toBe('held')
    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(
      journaled?.held,
      'a held run leaves a durable pending identity, retried if needed',
    ).toBeDefined()
  })
})

describe('RO-EX-155: a spent attempt never mints new ownership', () => {
  const signal = () => new AbortController().signal

  it('replaying a released attempt refuses instead of granting a fresh generation', async () => {
    const lease = new InMemoryRunLease()
    const first = await lease.claim({ run_id: RUN, attempt_id: 'a', signal: signal() })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    await lease.release({ run_id: RUN, generation: first.generation })

    // The delayed duplicate of attempt A arrives after the run is over.
    // Granting it a NEW generation recreates orphaned ownership through
    // a duplicate request instead of a delayed acknowledgement: nobody
    // is waiting for that grant, and nobody will ever release it.
    const replay = await lease.claim({ run_id: RUN, attempt_id: 'a', signal: signal() })
    expect(replay.ok, 'an attempt that produced a grant is resolved forever').toBe(false)

    // The RUN is still claimable — by a new attempt, with a waiting owner.
    const fresh = await lease.claim({ run_id: RUN, attempt_id: 'b', signal: signal() })
    expect(fresh.ok).toBe(true)
  })

  it('a replay refused as spent does not disturb the current holder', async () => {
    const lease = new InMemoryRunLease()
    const first = await lease.claim({ run_id: RUN, attempt_id: 'a', signal: signal() })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    await lease.release({ run_id: RUN, generation: first.generation })
    const second = await lease.claim({ run_id: RUN, attempt_id: 'b', signal: signal() })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    const replay = await lease.claim({ run_id: RUN, attempt_id: 'a', signal: signal() })
    expect(replay.ok).toBe(false)
    expect(await lease.renew({ run_id: RUN, generation: second.generation })).toBe(true)
  })
})

describe('RO-EX-156: owner authority names a verifiable owner record', () => {
  it('every recorded grant cites an owner-authenticated source, never a review or a task', () => {
    // A reviewer recommending an architecture is not owner authority,
    // however the review reached the repository. The record must point
    // at something the OWNER wrote in a verifiable place — a PR comment,
    // an issue, a commit — so the authority can be audited without
    // trusting the relay.
    const tasks = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        '..',
        '..',
        'openspec',
        'changes',
        'runner-control-orchestration',
        'tasks.md',
      ),
      'utf8',
    )
    const grants = tasks.split('\n').filter((line) => line.startsWith('| Granted by |'))
    expect(grants.length, 'the recorded owner decisions must be present').toBeGreaterThanOrEqual(3)
    for (const grant of grants) {
      expect(grant, 'authority must name a verifiable owner-authenticated record').toMatch(
        /(?:PR|pull request) #\d+|issue #\d+|commit [0-9a-f]{7,}/i,
      )
      expect(grant, 'an implementation task cannot grant its own authority').not.toMatch(
        /implementation task/i,
      )
      expect(grant, 'a reviewer assertion is not an owner decision').not.toMatch(/review/i)
    }
  })
})
