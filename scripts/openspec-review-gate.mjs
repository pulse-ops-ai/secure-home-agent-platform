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

const CONTRACT = 'preimplementation-review-v1'
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
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

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
  node scripts/openspec-review-gate.mjs manifest --change <change-name>
  node scripts/openspec-review-gate.mjs verify   --change <change-name>
  node scripts/openspec-review-gate.mjs manifest --change-dir <path>
  node scripts/openspec-review-gate.mjs verify   --change-dir <path>

Modes:
  manifest  Print a machine-readable gate block for the current clean HEAD.
  verify    Verify the accepting review, artifact hashes, and repository pin.
`
}

function runGit(repoRoot, args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', allowFailure ? 'pipe' : 'inherit'],
    }).trim()
  } catch (error) {
    if (allowFailure) {
      return null
    }
    throw error
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

  let change = null
  let changeDirArg = null

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--change') {
      change = argv[index + 1] ?? null
      index += 1
    } else if (arg === '--change-dir') {
      changeDirArg = argv[index + 1] ?? null
      index += 1
    } else {
      fail('USAGE', `unknown argument: ${arg}\n\n${usage()}`)
    }
  }

  if ((change === null) === (changeDirArg === null)) {
    fail('USAGE', 'provide exactly one of --change <name> or --change-dir <path>')
  }

  if (change !== null && !/^[a-z0-9][a-z0-9-]*$/.test(change)) {
    fail('INVALID_CHANGE_NAME', `change name must match ^[a-z0-9][a-z0-9-]*$: ${change}`)
  }

  return { mode, change, changeDirArg }
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

async function resolveContext({ change, changeDirArg }) {
  const repoRootText = runGit(process.cwd(), ['rev-parse', '--show-toplevel'], {
    allowFailure: true,
  })

  if (repoRootText === null || repoRootText.length === 0) {
    fail('NOT_A_GIT_REPOSITORY', 'run this command inside a Git repository')
  }

  const repoRoot = await realpath(repoRootText)
  const changesRoot = await realpath(path.join(repoRoot, 'openspec', 'changes'))

  const unresolved =
    change !== null ? path.join(changesRoot, change) : path.resolve(repoRoot, changeDirArg)

  let changeDir
  try {
    changeDir = await realpath(unresolved)
  } catch {
    fail('CHANGE_NOT_FOUND', `change directory does not exist: ${unresolved}`)
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

async function readSchemaSelection(changeDir) {
  const metadataPath = path.join(changeDir, '.openspec.yaml')
  await assertRegularFileInside(changeDir, metadataPath, '.openspec.yaml')
  const metadata = await readFile(metadataPath, 'utf8')

  const selected = metadata.match(/^\s*schema:\s*([^\s#]+)\s*(?:#.*)?$/m)?.[1]
  if (selected !== SCHEMA) {
    fail(
      'WRONG_CHANGE_SCHEMA',
      `.openspec.yaml selects ${selected ?? 'no schema'}; expected ${SCHEMA}`,
    )
  }
}

async function planningPaths(changeDir) {
  await readSchemaSelection(changeDir)

  const fixedBeforeSpecs = ['.openspec.yaml', 'proposal.md']
  const specPaths = await listMarkdownFiles(path.join(changeDir, 'specs'), 'specs')
  const fixedAfterSpecs = ['design.md', 'assurance.md', 'tasks.md']

  if (specPaths.length === 0) {
    fail('NO_DELTA_SPECS', 'governed-spec-driven-v2 requires at least one specs/**/*.md file')
  }

  const paths = [...fixedBeforeSpecs, ...specPaths, ...fixedAfterSpecs]

  for (const relative of paths) {
    await assertRegularFileInside(changeDir, path.join(changeDir, relative), relative)
  }

  return paths
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function artifactManifest(changeDir) {
  const paths = await planningPaths(changeDir)
  return Promise.all(
    paths.map(async (relative) => {
      const bytes = await readFile(path.join(changeDir, relative))
      return { path: relative, sha256: sha256(bytes) }
    }),
  )
}

function repositoryChanges(repoRoot, reviewedCommit) {
  const committed =
    runGit(repoRoot, [
      'diff',
      '--name-only',
      '--diff-filter=ACDMRTUXB',
      `${reviewedCommit}..HEAD`,
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
  if (Number.isNaN(Date.parse(gate.reviewed_at))) {
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

async function verifyArtifactManifest(changeDir, gate) {
  const actual = await artifactManifest(changeDir)
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
function maskNonProse(text) {
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

    const open = line.indexOf('<!--')
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
function assertReviewCommittedAfterPin({ repoRoot, changeRepoPath, reviewedCommit }) {
  const reviewPath = `${changeRepoPath}/${REVIEW_FILE}`

  const tracked = runGit(repoRoot, ['ls-files', '--error-unmatch', '--', reviewPath], {
    allowFailure: true,
  })
  if (tracked === null) {
    fail(
      'REVIEW_NOT_COMMITTED',
      `${reviewPath} is not tracked; the accepting review must be committed`,
    )
  }

  const changed =
    runGit(repoRoot, ['diff', '--name-only', `${reviewedCommit}..HEAD`, '--', reviewPath]) || ''

  if (changed.trim().length === 0) {
    fail(
      'REVIEW_UNCHANGED_SINCE_PIN',
      `${reviewPath} is unchanged between ${reviewedCommit} and HEAD; the ` +
        'accepting review must be recorded after the reviewed planning commit',
    )
  }
}

function assertRepositoryPin({ repoRoot, changeRepoPath, reviewedCommit }) {
  const commitExists = runGit(repoRoot, ['cat-file', '-e', `${reviewedCommit}^{commit}`], {
    allowFailure: true,
  })
  if (commitExists === null) {
    fail('REVIEWED_COMMIT_NOT_FOUND', `reviewed commit is not available locally: ${reviewedCommit}`)
  }

  const isAncestor = runGit(repoRoot, ['merge-base', '--is-ancestor', reviewedCommit, 'HEAD'], {
    allowFailure: true,
  })
  if (isAncestor === null) {
    fail(
      'REVIEWED_COMMIT_NOT_ANCESTOR',
      `reviewed commit is not an ancestor of HEAD: ${reviewedCommit}`,
    )
  }

  const allowedReviewPath = `${changeRepoPath}/${REVIEW_FILE}`
  const allowedHistoryPrefix = `${changeRepoPath}/reviews/`
  const changed = repositoryChanges(repoRoot, reviewedCommit)
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

async function manifestMode(context) {
  assertManifestWorktreeClean(context.repoRoot)

  const artifacts = await artifactManifest(context.changeDir)
  const reviewedCommit = runGit(context.repoRoot, ['rev-parse', 'HEAD'])

  const gate = {
    contract: CONTRACT,
    schema: SCHEMA,
    rubric: RUBRIC,
    reviewed_commit: reviewedCommit,
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

async function verifyMode(context) {
  assertVerifyWorktreeClean(context.repoRoot)
  await readSchemaSelection(context.changeDir)

  const reviewPath = path.join(context.changeDir, REVIEW_FILE)
  await assertRegularFileInside(context.changeDir, reviewPath, REVIEW_FILE)
  const reviewText = await readFile(reviewPath, 'utf8')

  const gate = extractGateBlock(reviewText)
  validateGateShape(gate)
  const artifacts = await verifyArtifactManifest(context.changeDir, gate)
  assertReviewBody(reviewText)
  assertRepositoryPin({
    repoRoot: context.repoRoot,
    changeRepoPath: context.changeRepoPath,
    reviewedCommit: gate.reviewed_commit,
  })
  assertReviewCommittedAfterPin({
    repoRoot: context.repoRoot,
    changeRepoPath: context.changeRepoPath,
    reviewedCommit: gate.reviewed_commit,
  })

  process.stdout.write(
    [
      'REVIEW_GATE_VALID',
      `change=${context.changeName}`,
      `reviewed_commit=${gate.reviewed_commit}`,
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
    await manifestMode(context)
  } else {
    await verifyMode(context)
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
