#!/usr/bin/env node
/**
 * openspec-review-gate.mjs
 *
 * Dependency-free verifier for governed-spec-driven-v2.
 *
 * OpenSpec's artifact graph can require preimplementation-review.md to exist,
 * but existence is not an acceptance decision. This script binds the accepting
 * review to one repository commit and the exact bytes of every planning
 * artifact, then fails closed on drift.
 *
 * Modes:
 *   node scripts/openspec-review-gate.mjs manifest --change <name>
 *   node scripts/openspec-review-gate.mjs verify   --change <name>
 *
 * The script is read-only.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

// v2, not v1: the block gained review_epoch, scope_id, and
// reviewed_base_commit, and its semantics changed from "one review before the
// first edit" to "one review epoch per independently released scope". A v1
// block must be REFUSED rather than reinterpreted — silently reading an old
// block under new rules would treat a review that never considered a scope
// boundary as though it had.
const CONTRACT = 'preimplementation-review-v2'
const SCHEMA = 'governed-spec-driven-v2'
const RUBRIC = 'governed-preimplementation-review-v1'
const REVIEW_FILE = 'preimplementation-review.md'
const REVIEWED_AT_PLACEHOLDER = 'REPLACE_WITH_RFC3339_TIMESTAMP'

/**
 * RFC 3339 date-time, which is narrower than what `Date.parse` accepts.
 * `Date.parse` takes '2026-08-26', 'August 26 2026', and other host-dependent
 * spellings, so a date-only or locale-flavoured value would have passed while
 * carrying no reviewable instant.
 */
// Captured, not sliced: slicing around the OPTIONAL fraction meant
// `2026-08-26T09:15:00.123+24:00` reached the offset check as ".123+24:00",
// which "starts with a dot", so the +24:00 bound was never validated.
const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/

/**
 * RFC 3339 shape is not a calendar.
 *
 * `Date.parse('2026-02-30T00:00:00Z')` NORMALISES to 2 March and returns a
 * number, so a shape check plus `Date.parse` accepts dates that never existed.
 * The components are therefore range-checked directly, including leap years.
 */
function isRealInstant(value) {
  const match = RFC3339.exec(value)
  if (match === null) return false

  const [, y, mo, d, h, mi, sec, , offH, offM] = match
  const [year, month, day, hour, minute, second] = [y, mo, d, h, mi, sec].map(Number)

  if (month < 1 || month > 12) return false
  if (hour > 23 || minute > 59) return false
  // 60 is a leap second, which RFC 3339 permits.
  if (second > 60) return false

  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (day < 1 || day > lengths[month - 1]) return false

  // Validated independently of whether a fraction was present.
  if (offH !== undefined && (Number(offH) > 23 || Number(offM) > 59)) return false

  return true
}

const VERDICT_TOKENS = [
  'REVIEW_REQUIRED',
  'ARCHITECTURE_ACCEPTED',
  'FOCUSED_CLOSURE_REQUIRED',
  'ARCHITECTURE_REJECTED',
]

/**
 * The required H2 sections, in their required order. Each must occur exactly
 * once. Order is part of the contract: a review that answers Apply Eligibility
 * before it has stated Findings is not the reviewed document this gate claims.
 */
/** `<!-- review-scope: <id> -->` in tasks.md. tasks.md owns scope; the review
 * only REFERS to it, so scope contents never gain a second authority. */
const SCOPE_MARKER = /^<!--\s*review-scope:\s*([a-z0-9][a-z0-9-]*)\s*-->\s*$/gm

const REQUIRED_SECTIONS = [
  'Review Pin',
  'Independent Review Statement',
  'Reviewed Artifact Manifest',
  'Review Method',
  'Architecture Acceptance Checks',
  'Severity Calibration',
  'Findings',
  'Authority Allocation Assessment',
  'Repository Feasibility',
  'Invariant Stability',
  'Review-Finding Regression Promotion',
  'Verdict',
  'Apply Eligibility',
]

/**
 * Markers, and the ONE section each belongs to.
 *
 * Section ownership is the invariant. An earlier revision tested these against
 * the whole document while its error messages named specific sections, so a
 * marker written into any section satisfied a requirement belonging to another
 * — verified by putting all four into Review Method and still passing.
 */
const SECTION_MARKERS = [
  {
    section: 'Findings',
    label: '**Unresolved P1 findings:** `none`',
    pattern: /^\*\*Unresolved P1 findings:\*\*[ \t]*`none`[ \t]*$/gm,
    code: 'HUMAN_P1_COUNT_MISMATCH',
  },
  {
    section: 'Findings',
    label: '**Unassigned P2/P3 findings:** `0`',
    pattern: /^\*\*Unassigned P2\/P3 findings:\*\*[ \t]*`0`[ \t]*$/gm,
    code: 'HUMAN_ASSIGNMENT_COUNT_MISMATCH',
  },
  {
    section: 'Authority Allocation Assessment',
    label: '**Authority allocation complete:** `YES`',
    pattern: /^\*\*Authority allocation complete:\*\*[ \t]*`YES`[ \t]*$/gm,
    code: 'HUMAN_AUTHORITY_STATUS_MISMATCH',
  },
  {
    section: 'Invariant Stability',
    label: '**Invariant set changed by this review:** `NO`',
    pattern: /^\*\*Invariant set changed by this review:\*\*[ \t]*`NO`[ \t]*$/gm,
    code: 'HUMAN_INVARIANT_STATUS_MISMATCH',
  },
  {
    section: 'Apply Eligibility',
    label: '**Apply eligible:** `YES`',
    pattern: /^\*\*Apply eligible:\*\*[ \t]*`YES`[ \t]*$/gm,
    code: 'APPLY_ELIGIBILITY_MISMATCH',
  },
]

class GateError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'GateError'
    this.code = code
  }
}

function fail(code, message) {
  throw new GateError(code, message)
}

function usage() {
  return `Usage:
  node scripts/openspec-review-gate.mjs manifest --change <name> \\
      --scope <scope-id> --epoch <n> --base <ref>
  node scripts/openspec-review-gate.mjs verify   --change <name> --base <ref>

  --change-dir <path> may be used instead of --change.

Modes:
  manifest  Print a machine-readable gate block for the current clean HEAD,
            pinned to one release scope, one review epoch, and one exact base.
  verify    Verify the accepting review, artifact hashes, repository pin, epoch
            sequence, declared scope, and that the base has not moved.
`
}

function runGit(repoRoot, args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', allowFailure ? 'pipe' : 'inherit'],
      maxBuffer: 64 * 1024 * 1024,
    }).trim()
  } catch (error) {
    if (allowFailure) {
      return null
    }
    throw error
  }
}

/**
 * THE COMMITTED OBJECT IS THE AUTHORITY, NOT THE FILE ON DISK.
 *
 * Hashing the worktree while claiming to describe `reviewed_commit` is only
 * sound if the two are provably identical, and git's cleanliness checks do not
 * establish that: `skip-worktree` and `assume-unchanged` make git report a
 * MODIFIED tracked file as clean. Verified directly —
 *
 *     git update-index --skip-worktree a.md ; echo B > a.md
 *     git status --porcelain  ->  (empty)
 *     git diff --name-only    ->  (empty)
 *     worktree = B, HEAD = A
 *
 * so a manifest could hash B while pinning a commit containing A. Every
 * governed byte is therefore read from the object store.
 */
function gitBlob(repoRoot, ref, repoPath, { allowMissing = false } = {}) {
  try {
    return execFileSync('git', ['show', `${ref}:${repoPath}`], {
      cwd: repoRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    if (allowMissing) return null
    fail('PLANNING_FILE_MISSING', `${repoPath} is not present at ${ref}`)
  }
}

const gitText = (repoRoot, ref, repoPath, options) => {
  const bytes = gitBlob(repoRoot, ref, repoPath, options)
  return bytes === null ? null : bytes.toString('utf8')
}

/**
 * `skip-worktree` and `assume-unchanged` are index flags that make git lie about
 * cleanliness by design. Reading bytes from the object store defeats the byte
 * substitution, but the flags would still make the worktree-clean claim false,
 * so they are refused outright rather than merely worked around.
 */
function assertNoHiddenIndexFlags(repoRoot) {
  const listing = runGit(repoRoot, ['ls-files', '-v'], { allowFailure: true })
  if (listing === null) {
    fail('INDEX_UNREADABLE', 'could not read the git index; nothing was verified')
  }
  const hidden = listing
    .split('\n')
    // 'H' is the NORMAL cached state -- flagging it would call every tracked
    // file hidden. Only 'S' (skip-worktree) and any LOWERCASE tag
    // (assume-unchanged) make git under-report a modification.
    .filter((line) => /^(S|[a-z]) /.test(line))
    .map((line) => line.slice(2).trim())
    .sort(compareUtf8)

  if (hidden.length > 0) {
    fail(
      'HIDDEN_INDEX_FLAGS',
      'paths carry skip-worktree or assume-unchanged, so git reports them clean ' +
        `even when modified:\n${hidden.map((item) => `  - ${item}`).join('\n')}`,
    )
  }
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(usage())
    process.exit(0)
  }

  const mode = argv[0]
  if (mode !== 'manifest' && mode !== 'verify') {
    fail('USAGE', `first argument must be "manifest" or "verify"\n\n${usage()}`)
  }

  const values = new Map()
  const FLAGS = [
    '--change',
    '--change-dir',
    '--scope',
    '--epoch',
    '--base',
    '--base-sha',
    '--remote',
    '--ref',
  ]

  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!FLAGS.includes(flag)) {
      fail('USAGE', `unknown argument: ${flag}\n\n${usage()}`)
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      fail('USAGE', `${flag} requires a value\n\n${usage()}`)
    }
    if (values.has(flag)) {
      fail('USAGE', `${flag} was supplied twice\n\n${usage()}`)
    }
    values.set(flag, value)
    index += 1
  }

  const change = values.get('--change') ?? null
  const changeDirArg = values.get('--change-dir') ?? null

  if ((change === null) === (changeDirArg === null)) {
    fail('USAGE', 'provide exactly one of --change <name> or --change-dir <path>')
  }

  if (change !== null && !/^[a-z0-9][a-z0-9-]*$/.test(change)) {
    fail('INVALID_CHANGE_NAME', `change name must match ^[a-z0-9][a-z0-9-]*$: ${change}`)
  }

  const epochText = values.get('--epoch')
  if (epochText !== undefined && !/^[0-9]+$/.test(epochText)) {
    fail('INVALID_REVIEW_EPOCH', `--epoch must be a positive integer; got ${epochText}`)
  }

  return {
    mode,
    change,
    changeDirArg,
    scope: values.get('--scope'),
    epoch: epochText === undefined ? undefined : Number(epochText),
    base: values.get('--base'),
    baseSha: values.get('--base-sha'),
    remote: values.get('--remote'),
    ref: values.get('--ref'),
  }
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}

/**
 * Deterministic, locale-independent ordering for the reviewed manifest.
 *
 * `localeCompare()` without a fixed locale is host-dependent: the same change
 * can produce a different artifact order — and therefore a different reviewed
 * manifest — on a different machine or ICU build. The manifest is compared for
 * exact ordered equality, so that is a reproducibility defect, not a cosmetic
 * one. UTF-8 byte order is defined by the bytes alone.
 */
function compareUtf8(left, right) {
  const a = Buffer.from(left, 'utf8')
  const b = Buffer.from(right, 'utf8')
  return Buffer.compare(a, b)
}

function byUtf8Bytes(a, b) {
  return compareUtf8(a.name, b.name)
}

function isInside(parent, child) {
  const relative = path.relative(parent, child)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

async function resolveContext({ change, changeDirArg, ref }) {
  const repoRootText = runGit(process.cwd(), ['rev-parse', '--show-toplevel'], {
    allowFailure: true,
  })

  if (repoRootText === null || repoRootText.length === 0) {
    fail('NOT_A_GIT_REPOSITORY', 'run this command inside a Git repository')
  }

  const repoRoot = await realpath(repoRootText)
  // With --ref, openspec/changes need not exist on disk either. The path is
  // still resolved logically so containment is checked the same way.
  const changesRootPath = path.join(repoRoot, 'openspec', 'changes')
  let changesRoot
  try {
    changesRoot = await realpath(changesRootPath)
  } catch {
    if (ref === undefined) {
      fail('CHANGE_NOT_FOUND', `openspec/changes does not exist: ${changesRootPath}`)
    }
    changesRoot = changesRootPath
  }

  const unresolved =
    change !== null ? path.join(changesRoot, change) : path.resolve(repoRoot, changeDirArg)

  let changeDir
  try {
    changeDir = await realpath(unresolved)
  } catch {
    // With --ref the change need not be checked out at all: the whole point is
    // verifying a commit that was never written to disk.
    if (ref === undefined) {
      fail('CHANGE_NOT_FOUND', `change directory does not exist: ${unresolved}`)
    }
    changeDir = unresolved
  }

  if (!isInside(changesRoot, changeDir)) {
    fail('CHANGE_OUTSIDE_ACTIVE_ROOT', `change must be under openspec/changes/: ${changeDir}`)
  }

  const changeName = path.basename(changeDir)
  const changeRepoPath = toPosix(path.relative(repoRoot, changeDir))

  return { repoRoot, changesRoot, changeDir, changeName, changeRepoPath }
}

async function assertRegularFileInside(changeDir, absolutePath, displayPath) {
  let info
  try {
    info = await lstat(absolutePath)
  } catch {
    fail('PLANNING_FILE_MISSING', `required file is missing: ${displayPath}`)
  }

  if (!info.isFile()) {
    fail('PLANNING_FILE_NOT_REGULAR', `not a regular file: ${displayPath}`)
  }

  const resolved = await realpath(absolutePath)
  if (!isInside(changeDir, resolved)) {
    fail(
      'PLANNING_FILE_ESCAPES_CHANGE',
      `file resolves outside the change directory: ${displayPath}`,
    )
  }
}

async function listMarkdownFiles(directory, relativePrefix) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }

  const results = []
  for (const entry of entries.sort(byUtf8Bytes)) {
    const absolute = path.join(directory, entry.name)
    const relative = `${relativePrefix}/${entry.name}`

    if (entry.isDirectory()) {
      results.push(...(await listMarkdownFiles(absolute, relative)))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(relative)
    } else if (entry.isSymbolicLink()) {
      fail('SPEC_SYMLINK_REFUSED', `delta-spec paths must not be symlinks: ${relative}`)
    }
  }

  return results
}

function readSchemaSelection(context, ref = 'HEAD') {
  const metadata = gitText(context.repoRoot, ref, `${context.changeRepoPath}/.openspec.yaml`)

  const selected = metadata.match(/^\s*schema:\s*([^\s#]+)\s*(?:#.*)?$/m)?.[1]
  if (selected !== SCHEMA) {
    fail(
      'WRONG_CHANGE_SCHEMA',
      `.openspec.yaml selects ${selected ?? 'no schema'}; expected ${SCHEMA}`,
    )
  }
}

/**
 * Every path the committed tree carries under the change directory, with its
 * mode, so a symlink entry can be told from a regular file.
 *
 * `git ls-tree -r` emits `<mode> SP <type> SP <object> TAB <path>`.
 */
function trackedAtHead(repoRoot, changeRepoPath, ref = 'HEAD') {
  // -z, not the default: git QUOTES non-ASCII paths under core.quotePath, so
  // `specs/x/Ábaco.md` comes back as "specs/x/\303\201baco.md" and matches no
  // path discovery produced. NUL termination also survives a newline in a name.
  const listing = runGit(repoRoot, ['ls-tree', '-r', '-z', ref, '--', changeRepoPath], {
    allowFailure: true,
  })
  if (listing === null) {
    fail(
      'HEAD_TREE_UNREADABLE',
      `could not read the committed tree at ${ref} for ${changeRepoPath}; nothing ` +
        'was compared, so the planning set could not be proved committed',
    )
  }

  const tracked = new Map()
  for (const entry of listing.split('\0')) {
    if (entry.length === 0) continue
    const tab = entry.indexOf('\t')
    if (tab === -1) continue
    const mode = entry.slice(0, entry.indexOf(' '))
    const repoPath = entry.slice(tab + 1)
    tracked.set(repoPath.slice(`${changeRepoPath}/`.length), mode)
  }
  return tracked
}

/**
 * PROVE THE MANIFEST DESCRIBES THE PINNED COMMIT, NOT THE WORKING DIRECTORY.
 *
 * The artifact set was discovered with `readdir`, while the clean-worktree check
 * uses `git ls-files --others --exclude-standard` — which excludes IGNORED
 * files. An ignored, untracked `specs/**.md` was therefore invisible to the
 * clean check and visible to discovery, so it could enter `reviewed_artifacts`
 * with a digest while existing in no commit at all. The entire contract is that
 * the manifest names bytes inside `reviewed_commit`; that let it name bytes that
 * were nowhere.
 *
 * Git's committed tree is the authority. Ignored files elsewhere in the
 * repository stay ignored — the requirement is only that everything ADMITTED to
 * the planning manifest is committed.
 */
function assertPlanningPathsTracked(repoRoot, changeRepoPath, paths, ref = 'HEAD') {
  const tracked = trackedAtHead(repoRoot, changeRepoPath, ref)
  const untracked = paths.filter((relative) => !tracked.has(relative))

  if (untracked.length > 0) {
    fail(
      'PLANNING_FILE_NOT_TRACKED',
      'planning artifacts are not committed at HEAD, so no review could bind ' +
        `them:\n${untracked.map((item) => `  - ${item}`).join('\n')}`,
    )
  }

  const symlinked = paths.filter((relative) => tracked.get(relative) === '120000')
  if (symlinked.length > 0) {
    fail(
      'PLANNING_FILE_NOT_REGULAR',
      `planning artifacts are symlinks in the committed tree:\n${symlinked
        .map((item) => `  - ${item}`)
        .join('\n')}`,
    )
  }
}

/**
 * The planning set, derived ENTIRELY from the committed tree.
 *
 * The last filesystem dependency: delta specs were enumerated with readdir, so
 * the gate needed the change checked out. Deriving them from the tree instead
 * means the gate can verify a commit that was never written to disk — which is
 * what lets the governed boundary run without placing untrusted code on a
 * privileged runner at all.
 */
function planningPaths(context, ref = 'HEAD') {
  readSchemaSelection(context, ref)

  const tracked = trackedAtHead(context.repoRoot, context.changeRepoPath, ref)

  const specPaths = [...tracked.keys()]
    .filter((relative) => relative.startsWith('specs/') && relative.endsWith('.md'))
    .sort(compareUtf8)

  const symlinked = specPaths.filter((relative) => tracked.get(relative) === '120000')
  if (symlinked.length > 0) {
    fail('SPEC_SYMLINK_REFUSED', `delta-spec paths must not be symlinks: ${symlinked.join(', ')}`)
  }

  if (specPaths.length === 0) {
    fail('NO_DELTA_SPECS', 'governed-spec-driven-v2 requires at least one specs/**/*.md file')
  }

  return ['.openspec.yaml', 'proposal.md', ...specPaths, 'design.md', 'assurance.md', 'tasks.md']
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function artifactManifest(context, ref = 'HEAD') {
  const { repoRoot, changeRepoPath } = context
  const paths = planningPaths(context, ref)
  assertPlanningPathsTracked(repoRoot, changeRepoPath, paths, ref)
  return paths.map((relative) => {
    // The COMMITTED bytes, never the worktree's.
    const bytes = gitBlob(repoRoot, ref, `${changeRepoPath}/${relative}`)
    return { path: relative, sha256: sha256(bytes) }
  })
}

function repositoryChanges(repoRoot, reviewedCommit, ref = 'HEAD') {
  const committed =
    runGit(repoRoot, [
      'diff',
      '--name-only',
      '--diff-filter=ACDMRTUXB',
      `${reviewedCommit}..${ref}`,
    ]) || ''
  const unstaged = runGit(repoRoot, ['diff', '--name-only', '--diff-filter=ACDMRTUXB']) || ''
  const staged =
    runGit(repoRoot, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB']) || ''
  const untracked = runGit(repoRoot, ['ls-files', '--others', '--exclude-standard']) || ''

  return new Set(
    [committed, unstaged, staged, untracked]
      .flatMap((group) => group.split('\n'))
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

function assertManifestWorktreeClean(repoRoot) {
  const tracked = runGit(repoRoot, ['diff', '--name-only']) || ''
  const staged = runGit(repoRoot, ['diff', '--cached', '--name-only']) || ''
  const untracked = runGit(repoRoot, ['ls-files', '--others', '--exclude-standard']) || ''

  const changes = [tracked, staged, untracked]
    .flatMap((group) => group.split('\n'))
    .map((item) => item.trim())
    .filter(Boolean)

  if (changes.length > 0) {
    fail(
      'MANIFEST_REQUIRES_CLEAN_WORKTREE',
      `commit or remove all changes before pinning review:\n${changes
        .map((item) => `  - ${item}`)
        .join('\n')}`,
    )
  }
}

function extractGateBlock(reviewText) {
  const matches = [...reviewText.matchAll(/<!--\s*openspec-review-gate\s*([\s\S]*?)-->/g)]

  if (matches.length !== 1) {
    fail(
      'GATE_BLOCK_COUNT',
      `expected exactly one openspec-review-gate block; found ${matches.length}`,
    )
  }

  let gate
  try {
    gate = JSON.parse(matches[0][1].trim())
  } catch (error) {
    fail('GATE_BLOCK_INVALID_JSON', error.message)
  }

  return gate
}

function assertExactKeys(object, expectedKeys, context) {
  if (object === null || typeof object !== 'object' || Array.isArray(object)) {
    fail('INVALID_GATE_SHAPE', `${context} must be an object`)
  }

  const actual = Object.keys(object).sort()
  const expected = [...expectedKeys].sort()

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      'UNEXPECTED_GATE_FIELDS',
      `${context} fields differ\nexpected: ${expected.join(', ')}\nactual:   ${actual.join(', ')}`,
    )
  }
}

function assertString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('INVALID_GATE_FIELD', `${field} must be a non-empty string`)
  }
}

function validateGateShape(gate) {
  const keys = [
    'contract',
    'schema',
    'rubric',
    'reviewed_commit',
    'reviewed_base_commit',
    'review_epoch',
    'scope_id',
    'reviewed_at',
    'reviewer',
    'verdict',
    'unresolved_p1_count',
    'unassigned_p2_p3_count',
    'invariant_set_changed',
    'authority_allocation_complete',
    'reviewed_artifacts',
  ]
  assertExactKeys(gate, keys, 'review gate')

  if (gate.contract !== CONTRACT) {
    fail('WRONG_GATE_CONTRACT', `contract must be ${CONTRACT}; got ${String(gate.contract)}`)
  }
  if (gate.schema !== SCHEMA) {
    fail('WRONG_GATE_SCHEMA', `schema must be ${SCHEMA}; got ${String(gate.schema)}`)
  }
  if (gate.rubric !== RUBRIC) {
    fail('WRONG_GATE_RUBRIC', `rubric must be ${RUBRIC}; got ${String(gate.rubric)}`)
  }

  if (typeof gate.reviewed_commit !== 'string' || !/^[0-9a-f]{40}$/.test(gate.reviewed_commit)) {
    fail('INVALID_REVIEWED_COMMIT', 'reviewed_commit must be a full lowercase 40-hex Git commit')
  }

  if (
    typeof gate.reviewed_base_commit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(gate.reviewed_base_commit)
  ) {
    fail(
      'INVALID_REVIEWED_BASE_COMMIT',
      'reviewed_base_commit must be a full lowercase 40-hex Git commit',
    )
  }

  if (!Number.isInteger(gate.review_epoch) || gate.review_epoch < 1) {
    fail(
      'INVALID_REVIEW_EPOCH',
      `review_epoch must be an integer >= 1; got ${JSON.stringify(gate.review_epoch)}`,
    )
  }

  assertString(gate.scope_id, 'scope_id')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(gate.scope_id)) {
    fail('INVALID_SCOPE_ID', `scope_id must match ^[a-z0-9][a-z0-9-]*$; got ${gate.scope_id}`)
  }

  assertString(gate.reviewed_at, 'reviewed_at')
  if (gate.reviewed_at === REVIEWED_AT_PLACEHOLDER) {
    fail(
      'PLACEHOLDER_REVIEWED_AT',
      'reviewed_at is still the manifest placeholder; the accepting reviewer ' +
        'records when the review was made, not the tool that pinned the bytes',
    )
  }
  if (!RFC3339.test(gate.reviewed_at)) {
    fail(
      'INVALID_REVIEWED_AT',
      `reviewed_at must be an RFC 3339 date-time; got ${gate.reviewed_at}`,
    )
  }
  if (!isRealInstant(gate.reviewed_at)) {
    fail(
      'INVALID_REVIEWED_AT',
      `reviewed_at is RFC 3339-shaped but not a real instant: ${gate.reviewed_at}`,
    )
  }

  assertString(gate.reviewer, 'reviewer')
  if (/REPLACE_WITH|TBD|TODO/i.test(gate.reviewer)) {
    fail('PLACEHOLDER_REVIEWER', 'reviewer still contains a placeholder')
  }

  if (gate.verdict !== 'ARCHITECTURE_ACCEPTED') {
    fail(
      'REVIEW_NOT_ACCEPTED',
      `verdict is ${String(gate.verdict)}; expected ARCHITECTURE_ACCEPTED`,
    )
  }

  if (gate.unresolved_p1_count !== 0) {
    fail('UNRESOLVED_P1', `unresolved_p1_count must be 0; got ${String(gate.unresolved_p1_count)}`)
  }

  if (gate.unassigned_p2_p3_count !== 0) {
    fail(
      'UNASSIGNED_NON_P1_FINDINGS',
      `unassigned_p2_p3_count must be 0; got ${String(gate.unassigned_p2_p3_count)}`,
    )
  }

  if (gate.invariant_set_changed !== false) {
    fail('INVARIANT_SET_CHANGED', 'invariant_set_changed must be false for the accepting review')
  }

  if (gate.authority_allocation_complete !== true) {
    fail('AUTHORITY_ALLOCATION_INCOMPLETE', 'authority_allocation_complete must be true')
  }

  if (!Array.isArray(gate.reviewed_artifacts)) {
    fail('INVALID_ARTIFACT_MANIFEST', 'reviewed_artifacts must be an array')
  }

  for (const [index, artifact] of gate.reviewed_artifacts.entries()) {
    assertExactKeys(artifact, ['path', 'sha256'], `reviewed_artifacts[${index}]`)
    assertString(artifact.path, `reviewed_artifacts[${index}].path`)

    if (
      path.isAbsolute(artifact.path) ||
      artifact.path.includes('\\') ||
      artifact.path.split('/').includes('..') ||
      artifact.path === REVIEW_FILE ||
      artifact.path.startsWith('reviews/')
    ) {
      fail('INVALID_ARTIFACT_PATH', `unsafe or non-planning artifact path: ${artifact.path}`)
    }

    if (typeof artifact.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(artifact.sha256)) {
      fail('INVALID_ARTIFACT_DIGEST', `invalid lowercase SHA-256 for ${artifact.path}`)
    }
  }
}

async function verifyArtifactManifest(context, gate, ref = 'HEAD') {
  const actual = await artifactManifest(context, ref)
  const declared = gate.reviewed_artifacts

  const actualPaths = actual.map((item) => item.path)
  const declaredPaths = declared.map((item) => item.path)

  if (new Set(declaredPaths).size !== declaredPaths.length) {
    fail('DUPLICATE_ARTIFACT_PATH', 'reviewed_artifacts contains duplicates')
  }

  if (JSON.stringify(actualPaths) !== JSON.stringify(declaredPaths)) {
    fail(
      'ARTIFACT_SET_DRIFT',
      `reviewed artifact paths differ\nexpected current ordered set:\n${actualPaths
        .map((item) => `  - ${item}`)
        .join('\n')}\ndeclared:\n${declaredPaths.map((item) => `  - ${item}`).join('\n')}`,
    )
  }

  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index].sha256 !== declared[index].sha256) {
      fail(
        'ARTIFACT_BYTES_DRIFT',
        `${actual[index].path} changed after review\nexpected ${declared[index].sha256}\nactual   ${actual[index].sha256}`,
      )
    }
  }

  return actual
}

/**
 * Blank out fenced code blocks and HTML comments, preserving line structure.
 *
 * A `## Heading` inside an example block is illustration, not a section, and
 * the machine-readable gate block is itself an HTML comment. Masking rather
 * than deleting keeps line numbers meaningful in refusals.
 */
function maskNonProse(text, { maskComments = true } = {}) {
  const lines = text.split('\n')
  const masked = []
  let fence = null
  let inComment = false

  for (const line of lines) {
    if (fence !== null) {
      const closing = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line)
      if (closing !== null && closing[1][0] === fence[0] && closing[1].length >= fence.length) {
        fence = null
      }
      masked.push('')
      continue
    }

    if (inComment) {
      const close = line.indexOf('-->')
      if (close === -1) {
        masked.push('')
        continue
      }
      inComment = false
      masked.push(line.slice(close + '-->'.length))
      continue
    }

    const opening = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (opening !== null) {
      fence = opening[1]
      masked.push('')
      continue
    }

    const open = maskComments ? line.indexOf('<!--') : -1
    if (open === -1) {
      masked.push(line)
      continue
    }

    const close = line.indexOf('-->', open)
    if (close === -1) {
      inComment = true
      masked.push(line.slice(0, open))
      continue
    }
    masked.push(line.slice(0, open) + line.slice(close + '-->'.length))
  }

  return masked.join('\n')
}

/**
 * Split the review into H2 sections. A section ends at the next H2, never at
 * end-of-file: slicing to EOF is what let a later section satisfy an earlier
 * section's requirement.
 */
function parseSections(reviewText) {
  const lines = maskNonProse(reviewText).split('\n')
  const sections = []
  let current = null

  for (const [index, line] of lines.entries()) {
    const heading = /^##[ \t]+(\S.*?)[ \t]*$/.exec(line)
    if (heading !== null) {
      current = { title: heading[1], line: index + 1, lines: [] }
      sections.push(current)
      continue
    }
    if (current !== null) {
      current.lines.push(line)
    }
  }

  return sections.map((section) => ({
    title: section.title,
    line: section.line,
    body: section.lines.join('\n'),
  }))
}

function countMatches(text, pattern) {
  return [...text.matchAll(new RegExp(pattern.source, pattern.flags))].length
}

function assertSectionStructure(sections) {
  const seen = new Map()
  for (const section of sections) {
    if (!REQUIRED_SECTIONS.includes(section.title)) {
      continue
    }
    if (seen.has(section.title)) {
      fail(
        'DUPLICATE_REVIEW_SECTION',
        `required section appears more than once: ## ${section.title} ` +
          `(lines ${seen.get(section.title).line} and ${section.line})`,
      )
    }
    seen.set(section.title, section)
  }

  for (const title of REQUIRED_SECTIONS) {
    if (!seen.has(title)) {
      fail('REVIEW_SECTION_MISSING', `required review section missing: ## ${title}`)
    }
  }

  const actualOrder = sections
    .filter((section) => REQUIRED_SECTIONS.includes(section.title))
    .map((section) => section.title)

  if (JSON.stringify(actualOrder) !== JSON.stringify(REQUIRED_SECTIONS)) {
    fail(
      'REVIEW_SECTION_ORDER',
      `required sections are out of contract order\nexpected: ${REQUIRED_SECTIONS.join(
        ' -> ',
      )}\nactual:   ${actualOrder.join(' -> ')}`,
    )
  }

  return seen
}

function assertSectionMarkers(sections, byTitle) {
  for (const marker of SECTION_MARKERS) {
    const owning = byTitle.get(marker.section)
    const occurrences = countMatches(owning.body, marker.pattern)

    if (occurrences !== 1) {
      fail(
        marker.code,
        `## ${marker.section} must contain exactly one line: ${marker.label}` +
          ` (found ${occurrences})`,
      )
    }

    // Section ownership, enforced in both directions: the same marker elsewhere
    // makes it ambiguous which section the reviewer was answering.
    for (const section of sections) {
      if (section === owning) {
        continue
      }
      if (countMatches(section.body, marker.pattern) > 0) {
        fail(
          'MARKER_OUTSIDE_OWNING_SECTION',
          `${marker.label} belongs to ## ${marker.section}; also found in ## ${section.title}`,
        )
      }
    }
  }
}

function assertVerdictSection(byTitle) {
  const verdict = byTitle.get('Verdict')
  const found = []

  for (const token of VERDICT_TOKENS) {
    const pattern = new RegExp(`^\\*\\*${token}\\*\\*[ \\t]*$`, 'gm')
    for (let index = 0; index < countMatches(verdict.body, pattern); index += 1) {
      found.push(token)
    }
  }

  if (found.length !== 1) {
    fail(
      'HUMAN_VERDICT_MISMATCH',
      '## Verdict must state exactly one governed verdict token as a bold line ' +
        `of its own; found ${found.length}${found.length > 0 ? ` (${found.join(', ')})` : ''}`,
    )
  }

  if (found[0] !== 'ARCHITECTURE_ACCEPTED') {
    fail(
      'REVIEW_NOT_ACCEPTED',
      `## Verdict states ${found[0]}; the gate accepts only ARCHITECTURE_ACCEPTED`,
    )
  }
}

function assertReviewBody(reviewText) {
  if (/REPLACE_WITH_(?:40_HEX_COMMIT|RFC3339_TIMESTAMP|INDEPENDENT_REVIEWER)/.test(reviewText)) {
    fail('REVIEW_PLACEHOLDER_REMAINS', 'machine-readable gate placeholders remain')
  }

  const sections = parseSections(reviewText)
  const byTitle = assertSectionStructure(sections)
  assertSectionMarkers(sections, byTitle)
  assertVerdictSection(byTitle)
}

/**
 * `verify` runs at the pre-apply boundary, so the thing being verified must be
 * the committed repository, not a worktree someone is still editing.
 *
 * Without this, an accepted review could exist only as an unstaged edit: the
 * gate would read it, pass, and leave nothing in history to review. The review
 * file and `reviews/**` are explicitly included — they are the two paths the
 * drift allowlist permits to change, which makes them exactly the paths most
 * likely to be left uncommitted.
 */
function assertVerifyWorktreeClean(repoRoot) {
  const unstaged = runGit(repoRoot, ['diff', '--name-only']) || ''
  const staged = runGit(repoRoot, ['diff', '--cached', '--name-only']) || ''
  const untracked = runGit(repoRoot, ['ls-files', '--others', '--exclude-standard']) || ''

  const dirty = [unstaged, staged, untracked]
    .flatMap((group) => group.split('\n'))
    .map((item) => item.trim())
    .filter(Boolean)
    .sort(compareUtf8)

  if (dirty.length > 0) {
    fail(
      'VERIFY_REQUIRES_CLEAN_WORKTREE',
      `verify runs against committed history; commit or remove:\n${dirty
        .map((item) => `  - ${item}`)
        .join('\n')}`,
    )
  }
}

/**
 * The accepting review must be a committed fact that did not exist, in this
 * form, at the planning pin.
 *
 * A review already present and unchanged at `reviewed_commit` was not written
 * about those bytes after reviewing them — it was there before the pin, and
 * treating it as the acceptance would let a stale or pre-seeded verdict satisfy
 * the gate.
 *
 * HONEST NOTE ON REACHABILITY. Both refusals below are defence in depth, and
 * neither is currently reachable:
 *
 *   REVIEW_NOT_COMMITTED     shadowed by assertVerifyWorktreeClean — an
 *                            untracked review makes the worktree dirty first.
 *   REVIEW_UNCHANGED_SINCE_PIN
 *                            unreachable by construction. For the review to be
 *                            unchanged after its pin, `reviewed_commit` would
 *                            have to name a commit at or after the last edit to
 *                            the review — but writing that value IS an edit, and
 *                            a commit cannot contain its own hash.
 *
 * They are kept because both properties are load-bearing and each becomes
 * reachable the moment the drift allowlist or the clean-worktree requirement is
 * relaxed. They are documented as unreachable rather than covered by a test
 * that cannot be written.
 */
function assertReviewCommittedAfterPin({ repoRoot, changeRepoPath, reviewedCommit, ref = 'HEAD' }) {
  const reviewPath = `${changeRepoPath}/${REVIEW_FILE}`

  // ls-files reads the index, which does not exist when verifying a bare ref;
  // the tree is the equivalent question and works for both.
  const tracked = runGit(repoRoot, ['cat-file', '-e', `${ref}:${reviewPath}`], {
    allowFailure: true,
  })
  if (tracked === null) {
    fail(
      'REVIEW_NOT_COMMITTED',
      `${reviewPath} is not tracked; the accepting review must be committed`,
    )
  }

  const changed =
    runGit(repoRoot, ['diff', '--name-only', `${reviewedCommit}..${ref}`, '--', reviewPath]) || ''

  if (changed.trim().length === 0) {
    fail(
      'REVIEW_UNCHANGED_SINCE_PIN',
      `${reviewPath} is unchanged between ${reviewedCommit} and ${ref}; the ` +
        'accepting review must be recorded after the reviewed planning commit',
    )
  }
}

/**
 * The scope must resolve EXACTLY ONCE in the pinned tasks.md.
 *
 * tasks.md owns implementation and release scope. The review refers to it by a
 * stable id and never restates its paths, tasks, or authorization — otherwise
 * "what is in this scope" would have two authorities that can disagree.
 */
function assertScopeResolves(context, scopeId, ref = 'HEAD') {
  const tasks = gitText(context.repoRoot, ref, `${context.changeRepoPath}/tasks.md`)

  // Fenced blocks are masked so an EXAMPLE marker in documentation cannot
  // declare a scope. Comments are NOT masked: the marker is deliberately an
  // HTML comment so it is machine-readable and invisible in rendered markdown.
  const declared = [...maskNonProse(tasks, { maskComments: false }).matchAll(SCOPE_MARKER)].map(
    (match) => match[1],
  )
  const matching = declared.filter((id) => id === scopeId)

  const duplicates = declared.filter((id, index) => declared.indexOf(id) !== index)
  if (duplicates.length > 0) {
    fail(
      'DUPLICATE_REVIEW_SCOPE',
      `tasks.md declares review-scope ids more than once: ${[...new Set(duplicates)].join(', ')}`,
    )
  }

  if (matching.length !== 1) {
    fail(
      'SCOPE_NOT_DECLARED',
      `scope_id "${scopeId}" resolves ${matching.length} times in tasks.md; ` +
        `declared scopes: ${declared.length > 0 ? declared.join(', ') : '(none)'}`,
    )
  }
}

/**
 * Epoch sequence, read from the append-only history beside the current review.
 *
 * Historical immutability belongs to the two-revision history checker; this
 * only asks whether the CURRENT epoch is the next one. Rounds are named
 * `<epoch>-<anything>.md`, so the directory listing IS the admitted sequence
 * and no hand-maintained count can drift from it.
 */
/**
 * ADMISSION IS A STATE TRANSITION, NOT A NAMING CONVENTION.
 *
 * An earlier revision read `reviews/` with readdir and treated ANY `<n>-*.md`
 * as an admitted epoch. Nothing looked inside. So `reviews/1-fake.md`
 * containing `# round 1` manufactured an epoch-1 predecessor, and because
 * enumeration used the filesystem while cleanliness used git's normal untracked
 * checks, an IGNORED file could do it without being committed at all — the
 * exact class of bug just fixed for planning artifacts.
 *
 * A historical round is admitted only if it is committed, named
 * `<epoch>-<reviewed-sha12>.md`, and carries a gate block that agrees with its
 * own filename and was accepted.
 */
function admittedEpochs(context, ref = 'HEAD') {
  const listing = runGit(
    context.repoRoot,
    ['ls-tree', '-r', '-z', '--name-only', ref, '--', `${context.changeRepoPath}/reviews`],
    { allowFailure: true },
  )
  if (listing === null) {
    fail('HEAD_TREE_UNREADABLE', 'could not read the committed review history')
  }

  // A round is a DIRECT CHILD of reviews/. `ls-tree -r` walks the whole subtree,
  // so taking the basename would read `reviews/nested/1-<sha12>.md` as the round
  // `1-<sha12>.md` — an epoch predecessor at a path the two-revision provenance
  // checker does not recognise, and therefore one whose bytes were never proved
  // to have been the current review immediately before archival. Admission is a
  // state transition, not a naming convention, so a nested path is REFUSED
  // rather than ignored: ignoring it would leave the same round admissible here
  // while invisible there.
  const reviewsPrefix = `${context.changeRepoPath}/reviews/`
  const admitted = []
  for (const repoPath of listing.split('\0').filter(Boolean)) {
    const relative = repoPath.startsWith(reviewsPrefix)
      ? repoPath.slice(reviewsPrefix.length)
      : repoPath.slice(repoPath.lastIndexOf('/') + 1)
    if (relative.includes('/')) {
      fail(
        'MALFORMED_REVIEW_HISTORY',
        `reviews/${relative} is nested; an admitted round is a direct child of ` +
          'reviews/ named <epoch>-<reviewed-sha12>.md. A nested path is not a ' +
          'second supported representation',
      )
    }
    const name = relative
    if (!name.endsWith('.md')) continue

    const named = /^(\d+)-([0-9a-f]{12})\.md$/.exec(name)
    if (named === null) {
      fail(
        'MALFORMED_REVIEW_HISTORY',
        `reviews/${name} is not <epoch>-<reviewed-sha12>.md; a round that cannot be ` +
          'identified cannot be admitted',
      )
    }
    const [, epochText, sha12] = named
    const text = gitText(context.repoRoot, ref, repoPath)

    let gate
    try {
      gate = extractGateBlock(text)
    } catch (error) {
      fail(
        'UNADMISSIBLE_REVIEW_HISTORY',
        `reviews/${name} carries no readable review gate block (${error.message}); ` +
          'a historical round must be a real accepted review, not a placeholder',
      )
    }

    // The COMPLETE contract, not four selected fields: an admitted round is a
    // real accepted review, so it must satisfy every rule the current review
    // does — shape, reviewer, calendar instant, counts, artifact manifest — and
    // its body must satisfy the section and verdict contract too.
    try {
      validateGateShape(gate)
      assertReviewBody(text)
    } catch (error) {
      fail(
        'UNADMISSIBLE_REVIEW_HISTORY',
        `reviews/${name} does not satisfy the review contract: ${error.message}`,
      )
    }

    const problems = []
    if (gate.review_epoch !== Number(epochText))
      problems.push(`review_epoch is ${String(gate.review_epoch)}, filename says ${epochText}`)
    if (!gate.reviewed_commit.startsWith(sha12))
      problems.push(`reviewed_commit does not start with ${sha12}`)
    // The reviewed commit must be a real commit in this repository's history.
    if (
      runGit(context.repoRoot, ['cat-file', '-e', `${gate.reviewed_commit}^{commit}`], {
        allowFailure: true,
      }) === null
    )
      problems.push(`reviewed_commit ${gate.reviewed_commit} is not a commit in this repository`)

    if (problems.length > 0) {
      fail(
        'UNADMISSIBLE_REVIEW_HISTORY',
        `reviews/${name} is not an admitted accepted review: ${problems.join('; ')}`,
      )
    }
    admitted.push(Number(epochText))
  }
  admitted.sort((a, b) => a - b)
  return admitted
}

function assertEpochSequence(context, epoch, ref = 'HEAD') {
  const admitted = admittedEpochs(context, ref)

  const duplicates = admitted.filter((value, index) => admitted.indexOf(value) !== index)
  if (duplicates.length > 0) {
    fail(
      'DUPLICATE_REVIEW_EPOCH',
      `review history admits epoch ${[...new Set(duplicates)].join(', ')} more than once`,
    )
  }

  const expected = Array.from({ length: epoch - 1 }, (_, index) => index + 1)
  if (JSON.stringify(admitted) !== JSON.stringify(expected)) {
    fail(
      'REVIEW_EPOCH_SEQUENCE',
      `epoch ${epoch} requires exactly admitted epochs [${expected.join(', ')}]; ` +
        `found [${admitted.join(', ')}]. An epoch may not be skipped, repeated, or ` +
        'regressed, and a superseded review must be archived first',
    )
  }
}

/**
 * Bind the review to the exact target-base revision its assumptions were made
 * against.
 *
 * Pinning only the planning branch commit left the base free to move: a review
 * accepted against one `main` could authorize apply against a different one,
 * silently. The exact SHA is recorded — never a mutable ref like `main`, which
 * would be an authority that changes without anybody deciding.
 *
 * A base advance requires a fresh epoch. It does NOT automatically require
 * another unrestricted architecture audit: when the planning bytes are
 * unchanged and the base movement does not touch their assumptions, the next
 * epoch may be a focused base-freshness review.
 */
function resolveBaseCommit(repoRoot, baseRef) {
  if (baseRef === undefined) {
    fail(
      'BASE_REF_REQUIRED',
      '--base <ref> is required: a review boundary is never inferred. Pass the ' +
        'target branch this review was made against, for example origin/main',
    )
  }
  const resolved = runGit(repoRoot, ['rev-parse', '--verify', `${baseRef}^{commit}`], {
    allowFailure: true,
  })
  if (resolved === null || !/^[0-9a-f]{40}$/.test(resolved)) {
    fail(
      'BASE_REF_UNRESOLVABLE',
      `--base "${baseRef}" does not resolve to a commit. An explicit base never ` +
        'demotes to inference: nothing was compared',
    )
  }
  return resolved
}

/**
 * PROVE THE RESOLVED BASE IS THE CURRENT TARGET BRANCH.
 *
 * `origin/main` is a LOCAL remote-tracking ref. If the real branch advances and
 * nobody fetched, both manifest and verify resolve the same stale SHA and the
 * gate passes — so the previous implementation proved "the caller's locally
 * visible base has not moved", while the documentation claimed "the target
 * branch has not advanced". Those are different statements.
 *
 * Freshness is therefore established explicitly, with no inferred fallback:
 * either an authoritative SHA is supplied (CI knows `pull_request.base.sha`),
 * or the live remote is consulted. An unreachable remote REFUSES rather than
 * assuming currency.
 */
function assertBaseIsCurrent(repoRoot, baseCommit, options) {
  if (options.baseSha !== undefined && options.remote !== undefined) {
    // Two alternative sources of freshness AUTHORITY. Silently preferring one
    // would let a caller supply a real remote alongside a hand-written SHA and
    // have the SHA win without saying so.
    fail(
      'CONFLICTING_FRESHNESS_SOURCES',
      '--base-sha and --remote are alternative freshness authorities; supply ' +
        'exactly one so which one decided is never ambiguous',
    )
  }

  if (options.baseSha !== undefined) {
    if (!/^[0-9a-f]{40}$/.test(options.baseSha)) {
      fail('INVALID_BASE_SHA', '--base-sha must be a full lowercase 40-hex commit')
    }
    if (options.baseSha !== baseCommit) {
      fail(
        'REVIEW_BASE_STALE',
        `the authoritative base is ${options.baseSha} but "${options.base}" resolves ` +
          'to ' +
          baseCommit +
          '. The local ref is behind the real target branch; ' +
          'fetch and take a fresh review epoch',
      )
    }
    return `--base-sha ${options.baseSha.slice(0, 12)}`
  }

  if (options.remote !== undefined) {
    const separator = options.remote.indexOf('/')
    if (separator === -1) {
      fail('INVALID_REMOTE', '--remote must be <remote>/<branch>, for example origin/main')
    }
    const remote = options.remote.slice(0, separator)
    const branch = options.remote.slice(separator + 1)
    const listed = runGit(repoRoot, ['ls-remote', '--exit-code', remote, `refs/heads/${branch}`], {
      allowFailure: true,
    })
    if (listed === null || listed.length === 0) {
      fail(
        'BASE_FRESHNESS_UNPROVEN',
        `could not read ${options.remote} from the remote, so the base could not be ` +
          'proved current. This refuses rather than assuming the local ref is fresh',
      )
    }
    const live = listed.split(/\s+/)[0]
    if (live !== baseCommit) {
      fail(
        'REVIEW_BASE_STALE',
        `${options.remote} is at ${live} but "${options.base}" resolves to ` +
          `${baseCommit}. The local ref is stale; fetch and take a fresh review epoch`,
      )
    }
    return `--remote ${options.remote}`
  }

  fail(
    'BASE_FRESHNESS_REQUIRED',
    'the base must be proved CURRENT, not merely resolvable: pass --base-sha ' +
      '<40-hex> (an authoritative SHA, for example a pull request base) or ' +
      '--remote <remote>/<branch> to consult the live ref. A local remote-tracking ' +
      'ref can be arbitrarily stale, and this gate never assumes it is fresh',
  )
}

function assertBaseIncorporated(repoRoot, baseCommit, ref = 'HEAD') {
  const incorporated = runGit(repoRoot, ['merge-base', '--is-ancestor', baseCommit, ref], {
    allowFailure: true,
  })
  if (incorporated === null) {
    fail(
      'BASE_NOT_INCORPORATED',
      `base commit ${baseCommit} is not an ancestor of ${ref}; the reviewed work ` +
        'does not sit on the base it claims',
    )
  }
}

function assertRepositoryPin({ repoRoot, changeRepoPath, reviewedCommit, ref = 'HEAD' }) {
  const commitExists = runGit(repoRoot, ['cat-file', '-e', `${reviewedCommit}^{commit}`], {
    allowFailure: true,
  })
  if (commitExists === null) {
    fail('REVIEWED_COMMIT_NOT_FOUND', `reviewed commit is not available locally: ${reviewedCommit}`)
  }

  const isAncestor = runGit(repoRoot, ['merge-base', '--is-ancestor', reviewedCommit, ref], {
    allowFailure: true,
  })
  if (isAncestor === null) {
    fail(
      'REVIEWED_COMMIT_NOT_ANCESTOR',
      `reviewed commit is not an ancestor of ${ref}: ${reviewedCommit}`,
    )
  }

  const allowedReviewPath = `${changeRepoPath}/${REVIEW_FILE}`
  const allowedHistoryPrefix = `${changeRepoPath}/reviews/`
  const changed = repositoryChanges(repoRoot, reviewedCommit, ref)
  const forbidden = [...changed]
    .filter(
      (candidate) => candidate !== allowedReviewPath && !candidate.startsWith(allowedHistoryPrefix),
    )
    .sort()

  if (forbidden.length > 0) {
    fail(
      'REPOSITORY_DRIFT_AFTER_REVIEW',
      `paths outside the current review/history changed after the reviewed commit:\n${forbidden
        .map((item) => `  - ${item}`)
        .join('\n')}`,
    )
  }
}

async function manifestMode(context, options) {
  assertManifestWorktreeClean(context.repoRoot)

  const epoch = options.epoch
  if (!Number.isInteger(epoch) || epoch < 1) {
    fail('INVALID_REVIEW_EPOCH', '--epoch <n> must be an integer >= 1')
  }
  if (options.scope === undefined) {
    fail('SCOPE_REQUIRED', '--scope <id> is required: every review pins one release scope')
  }

  assertNoHiddenIndexFlags(context.repoRoot)
  assertScopeResolves(context, options.scope)
  assertEpochSequence(context, epoch)

  const baseCommit = resolveBaseCommit(context.repoRoot, options.base)
  assertBaseIsCurrent(context.repoRoot, baseCommit, options)
  assertBaseIncorporated(context.repoRoot, baseCommit)

  const artifacts = await artifactManifest(context)
  const reviewedCommit = runGit(context.repoRoot, ['rev-parse', 'HEAD'])

  const gate = {
    contract: CONTRACT,
    schema: SCHEMA,
    rubric: RUBRIC,
    reviewed_commit: reviewedCommit,
    reviewed_base_commit: baseCommit,
    review_epoch: epoch,
    scope_id: options.scope,
    // NOT the current time. `manifest` runs BEFORE the independent review, so a
    // generated timestamp would record when the bytes were pinned and read as
    // when they were reviewed. The accepting reviewer replaces this.
    reviewed_at: REVIEWED_AT_PLACEHOLDER,
    reviewer: 'REPLACE_WITH_INDEPENDENT_REVIEWER',
    verdict: 'REVIEW_REQUIRED',
    unresolved_p1_count: null,
    unassigned_p2_p3_count: null,
    invariant_set_changed: null,
    authority_allocation_complete: null,
    reviewed_artifacts: artifacts,
  }

  process.stdout.write(`<!-- openspec-review-gate\n${JSON.stringify(gate, null, 2)}\n-->\n`)
}

async function verifyMode(context, options) {
  // With --ref nothing is checked out, so there is no worktree to be dirty and
  // no index to carry hidden flags: the ref IS the object under review. This is
  // what lets the governed boundary verify a pull request without ever placing
  // its code on a privileged runner.
  const ref = options.ref ?? 'HEAD'
  if (options.ref === undefined) {
    assertVerifyWorktreeClean(context.repoRoot)
    assertNoHiddenIndexFlags(context.repoRoot)
  } else if (
    runGit(context.repoRoot, ['rev-parse', '--verify', `${options.ref}^{commit}`], {
      allowFailure: true,
    }) === null
  ) {
    fail('REF_UNRESOLVABLE', `--ref "${options.ref}" does not resolve to a commit`)
  }
  readSchemaSelection(context, ref)

  // The COMMITTED review, never the worktree's: a committed non-accepting
  // review could otherwise be edited locally under skip-worktree while verify
  // read the local accepted bytes.
  const reviewText = gitText(context.repoRoot, ref, `${context.changeRepoPath}/${REVIEW_FILE}`)

  const gate = extractGateBlock(reviewText)
  validateGateShape(gate)
  const artifacts = await verifyArtifactManifest(context, gate, ref)
  assertReviewBody(reviewText)
  assertRepositoryPin({
    repoRoot: context.repoRoot,
    changeRepoPath: context.changeRepoPath,
    reviewedCommit: gate.reviewed_commit,
    ref,
  })
  assertReviewCommittedAfterPin({
    repoRoot: context.repoRoot,
    changeRepoPath: context.changeRepoPath,
    reviewedCommit: gate.reviewed_commit,
    ref,
  })

  assertScopeResolves(context, gate.scope_id, ref)
  assertEpochSequence(context, gate.review_epoch, ref)

  const baseCommit = resolveBaseCommit(context.repoRoot, options.base)
  const freshness = assertBaseIsCurrent(context.repoRoot, baseCommit, options)
  if (baseCommit !== gate.reviewed_base_commit) {
    fail(
      'REVIEW_BASE_DRIFT',
      `the base moved after this review: it was accepted against ` +
        `${gate.reviewed_base_commit} and "${options.base}" now resolves to ` +
        `${baseCommit}. A fresh review epoch is required. That epoch MAY be a ` +
        'focused base-freshness review when the planning bytes are unchanged and ' +
        'the base movement does not touch their assumptions — it is not ' +
        'automatically another unrestricted architecture audit',
    )
  }
  assertBaseIncorporated(context.repoRoot, baseCommit, ref)

  process.stdout.write(
    [
      'REVIEW_GATE_VALID',
      `change=${context.changeName}`,
      `epoch=${gate.review_epoch}`,
      `scope=${gate.scope_id}`,
      `reviewed_commit=${gate.reviewed_commit}`,
      `base=${gate.reviewed_base_commit}`,
      `freshness=${freshness}`,
      `artifacts=${artifacts.length}`,
      `reviewer=${gate.reviewer}`,
      '',
    ].join(' '),
  )
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  const context = await resolveContext(parsed)

  if (parsed.mode === 'manifest') {
    await manifestMode(context, parsed)
  } else {
    await verifyMode(context, parsed)
  }
}

main().catch((error) => {
  if (error instanceof GateError) {
    process.stderr.write(`REVIEW_GATE_REFUSED [${error.code}]: ${error.message}\n`)
    process.exit(1)
  }

  process.stderr.write(
    `REVIEW_GATE_ERROR: ${error instanceof Error ? error.stack : String(error)}\n`,
  )
  process.exit(2)
})
