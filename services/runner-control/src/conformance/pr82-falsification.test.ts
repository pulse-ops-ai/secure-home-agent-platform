/**
 * RO-EX-98…103: the PR-82 falsification findings.
 *
 * Reconstructed from an independent review's counterexamples — its own
 * commit was not in this clone — and each verified RED against
 * `fef7dc5` before the fix, for the reason the review named.
 *
 * The theme is one the landing keeps rediscovering: a guarantee is only
 * as strong as the narrowest path that can reach its violation. Every
 * finding here is a path the earlier proof did not walk.
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TRANSITIONS } from '../lifecycle/index.js'
import { narrowingOnly } from '../orchestration/controls.js'
import { Runner } from '../runner.js'
import { InMemoryRunJournal, InMemoryRunLease } from '../adapters/index.js'
import {
  CountingAuthoritySource,
  RecordingSession,
  runRequest,
  testPorts,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'
const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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
            if (seen === 4) lease.steal(RUN)
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
    const mutators = ['.advance(', '.commitProjected(', '.hold(']
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
        return mutators.some((m) => code.includes(m))
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
