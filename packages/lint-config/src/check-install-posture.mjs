#!/usr/bin/env node
/**
 * INSTALL IDENTITY, and the stopping rule that protects it.
 *
 * `onlyBuiltDependencies: []` is the accepted posture: no package in this
 * workspace runs an install lifecycle script. That is a supply-chain property,
 * not a convenience — an install script executes publisher-controlled code on
 * every machine that installs, before any gate has looked at anything.
 *
 * So a package that needs one is a STOP. Adding it to the allowlist, or working
 * around it in CI, or moving installation outside the proof, would each change
 * the posture rather than prove it. This checker exists to make that decision
 * visible instead of quiet.
 *
 * It also pins the exact toolchain identities, because "the install succeeded"
 * says nothing about WHAT was installed. On a native platform job the versions
 * are the evidence: a replacement engine that resolved a different build on
 * arm64 would install cleanly and prove nothing about the reviewed one.
 *
 * Dependency-free: node stdlib.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const REPO_ROOT = path.join(PACKAGE_ROOT, '..', '..')

/** Toolchain identities the reviewed contract pins exactly. */
export const PINNED_IDENTITIES = [
  { name: 'typescript', expected: '6.0.3', role: 'the normal compiler' },
  { name: '@typescript/typescript6', expected: '6.0.2', role: 'the bounded parsing seam' },
  { name: 'eslint', expected: '10.8.0', role: 'the legacy engine' },
  { name: 'oxlint', expected: '1.80.0', role: 'the replacement engine' },
  { name: 'oxlint-tsgolint', expected: '7.0.2001', role: 'the typed backend' },
]

/**
 * The install posture, read from the workspace declaration.
 *
 * A non-empty allowance is refused with the reason rather than a diff, because
 * the correct response to a package needing an install script is to stop, not
 * to widen this list.
 */
export function checkInstallPosture(repoRoot = REPO_ROOT) {
  const problems = []
  const workspacePath = path.join(repoRoot, 'pnpm-workspace.yaml')
  if (!existsSync(workspacePath)) {
    problems.push('pnpm-workspace.yaml is missing; the install posture cannot be established')
    return problems
  }
  const text = readFileSync(workspacePath, 'utf8')
  const declared = /^onlyBuiltDependencies:\s*(\[\s*\]|\S.*)?$/m.exec(text)

  if (declared === null) {
    problems.push(
      'pnpm-workspace.yaml does not declare onlyBuiltDependencies. An absent declaration ' +
        'is not an empty one: pnpm would decide, and the posture would be whatever it chose',
    )
  } else if ((declared[1] ?? '').trim() !== '[]') {
    problems.push(
      `onlyBuiltDependencies is ${declared[1]}, not []. A package requiring an install ` +
        'lifecycle script is a STOP: granting it here changes the accepted supply-chain ' +
        'posture rather than proving it',
    )
  }

  return problems
}

/** Resolved versions of the pinned toolchain, as actually installed. */
export function checkPinnedIdentities(repoRoot = REPO_ROOT) {
  const problems = []
  for (const { name, expected, role } of PINNED_IDENTITIES) {
    let resolved
    try {
      const output = execFileSync(
        process.execPath,
        [
          '-e',
          `const { createRequire } = require('node:module');` +
            `const r = createRequire(${JSON.stringify(path.join(PACKAGE_ROOT, 'index.js'))});` +
            `process.stdout.write(require(r.resolve(${JSON.stringify(`${name}/package.json`)})).version)`,
        ],
        { cwd: repoRoot, encoding: 'utf8' },
      )
      resolved = output.trim()
    } catch {
      problems.push(`${name} (${role}) could not be resolved from the workspace`)
      continue
    }
    if (resolved !== expected) {
      problems.push(`${name} (${role}) resolved ${resolved}, expected exactly ${expected}`)
    }
  }
  return problems
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  const identitiesOnly = process.argv.includes('--identities')
  const problems = identitiesOnly ? checkPinnedIdentities() : checkInstallPosture()

  if (problems.length > 0) {
    console.error(
      `✗ install ${identitiesOnly ? 'identities' : 'posture'} — ${problems.length} problem(s)\n`,
    )
    for (const problem of problems) console.error(`    ${problem}`)
    process.exit(1)
  }
  if (identitiesOnly) {
    console.log(
      `✓ toolchain identities on ${process.arch} — ${PINNED_IDENTITIES.length} exact pins`,
    )
    for (const { name, expected } of PINNED_IDENTITIES) console.log(`    ${name} ${expected}`)
  } else {
    console.log('✓ install posture — onlyBuiltDependencies is empty, no lifecycle exception')
  }
}
