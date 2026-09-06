/**
 * The production dual-engine entry point.
 *
 * Up to 1.11 the replacement engine was evidence. This is the wiring that makes
 * it part of merge admission, so the failure that matters is not "a rule
 * misfired" but "an engine did not run and nobody noticed" -- because an engine
 * that does not run reports no violations, and at every layer above that is
 * indistinguishable from clean code.
 */
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-ignore
import {
  ENGINE_BINARIES,
  LINT_CAPABILITY,
  LINT_PREREQUISITES,
  NON_LINTING_MEMBERS,
  checkLintWiring,
  members,
} from '../src/check-policy.mjs'
// @ts-ignore
import {
  LintEngineFailure,
  lintMember,
  resolveBin,
  resolveTypedBackend,
  roleForMember,
  typedAnalysisRan,
  typedBackendEnv,
} from '../src/run-lint.mjs'
// @ts-ignore
import { replacementPlannedRun } from '../src/run-parity.mjs'

const HERE = import.meta.dirname
const REPO_ROOT = path.join(HERE, '..', '..', '..')
const manifest = (rel: string): any =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, rel, 'package.json'), 'utf8'))
const lintScript = (rel: string): string => String(manifest(rel).scripts?.lint ?? '')

describe('every member reaches the replacement engine through the capability', () => {
  it('passes the wiring check as committed', () => {
    expect(checkLintWiring(REPO_ROOT)).toEqual([])
  })

  it('covers every linting member', () => {
    const linting = (members(REPO_ROOT) as string[]).filter(
      (rel) => !(NON_LINTING_MEMBERS as Set<string>).has(rel),
    )
    expect(linting.length).toBe(16)
    for (const rel of linting) {
      expect(lintScript(rel), rel).toContain(LINT_CAPABILITY as string)
    }
  })

  it('no member assembles its own engine commands', () => {
    for (const rel of members(REPO_ROOT) as string[]) {
      const script = lintScript(rel)
      for (const engine of ENGINE_BINARIES as string[]) {
        expect(
          new RegExp(`(^|[\\s&|])${engine}([\\s]|$)`).test(script),
          `${rel} invokes ${engine} directly`,
        ).toBe(false)
      }
    }
  })

  it('preserves each member-specific prerequisite', () => {
    for (const [rel, prerequisite] of LINT_PREREQUISITES as Map<string, string>) {
      expect(lintScript(rel), rel).toContain(prerequisite)
    }
  })

  it('keeps the JSON-only packages linting nothing', () => {
    for (const rel of NON_LINTING_MEMBERS as Set<string>) {
      expect(lintScript(rel)).toMatch(/no lint/)
      expect(lintScript(rel)).not.toContain(LINT_CAPABILITY as string)
    }
  })
})

describe('role selection comes from the existing authority', () => {
  it('projects each member onto the role 1.11 proved', () => {
    expect(roleForMember('packages/contracts')).toBe('library')
    expect(roleForMember('services/runner-control')).toBe('service')
    expect(roleForMember('apps/web')).toBe('application')
    expect(roleForMember('agents/adapters/coding/claude-code')).toBe('library')
  })

  it('declines to lint a member declared non-linting', () => {
    expect(roleForMember('packages/tsconfig')).toBeUndefined()
  })

  it('refuses rather than guessing for an unplaced member', () => {
    expect(() => roleForMember('somewhere/else')).toThrow(LintEngineFailure as never)
  })

  it('holds no second member-to-role table of its own', () => {
    // A copy here would agree today and diverge the first time a member moved,
    // and the runner's copy is the one that would silently win.
    const runner = readFileSync(path.join(HERE, '..', 'src', 'run-lint.mjs'), 'utf8')
    expect(runner).toMatch(/expectedRoleFor/)
    expect(runner).not.toMatch(/services\/.*:.*'service'/)
  })
})

describe('production typed lint is really typed', () => {
  const runner = readFileSync(path.join(HERE, '..', 'src', 'run-lint.mjs'), 'utf8')

  it('passes --type-aware to the replacement engine', () => {
    expect(runner).toMatch(/'--type-aware'/)
  })

  it('points the engine at the MEMBER tsconfig, not the fixture corpus', () => {
    expect(runner).toMatch(/'--tsconfig',\s*\n?\s*project/)
    expect(runner).not.toMatch(/FIXTURE_TSCONFIG/)
  })

  it('refuses a member with no TypeScript project', () => {
    // Without a project the typed policies do not run and the engine exits 0,
    // enforcing a fraction of the contract while looking identical to enforcing
    // all of it.
    expect(runner).toMatch(/has no tsconfig\.json, so typed policies cannot execute/)
  })

  it('puts the typed backend on PATH, since the engine shells out to it', () => {
    const env = typedBackendEnv({ PATH: '/usr/bin' }) as { PATH: string }
    expect(env.PATH).toMatch(/lint-config\/node_modules\/\.bin/)
    expect(env.PATH).toMatch(/\/usr\/bin$/)
  })
})

describe('the replacement engine is the only blocking path', () => {
  const runner = readFileSync(path.join(HERE, '..', 'src', 'run-lint.mjs'), 'utf8')

  it('derives the verdict from the replacement engine alone', () => {
    // Task 3.3: the legacy engine has left the blocking path. It is still
    // installed -- 3.4 removes the implementation -- but it no longer decides
    // whether a member passes, because `typescript-eslint` 8.66.0 refuses
    // TypeScript 7 and the 3.2 cutover cannot land while an engine that
    // rejects the new compiler is still required to succeed.
    expect(runner).toMatch(/ok: replacement\.ok/)
    expect(runner).not.toMatch(/legacy\.ok && replacement\.ok/)
  })

  it('does not execute the legacy engine on the production path', () => {
    expect(runner).not.toMatch(/resolveBin\('eslint'/)
  })

  it('treats a missing binary as fatal rather than as a skip', () => {
    expect(runner).not.toMatch(/if-present|catch\s*\{\s*\}/)
  })
})

describe('lint does not absorb the other authorities', () => {
  const runner = readFileSync(path.join(HERE, '..', 'src', 'run-lint.mjs'), 'utf8')

  it('does not typecheck', () => {
    expect(runner).not.toMatch(/\btsc\b|--noEmit/)
  })

  it('does not check import direction', () => {
    expect(runner).not.toMatch(/check-source-imports|check-workspace/)
  })

  it('leaves those commands independently declared at the root', () => {
    const root = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
    expect(root.scripts.typecheck).toBeTruthy()
    expect(root.scripts['check:imports']).toBeTruthy()
    expect(root.scripts.lint).not.toMatch(/typecheck|check:imports/)
  })
})

describe('the replacement engine actually executes', () => {
  // Source inspection cannot see an engine that was removed and replaced with a
  // hardcoded pass. Only running the thing can, so this lints a member that
  // really violates policy and requires BOTH engines to have said so.
  // A member-shaped subject that belongs to no workspace glob. Writing the
  // violation into a real member mutates state other members' suites scan
  // while they run in parallel -- which it did, surfacing as phantom
  // import-direction failures in runner-core.
  const SUBJECT = path.join(HERE, 'lint-subject')
  const VIOLATION = path.join(SUBJECT, 'src', 'violation.ts')

  it('a real violation is reported by the replacement engine', () => {
    // Source inspection cannot see an engine replaced with a hardcoded pass.
    // Only running it can, so this lints a subject that really violates policy.
    writeFileSync(VIOLATION, 'export const take = (v: any): any => v\n')
    try {
      const result = lintMember({
        memberDir: SUBJECT,
        rel: 'packages/contracts',
        paths: ['src'],
      }) as {
        ok: boolean
        legacy?: unknown
        replacement: { ok: boolean; output: string }
      }

      expect(result.ok, 'lint must fail').toBe(false)
      expect(result.replacement.ok, 'the replacement engine must have run and objected').toBe(false)
      expect(result.replacement.output).toMatch(/no-explicit-any/)
      // The legacy engine is no longer part of the verdict at all.
      expect(result.legacy).toBeUndefined()
    } finally {
      rmSync(VIOLATION, { force: true })
    }
  })

  it('the same member passes once the violation is gone', () => {
    const result = lintMember({
      memberDir: SUBJECT,
      rel: 'packages/contracts',
      paths: ['src'],
    }) as { ok: boolean }
    expect(result.ok).toBe(true)
  })

  it('a typed-only violation is caught, proving typed execution in production', () => {
    // `no-floating-promises` is undecidable without type information. If the
    // production run were untyped this would pass silently.
    writeFileSync(VIOLATION, 'export function run(p: Promise<void>): void {\n  p\n}\n')
    try {
      const result = lintMember({
        memberDir: SUBJECT,
        rel: 'packages/contracts',
        paths: ['src'],
      }) as { ok: boolean; replacement: { output: string } }
      expect(result.ok).toBe(false)
      expect(result.replacement.output).toMatch(/no-floating-promises/)
    } finally {
      rmSync(VIOLATION, { force: true })
    }
  })
})

describe('a missing typed backend fails lint closed', () => {
  // The seam this closes: measured on this workspace, Oxlint with an absent
  // tsgolint prints NOTHING and exits 0. A runner that trusts the exit code
  // enforces the static half of the contract and reports success, and the only
  // signal would be 24 type-aware policies quietly no longer being checked.
  const SUBJECT = path.join(HERE, 'lint-subject')

  it('the engine really does exit 0 with no output when the backend is gone', () => {
    // Asserted rather than assumed, because the whole defence is built on it.
    const oxlint = path.join(HERE, '..', 'node_modules', '.bin', 'oxlint')
    const nodeDir = path.dirname(process.execPath)
    const result = spawnSync(
      oxlint,
      [
        '--type-aware',
        '--tsconfig',
        'tsconfig.json',
        '--config',
        path.join(HERE, '..', 'generated', 'oxlintrc.library.json'),
        'src',
      ],
      { cwd: SUBJECT, encoding: 'utf8', env: { PATH: `${nodeDir}:/usr/bin:/bin` } },
    )
    expect(result.status, 'the engine exits cleanly without its backend').toBe(0)
  })

  it('the capability refuses when its own tsgolint is missing', () => {
    const absent = path.join(HERE, 'lint-subject')
    expect(() => resolveTypedBackend(absent)).toThrow(LintEngineFailure as never)
    expect(() => resolveTypedBackend(absent)).toThrow(/typed backend is missing/)
  })

  it('resolves the backend the CAPABILITY owns, not an ambient copy', () => {
    // A member-owned or PATH-supplied backend would let the subject supply the
    // toolchain that judges it.
    const backend = resolveTypedBackend() as string
    expect(backend).toBe(path.join(HERE, '..', 'node_modules', '.bin', 'tsgolint'))
  })

  it('lintMember refuses before invoking the engine at all', () => {
    // Preflight, not post-hoc: there is no output to inspect afterwards.
    const runner = readFileSync(path.join(HERE, '..', 'src', 'run-lint.mjs'), 'utf8')
    const preflight = runner.indexOf('resolveTypedBackend()')
    const invocation = runner.indexOf('--type-aware')
    expect(preflight).toBeGreaterThan(0)
    expect(preflight, 'the backend check must precede the engine call').toBeLessThan(invocation)
  })
})

describe('a silently-lost typed backend is refused even on exit 0', () => {
  it('output reporting a missing backend is a FAILURE whatever the exit code', () => {
    // The nastier case: a process that announces the failure and exits
    // successfully. The exit code is exactly what proved untrustworthy, so the
    // classifier does not consult it.
    expect(typedAnalysisRan('Failed to find tsgolint executable')).toBe(false)
    expect(typedAnalysisRan('warning: tsgolint not found')).toBe(false)
    expect(typedAnalysisRan('could not start tsgolint')).toBe(false)
  })

  it('ordinary output is not mistaken for a backend failure', () => {
    expect(typedAnalysisRan('')).toBe(true)
    expect(typedAnalysisRan('src/x.ts:1:1: error typescript(no-explicit-any): ...')).toBe(true)
  })

  it('a fake engine printing the failure and exiting 0 still fails the run', () => {
    // End to end through the real classifier, with a stand-in process that
    // behaves exactly as the hostile case describes.
    const fake = path.join(mkdtempSync(path.join(tmpdir(), 'fake-engine-')), 'oxlint')
    writeFileSync(fake, '#!/bin/sh\necho "Failed to find tsgolint executable"\nexit 0\n')
    chmodSync(fake, 0o755)

    const result = spawnSync(fake, [], { encoding: 'utf8' })
    expect(result.status, 'the stand-in exits successfully').toBe(0)
    expect(typedAnalysisRan(result.stdout), 'yet the run must be judged a failure').toBe(false)
  })
})

describe('the fail-closed path, driven end to end', () => {
  const SUBJECT = path.join(HERE, 'lint-subject')

  /** A stand-in engine pair whose replacement announces a dead backend. */
  const deadBackend = (command: string): { ok: boolean; output: string } =>
    command.includes('oxlint')
      ? { ok: true, output: 'Failed to find tsgolint executable' }
      : { ok: true, output: '' }

  it('a replacement that exits 0 with a dead backend fails the whole run', () => {
    // Both stand-ins "succeed". Only the output betrays that the type-aware
    // half never ran, and the run must still fail.
    const result = lintMember({
      memberDir: SUBJECT,
      rel: 'packages/contracts',
      paths: ['src'],
      execute: deadBackend,
    }) as { ok: boolean; replacement: { ok: boolean; output: string } }

    expect(result.replacement.ok, 'the replacement result must be a failure').toBe(false)
    expect(result.ok, 'and the member must fail lint').toBe(false)
    expect(result.replacement.output).toMatch(/typed backend did not start/)
  })

  it('the same stand-ins pass when the replacement says nothing', () => {
    // The control. Without it the test above would also pass if lintMember
    // simply failed everything.
    const result = lintMember({
      memberDir: SUBJECT,
      rel: 'packages/contracts',
      paths: ['src'],
      execute: () => ({ ok: true, output: '' }),
    }) as { ok: boolean }
    expect(result.ok).toBe(true)
  })

  it('a replacement failure fails the run', () => {
    const result = lintMember({
      memberDir: SUBJECT,
      rel: 'packages/contracts',
      paths: ['src'],
      execute: () => ({ ok: false, output: 'replacement violation' }),
    }) as { ok: boolean }
    expect(result.ok).toBe(false)
  })

  it('a legacy failure can no longer decide the run', () => {
    // The obsolete shape of this test required a legacy failure to fail the
    // run. After 3.3 the legacy engine is not on the production path at all,
    // so a stand-in that fails everything EXCEPT the replacement engine must
    // not affect the verdict — there is nothing else being executed.
    const result = lintMember({
      memberDir: SUBJECT,
      rel: 'packages/contracts',
      paths: ['src'],
      execute: (command: string) =>
        command.includes('oxlint')
          ? { ok: true, output: '' }
          : { ok: false, output: 'legacy violation' },
    }) as { ok: boolean }
    expect(result.ok).toBe(true)
  })
})

describe('the one admitted process-entry exception stays bounded (ADV-ROLE-003)', () => {
  // A coding adapter is a library and must not touch the process. Its
  // `src/bin.ts` is the single exception, because a CLI entry cannot be
  // written without stdio, argv and signals.
  //
  // The exception used to live in each adapter's own `eslint.config.js` as a
  // per-file override. Task 3.4 deleted those files with the engine that read
  // them, and the exception had to move into the runner rather than go: with
  // it simply gone the adapters failed lint outright, and the obvious repair
  // -- projecting the whole adapter onto the relaxed role -- would have
  // relaxed all three restrictions across every file of the package.
  //
  // So the wiring is checked, and then the BOUND is checked by running the
  // real engine over identical code in two places.
  const SUBJECT = path.join(HERE, 'lint-subject')
  const RESTRICTED = 'export const probe = (): void => console.log(process.env.HOME)\n'

  /** A member shaped like a coding adapter: same subject, plus an entry point. */
  const withEntryPoint = (body: string): string => {
    const dir = mkdtempSync(path.join(tmpdir(), 'adapter-probe-'))
    cpSync(SUBJECT, dir, { recursive: true })
    mkdirSync(path.join(dir, 'src'), { recursive: true })
    writeFileSync(path.join(dir, 'src', 'bin.ts'), body)
    return dir
  }

  it('lints the exempt file separately, and holds it out of the member run', () => {
    const dir = withEntryPoint('export const value = 1\n')
    try {
      const calls: string[][] = []
      const result = lintMember({
        memberDir: dir,
        rel: 'agents/adapters/coding/claude-code',
        paths: ['src'],
        execute: (_command: string, args: string[]) => {
          calls.push(args)
          return { ok: true, output: '' }
        },
      }) as { role: string; override?: { file: string; role: string } }

      // Two runs, because one run can only carry one role.
      expect(calls).toHaveLength(2)
      expect(result.role).toBe('library')
      expect(result.override).toEqual({ file: 'src/bin.ts', role: 'adapter-bin' })

      const [member, exempt] = calls as [string[], string[]]
      // The member run must EXCLUDE the exempt file. Without this the file
      // would be judged twice, and the stricter judgement would still fail it.
      expect(member).toContain('--ignore-pattern')
      expect(member[member.indexOf('--ignore-pattern') + 1]).toBe('src/bin.ts')
      expect(member.at(-1)).toBe('src')
      expect(member.join(' ')).toContain('oxlintrc.library.json')

      // The exempt run must cover that file and NOTHING else.
      expect(exempt.at(-1)).toBe('src/bin.ts')
      expect(exempt).not.toContain('src')
      expect(exempt.join(' ')).toContain('oxlintrc.adapter-bin.json')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('applies to no other member, so nothing else acquires the relaxation', () => {
    const calls: string[][] = []
    lintMember({
      memberDir: SUBJECT,
      rel: 'packages/contracts',
      paths: ['src'],
      execute: (_command: string, args: string[]) => {
        calls.push(args)
        return { ok: true, output: '' }
      },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).not.toContain('--ignore-pattern')
  })

  it('does not fire for an adapter that ships no such entry point', () => {
    // The override is bounded by the file EXISTING, not by the path prefix
    // alone. An adapter with no `src/bin.ts` must get exactly one run, or a
    // future adapter would acquire a second, relaxed pass over a file it never
    // wrote.
    expect(existsSync(path.join(SUBJECT, 'src', 'bin.ts'))).toBe(false)
    const calls: string[][] = []
    lintMember({
      memberDir: SUBJECT,
      rel: 'agents/adapters/coding/no-entry-point',
      paths: ['src'],
      execute: (_command: string, args: string[]) => {
        calls.push(args)
        return { ok: true, output: '' }
      },
    })
    expect(calls).toHaveLength(1)
  })

  it('THE BOUND: identical code passes at the entry point and fails beside it', () => {
    // The proof that matters, and the only one the wiring assertions cannot
    // give. Argument shapes can be right while the configs say the wrong
    // thing; this runs the real engine over the same three violations in two
    // files of one member and reads back which file each was charged to.
    //
    // The plan comes from the runner and the verdict is read from JSON. The
    // runner pins `--format=default`, which is the engine's default FOR THE
    // ENVIRONMENT: an Actions runner gets the `github` reporter. Reading the
    // runner's own text would pass locally and see nothing in CI, which is
    // precisely what it did the first time this test was written.
    const dir = withEntryPoint(RESTRICTED)
    try {
      writeFileSync(path.join(dir, 'src', 'index.ts'), RESTRICTED)

      // End to end first: the real runner, the real engine, the real verdict.
      const result = lintMember({
        memberDir: dir,
        rel: 'agents/adapters/coding/bound-probe',
        paths: ['src'],
      }) as { ok: boolean }
      expect(result.ok, 'the member must fail, because index.ts violates policy').toBe(false)

      // Then the attribution, through the invocations the runner planned.
      const plan: string[][] = []
      lintMember({
        memberDir: dir,
        rel: 'agents/adapters/coding/bound-probe',
        paths: ['src'],
        execute: (_command: string, args: string[]) => {
          plan.push(args)
          return { ok: true, output: '' }
        },
      })
      const bin = resolveBin('oxlint', dir, REPO_ROOT) as string
      const charged: { rule: string; file: string }[] = []
      for (const args of plan) {
        const report = replacementPlannedRun(bin, args, dir, typedBackendEnv()) as {
          attributions: { rule: string; file: string }[]
        }
        charged.push(...report.attributions)
      }

      // The engine reports the path as GIVEN: relative when the runner passes
      // `src`, absolute when a single file is passed. Match the suffix rather
      // than assuming either.
      const under = (file: string, name: string): boolean =>
        file.split(path.sep).join('/').endsWith(`src/${name}`)
      const inFile = (rule: string, name: string): boolean =>
        charged.some((e) => e.rule === rule && under(e.file, name))

      const RELAXED = ['no-console', 'no-restricted-globals', 'no-restricted-properties']
      for (const rule of RELAXED) {
        expect(inFile(rule, 'index.ts'), `${rule} must still bind beside the entry point`).toBe(
          true,
        )
        expect(inFile(rule, 'bin.ts'), `${rule} must be relaxed AT the entry point`).toBe(false)
      }

      // And the exempt run is not a no-op. The exception relaxes exactly three
      // policies; everything else still binds at the entry point, which is
      // what stops "bounded to one file" from quietly becoming "unlinted".
      const atEntry = charged.filter((e) => under(e.file, 'bin.ts'))
      expect(atEntry.length, 'the entry point must still be linted').toBeGreaterThan(0)
      for (const entry of atEntry) expect(RELAXED).not.toContain(entry.rule)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('task 3.3 — no member escapes the capability-owned policy path', () => {
  // The hostile shapes that would each leave a member enforced by something
  // other than the canonical 117-policy authority. Every one is a way for lint
  // to stay green while enforcing less than the repository decided.

  it('every linting member invokes the capability binary and nothing else', () => {
    for (const rel of members(REPO_ROOT) as string[]) {
      if ((NON_LINTING_MEMBERS as Set<string>).has(rel)) continue
      const script = lintScript(rel)
      expect(script, rel).toContain(LINT_CAPABILITY as string)
      for (const engine of ENGINE_BINARIES as string[]) {
        expect(
          new RegExp(`(^|[^-\\w])${engine}\\b`).test(script.replace(LINT_CAPABILITY as string, '')),
          `${rel} assembles its own ${engine} command`,
        ).toBe(false)
      }
    }
  })

  it('a member declared non-linting must say so and ship no engine config', () => {
    // Coverage is a closed question: a member is linted, or it is DECLARED
    // exempt and that declaration is checked. "Neither" is how a member escapes.
    for (const rel of NON_LINTING_MEMBERS as Set<string>) {
      expect(lintScript(rel), rel).toMatch(/no lint/)
      expect(existsSync(path.join(REPO_ROOT, rel, 'eslint.config.js')), rel).toBe(false)
    }
    expect(checkLintWiring(REPO_ROOT)).toEqual([])
  })

  it('the capability renders policy per role rather than invoking a bare engine', () => {
    // An entry point that ran the replacement binary with no `--config` would
    // enforce the engine's own defaults, not the repository's policy — green,
    // and enforcing something nobody decided.
    const runner = readFileSync(path.join(HERE, '..', 'src', 'run-lint.mjs'), 'utf8')
    expect(runner).toMatch(/configForRole\(role\)/)
    expect(runner).toMatch(/'--config'/)
    expect(runner).toMatch(/roleForMember/)
  })

  it('typed enforcement cannot silently downgrade', () => {
    const subject = path.join(HERE, 'lint-subject')
    const runner = readFileSync(path.join(HERE, '..', 'src', 'run-lint.mjs'), 'utf8')
    expect(runner).toMatch(/'--type-aware'/)
    expect(runner).toMatch(/resolveTypedBackend\(\)/)
    expect(runner).toMatch(/typedAnalysisRan/)

    // Behavioural, not just present: an engine that exits 0 while announcing a
    // dead backend must still fail.
    const result = lintMember({
      memberDir: subject,
      rel: 'packages/contracts',
      paths: ['src'],
      execute: () => ({ ok: true, output: 'tsgolint not found; type-aware analysis failed' }),
    }) as { ok: boolean }
    expect(result.ok, 'a dead typed backend must fail the run').toBe(false)
  })

  it('no member keeps an ESLint-specific production lint path', () => {
    // `packages/eslint-config` still EXISTS — task 3.4 removes it — but no
    // member may reach ESLint as a production lint path that bypasses the
    // capability. Its own lint script goes through the capability like the rest.
    for (const rel of members(REPO_ROOT) as string[]) {
      const script = lintScript(rel)
      if ((NON_LINTING_MEMBERS as Set<string>).has(rel)) continue
      expect(/\beslint\b/.test(script), `${rel} invokes ESLint directly`).toBe(false)
    }
    const root = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
    expect(/\beslint\b/.test(String(root.scripts.lint))).toBe(false)
  })

  it('the compiler authority is untouched by this task', () => {
    // 3.4 retires an ENGINE. The compiler cutover is 3.2 and has not happened,
    // so TypeScript must still be exactly 6.0.3 here: a retirement that also
    // moved the compiler would make it impossible to say which change caused
    // whatever broke next.
    const catalog = readFileSync(path.join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8')
    expect(catalog).toMatch(/^ {2}typescript: 6\.0\.3$/m)
  })

  it('and the retired engine is gone from the workspace entirely', () => {
    // The other half. This asserted the ENGINE's survival while 3.3 moved it
    // off the blocking path; 3.4 removes it, so the same fact is now checked
    // with the opposite sign rather than deleted. A pin left behind would keep
    // resolving the engine into the lockfile, and a package left behind would
    // keep offering a second way to configure lint.
    const catalog = readFileSync(path.join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8')
    expect(catalog).not.toMatch(/^ {2}eslint:/m)
    expect(catalog).not.toMatch(/^ {2}'?@eslint\//m)
    expect(catalog).not.toMatch(/^ {2}typescript-eslint:/m)
    expect(existsSync(path.join(REPO_ROOT, 'packages', 'eslint-config'))).toBe(false)
  })
})
