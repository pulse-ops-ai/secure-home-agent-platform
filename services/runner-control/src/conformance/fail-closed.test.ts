/**
 * Regression proofs for the eleven findings on `fc81dec`:
 *
 *  RO-EX-17  EVIDENCE_SEALED is recorded only after the seal succeeds
 *  RO-EX-18  a refused capture never travels onward as a snapshot
 *  RO-EX-19  a core refusal is sealed as REFUSED, never relabelled
 *  RO-EX-20  the base identity is content-bound; containment resolves links
 *  RO-EX-21  a throwing port cannot end a run in no state at all
 *  RO-EX-22  cancellation is honoured through verification
 *  RO-EX-23  evidence records the EXECUTION principal, not the requester
 *  RO-EX-24  a failing call emission keeps the operations already known
 *  RO-EX-25  the transition record is durable, not memory-only
 *  RO-EX-26  a write claim from another run cannot advance this machine
 *  RO-EX-27  envelope fields are not caller-overridable
 */
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EvidenceBundle } from '@secure-home/events'
import { describe, expect, it } from 'vitest'
import {
  DeterministicAdapterInvocation,
  FilesystemArtifactObserver,
  FilesystemWorkspaceObserver,
  RecordingEventSink,
  SteppingClock,
} from '../adapters/index.js'
import { RunMachine } from '../lifecycle/index.js'
import { RunEventEmitter } from '../events/index.js'
import { Runner } from '../runner.js'
import {
  CountingAuthoritySource,
  eventSinkFailing,
  evidenceSinkFailing,
  governedWrites,
  policyDocument,
  profileDocument,
  runRequest,
  testPorts,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'

describe('RO-EX-17: EVIDENCE_SEALED is recorded only after the seal', () => {
  it('a failed seal leaves no transition claiming the evidence was sealed', async () => {
    const ports = testPorts({
      evidence: evidenceSinkFailing((request) => request.kind === 'evidence_bundle'),
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('OPERATIONAL_FAILURE')
    const claimed = conclusion.transitions.filter((entry) => entry.to === 'EVIDENCE_SEALED')
    expect(claimed, 'the record must not assert a seal that did not happen').toEqual([])
  })

  it('a successful run records EVIDENCE_SEALED once, after the write', async () => {
    const conclusion = await new Runner(testPorts()).run(runRequest())
    expect(conclusion.transitions.filter((entry) => entry.to === 'EVIDENCE_SEALED')).toHaveLength(1)
    expect(conclusion.state).toBe('COMPLETED')
  })
})

describe('RO-EX-18: a refused capture is not a snapshot', () => {
  it('a refused PATH POLICY stops the run — not only the profile is checked', async () => {
    const ports = testPorts({
      authority: new CountingAuthoritySource({
        path_policy: {
          ok: true,
          source: { source: 'path_policy' },
          bytes: JSON.stringify({ ...policyDocument(), max_files: -1 }),
        },
      }),
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('REFUSED')
    expect(conclusion.detail).toContain('path_policy')
    expect(ports.adapter.requests).toHaveLength(0)
  })

  it('a refused GATE REGISTRY stops the run even when no gates were requested', async () => {
    // The dangerous shape: with no requested gates, an invalid registry
    // has nothing downstream that would notice it.
    const ports = testPorts({
      authority: new CountingAuthoritySource({
        gate_registry: {
          ok: true,
          source: { source: 'gate_registry' },
          bytes: JSON.stringify({ contract_id: 'gate-registry', contract_version: '1.0.0' }),
        },
      }),
    })
    const conclusion = await new Runner(ports).run(runRequest({ gates: [] }))

    expect(conclusion.state).toBe('REFUSED')
    expect(ports.adapter.requests, 'an invalid registry must not reach invocation').toHaveLength(0)
  })
})

describe('RO-EX-19: a core refusal is not relabelled operational', () => {
  it('a policy-bound refusal terminates REFUSED, not OPERATIONAL_FAILURE', async () => {
    // A change outside every allowed write root: the core refuses on
    // materialization when the outcome claims success.
    const ports = testPorts({
      workspace: {
        observe: () =>
          Promise.resolve({
            ok: true as const,
            changes: [{ path: 'etc/passwd', kind: 'modified' as const, bytes: 12 }],
          }),
        observeBase: () =>
          Promise.resolve({ ok: true as const, digest: `sha256:${'b'.repeat(64)}` }),
      },
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state, 'a contract decision must not read as an infrastructure fault').toBe(
      'REFUSED',
    )
  })
})

describe('RO-EX-20: the observed base is content-bound and link-safe', () => {
  const workspace = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'rc-base-'))
    writeFileSync(join(root, 'a.txt'), 'aaaa')
    return root
  }

  it('same-size content replacement CHANGES the observed base', async () => {
    const root = workspace()
    const observer = new FilesystemWorkspaceObserver()
    const before = await observer.observeBase({ run_id: RUN, root })

    writeFileSync(join(root, 'a.txt'), 'bbbb') // same length, different bytes

    const after = await observer.observeBase({ run_id: RUN, root })
    expect(before.ok && after.ok).toBe(true)
    if (!before.ok || !after.ok) return
    expect(after.digest, 'a size-only digest would call these identical').not.toBe(before.digest)
  })

  it('an in-root symlink pointing outside is not read', async () => {
    const root = workspace()
    const outside = mkdtempSync(join(tmpdir(), 'rc-outside-'))
    writeFileSync(join(outside, 'secret.txt'), 'not yours')
    mkdirSync(join(root, 'nested'))
    symlinkSync(join(outside, 'secret.txt'), join(root, 'nested', 'link.txt'))

    const observed = await new FilesystemArtifactObserver(root).observe({
      run_id: RUN,
      paths: ['nested/link.txt'],
    })
    expect(observed.ok, 'lexical containment alone would have followed the link').toBe(false)
  })
})

describe('RO-EX-21: a throwing port cannot leave a run in no state', () => {
  it('an authority source that throws still reaches a terminal state', async () => {
    const ports = testPorts({
      authority: {
        read: () => {
          throw new Error('source exploded')
        },
      },
    })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(['OPERATIONAL_FAILURE', 'REFUSED', 'INDETERMINATE']).toContain(conclusion.state)
    expect(conclusion.produced).toBe('early_termination_record')
  })

  it('an evidence sink that throws on the early record still concludes', async () => {
    const ports = testPorts({
      authority: new CountingAuthoritySource({
        profile: { ok: false, source: { source: 'profile' }, failure: 'gone' },
      }),
      evidence: evidenceSinkFailing(() => true),
    })
    // The contract under test is simply that this RESOLVES.
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.state).not.toBe('REQUESTED')
  })

  it('a clock that throws yields INDETERMINATE, never a silent rejection', async () => {
    const ports = testPorts({
      clock: {
        now: () => {
          throw new Error('clock exploded')
        },
      },
    })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.state).toBe('INDETERMINATE')
  })
})

describe('RO-EX-22: cancellation is honoured through verification', () => {
  it('a cancel raised after execution does not complete the run', async () => {
    let calls = 0
    const conclusion = await new Runner(testPorts()).run(runRequest(), {
      interrupt: () => {
        calls += 1
        // Pass the early checks, fire at the verification boundary.
        return calls >= 3 ? 'cancel' : undefined
      },
    })
    expect(calls, 'the verification boundary must consult the signal').toBeGreaterThanOrEqual(3)
    expect(conclusion.state).toBe('CANCELLED')
  })
})

describe('RO-EX-23: evidence records the execution principal', () => {
  it("the bundle's principal is the profile's agent identity, acting for the requester", async () => {
    const ports = testPorts()
    await new Runner(ports).run(runRequest())

    const parsed = EvidenceBundle.safeParse(governedWrites(ports, RUN)[0]?.payload)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    // The agent the run authenticated as — not the human who asked.
    expect(parsed.data.principal.sub).toBe('agent:home-status')
    expect(parsed.data.principal.acting).toEqual({ kind: 'actor', sub: 'human:mike' })
  })

  it('a profile requiring an actor refuses an autonomous agent requester', async () => {
    const requiring = profileDocument()
    requiring['principal'] = { sub: 'agent:home-status', actor_required: true }
    const ports = testPorts({
      authority: new CountingAuthoritySource({
        profile: { ok: true, source: { source: 'profile' }, bytes: JSON.stringify(requiring) },
      }),
    })
    const conclusion = await new Runner(ports).run(
      runRequest({ requester: { sub: 'agent:scheduler', acting: { kind: 'autonomous' } } }),
    )
    expect(conclusion.state).toBe('REFUSED')
    expect(conclusion.detail).toContain('actor')
  })
})

describe('RO-EX-24: a failing call emission keeps what is already known', () => {
  it('the operations recorded so far reach the bundle', async () => {
    let emitted = 0
    const sink = new RecordingEventSink()
    const ports = testPorts({
      adapter: new DeterministicAdapterInvocation({
        outcome: 'observed',
        observation: {
          calls: [
            { tool: 'household.read', disposition: 'permitted' },
            { tool: 'household.write', disposition: 'denied' },
          ],
          claims: [],
          events: [],
          terminal: { exit_code: 0 },
          usage: [],
        },
      }),
      events: eventSinkFailing(() => {
        emitted += 1
        // Fail on the SECOND call's disposition, after the first pair.
        return emitted === 7
      }, sink),
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('OPERATIONAL_FAILURE')
    const parsed = EvidenceBundle.safeParse(governedWrites(ports, RUN)[0]?.payload)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(
      parsed.data.operations.attempted.length,
      'the failure must not erase the calls it interrupted',
    ).toBeGreaterThan(0)
  })
})

describe('RO-EX-25: the transition record is durable', () => {
  it('every run journals its walk, refusals included', async () => {
    // Read from the JOURNAL, which is the durable transition record.
    // It used to be written a second time through the evidence sink,
    // after the seal — which made the seal not the run's last write.
    for (const request of [runRequest(), runRequest({ profile_ref: null })]) {
      const ports = testPorts()
      await new Runner(ports).run(request)
      const journaled = await ports.journal.readCurrentState({ run_id: request.run_id })
      expect(journaled, 'a memory-only record reconstructs nothing').toBeDefined()
      expect(journaled?.transitions.length).toBeGreaterThan(0)
      for (const entry of journaled?.transitions ?? []) expect(entry.run_id).toBe(request.run_id)
    }
  })

  it('the walk is returned to the caller, not just a count', async () => {
    const conclusion = await new Runner(testPorts()).run(runRequest())
    expect(conclusion.transitions.map((entry) => entry.to)).toEqual([
      'PROFILE_RESOLVED',
      'ELIGIBLE',
      'SANDBOX_STARTED',
      'RUNNING',
      'VERIFYING',
      'EVIDENCE_SEALED',
      'COMPLETED',
    ])
  })
})

describe('RO-EX-26: a claim belongs to one run', () => {
  it("another run's claim cannot advance this machine", () => {
    const machine = new RunMachine('run-a', new SteppingClock())
    const foreign = { run_id: 'run-b', version: 0 }
    const result = machine.apply(foreign, 'resolve_profile', 'foreign writer')
    expect(result.kind).toBe('rejected')
    if (result.kind !== 'rejected') return
    expect(result.entry.reason).toBe('foreign_claim')
    expect(machine.state).toBe('REQUESTED')
  })
})

describe('RO-EX-27: envelope fields are not caller-overridable', () => {
  it('a body cannot replace run_id, sequence, or adapter', async () => {
    const sink = new RecordingEventSink()
    const emitter = new RunEventEmitter(
      { run_id: 'run-real', adapter: 'copilot-cli' },
      sink,
      new SteppingClock(),
    )
    const outcome = await emitter.emit({
      event_type: 'adapter.started',
      run_id: 'run-forged',
      sequence: 999,
      adapter: 'codex-cli',
      contract_id: 'not-a-run-event',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.event.run_id).toBe('run-real')
    expect(outcome.event.sequence).toBe(0)
    expect(outcome.event.adapter).toBe('copilot-cli')
    expect(outcome.event.contract_id).toBe('run-event')
  })
})
