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
 * `orchestration/run.ts` is still the whole walk: the six phases and the
 * terminators share state through closures, and separating them is the
 * typestate extraction — a phase that receives only the state it has
 * earned cannot read a field it has not. That work is NOT done, so the
 * file is over its target and this records by how much.
 *
 * A ceiling here may only ever DECREASE. That is the point: the file
 * cannot grow back while the extraction is pending, and each phase moved
 * out lowers the number until the entry can be deleted and the target
 * applies on its own. An entry that is larger than the file it names is
 * itself a failure, so slack cannot be left lying around either.
 */
const RATCHET: Readonly<Record<string, number>> = {
  'orchestration/run.ts': 926,
}

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
