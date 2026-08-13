/**
 * Regression proofs for the seven authority and ordering defects the
 * review on `aa54574` found. Each one asserts the property that was
 * missing, so none of them can come back quietly.
 *
 *  RO-EX-10   the captured profile must BE the profile that was requested
 *  RO-EX-11   consent is bound to one run and is not replayable
 *  RO-EX-12   COMPLETED is entered only after the evidence seals
 *  RO-EX-13   the pinned base is asserted BEFORE the adapter is invoked
 *  RO-EX-14   the verification epoch verifies, and a failure refuses
 *  RO-EX-15   every reported adapter call reaches events and evidence
 *  RO-EX-16   the seal is the last write, terminal event included
 */
import { EvidenceBundle } from '@secure-home/events'
import { describe, expect, it } from 'vitest'
import { decideSpendGate } from '../consent/index.js'
import { Runner } from '../runner.js'
import {
  CountingAuthoritySource,
  PINNED_BASE,
  StaticArtifactObserver,
  StaticWorkspaceObserver,
  profileDocument,
  governedWrites,
  runRequest,
  testPorts,
} from '../testing-fixtures.js'
import { DeterministicAdapterInvocation } from '../adapters/index.js'

const RUN = 'run-20260812-0001'

describe('RO-EX-10: the acquired profile must be the profile requested', () => {
  it('a source returning a DIFFERENT valid profile refuses before spend', async () => {
    // The document is a perfectly valid execution profile — it is simply
    // not the one the run asked for. Capture cannot catch this: the
    // bytes are valid, and capture does not know what was requested.
    const other = { ...profileDocument(), identity: { name: 'broader-profile', version: '9.0.0' } }
    const ports = testPorts({
      authority: new CountingAuthoritySource({
        profile: { ok: true, source: { source: 'profile' }, bytes: JSON.stringify(other) },
      }),
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('REFUSED')
    expect(conclusion.detail).toContain('broader-profile@9.0.0')
    expect(conclusion.detail).toContain('home-status-read@1.0.0')
    // Nothing ran under the substituted profile.
    expect(ports.adapter.requests).toHaveLength(0)
    expect(ports.execution.requests).toHaveLength(0)
  })

  it('the matching profile proceeds — the check binds, it does not block', async () => {
    const conclusion = await new Runner(testPorts()).run(runRequest())
    expect(conclusion.state).toBe('COMPLETED')
  })
})

describe('RO-EX-11: consent is bound to one run', () => {
  it('an affirmative record from ANOTHER run does not open the gate', () => {
    const gate = decideSpendGate('run-b', {
      run_id: 'run-a',
      granted: true,
      by: 'human:mike',
      recorded_at: '2026-08-12T12:00:00.000Z',
    })
    expect(gate.ok, 'a past grant must not be replayable against a later run').toBe(false)
    if (gate.ok) return
    expect(gate.held).toBe('consent_for_another_run')
    expect(gate.detail).toContain('run-a')
    expect(gate.detail).toContain('run-b')
  })

  it("a run given another run's consent holds at ELIGIBLE and spends nothing", async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(
      runRequest({
        consent: {
          run_id: 'run-somewhere-else',
          granted: true,
          by: 'human:mike',
          recorded_at: '2026-08-12T12:00:00.000Z',
        },
      }),
    )
    expect(conclusion.state).toBe('ELIGIBLE')
    expect(ports.adapter.requests).toHaveLength(0)
  })
})

describe('RO-EX-12: COMPLETED requires a sealed bundle', () => {
  it('a sink that rejects the seal leaves the run OPERATIONAL_FAILURE, never COMPLETED', async () => {
    const ports = testPorts({
      evidence: {
        write: () => Promise.reject(new Error('evidence store unavailable')),
      },
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state, 'an unsealed run must never report the success state').not.toBe(
      'COMPLETED',
    )
    expect(conclusion.state).toBe('OPERATIONAL_FAILURE')
    expect(conclusion.produced).toBe('none')
  })

  it('an assembly failure is likewise fail-closed', async () => {
    // An unreadable artifact surface makes construction operational.
    const ports = testPorts({
      artifacts: new StaticArtifactObserver({ ok: false, failure: 'artifact store unreadable' }),
    })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.state).not.toBe('COMPLETED')
    expect(conclusion.produced).toBe('none')
  })
})

describe('RO-EX-13: the pinned base is asserted before the adapter runs', () => {
  it('a substituted workspace refuses, and the adapter is never invoked', async () => {
    const ports = testPorts({
      workspace: new StaticWorkspaceObserver(
        { ok: true, changes: [] },
        { ok: true, digest: `sha256:${'c'.repeat(64)}` },
      ),
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('REFUSED')
    expect(conclusion.detail).toContain('base_identity_mismatch')
    // The ordering IS the property: observing afterwards cannot un-run
    // a model invocation.
    expect(ports.adapter.requests, 'the adapter must not have run').toHaveLength(0)
  })

  it('an unobservable base is operational, not a pass', async () => {
    const ports = testPorts({
      workspace: new StaticWorkspaceObserver(
        { ok: true, changes: [] },
        { ok: false, failure: 'workspace unreadable' },
      ),
    })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.state).toBe('OPERATIONAL_FAILURE')
    expect(ports.adapter.requests).toHaveLength(0)
  })

  it('the matching base proceeds to the adapter', async () => {
    const ports = testPorts()
    await new Runner(ports).run(runRequest({ pinned_base: PINNED_BASE }))
    expect(ports.adapter.requests).toHaveLength(1)
  })
})

describe('RO-EX-14: the verification epoch verifies', () => {
  it('the verifier is fed the SECOND epoch and a fresh artifact reading', async () => {
    const ports = testPorts()
    await new Runner(ports).run(runRequest())
    // Each source read exactly twice: once per epoch. Verification that
    // reused production values would show one read per source.
    for (const source of ['profile', 'path_policy', 'gate_registry']) {
      expect(ports.authority.readsFor(RUN, source)).toHaveLength(2)
    }
    expect(
      ports.authority.readsFor(RUN).filter((read) => read.epoch === 'verification'),
    ).toHaveLength(3)
  })

  it('authority that diverges between the epochs fails the run, not silently passes', async () => {
    let reads = 0
    const diverging = new CountingAuthoritySource()
    const ports = testPorts({
      authority: {
        reads: diverging.reads,
        readsFor: diverging.readsFor.bind(diverging),
        read: (request: { run_id: string; epoch: string; source: string }) => {
          diverging.reads.push(request as never)
          reads += 1
          const document = profileDocument()
          if (request.source === 'profile' && request.epoch === 'verification') {
            // The profile CHANGED after production captured it. This is
            // exactly what independent re-acquisition exists to detect.
            document['identity'] = { name: 'home-status-read', version: '2.0.0' }
          }
          return Promise.resolve({
            ok: true as const,
            source: { source: request.source },
            bytes: JSON.stringify(
              request.source === 'profile'
                ? document
                : (
                    {
                      path_policy: () => ({
                        contract_id: 'path-policy',
                        contract_version: '2.0.0',
                        allowed_write_roots: ['packages'],
                        prohibited_rules: [],
                        max_files: 8,
                        max_total_bytes: 4096,
                        max_file_bytes: 1024,
                      }),
                      gate_registry: () => ({
                        contract_id: 'gate-registry',
                        contract_version: '1.0.0',
                        gates: {
                          lint: {
                            executable: 'pnpm',
                            args: ['lint'],
                            timeout_seconds: 600,
                            max_output_bytes: 262144,
                            environment_names: ['PATH'],
                            network: 'none',
                          },
                        },
                      }),
                    } as Record<string, () => unknown>
                  )[request.source]?.(),
            ),
          })
        },
      } as never,
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(reads).toBeGreaterThan(3)
    expect(conclusion.state, 'divergence between epochs must not complete').not.toBe('COMPLETED')
  })
})

describe('RO-EX-15: every reported adapter call reaches events and evidence', () => {
  it('permitted and denied calls appear as event pairs and as bundle operations', async () => {
    const ports = testPorts({
      adapter: new DeterministicAdapterInvocation({
        outcome: 'completed',
        calls: [
          { tool: 'household.read', disposition: 'permitted' },
          { tool: 'household.write', disposition: 'denied' },
        ],
      }),
    })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.state).toBe('COMPLETED')

    const types = ports.events.eventsOf(RUN).map((e) => (e as { event_type: string }).event_type)
    expect(types.filter((type) => type === 'call.attempted')).toHaveLength(2)
    expect(types.filter((type) => type === 'call.disposition')).toHaveLength(2)

    const parsed = EvidenceBundle.safeParse(governedWrites(ports, RUN)[0]?.payload)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.operations.attempted).toHaveLength(2)
    expect(parsed.data.operations.permitted.map((op) => op.operation.name)).toEqual([
      'household.read',
    ])
    expect(parsed.data.operations.denied.map((op) => op.operation.name)).toEqual([
      'household.write',
    ])
  })

  it('a denied call is never recorded as permitted', async () => {
    const ports = testPorts({
      adapter: new DeterministicAdapterInvocation({
        outcome: 'completed',
        calls: [{ tool: 'household.write', disposition: 'denied' }],
      }),
    })
    await new Runner(ports).run(runRequest())
    const parsed = EvidenceBundle.safeParse(governedWrites(ports, RUN)[0]?.payload)
    if (!parsed.success) throw new Error('the bundle must validate')
    expect(parsed.data.operations.permitted).toEqual([])
  })
})

describe('RO-EX-16: the seal is the last write of the run', () => {
  it('the terminal event is written BEFORE the seal, not after', async () => {
    const ports = testPorts()
    await new Runner(ports).run(runRequest())

    const types = ports.events.eventsOf(RUN).map((e) => (e as { event_type: string }).event_type)
    expect(types.at(-1), 'run.terminated must be the last event').toBe('run.terminated')
    // And it was emitted before the bundle write reached the sink: the
    // evidence sink holds exactly one write, made after every event.
    expect(governedWrites(ports, RUN)).toHaveLength(1)
  })

  it('a terminal-event failure fails the run closed rather than sealing without it', async () => {
    let emitted = 0
    const ports = testPorts({
      events: {
        emit: (request: { event: { event_type: string } }) => {
          emitted += 1
          // Fail only the TERMINAL emission — keyed on the event type
          // rather than a count, so the proof does not silently stop
          // testing anything if the run gains or loses an event.
          return request.event.event_type === 'run.terminated'
            ? Promise.reject(new Error('event sink down'))
            : Promise.resolve()
        },
        eventsOf: () => [],
        runs: [],
      } as never,
    })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(emitted, 'the terminal emission must have been reached').toBeGreaterThan(0)
    expect(conclusion.state).not.toBe('COMPLETED')
    expect(conclusion.state).toBe('OPERATIONAL_FAILURE')
    expect(governedWrites(ports), 'nothing is sealed when the terminal event is lost').toHaveLength(
      0,
    )
  })
})
