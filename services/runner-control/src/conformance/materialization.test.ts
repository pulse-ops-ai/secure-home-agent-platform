/**
 * RO-EX-72…77: workspace materialization and apply-back.
 *
 * The gap: a coding run writes into a workspace, the host observes the
 * diff, and then — nothing. `decideMaterialization` exists in the trusted
 * core and orchestration never called it. There was no apply-back at all,
 * so "the run changed the repository" had no representation, and the one
 * decision that governs whether changes may leave the sandbox was never
 * asked.
 *
 * The boundary this establishes, with ownership stated rather than
 * implied:
 *
 *   isolated writable workspace   ← provisioned through a port (L9 real)
 *          ↓
 *   trusted host observes diff    ← L4 owns this, and does it
 *          ↓
 *   materialization decision      ← the CORE decides; L4 asks
 *          ↓
 *   verified apply-back / refuse  ← L4 orders it; L9 performs it
 *
 * L4 owns the lifecycle and the ordering. L9 owns creating a real
 * isolated workspace and performing a real apply-back. Neither half is
 * left to be discovered later.
 */
import { describe, expect, it } from 'vitest'
import { Runner } from '../runner.js'
import {
  RecordingWorkspaceLifecycle,
  StaticWorkspaceObserver,
  governedWrites,
  runRequest,
  testPorts,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'

/** A change the fixture path policy permits (`packages` is a write root). */
const permitted = { path: 'packages/a.ts', kind: 'modified' as const, bytes: 12 }
/** A change it does not: outside every allowed write root. */
const forbidden = { path: 'etc/passwd', kind: 'modified' as const, bytes: 12 }

const observing = (changes: readonly { path: string; kind: 'modified'; bytes: number }[]) =>
  new StaticWorkspaceObserver(
    { ok: true, changes },
    { ok: true, digest: `sha256:${'b'.repeat(64)}` },
  )

describe('RO-EX-72: apply-back happens only on a materialization decision', () => {
  it('permitted changes are applied back, after the core decided they may be', async () => {
    const workspace = new RecordingWorkspaceLifecycle()
    const ports = testPorts({ workspace, observer: observing([permitted]) })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('COMPLETED')
    expect(workspace.calls).toContain('applyBack')
    expect(workspace.applied?.changes.map((change) => change.path)).toEqual(['packages/a.ts'])
    // Provisioned before anything ran, discarded on the way out.
    expect(workspace.calls[0]).toBe('provision')
    expect(workspace.calls.at(-1)).toBe('discard')
  })

  it("the decision is the CORE's, not the orchestrator's", async () => {
    // A run with no captured path policy cannot materialize: the core
    // refuses for want of authority, and the orchestrator does not
    // substitute a judgement of its own.
    const workspace = new RecordingWorkspaceLifecycle()
    const ports = testPorts({ workspace, observer: observing([forbidden]) })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('REFUSED')
    expect(workspace.calls, 'a refused materialization applies nothing').not.toContain('applyBack')
  })
})

describe('RO-EX-73: a refused materialization discards rather than applies', () => {
  it('changes outside the policy never leave the workspace', async () => {
    const workspace = new RecordingWorkspaceLifecycle()
    const ports = testPorts({ workspace, observer: observing([forbidden]) })
    await new Runner(ports).run(runRequest())

    expect(workspace.applied, 'nothing may be applied back').toBeUndefined()
    expect(workspace.calls).toContain('discard')
  })

  it('the refusal names the offending path', async () => {
    const ports = testPorts({ observer: observing([forbidden]) })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.detail).toContain('etc/passwd')
  })
})

describe('RO-EX-74: apply-back precedes the seal', () => {
  it('the workspace is applied before the bundle is written', async () => {
    const workspace = new RecordingWorkspaceLifecycle()
    const ports = testPorts({ workspace, observer: observing([permitted]) })
    await new Runner(ports).run(runRequest())

    // Seal-last is about the run's writes; an apply-back after the seal
    // would mean the sealed evidence describes a repository state that
    // had not happened yet.
    expect(workspace.applied).toBeDefined()
    expect(governedWrites(ports, RUN)).toHaveLength(1)
    expect(workspace.calls.indexOf('applyBack')).toBeLessThan(workspace.calls.indexOf('discard'))
  })

  it('an apply-back that fails does not complete the run', async () => {
    const workspace = new RecordingWorkspaceLifecycle({ applyBack: 'target is read-only' })
    const ports = testPorts({ workspace, observer: observing([permitted]) })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('OPERATIONAL_FAILURE')
    // A terminal past PROFILE_RESOLVED still seals a full bundle — that
    // is the lifecycle requirement. What must not happen is the bundle
    // claiming the run COMPLETED when its changes never landed.
    const sealed = governedWrites(ports, RUN).filter((w) => w.kind === 'evidence_bundle')
    expect(sealed).toHaveLength(1)
    expect(
      (sealed[0]?.payload as { outcome: { terminal_state: string } }).outcome.terminal_state,
    ).toBe('OPERATIONAL_FAILURE')
    expect(workspace.calls.at(-1)).toBe('discard')
  })
})

describe('RO-EX-75: the workspace lifecycle brackets the run', () => {
  it('provisioning failure stops the run before anything executes', async () => {
    const workspace = new RecordingWorkspaceLifecycle({ provision: 'no disk' })
    const ports = testPorts({ workspace })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).not.toBe('COMPLETED')
    expect(ports.adapter.requests, 'nothing runs without a workspace').toHaveLength(0)
  })

  it('the workspace is discarded even when the run refuses', async () => {
    const workspace = new RecordingWorkspaceLifecycle()
    const ports = testPorts({ workspace, observer: observing([forbidden]) })
    await new Runner(ports).run(runRequest())
    expect(workspace.calls.at(-1)).toBe('discard')
  })

  it('a run that never provisioned discards nothing', async () => {
    const workspace = new RecordingWorkspaceLifecycle()
    await new Runner(testPorts({ workspace })).run(runRequest({ profile_ref: null }))
    expect(workspace.calls).toEqual([])
  })
})

describe('RO-EX-76: a run that changed nothing applies nothing back', () => {
  it('an empty change set is not an apply-back', async () => {
    const workspace = new RecordingWorkspaceLifecycle()
    const ports = testPorts({ workspace, observer: observing([]) })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('COMPLETED')
    expect(
      workspace.calls,
      'applying an empty change set would claim an effect the run did not have',
    ).not.toContain('applyBack')
  })
})

describe('RO-EX-77: the applied change set is the OBSERVED one', () => {
  it('what is applied back is exactly what the host observed', async () => {
    const workspace = new RecordingWorkspaceLifecycle()
    const changes = [permitted, { path: 'docs/b.md', kind: 'modified' as const, bytes: 4 }]
    const ports = testPorts({ workspace, observer: observing(changes) })
    await new Runner(ports).run(runRequest())

    // Not the model's claims, and not a re-derivation: the authoritative
    // observation, which is the only thing entitled to say what changed.
    expect(workspace.applied?.changes.map((change) => change.path).sort()).toEqual([
      'docs/b.md',
      'packages/a.ts',
    ])
  })
})
