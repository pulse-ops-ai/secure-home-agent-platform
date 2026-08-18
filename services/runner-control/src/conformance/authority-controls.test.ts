/**
 * RO-EX-96: the public surface cannot widen a run's authority.
 *
 * `Runner` and `RunSignals` are exported from the package entrypoint,
 * and `RunSignals` carried `transitions` and `deadline_ms` — both
 * described as proof overrides, both reaching live machinery
 * unvalidated. A caller could submit a run whose lifecycle table mapped
 * `ELIGIBLE.commit_spend` straight to `COMPLETED`, and the machine
 * trusted it. Because a phase's effects run BEFORE the transition they
 * earn is applied, the effects downstream of a forged table execute
 * against a lifecycle nobody authorized.
 *
 * A test seam reachable from production is not a test seam.
 *
 * The deadline had the same shape and one more problem underneath it:
 * with no override at all, the timer was armed from the deadline the
 * SESSION PORT returned. That port is an implementation someone else
 * supplies, so the run's wall clock was whatever the sandbox asserted
 * rather than what the captured profile authorized. RO-EX-57 proved only
 * that the profile limit was SENT INTO session preparation.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TRANSITIONS } from '../lifecycle/index.js'
import { boundedDeadlineMs, narrowingOnly } from '../orchestration/controls.js'
import { Runner } from '../runner.js'
import { runRequest, testPorts } from '../testing-fixtures.js'

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('RO-EX-96: proof controls are off the request surface', () => {
  it('RunSignals declares nothing but the interrupt', () => {
    // Structural, because the hazard is the SHAPE. A caller that cannot
    // name the field cannot forge a lifecycle, whatever validation the
    // engine would otherwise have to perform.
    const result = readFileSync(join(srcRoot, 'orchestration/result.ts'), 'utf8')
    const block = result.slice(result.indexOf('export interface RunSignals'))
    const body = block.slice(0, block.indexOf('}'))
    expect(body).toContain('interrupt')
    expect(body, 'a run request must not carry a lifecycle table').not.toContain('transitions')
    expect(body, 'nor a deadline override').not.toContain('deadline_ms')
  })
})

describe('RO-EX-96: a supplied transition table may only narrow', () => {
  it('removing a transition is accepted', () => {
    const row = { ...TRANSITIONS.VERIFYING }
    delete row.seal_evidence
    expect(narrowingOnly({ ...TRANSITIONS, VERIFYING: row }).ok).toBe(true)
  })

  it('redirecting a transition is refused', () => {
    const forged = {
      ...TRANSITIONS,
      ELIGIBLE: { ...TRANSITIONS.ELIGIBLE, commit_spend: 'COMPLETED' as const },
    }
    const check = narrowingOnly(forged)
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.detail).toContain('redirects')
  })

  it('adding a transition the lifecycle does not declare is refused', () => {
    const forged = {
      ...TRANSITIONS,
      REQUESTED: { ...TRANSITIONS.REQUESTED, seal_evidence: 'EVIDENCE_SEALED' as const },
    }
    const check = narrowingOnly(forged)
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.detail).toContain('adds transition')
  })

  it('a run handed a widening table refuses instead of executing under it', async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports, {
      transitions: {
        ...TRANSITIONS,
        ELIGIBLE: { ...TRANSITIONS.ELIGIBLE, commit_spend: 'COMPLETED' as const },
      },
    }).run(runRequest())

    expect(conclusion.state).not.toBe('COMPLETED')
    expect(conclusion.detail).toContain('widens lifecycle authority')
    // And it never spent: the forged table is rejected before the walk.
    expect(ports.adapter.requests, 'a forged lifecycle must not reach the provider').toHaveLength(0)
  })
})

describe('RO-EX-96: the wall clock comes from the captured profile', () => {
  it('a session offering MORE than the profile granted does not widen the run', () => {
    // 600s granted, 600000s offered. The grant wins.
    expect(boundedDeadlineMs(600, 600_000)).toBe(600_000)
  })

  it('a session offering LESS than the profile granted narrows it', () => {
    expect(boundedDeadlineMs(600, 30)).toBe(30_000)
  })

  it('a proof override may only shorten', () => {
    expect(boundedDeadlineMs(600, 600, 20)).toBe(20)
    expect(boundedDeadlineMs(600, 600, 9_999_999)).toBe(600_000)
  })

  it('the spend phase arms from the bound, not from the raw session value', () => {
    // The regression this replaces read `prepared.handle.deadline`
    // directly. Asserted structurally because the armed value is
    // internal state — what is checkable is that the phase asks the
    // bound for it.
    const eligible = readFileSync(join(srcRoot, 'orchestration/phases/eligible.ts'), 'utf8')
    const code = eligible.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
    expect(code).toContain('boundedDeadlineMs(')
    expect(
      /arm\(\s*prepared\.handle\.deadline/.test(code),
      'the timer must not be armed from the session-reported deadline',
    ).toBe(false)
  })
})
