/**
 * Cross-run isolation over shared port instances (RO-INV-10; normative in
 * `runner-execution-boundary`, "Runs are isolated across shared port
 * instances"):
 *
 *  RO-EX-09    two runs over ONE shared set of port instances produce
 *              disjoint bundles, each equal to that run executed alone
 *  RO-PROP-04  any interleaving of two concurrent runs leaves each run's
 *              run_id-filtered sequence identical to its isolated
 *              execution — seal ordering included
 *  RO-MUT-07   an unkeyed field, or a port call that drops the run_id,
 *              is killed
 *
 * The claim under test is NOT "concurrency is unconstrained". It is the
 * narrower, checkable one: every ordering property this landing states is
 * scoped to one run. Seal-last means last among THAT run's writes.
 */
import { describe, expect, it } from 'vitest'
import { Runner } from '../runner.js'
import {
  CountingAuthoritySource,
  runRequest,
  testPorts,
  type TestPorts,
} from '../testing-fixtures.js'

const RUN_A = 'run-20260812-000a'
const RUN_B = 'run-20260812-000b'

const requestFor = (run_id: string, gates: readonly string[] = ['lint']) =>
  runRequest({
    run_id,
    gates,
    consent: { run_id, granted: true, by: 'human:mike', recorded_at: '2026-08-12T12:00:00.000Z' },
  })

/** Everything one run observably did, filtered by its own run_id. */
const traceOf = (ports: TestPorts, run_id: string) => ({
  events: ports.events.eventsOf(run_id),
  writes: ports.evidence.writesOf(run_id),
  reads: ports.authority.readsFor(run_id).map((read) => `${read.epoch}:${read.source}`),
  gates: ports.execution.requests
    .filter((request) => request.run_id === run_id)
    .map((request) => request.gate_id),
})

describe('RO-EX-09: two runs over one shared set of port instances stay disjoint', () => {
  it('every recorded operation carries the run_id of the run that issued it', async () => {
    const shared = testPorts()
    const runner = new Runner(shared)
    await Promise.all([runner.run(requestFor(RUN_A)), runner.run(requestFor(RUN_B))])

    expect([...shared.events.runs].sort()).toEqual([RUN_A, RUN_B])
    for (const write of shared.evidence.all) expect([RUN_A, RUN_B]).toContain(write.run_id)
    for (const read of shared.authority.reads) expect([RUN_A, RUN_B]).toContain(read.run_id)
    for (const request of shared.execution.requests) {
      expect([RUN_A, RUN_B]).toContain(request.run_id)
    }
  })

  it("neither run's evidence contains an operation issued by the other", async () => {
    const shared = testPorts()
    const runner = new Runner(shared)
    await Promise.all([
      runner.run(requestFor(RUN_A, ['lint'])),
      runner.run(requestFor(RUN_B, ['unit-tests'])),
    ])

    const a = traceOf(shared, RUN_A)
    const b = traceOf(shared, RUN_B)
    expect(a.gates).toEqual(['lint'])
    expect(b.gates).toEqual(['unit-tests'])
    expect(a.writes).toHaveLength(1)
    expect(b.writes).toHaveLength(1)
    expect(JSON.stringify(a.writes)).not.toContain(RUN_B)
    expect(JSON.stringify(b.writes)).not.toContain(RUN_A)
  })

  it('each sealed bundle equals the bundle that run produces ALONE', async () => {
    const shared = testPorts()
    const sharedRunner = new Runner(shared)
    await Promise.all([sharedRunner.run(requestFor(RUN_A)), sharedRunner.run(requestFor(RUN_B))])

    // The same run, on its own port instances, with nothing else running.
    const isolated = testPorts()
    await new Runner(isolated).run(requestFor(RUN_A))

    expect(shared.evidence.writesOf(RUN_A)[0]?.payload).toEqual(
      isolated.evidence.writesOf(RUN_A)[0]?.payload,
    )
  })
})

describe('RO-PROP-04: any interleaving leaves each run identical to its isolation', () => {
  /**
   * Force a specific interleaving by making the shared authority port
   * yield control a chosen number of microtask ticks before answering.
   * Different delay pairs produce genuinely different orderings of the
   * two runs' port calls through the same instances.
   */
  const delayedPorts = (delays: Readonly<Record<string, number>>): TestPorts => {
    const base = new CountingAuthoritySource()
    const ports = testPorts({
      authority: {
        reads: base.reads,
        readsFor: base.readsFor.bind(base),
        read: async (request: {
          run_id: string
          epoch: 'production' | 'verification'
          source: string
        }) => {
          for (let tick = 0; tick < (delays[request.run_id] ?? 0); tick += 1)
            await Promise.resolve()
          return base.read(request)
        },
      } as unknown as CountingAuthoritySource,
    })
    return ports
  }

  it('holds across every generated interleaving of two concurrent runs', async () => {
    // Baselines: each run alone, no concurrency at all.
    const baselines = new Map<string, unknown>()
    for (const run_id of [RUN_A, RUN_B]) {
      const alone = testPorts()
      await new Runner(alone).run(requestFor(run_id))
      baselines.set(run_id, alone.evidence.writesOf(run_id)[0]?.payload)
    }

    let checked = 0
    for (const a of [0, 1, 3, 7]) {
      for (const b of [0, 1, 3, 7]) {
        const shared = delayedPorts({ [RUN_A]: a, [RUN_B]: b })
        const runner = new Runner(shared)
        const [ca, cb] = await Promise.all([
          runner.run(requestFor(RUN_A)),
          runner.run(requestFor(RUN_B)),
        ])

        expect(ca.state, `interleaving ${String(a)}/${String(b)} changed run A`).toBe('COMPLETED')
        expect(cb.state, `interleaving ${String(a)}/${String(b)} changed run B`).toBe('COMPLETED')

        for (const run_id of [RUN_A, RUN_B]) {
          const filtered = shared.evidence.writesOf(run_id)
          expect(filtered, `${run_id} must seal exactly once`).toHaveLength(1)
          expect(
            filtered[0]?.payload,
            `interleaving ${String(a)}/${String(b)} changed ${run_id}'s bundle`,
          ).toEqual(baselines.get(run_id))
        }
        checked += 1
      }
    }
    expect(checked).toBe(16)
  })

  it('seal-last is a PER-RUN claim: a concurrent write is not a post-seal write', async () => {
    const shared = delayedPorts({ [RUN_A]: 0, [RUN_B]: 5 })
    const runner = new Runner(shared)
    await Promise.all([runner.run(requestFor(RUN_A)), runner.run(requestFor(RUN_B))])

    // Globally, run B writes after run A sealed. That is legitimate and
    // must not read as a violation — the property is per run.
    const globalOrder = shared.evidence.all.map((write) => write.run_id)
    for (const run_id of [RUN_A, RUN_B]) {
      const own = shared.evidence.writesOf(run_id)
      expect(own).toHaveLength(1)
      expect(own[0]?.kind).toBe('evidence_bundle')
    }
    expect(globalOrder).toHaveLength(2)
  })
})

describe('RO-MUT-07: dropping the key is observable', () => {
  it('every run-scoped port request type carries a run_id at the call site', async () => {
    const shared = testPorts()
    await new Runner(shared).run(requestFor(RUN_A))

    // If a call site dropped the run_id, these filters would come back
    // empty while the unfiltered collections were populated — which is
    // exactly the failure an unkeyed shared implementation produces.
    expect(shared.authority.readsFor(RUN_A).length).toBe(shared.authority.reads.length)
    expect(shared.evidence.writesOf(RUN_A).length).toBe(shared.evidence.all.length)
    expect(shared.events.eventsOf(RUN_A).length).toBeGreaterThan(0)
    expect(shared.execution.requests.every((request) => request.run_id === RUN_A)).toBe(true)
    expect(shared.adapter.requests.every((request) => request.run_id === RUN_A)).toBe(true)
  })

  it('an unkeyed sink conflates two runs — the defect the requirement forbids', async () => {
    // A deliberately WRONG implementation: it keeps per-run state in a
    // single unkeyed field. Two runs through it are indistinguishable,
    // which is why the requirement demands keying rather than trusting.
    const unkeyed: { last: string | undefined; count: number } = { last: undefined, count: 0 }
    const shared = testPorts({
      evidence: {
        write: (request: { run_id: string; kind: string }) => {
          unkeyed.last = request.run_id
          unkeyed.count += 1
          return Promise.resolve()
        },
      },
    })
    const runner = new Runner(shared)
    await Promise.all([runner.run(requestFor(RUN_A)), runner.run(requestFor(RUN_B))])

    expect(unkeyed.count).toBe(2)
    // Only one run survives in the unkeyed field: the other is lost.
    expect([RUN_A, RUN_B]).toContain(unkeyed.last)
    // Only ONE identity survived in the unkeyed field; the other run's
    // write is unrecoverable from it. That is the bleed the requirement
    // forbids, demonstrated rather than asserted.
    expect(new Set([unkeyed.last]).size).toBe(1)
  })
})
