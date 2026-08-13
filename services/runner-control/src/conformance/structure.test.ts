/**
 * RO-EX-93: the structural ratchet.
 *
 * These numbers are not sacred; the ratchet is. A 1,391-line orchestrator
 * was not a style problem — it produced four defects that review had to
 * find one at a time, and every one of them came from the same cause:
 * state shared through closures that nothing could see the shape of.
 *
 *   the exception handler could not reach the run's real state
 *   a failure terminal skipped the checked-machine rule
 *   a trust decision lived in orchestration
 *   a second authority for the transition record survived unnoticed
 *
 * A limit that only holds while someone remembers it is not a limit. This
 * fails the build, so the file cannot grow back.
 *
 * The distinction the layout encodes: the mechanism directories
 * (`workspace/`, `acquisition/`, `lifecycle/`, …) own MECHANISMS;
 * `orchestration/phases/` owns COMPOSITION ACROSS them. Orchestration
 * does not move into the mechanism modules, and mechanisms do not learn
 * about phases.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(here, '..')

const sourceFiles = (root: string): readonly string[] => {
  const out: string[] = []
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
    if (entry.name.endsWith('.test.ts')) continue
    if (entry.name === 'testing-fixtures.ts') continue
    out.push(join(entry.parentPath, entry.name))
  }
  return out
}

/** Lines of CODE: comments and blanks are documentation, not size. */
const codeLines = (file: string): number =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return trimmed.length > 0 && !trimmed.startsWith('//')
    }).length

const LIMITS = {
  /** The target for any orchestration module once phases are extracted. */
  orchestration: 350,
  /** One phase handler: composition across mechanisms, nothing more. */
  phase: 120,
  /** The public facade. */
  facade: 200,
} as const

/**
 * The RATCHET, as distinct from the target.
 *
 * EMPTY, and that is the finished state. Each entry recorded a file over
 * its target while the typestate extraction was pending; extracting a
 * phase lowered its number, and the last entry was deleted when
 * `orchestration/run.ts` came under the target on its own — 926 code
 * lines to 216.
 *
 * The machinery stays because the next thing to grow past a target
 * should record the debt here rather than raising the target. A ceiling
 * may only ever DECREASE, one larger than its file fails so slack cannot
 * be parked, and one at or below the target is deleted.
 */
const RATCHET: Readonly<Record<string, number>> = {}

describe('RO-EX-93: orchestration stays small enough to see', () => {
  it('every orchestration module is within its ratchet', () => {
    const oversized = sourceFiles(join(srcRoot, 'orchestration'))
      .filter((file) => !file.includes('/phases/'))
      .map((file) => ({ file: relative(srcRoot, file), lines: codeLines(file) }))
      .filter((entry) => entry.lines > (RATCHET[entry.file] ?? LIMITS.orchestration))

    expect(oversized, 'an orchestration module exceeded its recorded ceiling').toEqual([])
  })

  it('the ratchet has no slack — a recorded ceiling matches its file', () => {
    // Without this, a ceiling could be set generously once and absorb
    // years of growth silently. Extracting a phase must LOWER the number
    // in the same commit, or this fails.
    const slack = Object.entries(RATCHET)
      .map(([file, ceiling]) => ({ file, ceiling, actual: codeLines(join(srcRoot, file)) }))
      .filter((entry) => entry.actual < entry.ceiling)

    expect(slack, 'lower the recorded ceiling to the file’s actual size').toEqual([])
  })

  it('the ratchet is temporary — every entry names a file over its target', () => {
    // An entry for a file already under the target is dead weight and
    // should be deleted, not left as permission to grow back up to it.
    const needless = Object.entries(RATCHET).filter(
      ([, ceiling]) => ceiling <= LIMITS.orchestration,
    )
    expect(needless, 'delete ratchet entries that the target already covers').toEqual([])
  })

  it('every phase handler is within the ratchet', () => {
    const oversized = sourceFiles(join(srcRoot, 'orchestration/phases'))
      .map((file) => ({ file: relative(srcRoot, file), lines: codeLines(file) }))
      .filter((entry) => entry.lines > LIMITS.phase)

    expect(oversized, `a phase handler must stay under ${LIMITS.phase} code lines`).toEqual([])
  })

  it('the public facade is thin', () => {
    const lines = codeLines(join(srcRoot, 'runner.ts'))
    expect(lines, `runner.ts must stay under ${LIMITS.facade} code lines`).toBeLessThanOrEqual(
      LIMITS.facade,
    )
  })

  it('RO-EX-94: a phase cannot reach state it has not earned', () => {
    // The property the typestate exists for. `requested` establishes
    // authority and observes nothing, so it must not be able to name an
    // observation at all — not "must not use one", must not HAVE one.
    //
    // Checked by import, because that is what makes it structural: a
    // phase that does not import `Observations` cannot construct, read
    // or pass one, whatever its body says.
    const requested = readFileSync(join(srcRoot, 'orchestration/phases/requested.ts'), 'utf8')
    expect(requested.includes('Observations'), 'requested has no observations to reach').toBe(false)
    expect(requested.includes('artifacts'), 'nor an artifact surface').toBe(false)

    const profileResolved = readFileSync(
      join(srcRoot, 'orchestration/phases/profile-resolved.ts'),
      'utf8',
    )
    // It may pass `noObservations()` to a terminal — the empty set is
    // the true record of a run that has observed nothing — but it must
    // not receive observations from anywhere.
    expect(profileResolved.includes('seen:'), 'nor does profile-resolved take any').toBe(false)
  })

  it('RO-EX-94: the definite-assignment assertions are gone, not relocated', () => {
    // `let profile!: …` told the compiler to stop checking exactly the
    // ordering the walk guaranteed. The guarantee is now carried by the
    // parameter list, so the assertions have nothing left to assert —
    // and a new one would mean the typestate has been worked around.
    const offenders = sourceFiles(srcRoot)
      .filter((file) => {
        const code = readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/\/\/[^\n]*/g, ' ')
        // `let x!: T` and class field `x!: T`.
        return /(?:^|\s)(?:let\s+)?[A-Za-z_$][\w$]*!\s*:/.test(code)
      })
      .map((file) => relative(srcRoot, file))

    expect(offenders, 'definite-assignment assertions re-entered the tree').toEqual([])
  })

  it('no module outside the declared owners advances the machine', () => {
    // The walk engine applies a phase's earned transition; `RunScope`
    // owns every terminal taken outside it. A third caller is how the
    // checked-machine rule was bypassed twice.
    const owners = ['lifecycle/walk.ts', 'lifecycle/machine.ts', 'run/scope.ts']
    const offenders = sourceFiles(srcRoot)
      .filter((file) => !owners.some((owner) => file.endsWith(owner)))
      .filter((file) =>
        readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/\/\/[^\n]*/g, ' ')
          .includes('.advance('),
      )
      .map((file) => relative(srcRoot, file))

    expect(offenders, 'terminal transitions have declared owners').toEqual([])
  })
})
