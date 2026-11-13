#!/usr/bin/env node
/**
 * Current-state entry point and atomic activation surface gate.
 *
 * File access, command-line handling, and reporting live here. All state
 * semantics, canonicalization, derivation, and digest checks are delegated to
 * scripts/governance/model/.
 */

import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  canonicalizeStateText,
  decodeUtf8,
  evaluateState,
  parseStrictJson,
} from './governance/model/index.mjs'
import { CANDIDATE_PATHS } from './governance/model/digests.mjs'
import { CONSUMER_DISPOSITIONS, discoverConsumers } from './governance/model/consumers.mjs'
import {
  PROJECTIONS,
  BEGIN,
  END,
  markersIn,
  renderProjections,
} from './render-governance-state.mjs'
import { createGitTreeObserver } from './governance/git-tree/index.mjs'
import {
  cacheTreeObservations,
  createGenesisReader,
  createCommitReader,
  readCheckoutSnapshot,
  sourceManifestPath,
} from './governance/genesis/observations.mjs'
import {
  ContainmentError,
  checkoutPathExists,
  checkoutTree,
  readContainedBytes,
} from './governance/git-tree/contained-read.mjs'

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

/**
 * Every filesystem-backed read goes through the one containment primitive.
 *
 * The previous implementation checked lexical containment and then inspected
 * only the FINAL entry for a symlink, so an archive reached through a symlinked
 * ancestor pointing outside the repository was read as though it were inside.
 * A containment refusal is a checker refusal, not an absent file: returning
 * `undefined` here would let an escape satisfy a required-absence rule.
 */
function readRepositoryBytes(root, requested) {
  return readContainedBytes(root, requested)
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

  let sourceManifestBytes
  try {
    sourceManifestBytes = readRepositoryBytes(
      resolvedRoot,
      sourceManifestPath(relative(resolvedRoot, resolvedState)),
    )
  } catch (error) {
    return {
      ok: false,
      problems: [
        {
          code: 'ADV-G87',
          path: sourceManifestPath(statePath),
          message:
            (error instanceof ContainmentError
              ? 'source manifest containment refused: '
              : 'source manifest unreadable: ') + error.message,
        },
      ],
    }
  }
  return evaluateState(text, {
    // The original bytes, so the canonical check is a byte check.
    stateBytes: bytes,
    sourceManifestBytes,
    readSnapshot: createGenesisReader(resolvedRoot),
    ...createCommitReader(resolvedRoot),
    readPreparationSnapshot: () => readCheckoutSnapshot(resolvedRoot),
    readBytes: (path) => readRepositoryBytes(resolvedRoot, path),
    // Rules-free repository observations. The checker supplies them; the model
    // decides what they mean.
    observe: cacheTreeObservations(createGitTreeObserver(resolvedRoot)),
    // The filesystem half. Git answers what a commit contains; this answers
    // what the checkout contains, which is where a dirty or extra member shows.
    checkout: {
      tree: (rootPath) => checkoutTree(resolvedRoot, rootPath),
      pathExists: (repoPath) => checkoutPathExists(resolvedRoot, repoPath),
    },
    hasLocalGitObject: (identity) => hasLocalGitObject(resolvedRoot, identity),
  })
}

/** Activate repository-surface checks without changing semantic evaluation.
 * Explicit rendering can repair stale projections; the current/history CLI
 * gates require that repair before a revision can pass.
 */
export function checkGovernanceSurfaces({ snapshot, evaluation, readSnapshot, pathExists }) {
  const problems = []
  const fail = (code, path, message) => problems.push({ code, path, message })
  const read = (path) => {
    const entry = snapshot.entries.get(path)
    if (!entry) return undefined
    if (!['100644', '100755'].includes(entry.mode))
      throw new Error('consumer must be a regular file: ' + path)
    return decodeUtf8(entry.bytes)
  }
  try {
    for (const path of CANDIDATE_PATHS)
      if (pathExists(path)) fail('ADV-G55', path, 'candidate source survives promotion')
    const inventory = parseStrictJson(read('governance/consumers.json') ?? '')
    if (
      inventory.schemaVersion !== 1 ||
      !Array.isArray(inventory.rows) ||
      Object.keys(inventory).sort().join(',') !== 'rows,schemaVersion'
    )
      throw new Error('canonical consumer inventory is missing or malformed')
    const rows = new Map()
    for (const row of inventory.rows) {
      if (
        typeof row.path !== 'string' ||
        rows.has(row.path) ||
        !CONSUMER_DISPOSITIONS.includes(row.disposition) ||
        !Array.isArray(row.factClasses) ||
        !Array.isArray(row.generatedRegions) ||
        Object.keys(row).sort().join(',') !==
          'disposition,factClasses,generatedRegions,historicalIdentity,migrationLanding,path,retainedReason'
      )
        throw new Error('invalid or duplicate consumer row: ' + String(row.path))
      rows.set(row.path, row)
    }
    const owned = new Set([
      'governance/state.json',
      'governance/consumers.json',
      'governance/genesis-source-manifest.json',
      ...PROJECTIONS.map(({ target }) => target),
    ])
    for (const claim of discoverConsumers(snapshot)) {
      if (owned.has(claim.path)) continue
      const row = rows.get(claim.path)
      if (!row) fail('ADV-G46', claim.path, 'discovered governance surface has no inventory row')
      else if (claim.factClasses.some((name) => !row.factClasses.includes(name)))
        fail('ADV-G46', claim.path, 'discovered fact class exceeds frozen consumer scope')
    }
    for (const [path, entry] of snapshot.entries) {
      // Only standalone declarations, never quoted marker examples.
      const text = Buffer.from(entry.bytes).toString('utf8')
      for (const marker of text.matchAll(/^<!-- governance:(?:begin|end) ([^\n]+?) -->$/gmu))
        if (!PROJECTIONS.some((p) => p.target === path && p.region === marker[1]))
          fail('ADV-G22', path, 'unregistered projection marker: ' + marker[1])
    }
    const copiedFields = [
      [
        'decision-range',
        /\bADR-\d{4}\s*(?:through|[–—-])\s*(?:ADR-)?\d{4}[^.\n]{0,120}\b(?:are|remain)\s+(?:all\s+)?Accepted\b/iu,
      ],
      [
        'resolved-count',
        /\b(?:of the (?:tracked set|eleven tracked questions)[^\n]{0,100}(?:two|\d+) (?:are|items have ever been) (?:closed|resolved)|resolved(?:Question)?Count\s*[:=]\s*\d+)/iu,
      ],
      [
        'question-status-list',
        /^\s*\|\s*(?:Question|U-item)\s*\|[^\n]*\bStatus\b[^\n]*\n[^\n]*\n(?:[^\n]*\n)*?\s*\|\s*U(?:[1-9]|1[01])\s*\|[^\n]*\b(?:Open|Closed|Resolved|Unresolved)\b/imu,
      ],
      [
        'program-blocker-summary',
        /^\s*(?:[-*>]\s*)?(?:blockedOn|blockers|unsatisfiedPrerequisites)\s*[:=]|^\s*\|\s*(?:runner\/)?(?:L\d+|GATE-U\d+)\s*\|[^\n]*\b(?:NotReady|Ready|Blocked)\b/imu,
      ],
    ]
    for (const row of rows.values()) {
      if (CANDIDATE_PATHS.includes(row.path)) continue
      let authored = read(row.path)
      if (authored === undefined) {
        fail('ADV-G46', row.path, 'inventoried consumer is missing')
        continue
      }
      if (!['stable-pointer', 'generated-region'].includes(row.disposition)) continue
      if (
        row.disposition === 'stable-pointer' &&
        !/governance\/(?:state\.json|STATE\.md)|scripts\/query-governance-state\.mjs/u.test(
          authored,
        )
      )
        fail('ADV-G48', row.path, 'stable-pointer consumer lacks its canonical reference')
      const regions = PROJECTIONS.filter((p) => p.target === row.path && p.region)
      for (const name of markersIn(authored))
        if (!regions.some((p) => p.region === name))
          fail('ADV-G22', row.path, 'unregistered projection marker: ' + name)
      for (const { region } of regions) {
        const begin = BEGIN(region),
          end = END(region)
        const start = authored.indexOf(begin),
          stop = authored.indexOf(end)
        if (
          start < 0 ||
          stop < start ||
          authored.indexOf(begin, start + 1) >= 0 ||
          authored.indexOf(end, stop + 1) >= 0
        ) {
          fail('ADV-G22', row.path, 'registered markers are missing, duplicated or inverted')
          continue
        }
        authored = authored.slice(0, start) + authored.slice(stop + end.length)
      }
      if (row.path === 'docs/decisions/INDEX.md') {
        const acceptanceRecords = (text) =>
          [
            ...text.matchAll(
              /^(#{2,3}) (?:ADR-\d{4} acceptance record|Acceptance record)\s*\n[\s\S]*?(?=^#{1,3} |$(?![\s\S]))/gmu,
            ),
          ].map((m) => m[0])
        const records = acceptanceRecords(authored)
        const manifestPath = 'governance/genesis-source-manifest.json'
        const manifestText = read(manifestPath)
        // A genesis-free index with no historical records needs no invented
        // witness. Existing manifests and every historical record still bind
        // to the exact immutable source; malformed or missing proof refuses.
        if (manifestText === undefined) {
          if (pathExists(manifestPath))
            fail(
              'ADV-G46',
              manifestPath,
              'source manifest exists but is not a readable regular file',
            )
          if (records.length > 0)
            fail(
              'ADV-G54',
              row.path,
              'historical acceptance sections require source-manifest evidence',
            )
        } else {
          const manifest = parseStrictJson(manifestText)
          const source = readSnapshot(manifest.sourceSnapshotIdentity.value)
          const witnessed = new Set(
            acceptanceRecords(decodeUtf8(source.entries.get(row.path).bytes)),
          )
          for (const record of records) {
            if (!witnessed.has(record))
              fail('ADV-G54', row.path, 'historical acceptance section differs from source witness')
            else authored = authored.replace(record, '')
          }
        }
      }
      // Closed copied-field checks are mechanical, not arbitrary prose review.
      // Examples are not current fields; active change directories are not exempt.
      const prose = authored
        .replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2\s*$/gmu, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
        .replace(/[*`]/gu, '')
      for (const [field, pattern] of copiedFields)
        if (pattern.test(prose)) fail('ADV-G24', row.path, 'prohibited hand-maintained ' + field)
    }
    if (evaluation?.derived) {
      const plan = renderProjections({ state: evaluation.state, derived: evaluation.derived, read })
      for (const [path, { expected, actual }] of plan)
        if (expected !== actual) fail('ADV-G36', path, 'projection is not byte-for-byte current')
    }
  } catch (error) {
    fail(error.code ?? 'ADV-G46', error.path ?? 'governance/consumers.json', error.message)
  }
  return { ok: problems.length === 0, problems }
}

function printProblems(problems) {
  for (const problem of problems) {
    console.error('    ' + problem.code + ' ' + problem.path + ' — ' + problem.message)
  }
}

/**
 * The canonical form the checker expected, after the diagnostics.
 *
 * Bounded and unambiguous: one header line, then the exact model-produced
 * bytes. It is the model's serialization verbatim — recomputing it here would
 * make the CLI a second canonicalization authority, and the two could disagree
 * about precisely the thing being reported.
 */
function printExpectedCanonical(canonical) {
  if (canonical === undefined) return
  console.error('')
  console.error('Expected canonical state:')
  console.error(canonical)
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
  if (
    relative(resolve(options.root), safePath(resolve(options.root), statePath)) ===
    'governance/state.json'
  ) {
    try {
      const surfaces = checkGovernanceSurfaces({
        snapshot: readCheckoutSnapshot(resolve(options.root)),
        evaluation: result,
        readSnapshot: createGenesisReader(resolve(options.root)),
        pathExists: (path) => checkoutPathExists(resolve(options.root), path),
      })
      result.problems.push(...surfaces.problems)
      result.ok = result.ok && surfaces.ok
    } catch (error) {
      result.problems.push({ code: 'ADV-G46', path: '$.checkout', message: error.message })
      result.ok = false
    }
  }
  if (options.json) {
    console.log(
      JSON.stringify({
        ok: result.ok,
        problems: result.problems,
        derived: result.derived,
        digests: result.digests,
        // The canonical form the checker expected. A refusal that says only
        // "these bytes are not canonical" leaves the author to guess what
        // canonical would have been; the contract requires the checker to
        // report it. Passed through from the model, never recomputed here —
        // a second opinion in the CLI would be a second canonicalizer.
        //
        // Absent when parsing failed, because then there is no logical state
        // to serialize and inventing one would be a fabricated answer.
        ...(result.canonical === undefined ? {} : { canonical: result.canonical }),
      }),
    )
    if (!result.ok) process.exitCode = 1
    return
  }
  if (!result.ok) {
    console.error('✗ governance state — ' + result.problems.length + ' refusal(s)')
    printProblems(result.problems)
    printExpectedCanonical(result.canonical)
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
