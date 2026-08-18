/**
 * Terminal-observation classification belongs to the TRUSTED CORE.
 *
 * The decision itself already existed and was correct. It lived in the
 * wrong place: `runner.ts` held a local `describeTerminalDisagreement`
 * that decided, on its own authority, that a clean exit alongside a kill
 * signal means the terminal state cannot be established.
 *
 * Two accepted contracts say that is not orchestration's call.
 * `runner-execution-boundary` says orchestration decides nothing and
 * trust decisions originate here; ADR-0013 decision 3 says provider
 * terminal observations are observational INPUT and the platform
 * lifecycle owns classification. A local algorithm inside the
 * orchestrator is also what L7 would have inherited.
 *
 * So the rule moves here, where it can be proven once and consumed, and
 * `runner-control` sequences it and obeys the answer.
 */
import { describe, expect, it } from 'vitest'
import { classifyTerminalObservations } from './terminal.js'

describe('a clean exit alongside a kill signal cannot be established', () => {
  it('exit 0 with a signal is a conflict, not a success', () => {
    // The spike's exit-124 case: the provider reported success and the
    // substrate saw it die. Neither observation outranks the other, so
    // the honest answer is that the terminal cannot be established.
    const classified = classifyTerminalObservations({ exit_code: 0, signalled: 'SIGKILL' })

    expect(classified.established).toBe(false)
    expect(classified.established === false && classified.conflict).toBe('clean_exit_with_signal')
    expect(classified.established === false && classified.detail).toContain('SIGKILL')
  })

  it('a success claim alongside a non-zero exit is a conflict', () => {
    const classified = classifyTerminalObservations({ exit_code: 124, reported_outcome: 'success' })

    expect(classified.established).toBe(false)
    expect(classified.established === false && classified.conflict).toBe(
      'success_claim_with_failure_exit',
    )
    expect(classified.established === false && classified.detail).toContain('124')
  })
})

describe('observations that agree are established', () => {
  it('a clean exit with no signal is established', () => {
    expect(classifyTerminalObservations({ exit_code: 0 }).established).toBe(true)
  })

  it('a non-zero exit with no success claim is established', () => {
    // A failing run is not a conflict. It failed, which is a fact the
    // observations agree on.
    expect(classifyTerminalObservations({ exit_code: 3 }).established).toBe(true)
  })

  it('a signal with a non-zero exit is established — they agree it died', () => {
    expect(classifyTerminalObservations({ exit_code: 137, signalled: 'SIGKILL' }).established).toBe(
      true,
    )
  })

  it('an absent exit code is established rather than assumed', () => {
    // Nothing to contradict. "We were not told" is not a conflict, and
    // inventing one would refuse runs whose provider reports no code.
    expect(classifyTerminalObservations({}).established).toBe(true)
  })
})

describe('the classification never decides a run succeeded', () => {
  it('there is no field an adapter could use to claim success', () => {
    // The whole point of ADR-0013 decision 3. This function answers one
    // question — do the observations contradict each other — and the
    // lifecycle decides what that means. A shape carrying a terminal
    // state would let a provider name its own outcome.
    const established = classifyTerminalObservations({ exit_code: 0 })
    expect(Object.keys(established)).toEqual(['established'])
  })

  it('the untrusted reported_outcome alone establishes nothing either way', () => {
    // `reported_outcome` is the provider's own words. On its own it is
    // neither a conflict nor a verdict.
    expect(classifyTerminalObservations({ reported_outcome: 'success' }).established).toBe(true)
  })
})
