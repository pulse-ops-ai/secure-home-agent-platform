/**
 * THE `preimplementation-review-v2` RECORD CONTRACT, AS ONE SEMANTIC OWNER.
 *
 * Two consumers need the same answer to "is this a valid accepting review
 * record, and what planning artifacts must it cover": the OpenSpec review gate,
 * which asks it about a live change, and the governance-state model, which asks
 * it about an archived package as the content-backed `reviewedIdentity`. Two
 * implementations of that question would drift, and the one that drifted
 * loosest would become the one an author reaches for — so the rules live here
 * and both import them.
 *
 * PURE, DELIBERATELY. This module reads no files, runs no Git, mutates nothing
 * and knows nothing about governance state or completion. That is not tidiness:
 * the governance consumer validates an archived record with the reviewed commit
 * long gone, so anything history-dependent here would make the content-backed
 * form impossible to evaluate. History-dependent rules — epoch sequence, base
 * freshness, repository pinning, worktree cleanliness — stay in the gate.
 *
 * FAILURES ARE THROWN, NOT EXITED. The gate turns these into its own `fail()`
 * with the SAME code and message, so extracting them changed no gate output.
 */

/** The versioned identity triple. The contract string IS the schema version. */
export const CONTRACT = 'preimplementation-review-v2'
export const SCHEMA = 'governed-spec-driven-v2'
export const RUBRIC = 'governed-preimplementation-review-v1'

export const REVIEW_FILE = 'preimplementation-review.md'
export const REVIEWED_AT_PLACEHOLDER = 'REPLACE_WITH_RFC3339_TIMESTAMP'
export const ACCEPTED_VERDICT = 'ARCHITECTURE_ACCEPTED'

/** The closed field set of the gate block. */
export const GATE_FIELDS = [
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

/** The fixed planning artifacts, in their canonical order around the specs. */
export const PLANNING_PREFIX = ['.openspec.yaml', 'proposal.md']
export const PLANNING_SUFFIX = ['design.md', 'assurance.md', 'tasks.md']

export class ReviewContractError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReviewContractError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new ReviewContractError(code, message)
}

/**
 * RFC 3339 date-time, which is narrower than what `Date.parse` accepts.
 * `Date.parse` takes '2026-08-26', 'August 26 2026', and other host-dependent
 * spellings, so a date-only or locale-flavoured value would have passed while
 * carrying no reviewable instant.
 */
// Captured, not sliced: slicing around the OPTIONAL fraction meant
// `2026-08-26T09:15:00.123+24:00` reached the offset check as ".123+24:00",
// which "starts with a dot", so the +24:00 bound was never validated.
export const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/

/**
 * RFC 3339 shape is not a calendar.
 *
 * `Date.parse('2026-02-30T00:00:00Z')` NORMALISES to 2 March and returns a
 * number, so a shape check plus `Date.parse` accepts dates that never existed.
 * The components are therefore range-checked directly, including leap years.
 */
export function isRealInstant(value) {
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

/** Byte order, not locale order: the manifest is canonical, not presentational. */
export function compareUtf8(left, right) {
  const a = Buffer.from(left, 'utf8')
  const b = Buffer.from(right, 'utf8')
  return Buffer.compare(a, b)
}

export function assertExactKeys(object, expectedKeys, context) {
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

/**
 * The one gate block, parsed.
 *
 * Exactly one: two blocks would leave which one is authoritative to whoever
 * read the file first, and zero is not "an unreviewed change" but an
 * unanswerable question.
 */
export function extractReviewBlock(reviewText) {
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

/**
 * The closed shape AND the acceptance semantics, together.
 *
 * They are one check on purpose. A structurally perfect record carrying
 * `FOCUSED_CLOSURE_REQUIRED`, or three unresolved P1s, is not "a valid record
 * that happens not to be accepted" for either consumer: the gate refuses to
 * admit it, and the governance model refuses it as completion evidence. Letting
 * a caller take the shape check without the verdict check is the split that
 * would let one consumer accept what the other rejects.
 */
export function validateReviewRecordShapeAndAcceptance(gate) {
  assertExactKeys(gate, GATE_FIELDS, 'review gate')

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

  if (gate.verdict !== ACCEPTED_VERDICT) {
    fail('REVIEW_NOT_ACCEPTED', `verdict is ${String(gate.verdict)}; expected ${ACCEPTED_VERDICT}`)
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
      artifact.path.startsWith('/') ||
      /^[A-Za-z]:[\\/]/.test(artifact.path) ||
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

  return gate
}

/**
 * The canonical planning projection of a change, from its delta-spec paths.
 *
 * COMPOSITION only — enumerating the delta specs is an observation, and
 * observations belong to the caller: the gate reads a Git tree, the governance
 * model reads an archived member manifest. What must not differ between them is
 * which artifacts count as planning and in what order, so that lives here.
 *
 * A package with no delta spec is refused rather than projected to the five
 * fixed files: `governed-spec-driven-v2` requires at least one, and a
 * projection that quietly shrank would let an incomplete manifest match it.
 */
export function planningProjection(specPaths) {
  const specs = [...specPaths].sort(compareUtf8)

  if (specs.length === 0) {
    fail('NO_DELTA_SPECS', 'governed-spec-driven-v2 requires at least one specs/**/*.md file')
  }

  return [...PLANNING_PREFIX, ...specs, ...PLANNING_SUFFIX]
}

/** The delta-spec members of a path list, in canonical order. */
export const deltaSpecPaths = (paths) =>
  [...paths]
    .filter((relative) => relative.startsWith('specs/') && relative.endsWith('.md'))
    .sort(compareUtf8)
