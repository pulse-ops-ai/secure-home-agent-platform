#!/usr/bin/env node
/**
 * MATERIALIZE A CANDIDATE OPENSPEC CHANGE AS INERT DATA.
 *
 * The trusted pre-implementation boundary must answer two separate questions:
 *
 *   1. is the v2 schema/tooling itself correct?      (conformance tests, CI)
 *   2. is THIS EXACT CANDIDATE a valid OpenSpec change under the TRUSTED
 *      configuration and schema?                     (this file)
 *
 * The second needs `openspec validate <change> --strict` to run against the
 * candidate — and the candidate must never be checked out, because a privileged
 * runner that materialises a pull request's working tree can be made to execute
 * it (CodeQL: cache poisoning via execution of untrusted code).
 *
 * So an isolated workspace is assembled instead:
 *
 *   <out>/openspec/config.yaml     TRUSTED  copied from the default branch
 *   <out>/openspec/schemas/**      TRUSTED  copied from the default branch
 *   <out>/openspec/specs/          TRUSTED  the canonical spec root
 *   <out>/openspec/changes/<name>  CANDIDATE  read from git OBJECTS at a ref
 *
 * Only the change directory comes from the candidate, so a pull request cannot
 * substitute the schema or configuration that judges it: the paths that decide
 * validity are structurally outside what the candidate supplies.
 *
 * Nothing from the candidate is executed, and nothing it contains can become
 * executable here:
 *
 *   - entries are read with `git cat-file`, never checked out, so no hook,
 *     filter, or lifecycle script of the candidate ever runs;
 *   - only regular blobs are written. A symlink (120000) or submodule (160000)
 *     is REFUSED rather than materialised, so nothing escapes the workspace;
 *   - every file is written 0644. An executable bit in the candidate tree does
 *     not survive, so nothing here can be run even by accident.
 *
 * Dependency-free: git, node stdlib.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, cpSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const CHANGE_ID = /^[a-z0-9][a-z0-9-]*$/

class WorkspaceError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const fail = (code, message) => {
  throw new WorkspaceError(code, message)
}

function git(repoRoot, args, { encoding = 'utf8' } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

/**
 * The candidate's change tree, as (path, mode) pairs.
 *
 * `-z` because git quotes non-ASCII paths by default, which would silently
 * mangle a filename; NUL termination also survives a newline in a name.
 */
function candidateEntries(repoRoot, ref, changeRepoPath) {
  const listing = git(repoRoot, ['ls-tree', '-r', '-z', ref, '--', changeRepoPath])
  if (listing === null) {
    fail(
      'CANDIDATE_TREE_UNREADABLE',
      `could not read ${changeRepoPath} at ${ref}; nothing was materialised`,
    )
  }

  const entries = []
  for (const entry of listing.split('\0')) {
    if (entry.length === 0) continue
    const tab = entry.indexOf('\t')
    if (tab === -1) continue
    const meta = entry.slice(0, tab).split(' ')
    entries.push({ mode: meta[0], objectPath: entry.slice(tab + 1) })
  }

  if (entries.length === 0) {
    fail('CANDIDATE_CHANGE_EMPTY', `${changeRepoPath} does not exist at ${ref}, or is empty`)
  }
  return entries
}

export function materialize({ repoRoot, ref, change, out, trustedRoot }) {
  if (!CHANGE_ID.test(change)) {
    // Validated BEFORE it is used as a path segment or a CLI argument.
    fail('INVALID_CHANGE_NAME', `change name must match ${CHANGE_ID}: ${change}`)
  }
  if (git(repoRoot, ['rev-parse', '--verify', `${ref}^{commit}`]) === null) {
    fail('REF_UNRESOLVABLE', `--ref "${ref}" does not resolve to a commit`)
  }

  const trustedOpenspec = path.join(trustedRoot, 'openspec')
  for (const required of ['config.yaml', 'schemas']) {
    if (!existsSync(path.join(trustedOpenspec, required))) {
      fail(
        'TRUSTED_OPENSPEC_MISSING',
        `the trusted context has no openspec/${required}; validation cannot be ` +
          'established, and the candidate must not supply it',
      )
    }
  }

  const outOpenspec = path.join(out, 'openspec')
  mkdirSync(path.join(outOpenspec, 'specs'), { recursive: true })
  mkdirSync(path.join(outOpenspec, 'changes'), { recursive: true })

  // TRUSTED inputs. Copied from the default-branch context, never the candidate.
  cpSync(path.join(trustedOpenspec, 'config.yaml'), path.join(outOpenspec, 'config.yaml'))
  cpSync(path.join(trustedOpenspec, 'schemas'), path.join(outOpenspec, 'schemas'), {
    recursive: true,
  })
  if (existsSync(path.join(trustedOpenspec, 'specs'))) {
    cpSync(path.join(trustedOpenspec, 'specs'), path.join(outOpenspec, 'specs'), {
      recursive: true,
    })
  }

  // CANDIDATE inputs. Object reads only.
  const changeRepoPath = `openspec/changes/${change}`
  const changeRoot = path.join(outOpenspec, 'changes', change)
  const changeRootReal = path.resolve(changeRoot)
  const entries = candidateEntries(repoRoot, ref, changeRepoPath)

  let written = 0
  for (const { mode, objectPath } of entries) {
    if (mode !== '100644' && mode !== '100755') {
      fail(
        'CANDIDATE_ENTRY_REFUSED',
        `${objectPath} has mode ${mode}; only regular files are materialised, so a ` +
          'symlink or submodule cannot reach outside the validation workspace',
      )
    }

    const relative = objectPath.slice(`${changeRepoPath}/`.length)
    const destination = path.resolve(changeRoot, relative)
    if (destination !== changeRootReal && !destination.startsWith(`${changeRootReal}${path.sep}`)) {
      fail('CANDIDATE_PATH_ESCAPES', `${objectPath} resolves outside the change directory`)
    }

    const bytes = git(repoRoot, ['cat-file', 'blob', `${ref}:${objectPath}`], {
      encoding: 'buffer',
    })
    if (bytes === null) {
      fail('CANDIDATE_BLOB_UNREADABLE', `could not read ${objectPath} at ${ref}`)
    }

    mkdirSync(path.dirname(destination), { recursive: true })
    // 0644 always: an executable bit in the candidate does not survive.
    writeFileSync(destination, bytes, { mode: 0o644 })
    written += 1
  }

  return { change, ref, written, out }
}

const invokedDirectly = (() => {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  const args = process.argv.slice(2)
  const usage = () =>
    'usage: openspec-candidate-workspace.mjs --ref <ref> --change <name> --out <dir> [--trusted <dir>] [--repo <dir>]'

  const refuse = (message) => {
    console.error(`✗ candidate workspace — ${message}`)
    console.error(`    ${usage()}`)
    process.exit(1)
  }

  const FLAGS = ['--ref', '--change', '--out', '--trusted', '--repo']
  const values = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (!FLAGS.includes(flag)) refuse(`unknown option "${flag}"`)
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) refuse(`${flag} requires a value`)
    if (values.has(flag)) refuse(`${flag} was supplied twice`)
    values.set(flag, value)
    index += 1
  }
  for (const required of ['--ref', '--change', '--out']) {
    if (!values.has(required)) refuse(`${required} is required`)
  }

  const trustedRoot = values.get('--trusted') ?? fileURLToPath(new URL('..', import.meta.url))
  const repoRoot = values.get('--repo') ?? trustedRoot

  try {
    const result = materialize({
      repoRoot,
      ref: values.get('--ref'),
      change: values.get('--change'),
      out: values.get('--out'),
      trustedRoot,
    })
    console.log(
      `✓ candidate workspace — ${result.written} file(s) from ${result.ref} ` +
        `for "${result.change}" (trusted schema and config)`,
    )
  } catch (error) {
    if (error instanceof WorkspaceError) {
      console.error(`✗ candidate workspace [${error.code}]: ${error.message}`)
      process.exit(1)
    }
    console.error(`✗ candidate workspace — ${error instanceof Error ? error.stack : error}`)
    process.exit(2)
  }
}
