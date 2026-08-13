/**
 * RO-EX-44…50: the adapter SPI, frozen to the shape ADR-0013 accepted.
 *
 * The port received `{run_id, adapter, profile_ref}` and returned
 * `completed + calls[]`. ADR-0013 is accepted and says considerably more,
 * and the gap matters NOW rather than at L7: L7's authorized scope is
 * `adapters/` and images, not `services/runner-control`. An L7 that
 * discovers the SPI cannot carry what the ADR requires has to either
 * reopen L4 or widen its own authorization, and neither is a thing a
 * landing gets to do to itself.
 *
 * Two of these are structural rather than behavioural, and those are the
 * ones worth the most:
 *
 *  - an adapter has NO WAY to report that the run succeeded (decision 3);
 *  - an adapter has NO WAY to receive a credential value (decision 7).
 *
 * Both are proven by the absence of a representable shape, not by a
 * runtime check that could be skipped.
 *
 * NOTE ON THE TYPE-LEVEL PROOFS. `expectTypeOf` assertions here are
 * discharged by `tsc`, not by the test runner — `vitest run` alone will
 * report them green whatever they say. They are real proofs (adding an
 * optional `value` to the credential reference fails the typecheck), but
 * only under `repo-check`, which runs types and tests both. A green test
 * run on its own is not a complete pass of this file.
 */
import { describe, expect, expectTypeOf, it } from 'vitest'
import { TERMINAL_STATES } from '../lifecycle/index.js'
import type { AdapterInvocation, AdapterObservation } from '../ports/index.js'
import { Runner } from '../runner.js'
import { ObservingAdapter, governedWrites, runRequest, testPorts } from '../testing-fixtures.js'
import { EvidenceBundle } from '@secure-home/events'

const RUN = 'run-20260812-0001'

describe('RO-EX-44: the invocation is platform-built and complete', () => {
  it('carries everything the adapter needs and nothing it could widen with', async () => {
    const adapter = new ObservingAdapter()
    const ports = testPorts({ adapter })
    await new Runner(ports).run(
      runRequest({ input: { kind: 'task', task: 'read the thermostat', parameters: {} } }),
    )

    const invocation = adapter.invocations[0]
    expect(invocation).toBeDefined()
    if (invocation === undefined) return

    // The captured profile identity, digest included — WHICH bytes
    // governed, not merely which name was asked for.
    expect(invocation.profile.name).toBe('home-status-read')
    expect(invocation.profile.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    // The immutable task. The runner model says a run request carries
    // profile ref, actor, and INPUTS; there was no input at all.
    expect(invocation.input.task).toBe('read the thermostat')
    // The grant to translate into a provider tool surface (decision 2).
    expect(invocation.grant.tools).toEqual(['household.read'])
    // Routing, limits, workspace reference.
    expect(invocation.routing.routing_class).toBe('R1')
    expect(invocation.limits.wall_clock_seconds).toBeGreaterThan(0)
    expect(invocation.workspace.session_ref).toContain(RUN)
  })

  it('carries no image, argv, mount path, or socket — nothing to launch with', () => {
    // The adapter translates and reports. An invocation able to name an
    // image or a command would make "the adapter cannot widen" a review
    // rule rather than a property of the shape.
    expectTypeOf<AdapterInvocation>().not.toHaveProperty('image_digest')
    expectTypeOf<AdapterInvocation>().not.toHaveProperty('argv')
    expectTypeOf<AdapterInvocation>().not.toHaveProperty('command')
  })
})

describe('RO-EX-45: an adapter cannot receive a credential value', () => {
  it('only references travel — env-var names, never secrets', async () => {
    const adapter = new ObservingAdapter()
    await new Runner(testPorts({ adapter })).run(runRequest())

    const invocation = adapter.invocations[0]
    expect(invocation?.credentials).toEqual([{ env_var: 'RUN_TOKEN' }])
    // Nothing anywhere in the invocation looks like a held secret.
    const serialized = JSON.stringify(invocation)
    for (const forbidden of ['"value"', '"secret"', '"token_value"', '"password"']) {
      expect(serialized, `${forbidden} must not be representable`).not.toContain(forbidden)
    }
  })

  it('the credential reference type has no value field to populate', () => {
    expectTypeOf<AdapterInvocation['credentials'][number]>().toEqualTypeOf<{
      readonly env_var: string
    }>()
  })
})

describe('RO-EX-46: an adapter cannot report that the run succeeded', () => {
  it('no terminal-vocabulary state is expressible in an observation', () => {
    // Decision 3: exit code, self-reported outcome and transcript
    // terminal are OBSERVATIONS. The lifecycle decides. If the
    // observation could name COMPLETED, the adapter would be deciding.
    const shape: AdapterObservation = {
      calls: [],
      claims: [],
      events: [],
      terminal: { exit_code: 0 },
      usage: [],
    }
    const serialized = JSON.stringify(shape)
    for (const state of TERMINAL_STATES) {
      expect(serialized, `${state} must not be reportable by an adapter`).not.toContain(state)
    }
    expectTypeOf<AdapterObservation>().not.toHaveProperty('terminal_state')
    expectTypeOf<AdapterObservation>().not.toHaveProperty('outcome')
  })

  it('the observations are separate fields, so they can DISAGREE', async () => {
    // The spike's finding: exit 124 versus exitCode 0. A single
    // "terminal" field would have to pick one and lose the disagreement.
    const adapter = new ObservingAdapter({
      calls: [],
      claims: [],
      events: [],
      terminal: { exit_code: 0, signalled: 'SIGKILL', reported_outcome: 'success' },
      usage: [],
    })
    const conclusion = await new Runner(testPorts({ adapter })).run(runRequest())
    expect(
      conclusion.state,
      'a run whose observations disagree has no establishable terminal',
    ).toBe('INDETERMINATE')
  })

  it('agreeing observations let the run proceed normally', async () => {
    const adapter = new ObservingAdapter({
      calls: [],
      claims: [],
      events: [],
      terminal: { exit_code: 0 },
      usage: [],
    })
    const conclusion = await new Runner(testPorts({ adapter })).run(runRequest())
    expect(conclusion.state).toBe('COMPLETED')
  })
})

describe('RO-EX-47: model output is an untrusted claim', () => {
  it('claims reach the run as claims and never become observed fact', async () => {
    const adapter = new ObservingAdapter({
      calls: [],
      claims: [{ kind: 'text', content: 'I changed etc/passwd' }],
      events: [],
      terminal: { exit_code: 0 },
      usage: [],
    })
    const ports = testPorts({ adapter })
    await new Runner(ports).run(runRequest())

    const parsed = EvidenceBundle.safeParse(governedWrites(ports, RUN)[0]?.payload)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    // The observed change set is the host's, not the model's story.
    expect(parsed.data.change_sets.authoritative).toBe('observed')
    expect(parsed.data.change_sets.observed).toEqual([])
  })
})

describe('RO-EX-48: usage is native units, and money is not modeled', () => {
  it('usage travels as unit/amount pairs with no currency anywhere', async () => {
    const adapter = new ObservingAdapter({
      calls: [],
      claims: [],
      events: [],
      terminal: { exit_code: 0 },
      usage: [
        { unit: 'input_tokens', amount: 1200 },
        { unit: 'premium_requests', amount: 1 },
      ],
    })
    await new Runner(testPorts({ adapter })).run(runRequest())

    expectTypeOf<AdapterObservation['usage'][number]>().toEqualTypeOf<{
      readonly unit: string
      readonly amount: number
    }>()
    const serialized = JSON.stringify(adapter.observation)
    for (const money of ['cost', 'usd', 'currency', 'price']) {
      expect(serialized.toLowerCase(), `${money} must not be modeled`).not.toContain(money)
    }
  })
})

describe('RO-EX-49: the run input reaches the adapter unchanged', () => {
  it('the task and its parameters are passed through verbatim', async () => {
    const adapter = new ObservingAdapter()
    const input = {
      kind: 'task' as const,
      task: 'summarize the overnight door events',
      parameters: { since: '2026-08-12T00:00:00Z' },
    }
    await new Runner(testPorts({ adapter })).run(runRequest({ input }))
    expect(adapter.invocations[0]?.input).toEqual(input)
  })
})

describe('RO-EX-50: reported calls still reach events and evidence', () => {
  it('the richer observation did not lose the call records', async () => {
    const adapter = new ObservingAdapter({
      calls: [
        { tool: 'household.read', disposition: 'permitted' },
        { tool: 'household.write', disposition: 'denied' },
      ],
      claims: [],
      events: [],
      terminal: { exit_code: 0 },
      usage: [],
    })
    const ports = testPorts({ adapter })
    await new Runner(ports).run(runRequest())

    const parsed = EvidenceBundle.safeParse(governedWrites(ports, RUN)[0]?.payload)
    if (!parsed.success) throw new Error('the bundle must validate')
    expect(parsed.data.operations.attempted).toHaveLength(2)
    expect(parsed.data.operations.denied.map((op) => op.operation.name)).toEqual([
      'household.write',
    ])
  })
})
