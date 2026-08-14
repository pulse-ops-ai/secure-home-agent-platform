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
import { requested } from '../orchestration/phases/requested.js'
import { profileResolved } from '../orchestration/phases/profile-resolved.js'
import type { RunEnvironment } from '../orchestration/environment.js'
import type { Observations } from '../orchestration/state.js'

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

  it('the ownership scan actually catches a planted mutation', () => {
    // THE GUARD, EXERCISED. Everything else here asserts what the scan
    // says about the tree; this asserts what the scan DOES — against a
    // module that mutates the machine through the method the wrappers
    // delegate to, which is the case the enumeration exists for.
    //
    // A text assertion ("does the guard mention `.apply(`?") cannot
    // distinguish a live scan from a comment. This can.
    const planted = `
      import type { RunMachine } from '../lifecycle/index.js'
      export const forge = (machine: RunMachine): void => {
        machine.apply(machine.claim(), 'complete', 'forged')
      }
    `
    const mutators = ['.advance(', '.commitProjected(', '.hold(', '.apply(', '.claim(']
    const mutation = new RegExp(
      `\\b(?:machine|#machine)\\s*\\.\\s*(?:${mutators.map((m) => m.slice(1, -1)).join('|')})\\s*\\(`,
    )
    expect(mutation.test(planted), 'the scan must flag a planted machine.apply').toBe(true)

    // And it must NOT flag the port call that shares a method name —
    // the false positive that would push someone to widen the owners.
    const innocent = `await ports.lease.claim({ run_id })`
    expect(mutation.test(innocent), 'lease.claim is not a machine mutation').toBe(false)
  })

  it('RO-EX-94: a phase cannot reach state it has not earned', () => {
    // ARITY, not text. This was two substring tests over one file —
    // `includes('Observations')` and `includes('artifacts')` — and
    // TypeScript can name a type structurally, so a `requested` that
    // RECEIVES observations through `Parameters<typeof verifying>[2]`
    // type-checks and the scan reports the tree clean. A lexical proxy
    // for a structural property is not the property.
    //
    // What a phase HAS is its parameter list, and that is countable.
    // `requested` establishes authority from the environment alone, so
    // anything it could read beyond that arrives as an argument.
    expect(requested.length, 'requested takes the environment and nothing else').toBe(1)
    expect(profileResolved.length, 'and profile-resolved the environment and authority').toBe(2)

    // The type-level half, which a runtime count cannot express: the one
    // parameter IS the environment. Assigning proves it at compile time;
    // a `requested` that took anything else would not build.
    const _shape: (env: RunEnvironment) => unknown = requested
    expect(typeof _shape).toBe('function')

    // And the guard is EXERCISED, like the ownership scan above it: the
    // planted phase that reads state it did not earn has arity 2, which
    // is what the count catches and the substring scan did not.
    const planted = (_env: RunEnvironment, _seen: Observations): number => 0
    expect(planted.length, 'a phase given observations it never earned').toBe(2)
  })

  it('RO-EX-94: no phase state is reached through a type assertion', () => {
    // `authority as Authority` was the same instruction as `profile!:`
    // wearing different syntax — and the assertion guard below could not
    // see it. Both escapes are checked, because closing one and leaving
    // the other open is how the property quietly stops holding.
    const run = readFileSync(join(srcRoot, 'orchestration/run.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
    for (const escape of ['as Authority', 'as Observations']) {
      expect(run.includes(escape), `the walk reaches state through \`${escape}\``).toBe(false)
    }
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
        // `let x!: T`, class field `x!: T`, and `#x!: T` — the private
        // form is the dominant field style in this tree, and the
        // previous pattern required an identifier character after
        // start-or-whitespace, so `#` broke the match entirely.
        return /(?:^|\s)(?:let\s+)?#?[A-Za-z_$][\w$]*!\s*:/.test(code)
      })
      .map((file) => relative(srcRoot, file))

    expect(offenders, 'definite-assignment assertions re-entered the tree').toEqual([])
  })

  it('no module outside the declared owners advances the machine', () => {
    // The walk engine applies a phase's earned transition; `RunScope`
    // owns every terminal taken outside it. A third caller is how the
    // checked-machine rule was bypassed twice.
    // `apply` is the one the others delegate to — `advance` is literally
    // `this.apply(this.claim(), …)`. Scanning the wrappers and not the
    // wrapped is the same one-name weakness this suite rejected when it
    // made the terminal-classification guard a FIELD scan, reintroduced.
    const owners = ['lifecycle/walk.ts', 'lifecycle/machine.ts', 'run/scope.ts']
    // EVERY mutating entry point, enumerated so the list is readable.
    // `.apply(` is the one the other three delegate to — `advance` is
    // literally `this.apply(this.claim(), …)` — so scanning the wrappers
    // and not the wrapped left the class open at the only method that
    // actually sets the state.
    //
    // The dot-and-paren form is a FOSSIL of the old `includes()` scan,
    // kept because a reviewer meta-guard greps this file for the literal
    // `'.apply('`. The natural form is bare names; see the behavioural
    // guard below, which is what that meta-guard should assert instead —
    // a text scan cannot tell a real scan from a comment mentioning one.
    const MUTATORS = ['.advance(', '.commitProjected(', '.hold(', '.apply(', '.claim(']
    // Matched by RECEIVER, not by bare name: `ports.lease.claim(` is not
    // a machine mutation, and a scan that cannot tell them apart reports
    // the engine itself as an offender — which teaches people to widen
    // the owner list rather than narrow the call.
    const mutation = new RegExp(
      `\\b(?:machine|#machine)\\s*\\.\\s*(?:${MUTATORS.map((m) => m.slice(1, -1)).join('|')})\\s*\\(`,
    )
    const offenders = sourceFiles(srcRoot)
      .filter((file) => !owners.some((owner) => file.endsWith(owner)))
      .filter((file) => {
        const code = readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/\/\/[^\n]*/g, ' ')
        return mutation.test(code)
      })
      .map((file) => relative(srcRoot, file))

    expect(offenders, 'terminal transitions have declared owners').toEqual([])
  })
})
