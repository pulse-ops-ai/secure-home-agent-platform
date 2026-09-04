#!/usr/bin/env node
/**
 * THE DUAL-ENGINE LINT ENTRY POINT.
 *
 * Until now the replacement engine was evidence: the conformance harness proved
 * it CAN enforce the 117-policy contract, while `pnpm lint` still ran ESLint
 * alone. This is where it stops being evidence and joins the repository's
 * merge-admission path.
 *
 *   pnpm lint
 *     ├── legacy ESLint          BLOCKING
 *     └── Oxlint + typed backend BLOCKING
 *
 * Either engine reporting violations fails lint. So does either engine failing
 * to RUN. Those are different failures and both must be fatal, because an
 * engine that did not execute reports no violations, and "no violations" and
 * "no analysis" are indistinguishable downstream.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not typecheck, and it does not
 * check import direction. The compiler and the architecture gates are separate
 * authorities with their own commands; folding them in here would make lint
 * success imply things lint did not verify.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { NON_LINTING_MEMBERS, SELF_LINTING_MEMBER, expectedRoleFor } from './check-policy.mjs'

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const REPO_ROOT = path.join(PACKAGE_ROOT, '..', '..')

export class LintEngineFailure extends Error {
  constructor(engine, detail) {
    super(`${engine}: ${detail}`)
    this.engine = engine
  }
}

/**
 * The role a member lints as.
 *
 * Derived from the SAME projection `check-policy.mjs` enforces repository-wide.
 * A second member-to-role table here would be a second authority: the two would
 * agree today and diverge the first time a member moved, and the runner's copy
 * is the one that would silently win.
 */
export function roleForMember(rel) {
  if (NON_LINTING_MEMBERS.has(rel)) return undefined
  if (rel === SELF_LINTING_MEMBER) return 'library'
  const projected = expectedRoleFor(rel)
  if (projected === undefined) {
    throw new LintEngineFailure(
      'role selection',
      `${rel} sits outside every taxonomy prefix, so no role can be projected for it`,
    )
  }
  return projected.role
}

/** The generated replacement config for a role. */
export function configForRole(role) {
  return path.join(PACKAGE_ROOT, 'generated', `oxlintrc.${role}.json`)
}

/**
 * The member's REAL TypeScript project.
 *
 * Production typed lint must run against the code's own type environment, not
 * the conformance corpus's. Without a project the typed policies do not run,
 * and the engine exits clean -- enforcing a fraction of the contract while
 * looking identical to enforcing all of it.
 */
export function projectForMember(memberDir) {
  const tsconfig = path.join(memberDir, 'tsconfig.json')
  if (!existsSync(tsconfig)) {
    throw new LintEngineFailure(
      'typed lint',
      `${memberDir} has no tsconfig.json, so typed policies cannot execute. A lint run ` +
        'without type information enforces part of the contract and reports success',
    )
  }
  return tsconfig
}

/**
 * An engine binary, searched from the member outward.
 *
 * pnpm links each member's own dependencies, so the legacy engine lives beside
 * the member that declares it while the replacement engine lives with the
 * capability package. A MISSING binary is fatal rather than a skip: an engine
 * that cannot start reports no violations, which is indistinguishable from a
 * clean run at every layer above.
 */
export function resolveBin(name, memberDir, repoRoot = REPO_ROOT) {
  const candidates = [
    path.join(memberDir, 'node_modules', '.bin', name),
    path.join(PACKAGE_ROOT, 'node_modules', '.bin', name),
    path.join(repoRoot, 'node_modules', '.bin', name),
  ]
  const found = candidates.find((candidate) => existsSync(candidate))
  if (found === undefined) {
    throw new LintEngineFailure(
      name,
      `no executable found in ${candidates.join(', ')}; the dual-engine contract cannot run`,
    )
  }
  return found
}

function run(command, args, cwd, env) {
  try {
    return { ok: true, output: execFileSync(command, args, { cwd, encoding: 'utf8', env }) }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new LintEngineFailure(command, 'the executable is not installed in this workspace')
    }
    return {
      ok: false,
      output: `${String(error.stdout ?? '')}${String(error.stderr ?? '')}`,
    }
  }
}

/**
 * The environment the replacement engine needs to find its typed backend.
 *
 * Oxlint shells out to `tsgolint`, which lives with the capability package
 * rather than with the member being linted. Without it on PATH the engine
 * reports "Failed to find tsgolint executable" and typed policies do not run.
 */
export function typedBackendEnv(base = process.env) {
  const bin = path.join(PACKAGE_ROOT, 'node_modules', '.bin')
  return { ...base, PATH: `${bin}${path.delimiter}${base.PATH ?? ''}` }
}

/** Both engines, in order, with neither able to mask the other. */
export function lintMember({ memberDir, rel, paths = ['src'], repoRoot = REPO_ROOT }) {
  const role = roleForMember(rel)
  if (role === undefined) return { skipped: true, rel }

  const eslintBin = resolveBin('eslint', memberDir, repoRoot)
  const oxlintBin = resolveBin('oxlint', memberDir, repoRoot)

  const project = projectForMember(memberDir)
  // The member's OWN declared paths. A runner that linted `.` everywhere would
  // widen enforcement to files members deliberately exclude, and one that
  // hardcoded `src` would narrow it for members that lint more.
  const legacy = run(eslintBin, [...paths], memberDir)
  // --type-aware is not optional. Without it the typed policies silently do not
  // run and the engine exits 0, which is the one failure mode this contract
  // exists to prevent.
  const replacement = run(
    oxlintBin,
    ['--type-aware', '--tsconfig', project, '--config', configForRole(role), ...paths],
    memberDir,
    typedBackendEnv(),
  )

  // BOTH are evaluated before either verdict is returned. Short-circuiting on
  // the legacy result would let a replacement failure go unreported whenever
  // ESLint happened to fail first.
  return {
    rel,
    role,
    legacy,
    replacement,
    ok: legacy.ok && replacement.ok,
  }
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  const memberDir = process.cwd()
  const rel = path.relative(REPO_ROOT, memberDir).split(path.sep).join('/')
  const paths = process.argv.slice(2)
  try {
    const result = lintMember({ memberDir, rel, paths: paths.length > 0 ? paths : ['src'] })
    if (result.skipped) {
      console.log(`· ${rel} declares no lint engine`)
      process.exit(0)
    }
    if (!result.ok) {
      if (!result.legacy.ok) console.error(result.legacy.output)
      if (!result.replacement.ok) console.error(result.replacement.output)
      console.error(
        `✗ ${rel} (${result.role}) — legacy ${result.legacy.ok ? 'pass' : 'FAIL'}, ` +
          `replacement ${result.replacement.ok ? 'pass' : 'FAIL'}`,
      )
      process.exit(1)
    }
    console.log(`✓ ${rel} (${result.role}) — both engines clean`)
  } catch (error) {
    if (error instanceof LintEngineFailure) {
      console.error(`✗ ${rel} — ${error.message}`)
      process.exit(1)
    }
    throw error
  }
}
