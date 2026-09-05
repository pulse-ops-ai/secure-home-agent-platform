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
/**
 * The packages whose installed identity must match the declaration, and what
 * each one is FOR. Versions are deliberately absent: they live in the workspace
 * catalog, which is the single version authority.
 *
 * They used to be constants here, and that quietly deadlocked the maintenance
 * boundary it was meant to support. A predecessor-authorized engine bump would
 * be admitted by the classifier, installed correctly on both architectures, and
 * then refused by this checker for not being the PR-B-era version -- so the
 * native proof could never go green for the exact operation the machinery
 * exists to permit. The declaration moves; the expectation must move with it.
 */
export const IDENTITY_ROLES = [
  { name: 'typescript', role: 'the normal compiler' },
  { name: '@typescript/typescript6', role: 'the bounded parsing seam' },
  { name: 'eslint', role: 'the legacy engine' },
  { name: 'oxlint', role: 'the replacement engine' },
  { name: 'oxlint-tsgolint', role: 'the typed backend' },
]

/**
 * The exact catalog pins of the revision under test.
 *
 * Strict rather than forgiving: this decides what "the right version" means, so
 * a catalog line it cannot account for must refuse rather than be skipped. A
 * skipped line is a version expectation that silently disappears.
 */
export function catalogPins(repoRoot = REPO_ROOT) {
  const text = readFileSync(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8')
  const lines = text.split('\n')
  const start = lines.findIndex((line) => /^catalog:\s*$/.test(line))
  if (start === -1) throw new Error('pnpm-workspace.yaml declares no catalog')
  const pins = {}
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '' || /^\s*#/.test(line)) continue
    if (!/^\s/.test(line)) break
    const entry = /^\s{2}(?:'([^']+)'|"([^"]+)"|([^\s:'"]+))\s*:\s*(\S+)\s*$/.exec(line)
    if (!entry) {
      throw new Error(
        `pnpm-workspace.yaml has a catalog line this reader cannot account for, so a version ` +
          `expectation could vanish: ${JSON.stringify(line)}`,
      )
    }
    pins[entry[1] ?? entry[2] ?? entry[3]] = entry[4].replace(/^['"]|['"]$/g, '')
  }
  return pins
}

/** What each identity must resolve to at THIS revision. */
export function pinnedIdentities(repoRoot = REPO_ROOT) {
  const pins = catalogPins(repoRoot)
  return IDENTITY_ROLES.map(({ name, role }) => ({ name, role, expected: pins[name] }))
}

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
  for (const { name, expected, role } of pinnedIdentities(repoRoot)) {
    if (expected === undefined) {
      problems.push(`${name} (${role}) is not pinned in the workspace catalog`)
      continue
    }
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
    console.log(`✓ toolchain identities on ${process.arch} — ${IDENTITY_ROLES.length} exact pins`)
    for (const { name, expected } of pinnedIdentities()) console.log(`    ${name} ${expected}`)
  } else {
    console.log('✓ install posture — onlyBuiltDependencies is empty, no lifecycle exception')
  }
}
