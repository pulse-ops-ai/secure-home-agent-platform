#!/usr/bin/env node
/**
 * Thin PR-1 current-state entry point.
 *
 * File access, command-line handling, and reporting live here. All state
 * semantics, canonicalization, derivation, and digest checks are delegated to
 * scripts/governance/model/.
 */

import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { canonicalizeStateText, decodeUtf8, evaluateState } from './governance/model/index.mjs'

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))

function usage() {
  return [
    'Usage: node scripts/check-governance-state.mjs [--root ROOT] [--state FILE] [--json]',
    '       node scripts/check-governance-state.mjs --canonical --state FILE',
  ].join('\n')
}

function parseArguments(argv) {
  const options = { root: DEFAULT_ROOT, state: undefined, json: false, canonical: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--root' || argument === '--state') {
      const value = argv[index + 1]
      if (!value) throw new Error(argument + ' requires a value')
      options[argument === '--root' ? 'root' : 'state'] = value
      index += 1
    } else if (argument === '--json') {
      options.json = true
    } else if (argument === '--canonical') {
      options.canonical = true
    } else if (argument === '--help' || argument === '-h') {
      options.help = true
    } else {
      throw new Error('unknown argument: ' + argument)
    }
  }
  return options
}

function safePath(root, requested) {
  const absolute = isAbsolute(requested) ? resolve(requested) : resolve(root, requested)
  const escaped = relative(root, absolute).startsWith('..')
  if (escaped) throw new Error('path escapes repository root: ' + requested)
  return absolute
}

function readRepositoryBytes(root, requested) {
  const absolute = safePath(root, requested)
  let stats
  try {
    stats = lstatSync(absolute)
  } catch {
    return undefined
  }
  if (!stats.isFile() || stats.isSymbolicLink()) return undefined
  return new Uint8Array(readFileSync(absolute))
}

function hasLocalGitObject(root, identity) {
  try {
    execFileSync('git', ['-C', root, 'cat-file', '-e', identity + '^{commit}'], {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

export function checkGovernanceState({
  root = DEFAULT_ROOT,
  statePath = 'governance/state.json',
} = {}) {
  const resolvedRoot = resolve(root)
  const resolvedState = safePath(resolvedRoot, statePath)
  let stateStats
  try {
    stateStats = lstatSync(resolvedState)
  } catch {
    return {
      ok: false,
      problems: [
        {
          code: 'ADV-G23',
          path: statePath,
          message: 'governance state is missing; an absent registry is not an empty registry',
        },
      ],
    }
  }
  if (!stateStats.isFile() || stateStats.isSymbolicLink()) {
    return {
      ok: false,
      problems: [
        {
          code: 'ADV-G23',
          path: statePath,
          message: 'governance state must be a regular file, not a link or directory',
        },
      ],
    }
  }

  let bytes
  try {
    bytes = new Uint8Array(readFileSync(resolvedState))
  } catch (error) {
    return {
      ok: false,
      problems: [
        { code: 'ADV-G23', path: statePath, message: 'state is unreadable: ' + error.message },
      ],
    }
  }

  let text
  try {
    text = decodeUtf8(bytes)
  } catch (error) {
    return {
      ok: false,
      problems: [
        { code: 'ADV-G01', path: statePath, message: 'state is not valid UTF-8: ' + error.message },
      ],
    }
  }

  return evaluateState(text, {
    readBytes: (path) => readRepositoryBytes(resolvedRoot, path),
    hasLocalGitObject: (identity) => hasLocalGitObject(resolvedRoot, identity),
  })
}

function printProblems(problems) {
  for (const problem of problems) {
    console.error('    ' + problem.code + ' ' + problem.path + ' — ' + problem.message)
  }
}

function main() {
  let options
  try {
    options = parseArguments(process.argv.slice(2))
  } catch (error) {
    console.error('✗ governance state — ' + error.message)
    console.error(usage())
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log(usage())
    return
  }

  const statePath = options.state ?? 'governance/state.json'
  if (options.canonical) {
    try {
      const absolute = safePath(resolve(options.root), statePath)
      const text = decodeUtf8(new Uint8Array(readFileSync(absolute)))
      process.stdout.write(canonicalizeStateText(text))
    } catch (error) {
      console.error('✗ governance canonicalization — ' + error.message)
      process.exitCode = 1
    }
    return
  }

  const result = checkGovernanceState({ root: options.root, statePath })
  if (options.json) {
    console.log(
      JSON.stringify({
        ok: result.ok,
        problems: result.problems,
        derived: result.derived,
        digests: result.digests,
      }),
    )
    if (!result.ok) process.exitCode = 1
    return
  }
  if (!result.ok) {
    console.error('✗ governance state — ' + result.problems.length + ' refusal(s)')
    printProblems(result.problems)
    process.exitCode = 1
    return
  }
  console.log(
    '✓ governance state — valid; ' +
      result.derived.currentNodeIds.length +
      ' current node(s), ' +
      Object.values(result.derived.questions).filter((question) => question.resolved).length +
      ' resolved question(s)',
  )
}

const invokedDirectly = (() => {
  if (process.argv[1] === undefined) return false
  try {
    return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()

if (invokedDirectly) main()
