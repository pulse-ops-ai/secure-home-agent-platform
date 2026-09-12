import {
  canonicalSerialize,
  canonicalizeValue,
  decodeUtf8,
  hasOwn,
  isCanonicalStateBytes,
  isCanonicalStateText,
  isObject,
  parseStrictJson,
} from './canonical.mjs'
import {
  completionDigest,
  contentDigest,
  genesisCompletionEnvelopeDigest,
  isSha256,
  primitiveDigest,
  relationshipDigest,
  replacementDigest,
  semanticIdentityDigest,
  sha256Text,
  transitionDigest,
  withdrawalDigest,
} from './digests.mjs'
import { validateArchivedOpenSpec } from './archived-openspec.mjs'
import { ABSENT, PRESENT } from '../git-tree/index.mjs'
import { canonicalPathSetProblems } from './paths.mjs'

const ADR_LIFECYCLES = new Set(['Proposed', 'Accepted', 'Superseded', 'Rejected'])
const DELIVERY_LIFECYCLES = new Set(['Planned', 'InProgress', 'Complete', 'Withdrawn'])
const COMPLETION_POLICIES = new Set(['reviewed-delivery-v1', 'reviewed-spike-evidence-v1'])
const LANDING_KINDS = new Set(['implementation-landing', 'spike-landing'])
const NODE_KINDS = new Set(['gate', 'implementation-landing', 'spike-landing'])
const SEVERITIES = new Set(['critical', 'high', 'medium'])
const PREDICATES = new Set(['exactly-one-current-accepted-resolver'])
const IDENTITY_CLASSES = new Set(['local-git-commit', 'external-git-commit', 'content-sha256'])
const ANCHOR_TYPES = new Set(['github-issue', 'github-pull-request', 'task-contract'])
const NODE_ID = /^runner\/(?:L(?:[2-9]|10)|GATE-U(?:4|6))(?:-[A-Za-z0-9][A-Za-z0-9.-]*)?$/u
const ADR_ID = /^ADR-\d{4}$/u
const QUESTION_ID = /^U(?:[1-9]|1[01])$/u
const SHA1_OR_SHA256 = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u
const ACTOR = /^[@A-Za-z0-9][@A-Za-z0-9._:/-]{0,99}$/u
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u
const DATE = /^\d{4}-\d{2}-\d{2}$/u
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u

const ADR_FIELDS = [
  'id',
  'path',
  'title',
  'lifecycle',
  'proposedOn',
  'resolves',
  'supersedes',
  'acceptance',
]
const QUESTION_FIELDS = ['id', 'anchor', 'title', 'severity']
const GATE_FIELDS = [
  'id',
  'kind',
  'predicate',
  'authorityAnchor',
  'sources',
  'reviewedOrderingIntent',
  'replaces',
  'replacement',
]
const LANDING_FIELDS = [
  'id',
  'kind',
  'requires',
  'authorityAnchor',
  'reviewedOrderingIntent',
  'replaces',
  'replacement',
  'delivery',
]
const ACCEPTANCE_FIELDS = [
  'transitionDigest',
  'contentDigest',
  'reviewedIdentity',
  'actor',
  'at',
  'outcome',
  'authority',
]
const ATTESTATION_FIELDS = ['digest', 'actor', 'at', 'outcome', 'authority']
/**
 * THE COMPLETION BRANCHES ARE THE MERGED CONTRACT'S, NOT AN EARLIER DRAFT'S.
 *
 * The implementation had grown its own evidence vocabulary — a `type`
 * discriminator, a `policyEvidenceIdentities` set, and a spike branch built
 * from `noOpenSpec`, `manifest`, `findings`, `mergedPullRequest` and
 * `mergedCommit`. None of those names survive in the accepted planning
 * contract, which discriminates on `policy` and names the spike members
 * `openSpecApplicability`, `mergedEvidencePullRequest`, `mergedEvidenceIdentity`,
 * `evidenceRoot`, `evidenceManifestIdentity` and `findingsIdentity`.
 *
 * The contract refuses aliases outright, so nothing here is kept for
 * compatibility: a stale name is an unknown field like any other.
 */
const DELIVERY_EVIDENCE_FIELDS = ['policy', 'deliveredIdentity', 'archivedOpenSpec']

/** Every spike member is required; the branch has no optional fields. */
const SPIKE_EVIDENCE_FIELDS = [
  'policy',
  'openSpecApplicability',
  'mergedEvidencePullRequest',
  'mergedEvidenceIdentity',
  'evidenceRoot',
  'evidenceManifestIdentity',
  'findingsIdentity',
]

const WITHDRAWAL_EVIDENCE_FIELDS = ['type', 'decisionIdentity', 'contentDigest', 'authorityAnchor']

/**
 * The only v1 value of the spike branch's OpenSpec applicability fact, and the
 * contract-fixed basename of the evidence manifest.
 */
const OPENSPEC_NOT_APPLICABLE = 'not-applicable'
const EVIDENCE_MANIFEST_FILE = 'MANIFEST.sha256'

const EVIDENCE_FIELDS = [
  ...new Set([
    ...DELIVERY_EVIDENCE_FIELDS,
    ...SPIKE_EVIDENCE_FIELDS,
    ...WITHDRAWAL_EVIDENCE_FIELDS,
  ]),
]

/**
 * Exactly the fields each policy branch owns.
 *
 * `EVIDENCE_FIELDS` remains only as the fallback for an unknown policy, which
 * is itself refused elsewhere; it is not a compatibility path.
 */
const POLICY_EVIDENCE_FIELDS = {
  'reviewed-delivery-v1': DELIVERY_EVIDENCE_FIELDS,
  'reviewed-spike-evidence-v1': SPIKE_EVIDENCE_FIELDS,
  withdrawal: WITHDRAWAL_EVIDENCE_FIELDS,
}

const DELIVERY_FIELDS = ['lifecycle', 'completionPolicy', 'completion', 'withdrawal']
const COMPLETION_FIELDS = ['from', 'to', 'digest', 'evidence', 'attestation']
const WITHDRAWAL_FIELDS = ['from', 'to', 'digest', 'evidence', 'attestation']
const REPLACEMENT_FIELDS = ['digest', 'attestation']
const IDENTITY_FIELDS = ['class', 'value', 'scope']
const EXTERNAL_REFERENCE_FIELDS = ['id', 'reference', 'role']
const GENESIS_COMPLETION_FIELDS = [
  'envelopeDigest',
  'members',
  'actor',
  'at',
  'outcome',
  'authority',
]

const ownKeys = (value) => Object.keys(value)
const compareText = (left, right) => (left === right ? 0 : left < right ? -1 : 1)

function addProblem(problems, code, path, message) {
  problems.push({ code, path, message })
}

function requireObject(value, path, problems, code = 'ADV-G02') {
  if (!isObject(value)) {
    addProblem(problems, code, path, 'must be an object')
    return false
  }
  return true
}

function requireArray(value, path, problems, code = 'ADV-G02') {
  if (!Array.isArray(value)) {
    addProblem(problems, code, path, 'must be an array')
    return false
  }
  return true
}

function checkFields(value, allowed, path, problems) {
  if (!isObject(value)) return false
  const allowedSet = new Set(allowed)
  for (const key of ownKeys(value)) {
    if (!allowedSet.has(key)) {
      addProblem(problems, 'ADV-G02', path + '.' + key, 'unknown field')
      if (Array.isArray(value[key])) {
        addProblem(
          problems,
          'ADV-G39',
          path + '.' + key,
          'collection is not classified by the v1 schema',
        )
      }
    }
  }
  return true
}

function requiredFields(value, required, path, problems, code = 'ADV-G02') {
  for (const key of required) {
    if (!hasOwn(value, key))
      addProblem(problems, code, path + '.' + key, 'required field is missing')
  }
}

function nonEmptyString(value, path, problems, code = 'ADV-G02') {
  if (typeof value !== 'string' || value.length === 0) {
    addProblem(problems, code, path, 'must be a non-empty string')
    return false
  }
  return true
}

/**
 * A RegExp coerces its argument, so `DATE.test(["2026-08-30"])` is TRUE.
 *
 * That made a wrong JSON type look like a well-formed value, and the next line
 * — `value.split('-')` — threw a TypeError out of the checker instead of
 * recording a refusal. A crash is not a verdict: it exits nonzero with no
 * problem list, which is indistinguishable from a tooling failure. Type first,
 * then pattern.
 */
function requireText(value, path, problems, code = 'ADV-G02') {
  if (typeof value !== 'string') {
    addProblem(problems, code, path, 'must be a string')
    return false
  }
  return true
}

function validDate(value, path, problems) {
  if (!requireText(value, path, problems)) return false
  if (!DATE.test(value)) {
    addProblem(problems, 'ADV-G02', path, 'must be an ISO calendar date')
    return false
  }
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(value + 'T00:00:00Z')
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    addProblem(problems, 'ADV-G02', path, 'must be an ISO calendar date')
    return false
  }
  return true
}

function validTimestamp(value, path, problems) {
  if (!requireText(value, path, problems)) return false
  if (!RFC3339.test(value)) {
    addProblem(problems, 'ADV-G02', path, 'must be an RFC 3339 UTC timestamp')
    return false
  }
  const datePart = value.slice(0, 10)
  const [year, month, day] = datePart.split('-').map(Number)
  const parsed = new Date(value)
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    addProblem(problems, 'ADV-G02', path, 'must be an RFC 3339 UTC timestamp')
    return false
  }
  return true
}

function validRepoPath(value, path, problems) {
  if (!nonEmptyString(value, path, problems, 'ADV-G12')) return false
  if (
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('\u0000') ||
    value.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    addProblem(
      problems,
      'ADV-G12',
      path,
      'must be a repository-relative POSIX path without traversal',
    )
    return false
  }
  return true
}

function validDocumentAnchor(value, path, problems) {
  if (!nonEmptyString(value, path, problems, 'ADV-G12')) return false
  const separator = value.indexOf('#')
  if (
    separator <= 0 ||
    separator === value.length - 1 ||
    value.indexOf('#', separator + 1) !== -1
  ) {
    addProblem(problems, 'ADV-G12', path, 'must be path#anchor')
    return false
  }
  const validPath = validRepoPath(value.slice(0, separator), path, problems)
  if (!/^[a-z0-9][a-z0-9._:-]*$/u.test(value.slice(separator + 1))) {
    addProblem(problems, 'ADV-G12', path, 'anchor fragment has invalid form')
    return false
  }
  return validPath
}

function headerPreamble(text) {
  const separator = text.search(/^\s*---\s*$/mu)
  return separator === -1 ? text : text.slice(0, separator)
}

/**
 * A relationship LABEL present in a shape this parser does not support.
 *
 * The parser reads the structural form the repository authors. A plain
 * `Closes: U4` line is not that form, so it parsed to nothing — and "nothing"
 * is exactly what an empty registry relation looks like, so a header claiming
 * a relationship the registry omits compared equal and passed. An unsupported
 * claim must be a refusal, never silence.
 */
function unparseableRelationshipClaims(text, labels) {
  const supported = new RegExp('^- \\*\\*(' + labels.join('|') + '):\\*\\*\\s', 'u')
  const anyClaim = new RegExp('^\\s*[-*]?\\s*\\**(' + labels.join('|') + ')\\**\\s*:', 'iu')
  const found = []
  for (const line of headerPreamble(text).split('\n')) {
    if (!anyClaim.test(line)) continue
    if (supported.test(line)) continue
    found.push(line.trim())
  }
  return found
}

function parseHeaderRelationship(text, labels, expression, path, problems) {
  for (const claim of unparseableRelationshipClaims(text, labels)) {
    addProblem(
      problems,
      'ADV-G14',
      path,
      `the header carries a relationship claim this parser cannot read structurally, so it ` +
        `cannot be compared with the registry: ${claim}`,
    )
  }
  const pattern = new RegExp('^- \\*\\*(' + labels.join('|') + '):\\*\\*\\s*(.*)$', 'gmu')
  const values = new Set()
  for (const match of headerPreamble(text).matchAll(pattern)) {
    const remainder = match[2].trim()
    if (/^(?:none|nothing\b|no unresolved decision\b)/iu.test(remainder)) continue
    for (const reference of remainder.matchAll(/\[([^\]]+)\]/gu)) {
      const value = reference[1]
      if (!expression.test(value)) {
        addProblem(
          problems,
          'ADV-G14',
          path,
          'relationship header contains an invalid identifier: ' + value,
        )
        continue
      }
      values.add(value)
    }
  }
  return [...values].sort(compareText)
}

function compareSets(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function validId(value, expression, path, problems, code = 'ADV-G02') {
  if (typeof value !== 'string' || !expression.test(value)) {
    addProblem(problems, code, path, 'has an invalid identifier')
    return false
  }
  return true
}

function duplicateMembers(values, path, problems, code = 'ADV-G38') {
  if (!Array.isArray(values)) return
  const seen = new Set()
  for (const [index, value] of values.entries()) {
    const key = typeof value === 'string' ? value : JSON.stringify(canonicalizeValue(value))
    if (seen.has(key))
      addProblem(problems, code, path + '[' + index + ']', 'duplicate collection member')
    seen.add(key)
  }
}

function validateSet(values, path, problems, valueValidator) {
  if (!requireArray(values, path, problems)) return
  duplicateMembers(values, path, problems)
  for (const [index, value] of values.entries())
    valueValidator(value, path + '[' + index + ']', problems)
}

function validateSequence(values, path, problems) {
  if (!requireArray(values, path, problems)) return
  duplicateMembers(values, path, problems)
  for (const [index, value] of values.entries())
    nonEmptyString(value, path + '[' + index + ']', problems)
}

function validateTypedAnchor(value, path, problems) {
  if (!requireObject(value, path, problems, 'ADV-G12')) return false
  if (!hasOwn(value, 'type') || typeof value.type !== 'string' || !ANCHOR_TYPES.has(value.type)) {
    addProblem(problems, 'ADV-G12', path + '.type', 'unknown or missing typed-reference kind')
    return false
  }

  if (value.type === 'github-issue' || value.type === 'github-pull-request') {
    checkFields(value, ['type', 'repository', 'number'], path, problems)
    requiredFields(value, ['repository', 'number'], path, problems, 'ADV-G12')
    if (
      hasOwn(value, 'repository') &&
      (!nonEmptyString(value.repository, path + '.repository', problems) ||
        !REPOSITORY.test(value.repository))
    ) {
      addProblem(problems, 'ADV-G12', path + '.repository', 'must be owner/repository')
    }
    if (!Number.isInteger(value.number) || value.number < 1) {
      addProblem(problems, 'ADV-G12', path + '.number', 'must be a positive integer')
    }
  } else {
    checkFields(value, ['type', 'repository', 'id'], path, problems)
    requiredFields(value, ['repository', 'id'], path, problems, 'ADV-G12')
    if (!nonEmptyString(value.id, path + '.id', problems)) return false
    if (
      hasOwn(value, 'repository') &&
      (!nonEmptyString(value.repository, path + '.repository', problems) ||
        !REPOSITORY.test(value.repository))
    ) {
      addProblem(problems, 'ADV-G12', path + '.repository', 'must be owner/repository')
    }
  }
  return true
}

function validateIdentity(value, path, problems, options = {}) {
  if (!requireObject(value, path, problems)) return false
  checkFields(value, IDENTITY_FIELDS, path, problems)
  requiredFields(value, ['class', 'value'], path, problems)
  if (typeof value.class !== 'string' || !IDENTITY_CLASSES.has(value.class)) {
    addProblem(problems, 'ADV-G02', path + '.class', 'unknown identity class')
    return false
  }
  if (typeof value.value !== 'string') {
    addProblem(problems, 'ADV-G02', path + '.value', 'must be a string')
    return false
  }
  if (value.class === 'content-sha256' && !isSha256(value.value)) {
    addProblem(problems, 'ADV-G02', path + '.value', 'content identity must be lowercase SHA-256')
  }
  if (
    (value.class === 'local-git-commit' || value.class === 'external-git-commit') &&
    !SHA1_OR_SHA256.test(value.value)
  ) {
    addProblem(
      problems,
      'ADV-G02',
      path + '.value',
      'Git identity must be a hexadecimal SHA-1 or SHA-256',
    )
  }
  if (hasOwn(value, 'scope')) {
    // One owner for canonical path sets, shared with the archived-OpenSpec
    // identity so a scope cannot mean different things in different records.
    const scopeProblems = canonicalPathSetProblems(value.scope)
    if (scopeProblems.length > 0) {
      addProblem(problems, 'ADV-G12', path + '.scope', scopeProblems.join('; '))
    }
  } else if (options.requireScope) {
    addProblem(problems, 'ADV-G26', path + '.scope', 'delivery identity must bind a declared scope')
  }
  if (options.requireScope && Array.isArray(value.scope) && value.scope.length === 0) {
    addProblem(problems, 'ADV-G26', path + '.scope', 'delivery identity scope cannot be empty')
  }
  if (options.requireOfflineProof) {
    if (value.class === 'external-git-commit') {
      addProblem(
        problems,
        'ADV-G33',
        path,
        'external Git identity is opaque; completion requires locally verifiable evidence',
      )
    }
    if (
      value.class === 'content-sha256' &&
      (!Array.isArray(value.scope) || value.scope.length !== 1)
    ) {
      addProblem(
        problems,
        'ADV-G26',
        path + '.scope',
        'content completion identity must bind exactly one artifact path',
      )
    }
  }
  return true
}

function validateActorEvidence(value, path, problems, expectedOutcome) {
  if (!requireObject(value, path, problems)) return false
  checkFields(value, ATTESTATION_FIELDS, path, problems)
  requiredFields(value, ATTESTATION_FIELDS, path, problems)
  if (typeof value.digest !== 'string' || !isSha256(value.digest)) {
    addProblem(problems, 'ADV-G19', path + '.digest', 'must be a lowercase SHA-256')
  }
  if (typeof value.actor !== 'string' || !ACTOR.test(value.actor)) {
    addProblem(problems, 'ADV-G02', path + '.actor', 'must be a bounded actor identifier')
  }
  // A MALFORMED TIMESTAMP IS ONE FAILURE, NOT PERMISSION TO SKIP THE REST.
  //
  // This guard used to read `typeof value.at !== 'string' ||
  // !validTimestamp(...)` and then return. Both halves were wrong. The type
  // test short-circuited, so `validTimestamp` was never reached for a
  // non-string and NO problem was recorded at all; and the return abandoned
  // `outcome` and `authority`, which a clock value says nothing about. An
  // attestation carrying `at: 12345` and a forged outcome therefore validated
  // clean. `validTimestamp` is type-safe on its own, so it is called
  // unconditionally and contributes its own ADV-G02 alongside the rest.
  validTimestamp(value.at, path + '.at', problems)
  if (value.outcome !== expectedOutcome) {
    addProblem(problems, 'ADV-G19', path + '.outcome', 'does not match the protocol outcome')
  }
  validateTypedAnchor(value.authority, path + '.authority', problems)
  return true
}

function verifyContent(relativePath, expected, path, problems, context) {
  if (!context?.readBytes) {
    addProblem(
      problems,
      'ADV-G04',
      path,
      'content cannot be verified without a local artifact reader',
    )
    return false
  }
  let bytes
  try {
    bytes = context.readBytes(relativePath)
  } catch (error) {
    addProblem(problems, 'ADV-G04', path, 'referenced artifact is unreadable: ' + error.message)
    return false
  }
  if (bytes === undefined) {
    addProblem(problems, 'ADV-G04', path, 'referenced artifact is missing')
    return false
  }
  if (contentDigest(bytes) !== expected) {
    addProblem(problems, 'ADV-G04', path, 'content digest does not match exact artifact bytes')
    return false
  }
  return true
}

function verifyHeader(adr, path, problems, context) {
  if (!context?.readBytes) {
    addProblem(
      problems,
      'ADV-G14',
      path,
      'decision header cannot be verified without a local artifact reader',
    )
    return false
  }
  let bytes
  try {
    bytes = context.readBytes(adr.path)
  } catch (error) {
    addProblem(problems, 'ADV-G14', path, 'decision document is unreadable: ' + error.message)
    return false
  }
  if (bytes === undefined) {
    addProblem(problems, 'ADV-G14', path, 'decision document is missing')
    return false
  }
  let text
  try {
    text = decodeUtf8(bytes)
  } catch (error) {
    addProblem(problems, 'ADV-G14', path, 'decision document is not valid UTF-8: ' + error.message)
    return false
  }
  const match = /^- \*\*Status:\*\* ([A-Za-z]+)$/mu.exec(headerPreamble(text))
  const expected = adr.lifecycle === 'Superseded' ? 'Accepted' : adr.lifecycle
  if (!match || match[1] !== expected) {
    addProblem(
      problems,
      'ADV-G14',
      path + '.Status',
      'document header does not mirror the allowed lifecycle',
    )
    return false
  }

  const headerResolves = parseHeaderRelationship(
    text,
    ['Closes', 'Decides'],
    /^U(?:[1-9]|1[01])$/u,
    path + '.relationships',
    problems,
  )
  const headerSupersedes = parseHeaderRelationship(
    text,
    ['Supersedes'],
    /^ADR-\d{4}$/u,
    path + '.relationships',
    problems,
  )
  const expectedResolves = [...(Array.isArray(adr.resolves) ? adr.resolves : [])].sort(compareText)
  const expectedSupersedes = [...(Array.isArray(adr.supersedes) ? adr.supersedes : [])].sort(
    compareText,
  )
  if (!compareSets(headerResolves, expectedResolves)) {
    addProblem(
      problems,
      'ADV-G14',
      path + '.resolves',
      'decision relationship header does not mirror registry resolves',
    )
  }
  if (!compareSets(headerSupersedes, expectedSupersedes)) {
    addProblem(
      problems,
      'ADV-G14',
      path + '.supersedes',
      'decision relationship header does not mirror registry supersedes',
    )
  }
  return true
}

function verifyIdentity(value, path, problems, context, { requireScopedProof = false } = {}) {
  if (!value || typeof value !== 'object') return
  if (value.class === 'local-git-commit') {
    if (!context?.hasLocalGitObject || !context.hasLocalGitObject(value.value)) {
      addProblem(
        problems,
        'ADV-G33',
        path,
        'local Git object is absent; completion requires external verification',
      )
      return
    }
    // OBJECT EXISTENCE IS NOT SCOPED PROOF.
    //
    // A commit that exists proves only that some commit exists. Where the
    // policy binds a scope, the scope has to actually resolve IN that commit —
    // otherwise any unrelated commit paired with any path satisfied the
    // evidence, which is exactly the shape an author would reach for.
    if (requireScopedProof && Array.isArray(value.scope) && context?.observe) {
      for (const member of value.scope) {
        const seen = context.observe.pathExistsAt(value.value, member)
        if (seen === 'PRESENT') continue
        addProblem(
          problems,
          'ADV-G33',
          path + '.scope',
          seen === 'OBSERVATION_ERROR'
            ? `the scope "${member}" could not be observed at the bound commit; an unanswered ` +
                'repository question is a refusal'
            : `the scope "${member}" does not exist at the bound commit, so the identity proves ` +
                'nothing about the delivered bytes',
        )
      }
    }
  }
  if (
    value.class === 'content-sha256' &&
    Array.isArray(value.scope) &&
    value.scope.length === 1 &&
    context?.readBytes
  ) {
    verifyContent(value.scope[0], value.value, path, problems, context)
  }
}

/**
 * `reviewed-delivery-v1`: a delivered identity and the whole archived change.
 *
 * The delivered identity keeps the accepted commit-or-artifact alternative;
 * `archivedOpenSpec` binds the complete package, both stage roots, every member
 * digest, the bundle identity, and the two provenance identities — a
 * `{path, contentDigest}` pair proved only that one file existed.
 */
function validateDeliveryEvidence(value, path, problems, context) {
  if (
    !validateIdentity(value.deliveredIdentity, path + '.deliveredIdentity', problems, {
      requireScope: true,
      requireOfflineProof: true,
    })
  )
    return false
  verifyIdentity(value.deliveredIdentity, path + '.deliveredIdentity', problems, context, {
    requireScopedProof: true,
  })
  validateArchivedOpenSpec(value.archivedOpenSpec, path + '.archivedOpenSpec', problems, context)
  return true
}

/**
 * `reviewed-spike-evidence-v1`: an explicit no-OpenSpec fact plus locally
 * verifiable evidence.
 *
 * Every member is required — the branch has no optional fields — and each is
 * checked independently of the others, so one malformed member cannot conceal a
 * second.
 */
function validateSpikeEvidence(value, path, problems, context) {
  requiredFields(value, SPIKE_EVIDENCE_FIELDS, path, problems, 'ADV-G27')

  // An explicit STRING fact, not a boolean and not an omission. The retired
  // `noOpenSpec: true` spelling is an unknown field here, and `true` under the
  // new name is refused on its own terms rather than coerced.
  if (value.openSpecApplicability !== OPENSPEC_NOT_APPLICABLE) {
    addProblem(
      problems,
      'ADV-G27',
      path + '.openSpecApplicability',
      `must be exactly the string "${OPENSPEC_NOT_APPLICABLE}"; an omitted, null, boolean, ` +
        'aliased, or differing value does not state the required no-OpenSpec fact',
    )
  }
  // A manufactured archive is its own named adversary, so it keeps its own code
  // in addition to the unknown-field refusal the closed branch already gives.
  if (hasOwn(value, 'archivedOpenSpec') && value.archivedOpenSpec !== null) {
    addProblem(
      problems,
      'ADV-G28',
      path + '.archivedOpenSpec',
      'spike evidence cannot manufacture or carry an OpenSpec archive',
    )
  }

  const rootIsPath = validRepoPath(value.evidenceRoot, path + '.evidenceRoot', problems)
  const evidenceRoot = rootIsPath ? value.evidenceRoot : undefined

  if (
    validateTypedAnchor(
      value.mergedEvidencePullRequest,
      path + '.mergedEvidencePullRequest',
      problems,
    ) &&
    value.mergedEvidencePullRequest.type !== 'github-pull-request'
  ) {
    addProblem(
      problems,
      'ADV-G27',
      path + '.mergedEvidencePullRequest.type',
      'the supporting merged-evidence reference must be a github-pull-request',
    )
  }

  validateMergedEvidenceIdentity(value, path, problems, context, evidenceRoot)
  requireEvidenceContentIdentity(
    value.evidenceManifestIdentity,
    path + '.evidenceManifestIdentity',
    problems,
    context,
    evidenceRoot,
    evidenceRoot === undefined ? undefined : evidenceRoot + '/' + EVIDENCE_MANIFEST_FILE,
  )
  requireEvidenceContentIdentity(
    value.findingsIdentity,
    path + '.findingsIdentity',
    problems,
    context,
    evidenceRoot,
    undefined,
  )
  return true
}

/**
 * The merged evidence commit must be LOCAL and must cover the WHOLE root.
 *
 * `mergedEvidencePullRequest` is supporting external provenance and proves
 * nothing offline, so the local commit carries the whole burden. A scope naming
 * one convenient file inside the evidence root proves that file and nothing
 * else — which is exactly what "an arbitrary issue plus a merged PR" becomes
 * once someone gives it a path. The declared scope is therefore compared
 * against the complete enumeration of the evidence root at the bound commit, in
 * both directions: nothing outside the root, and nothing in the root left out.
 */
function validateMergedEvidenceIdentity(value, path, problems, context, evidenceRoot) {
  const identityPath = path + '.mergedEvidenceIdentity'
  const identity = value.mergedEvidenceIdentity
  if (!validateIdentity(identity, identityPath, problems, { requireScope: true })) return
  if (identity.class !== 'local-git-commit') {
    addProblem(
      problems,
      'ADV-G33',
      identityPath,
      'the merged evidence identity must be a local-git-commit; an opaque external commit or a ' +
        'content digest cannot prove the evidence root offline',
    )
    return
  }
  verifyIdentity(identity, identityPath, problems, context, { requireScopedProof: true })
  if (evidenceRoot === undefined) return

  const scopePath = identityPath + '.scope'
  const declared = Array.isArray(identity.scope) ? identity.scope : []
  const prefix = evidenceRoot + '/'
  for (const member of declared) {
    if (typeof member === 'string' && member.startsWith(prefix)) continue
    addProblem(
      problems,
      'ADV-G27',
      scopePath,
      `the scope entry ${JSON.stringify(member)} lies outside the declared evidence root ` +
        `"${evidenceRoot}"`,
    )
  }

  if (!context?.observe) {
    addProblem(
      problems,
      'ADV-G27',
      scopePath,
      'evidence-root coverage cannot be proved without a repository observer',
    )
    return
  }
  const tree = context.observe.treeAt(identity.value, evidenceRoot)
  if (tree.status !== PRESENT) {
    addProblem(
      problems,
      'ADV-G27',
      scopePath,
      tree.status === ABSENT
        ? `the evidence root "${evidenceRoot}" does not exist at the merged evidence commit`
        : `the evidence root "${evidenceRoot}" could not be observed at the merged evidence ` +
            'commit; an unanswered repository question is a refusal',
    )
    return
  }
  if (tree.entries.size === 0) {
    addProblem(
      problems,
      'ADV-G27',
      scopePath,
      `the evidence root "${evidenceRoot}" holds no files at the merged evidence commit, so the ` +
        'scope proves nothing',
    )
    return
  }
  const covered = new Set(declared)
  for (const relative of tree.entries.keys()) {
    if (covered.has(prefix + relative)) continue
    addProblem(
      problems,
      'ADV-G27',
      scopePath,
      `the evidence file "${prefix + relative}" is present at the merged evidence commit but is ` +
        'not covered by the declared scope',
    )
  }
}

/**
 * A manifest or findings identity is a locally verified content identity at its
 * declared exact path.
 *
 * `exactPath` is supplied where the contract fixes the name — the evidence
 * manifest is `MANIFEST.sha256` under the evidence root — and omitted where it
 * names only a location, as for the findings document.
 */
function requireEvidenceContentIdentity(
  identity,
  path,
  problems,
  context,
  evidenceRoot,
  exactPath,
) {
  if (!validateIdentity(identity, path, problems, { requireScope: true })) return
  if (identity.class !== 'content-sha256') {
    addProblem(
      problems,
      'ADV-G27',
      path,
      'must be a content-sha256 identity verified against the exact evidence bytes',
    )
    return
  }
  if (!Array.isArray(identity.scope) || identity.scope.length !== 1) {
    addProblem(problems, 'ADV-G27', path + '.scope', 'must bind exactly one evidence path')
    return
  }
  const declared = identity.scope[0]
  if (exactPath !== undefined && declared !== exactPath) {
    addProblem(problems, 'ADV-G27', path + '.scope', `must be exactly "${exactPath}"`)
    return
  }
  if (evidenceRoot !== undefined && !declared.startsWith(evidenceRoot + '/')) {
    addProblem(
      problems,
      'ADV-G27',
      path + '.scope',
      `the path "${declared}" lies outside the declared evidence root "${evidenceRoot}"`,
    )
    return
  }
  verifyContent(declared, identity.value, path, problems, context)
}

function validateEvidence(value, path, problems, context, policy) {
  const evidenceCode =
    policy === 'withdrawal'
      ? 'ADV-G67'
      : policy === 'reviewed-spike-evidence-v1'
        ? 'ADV-G27'
        : 'ADV-G26'
  if (!requireObject(value, path, problems, evidenceCode)) return false
  // CLOSED PER POLICY, not one broad union.
  //
  // A single union of every branch's fields let a reviewed delivery carry spike
  // fields and vice versa, and accepted a legacy `reviewed-delivery` alias for
  // the discriminator. Each policy now enumerates exactly its own fields, so a
  // field belonging to another branch is an unknown field rather than an
  // ignored one.
  checkFields(value, POLICY_EVIDENCE_FIELDS[policy] ?? EVIDENCE_FIELDS, path, problems)

  if (policy === 'reviewed-delivery-v1' || policy === 'reviewed-spike-evidence-v1') {
    // THE DISCRIMINATOR IS A MIRROR, NOT A SECOND AUTHORITY.
    //
    // `evidence.policy` must equal the policy the LANDING selected. Reading the
    // branch off the evidence itself would let a completion choose the rules it
    // is judged by; reading it off the landing and then requiring the mirror to
    // agree means a disagreement is itself the refusal.
    if (value.policy !== policy) {
      addProblem(
        problems,
        'ADV-G30',
        path + '.policy',
        `must be exactly ${policy}, mirroring the landing's selected completion policy; a ` +
          'missing, aliased, or differing discriminator is refused',
      )
      return false
    }
    return policy === 'reviewed-delivery-v1'
      ? validateDeliveryEvidence(value, path, problems, context)
      : validateSpikeEvidence(value, path, problems, context)
  }

  if (policy === 'withdrawal') {
    if (value.type !== 'withdrawal')
      addProblem(problems, 'ADV-G67', path + '.type', 'withdrawal evidence type is required')
    if (hasOwn(value, 'contentDigest') && !isSha256(value.contentDigest)) {
      addProblem(problems, 'ADV-G67', path + '.contentDigest', 'must be a lowercase SHA-256')
    }
    if (!value.decisionIdentity && !value.contentDigest) {
      addProblem(
        problems,
        'ADV-G67',
        path,
        'withdrawal evidence needs a decision identity or content digest',
      )
    }
    if (value.decisionIdentity)
      validateIdentity(value.decisionIdentity, path + '.decisionIdentity', problems)
    if (value.authorityAnchor)
      validateTypedAnchor(value.authorityAnchor, path + '.authorityAnchor', problems)
    return true
  }

  addProblem(problems, 'ADV-G30', path + '.policy', 'unknown evidence policy')
  return false
}

function validateAcceptance(adr, path, problems, context) {
  const acceptance = adr.acceptance
  if (adr.lifecycle === 'Proposed') {
    if (acceptance !== null)
      addProblem(problems, 'ADV-G25', path, 'Proposed decisions cannot carry acceptance evidence')
    return
  }
  if (!requireObject(acceptance, path, problems, 'ADV-G25')) return
  checkFields(acceptance, ACCEPTANCE_FIELDS, path, problems)
  requiredFields(acceptance, ACCEPTANCE_FIELDS, path, problems)
  if (!isSha256(acceptance.contentDigest))
    addProblem(problems, 'ADV-G25', path + '.contentDigest', 'final decision bytes need a SHA-256')
  const expectedOutcome = adr.lifecycle === 'Rejected' ? 'rejected' : 'accepted'
  if (acceptance.outcome !== expectedOutcome) {
    addProblem(problems, 'ADV-G25', path + '.outcome', 'does not match the ADR lifecycle')
  }
  validateIdentity(acceptance.reviewedIdentity, path + '.reviewedIdentity', problems)
  if (typeof acceptance.transitionDigest !== 'string' || !isSha256(acceptance.transitionDigest)) {
    addProblem(problems, 'ADV-G19', path + '.transitionDigest', 'must be a lowercase SHA-256')
  }
  if (typeof acceptance.actor !== 'string' || !ACTOR.test(acceptance.actor)) {
    addProblem(problems, 'ADV-G02', path + '.actor', 'must be a bounded actor identifier')
  }
  // Independent of the timestamp: the authority anchor and the exact accepted
  // bytes. A malformed `at` is recorded and validation continues, so a wrong
  // `contentDigest` cannot hide behind it.
  validTimestamp(acceptance.at, path + '.at', problems)
  validateTypedAnchor(acceptance.authority, path + '.authority', problems)
  if (isSha256(acceptance.contentDigest))
    verifyContent(adr.path, acceptance.contentDigest, path + '.contentDigest', problems, context)
  // A current snapshot cannot reconstruct the historical target primitive
  // digest after later records are added or changed. Pairwise history
  // validation owns transition-preimage comparison; this current checker
  // validates the recorded digest's shape and the exact decision bytes.
}

function validateAdr(value, path, problems, context) {
  if (!requireObject(value, path, problems)) return
  checkFields(value, ADR_FIELDS, path, problems)
  requiredFields(value, ADR_FIELDS, path, problems)
  validId(value.id, ADR_ID, path + '.id', problems)
  validRepoPath(value.path, path + '.path', problems)
  nonEmptyString(value.title, path + '.title', problems)
  if (!ADR_LIFECYCLES.has(value.lifecycle))
    addProblem(problems, 'ADV-G14', path + '.lifecycle', 'unknown ADR lifecycle')
  validDate(value.proposedOn, path + '.proposedOn', problems)
  verifyHeader(value, path, problems, context)
  validateSet(value.resolves, path + '.resolves', problems, (member, memberPath, memberProblems) =>
    validId(member, QUESTION_ID, memberPath, memberProblems, 'ADV-G12'),
  )
  validateSet(
    value.supersedes,
    path + '.supersedes',
    problems,
    (member, memberPath, memberProblems) =>
      validId(member, ADR_ID, memberPath, memberProblems, 'ADV-G12'),
  )
  validateAcceptance(value, path + '.acceptance', problems, context)
}

function validateQuestion(value, path, problems) {
  if (!requireObject(value, path, problems)) return
  checkFields(value, QUESTION_FIELDS, path, problems)
  requiredFields(value, QUESTION_FIELDS, path, problems)
  validId(value.id, QUESTION_ID, path + '.id', problems)
  validDocumentAnchor(value.anchor, path + '.anchor', problems)
  nonEmptyString(value.title, path + '.title', problems)
  if (!SEVERITIES.has(value.severity))
    addProblem(problems, 'ADV-G02', path + '.severity', 'unknown severity')
}

function validateOrderingIntent(value, path, problems) {
  if (!hasOwn(value, 'reviewedOrderingIntent')) return
  if (value.reviewedOrderingIntent === null) return
  validateSequence(value.reviewedOrderingIntent, path + '.reviewedOrderingIntent', problems)
}

function validateNodeId(value, path, problems) {
  validId(value, NODE_ID, path, problems, 'ADV-G12')
}

function validateReplacementTarget(value, path, problems) {
  if (value === null) return
  if (typeof value !== 'string') {
    addProblem(problems, 'ADV-G66', path, 'must be null or a node identifier')
    return
  }
  validateNodeId(value, path, problems)
}

function validateReplacementEnvelope(value, path, problems) {
  if (!requireObject(value, path, problems, 'ADV-G66')) return
  checkFields(value, REPLACEMENT_FIELDS, path, problems)
  requiredFields(value, REPLACEMENT_FIELDS, path, problems)
  if (!isSha256(value.digest))
    addProblem(problems, 'ADV-G66', path + '.digest', 'replacement digest is required')
  validateActorEvidence(value.attestation, path + '.attestation', problems, 'replaced')
}

function validateGate(value, path, problems) {
  if (!requireObject(value, path, problems)) return
  checkFields(value, GATE_FIELDS, path, problems)
  requiredFields(
    value,
    ['id', 'kind', 'predicate', 'authorityAnchor', 'sources', 'replaces', 'replacement'],
    path,
    problems,
  )
  validateNodeId(value.id, path + '.id', problems)
  if (value.kind !== 'gate')
    addProblem(problems, 'ADV-G66', path + '.kind', 'gate record must have kind gate')
  if (!requireObject(value.predicate, path + '.predicate', problems, 'ADV-G11')) return
  checkFields(value.predicate, ['name', 'question'], path + '.predicate', problems)
  requiredFields(value.predicate, ['name', 'question'], path + '.predicate', problems)
  if (!PREDICATES.has(value.predicate.name))
    addProblem(
      problems,
      'ADV-G09',
      path + '.predicate.name',
      'predicate is not in the v1 vocabulary',
    )
  validId(value.predicate.question, QUESTION_ID, path + '.predicate.question', problems, 'ADV-G12')
  validateTypedAnchor(value.authorityAnchor, path + '.authorityAnchor', problems)
  validateSet(value.sources, path + '.sources', problems, (member, memberPath, memberProblems) =>
    validDocumentAnchor(member, memberPath, memberProblems),
  )
  validateOrderingIntent(value, path, problems)
  validateReplacementTarget(value.replaces, path + '.replaces', problems)
  if (value.replacement !== null)
    validateReplacementEnvelope(value.replacement, path + '.replacement', problems)
  if ((value.replaces === null) !== (value.replacement === null)) {
    addProblem(problems, 'ADV-G66', path, 'replaces and replacement must be paired')
  }
}

function expectedPolicy(kind) {
  if (kind === 'implementation-landing') return 'reviewed-delivery-v1'
  if (kind === 'spike-landing') return 'reviewed-spike-evidence-v1'
  return null
}

function validateDelivery(value, path, problems, context, landing) {
  if (!requireObject(value, path, problems)) return
  checkFields(value, DELIVERY_FIELDS, path, problems)
  requiredFields(value, DELIVERY_FIELDS, path, problems)
  if (!DELIVERY_LIFECYCLES.has(value.lifecycle))
    addProblem(problems, 'ADV-G18', path + '.lifecycle', 'unknown delivery lifecycle')
  const policy = expectedPolicy(landing.kind)
  if (!COMPLETION_POLICIES.has(value.completionPolicy))
    addProblem(
      problems,
      'ADV-G30',
      path + '.completionPolicy',
      'completion policy is outside the closed v1 vocabulary',
    )
  if (value.completionPolicy !== policy) {
    addProblem(
      problems,
      'ADV-G15',
      path + '.completionPolicy',
      'must be selected by landing kind and remain stable',
    )
  }

  if (value.lifecycle === 'Planned' || value.lifecycle === 'InProgress') {
    if (value.completion !== null || value.withdrawal !== null) {
      addProblem(problems, 'ADV-G18', path, 'non-terminal lifecycle cannot carry terminal evidence')
    }
    return
  }
  if (value.lifecycle === 'Complete') {
    // EXCLUSIVITY IS A REFUSAL, NOT A REASON TO STOP LOOKING.
    //
    // This used to `return` the moment a withdrawal envelope was present,
    // adding nothing — so `Complete` carrying both envelopes produced no
    // problem at all, and the landing went on to satisfy a prerequisite. An
    // early return that records nothing is indistinguishable from acceptance.
    if (value.withdrawal !== null) {
      addProblem(
        problems,
        'ADV-G67',
        path + '.withdrawal',
        'a Complete landing SHALL carry no withdrawal envelope; completion and withdrawal are ' +
          'mutually exclusive',
      )
      return
    }
    if (!requireObject(value.completion, path + '.completion', problems, 'ADV-G26')) return
    checkFields(value.completion, COMPLETION_FIELDS, path + '.completion', problems)
    requiredFields(value.completion, COMPLETION_FIELDS, path + '.completion', problems)
    if (value.completion.from !== 'Planned' && value.completion.from !== 'InProgress') {
      addProblem(
        problems,
        'ADV-G27',
        path + '.completion.from',
        'completion source lifecycle is invalid',
      )
    }
    if (value.completion.to !== 'Complete')
      addProblem(problems, 'ADV-G27', path + '.completion.to', 'completion target must be Complete')
    const evidenceProblems = problems.length
    validateEvidence(
      value.completion.evidence,
      path + '.completion.evidence',
      problems,
      context,
      policy,
    )
    if (problems.length === evidenceProblems) {
      const expectedDigest = completionDigest(landing, value.completion)
      if (value.completion.digest !== expectedDigest)
        addProblem(
          problems,
          'ADV-G19',
          path + '.completion.digest',
          'completion preimage does not match the recorded digest',
        )
      validateActorEvidence(
        value.completion.attestation,
        path + '.completion.attestation',
        problems,
        'completed',
      )
      if (value.completion.attestation?.digest !== expectedDigest) {
        addProblem(
          problems,
          'ADV-G19',
          path + '.completion.attestation.digest',
          'completion attestation is not bound to completion digest',
        )
      }
    }
    return
  }
  if (value.lifecycle === 'Withdrawn') {
    if (value.completion !== null) {
      addProblem(
        problems,
        'ADV-G67',
        path + '.completion',
        'a Withdrawn landing SHALL carry no completion envelope; completion and withdrawal are ' +
          'mutually exclusive',
      )
      return
    }
    if (!requireObject(value.withdrawal, path + '.withdrawal', problems, 'ADV-G67')) return
    checkFields(value.withdrawal, WITHDRAWAL_FIELDS, path + '.withdrawal', problems)
    requiredFields(value.withdrawal, WITHDRAWAL_FIELDS, path + '.withdrawal', problems)
    if (value.withdrawal.from !== 'Planned' && value.withdrawal.from !== 'InProgress') {
      addProblem(
        problems,
        'ADV-G75',
        path + '.withdrawal.from',
        'withdrawal source lifecycle is invalid',
      )
    }
    if (value.withdrawal.to !== 'Withdrawn')
      addProblem(
        problems,
        'ADV-G67',
        path + '.withdrawal.to',
        'withdrawal target must be Withdrawn',
      )
    const evidenceProblems = problems.length
    validateEvidence(
      value.withdrawal.evidence,
      path + '.withdrawal.evidence',
      problems,
      context,
      'withdrawal',
    )
    if (problems.length === evidenceProblems) {
      const expectedDigest = withdrawalDigest(landing, value.withdrawal)
      if (value.withdrawal.digest !== expectedDigest)
        addProblem(
          problems,
          'ADV-G67',
          path + '.withdrawal.digest',
          'withdrawal preimage does not match the recorded digest',
        )
      validateActorEvidence(
        value.withdrawal.attestation,
        path + '.withdrawal.attestation',
        problems,
        'withdrawn',
      )
      if (value.withdrawal.attestation?.digest !== expectedDigest) {
        addProblem(
          problems,
          'ADV-G67',
          path + '.withdrawal.attestation.digest',
          'withdrawal attestation is not bound to withdrawal digest',
        )
      }
    }
  }
}

function validateLanding(value, path, problems, context) {
  if (!requireObject(value, path, problems)) return
  checkFields(value, LANDING_FIELDS, path, problems)
  requiredFields(
    value,
    ['id', 'kind', 'requires', 'authorityAnchor', 'replaces', 'replacement', 'delivery'],
    path,
    problems,
  )
  validateNodeId(value.id, path + '.id', problems)
  if (!LANDING_KINDS.has(value.kind))
    addProblem(problems, 'ADV-G66', path + '.kind', 'unknown landing kind')
  validateSet(value.requires, path + '.requires', problems, (member, memberPath, memberProblems) =>
    validateNodeId(member, memberPath, memberProblems),
  )
  validateTypedAnchor(value.authorityAnchor, path + '.authorityAnchor', problems)
  validateOrderingIntent(value, path, problems)
  validateReplacementTarget(value.replaces, path + '.replaces', problems)
  if (value.replacement !== null)
    validateReplacementEnvelope(value.replacement, path + '.replacement', problems)
  if ((value.replaces === null) !== (value.replacement === null)) {
    addProblem(problems, 'ADV-G66', path, 'replaces and replacement must be paired')
  }
  validateDelivery(value.delivery, path + '.delivery', problems, context, value)
}

function validateExternalReference(value, path, problems) {
  if (!requireObject(value, path, problems)) return
  checkFields(value, EXTERNAL_REFERENCE_FIELDS, path, problems)
  requiredFields(value, EXTERNAL_REFERENCE_FIELDS, path, problems)
  nonEmptyString(value.id, path + '.id', problems)
  validateTypedAnchor(value.reference, path + '.reference', problems)
  nonEmptyString(value.role, path + '.role', problems)
}

function validateGenesisCompletion(value, path, problems) {
  if (value === undefined) return
  if (!requireObject(value, path, problems)) return
  checkFields(value, GENESIS_COMPLETION_FIELDS, path, problems)
  requiredFields(value, GENESIS_COMPLETION_FIELDS, path, problems)
  if (!isSha256(value.envelopeDigest))
    addProblem(problems, 'ADV-G19', path + '.envelopeDigest', 'must be a lowercase SHA-256')
  validateSet(value.members, path + '.members', problems, (member, memberPath, memberProblems) => {
    if (!requireObject(member, memberPath, memberProblems)) return
    checkFields(member, ['landingId', 'digest'], memberPath, memberProblems)
    requiredFields(member, ['landingId', 'digest'], memberPath, memberProblems)
    validateNodeId(member.landingId, memberPath + '.landingId', memberProblems)
    if (!isSha256(member.digest))
      addProblem(memberProblems, 'ADV-G19', memberPath + '.digest', 'must be a lowercase SHA-256')
  })
  const landingIds = new Set()
  const digests = new Set()
  for (const member of Array.isArray(value.members) ? value.members : []) {
    if (!isObject(member)) continue
    if (landingIds.has(member.landingId))
      addProblem(
        problems,
        'ADV-G65',
        path + '.members',
        'completion envelope contains a duplicate landing identifier',
      )
    landingIds.add(member.landingId)
    if (digests.has(member.digest))
      addProblem(
        problems,
        'ADV-G65',
        path + '.members',
        'one completion digest cannot identify two landings',
      )
    digests.add(member.digest)
  }
  if (typeof value.actor !== 'string' || !ACTOR.test(value.actor))
    addProblem(problems, 'ADV-G02', path + '.actor', 'must be a bounded actor identifier')
  // The envelope digest, the outcome and the authority anchor are all
  // independent of when the attestation was made.
  validTimestamp(value.at, path + '.at', problems)
  if (value.outcome !== 'attested')
    addProblem(problems, 'ADV-G19', path + '.outcome', 'must be attested')
  validateTypedAnchor(value.authority, path + '.authority', problems)
  if (
    isSha256(value.envelopeDigest) &&
    Array.isArray(value.members) &&
    value.members.every((member) => isObject(member))
  ) {
    const expected = genesisCompletionEnvelopeDigest(value.members)
    if (value.envelopeDigest !== expected)
      addProblem(
        problems,
        'ADV-G19',
        path + '.envelopeDigest',
        'completion-envelope preimage does not match the recorded digest',
      )
  }
}

/**
 * THE GENESIS ATTESTATION, AND WHY ITS SHAPE IS CLOSED HERE.
 *
 * `attestations.genesis` binds the seed and its relationship equivalence, and
 * it carries the four facts the history checker needs to admit the one genesis
 * exception: the source snapshot the candidate was derived from, the exact
 * activation base, the equivalent freshness result, and the activation
 * identity. The exception is admitted by BINDING, never by the absence of a
 * registry in the base — every commit before activation lacks one, so absence
 * alone would let any of them claim it.
 *
 * The schema lives in the model and not in the history entry point because the
 * current checker must refuse a malformed genesis attestation on its own, and
 * two readers of one closed shape would be two schemas.
 *
 * This is the shape only. Recording a real attestation is a human act reserved
 * for the activation change; nothing here produces one.
 */
const GENESIS_FIELDS = [
  'digest',
  'actor',
  'at',
  'outcome',
  'authority',
  'seedDigest',
  'relationshipEquivalenceDigest',
  'sourceSnapshotIdentity',
  'candidateFreezeIdentity',
  'activationBaseCommit',
  'activationIdentity',
  'activationFreshness',
]

const FRESHNESS_FIELDS = ['outcome', 'digest']
const CANDIDATE_BUNDLE_FIELDS = ['schemaVersion', 'type', 'members', 'bundleSha256']

export const CANDIDATE_BUNDLE_TYPE = 'governance-candidate-bundle'
export const FRESHNESS_EQUIVALENT = 'equivalent'

function validateCandidateFreezeIdentity(value, path, problems) {
  if (!requireObject(value, path, problems, 'ADV-G76')) return
  checkFields(value, CANDIDATE_BUNDLE_FIELDS, path, problems)
  requiredFields(value, CANDIDATE_BUNDLE_FIELDS, path, problems, 'ADV-G76')
  if (value.schemaVersion !== 1)
    addProblem(problems, 'ADV-G76', path + '.schemaVersion', 'candidate bundle is version 1')
  if (value.type !== CANDIDATE_BUNDLE_TYPE)
    addProblem(problems, 'ADV-G76', path + '.type', 'must be ' + CANDIDATE_BUNDLE_TYPE)
  if (!isSha256(value.bundleSha256))
    addProblem(problems, 'ADV-G76', path + '.bundleSha256', 'must be a lowercase SHA-256')
  // A commit name or label is not a content identity: the members carry the
  // exact bytes, so a candidate byte change must move a member digest.
  if (!requireArray(value.members, path + '.members', problems, 'ADV-G76')) return
  const paths = []
  for (const [index, member] of value.members.entries()) {
    const memberPath = path + '.members[' + index + ']'
    if (!requireObject(member, memberPath, problems, 'ADV-G76')) continue
    checkFields(member, ['path', 'contentSha256'], memberPath, problems)
    requiredFields(member, ['path', 'contentSha256'], memberPath, problems, 'ADV-G76')
    if (!validRepoPath(member.path, memberPath + '.path', problems)) continue
    if (!isSha256(member.contentSha256))
      addProblem(problems, 'ADV-G76', memberPath + '.contentSha256', 'must be a lowercase SHA-256')
    paths.push(member.path)
  }
  const pathProblems = canonicalPathSetProblems(paths)
  if (pathProblems.length > 0)
    addProblem(problems, 'ADV-G76', path + '.members', pathProblems.join('; '))
}

function validateGenesisAttestation(value, path, problems) {
  if (!requireObject(value, path, problems, 'ADV-G19')) return
  checkFields(value, GENESIS_FIELDS, path, problems)
  requiredFields(value, GENESIS_FIELDS, path, problems, 'ADV-G19')
  for (const field of ['digest', 'seedDigest', 'relationshipEquivalenceDigest']) {
    if (!isSha256(value[field]))
      addProblem(problems, 'ADV-G19', path + '.' + field, 'must be a lowercase SHA-256')
  }
  if (typeof value.actor !== 'string' || !ACTOR.test(value.actor))
    addProblem(problems, 'ADV-G02', path + '.actor', 'must be a bounded actor identifier')
  // Independent of the instant: see validateActorEvidence.
  validTimestamp(value.at, path + '.at', problems)
  if (value.outcome !== 'attested')
    addProblem(problems, 'ADV-G19', path + '.outcome', 'must be attested')
  validateTypedAnchor(value.authority, path + '.authority', problems)
  validateIdentity(value.sourceSnapshotIdentity, path + '.sourceSnapshotIdentity', problems, {
    requireScope: false,
  })
  validateCandidateFreezeIdentity(
    value.candidateFreezeIdentity,
    path + '.candidateFreezeIdentity',
    problems,
  )
  if (
    typeof value.activationBaseCommit !== 'string' ||
    !SHA1_OR_SHA256.test(value.activationBaseCommit)
  )
    addProblem(
      problems,
      'ADV-G19',
      path + '.activationBaseCommit',
      'must be a hexadecimal Git commit identity',
    )
  validateTypedAnchor(value.activationIdentity, path + '.activationIdentity', problems)
  if (
    requireObject(value.activationFreshness, path + '.activationFreshness', problems, 'ADV-G19')
  ) {
    checkFields(
      value.activationFreshness,
      FRESHNESS_FIELDS,
      path + '.activationFreshness',
      problems,
    )
    requiredFields(
      value.activationFreshness,
      FRESHNESS_FIELDS,
      path + '.activationFreshness',
      problems,
      'ADV-G19',
    )
    if (value.activationFreshness.outcome !== FRESHNESS_EQUIVALENT)
      addProblem(
        problems,
        'ADV-G19',
        path + '.activationFreshness.outcome',
        'a genesis attestation may bind only an equivalent freshness result',
      )
    if (!isSha256(value.activationFreshness.digest))
      addProblem(
        problems,
        'ADV-G19',
        path + '.activationFreshness.digest',
        'must be a lowercase SHA-256',
      )
  }
}

function validateAttestations(value, path, problems) {
  if (!requireObject(value, path, problems)) return
  checkFields(value, ['genesis', 'genesisCompletion'], path, problems)
  requiredFields(value, ['genesis'], path, problems)
  if (!isObject(value.genesis)) {
    addProblem(problems, 'ADV-G19', path + '.genesis', 'genesis attestation must be an object')
  } else if (Object.keys(value.genesis).length > 0) {
    // An EMPTY object is the pre-activation state: no genesis has occurred, and
    // that is not an error. A populated one is the real closed shape.
    validateGenesisAttestation(value.genesis, path + '.genesis', problems)
  }
  validateGenesisCompletion(value.genesisCompletion, path + '.genesisCompletion', problems)
}

function validateTopLevel(state, problems, context) {
  if (!requireObject(state, '$', problems)) return
  checkFields(
    state,
    [
      'schemaVersion',
      'adrs',
      'questions',
      'gates',
      'landings',
      'externalReferences',
      'attestations',
    ],
    '$',
    problems,
  )
  requiredFields(
    state,
    [
      'schemaVersion',
      'adrs',
      'questions',
      'gates',
      'landings',
      'externalReferences',
      'attestations',
    ],
    '$',
    problems,
  )
  if (state.schemaVersion !== 1)
    addProblem(problems, 'ADV-G02', '$.schemaVersion', 'only schema version 1 is supported')

  for (const [name, , validator] of [
    ['adrs', ADR_FIELDS, (value, path) => validateAdr(value, path, problems, context)],
    ['questions', QUESTION_FIELDS, (value, path) => validateQuestion(value, path, problems)],
    ['gates', GATE_FIELDS, (value, path) => validateGate(value, path, problems)],
    ['landings', LANDING_FIELDS, (value, path) => validateLanding(value, path, problems, context)],
    [
      'externalReferences',
      EXTERNAL_REFERENCE_FIELDS,
      (value, path) => validateExternalReference(value, path, problems),
    ],
  ]) {
    if (!requireArray(state[name], '$.' + name, problems)) continue
    const ids = new Set()
    for (const [index, value] of state[name].entries()) {
      const path = '$.' + name + '[' + index + ']'
      validator(value, path)
      const id = value?.id
      if (typeof id === 'string') {
        if (ids.has(id))
          addProblem(problems, 'ADV-G38', path + '.id', 'duplicate entity identifier')
        ids.add(id)
      }
    }
  }
  const nodeIds = new Set()
  const gates = Array.isArray(state.gates) ? state.gates : []
  const landings = Array.isArray(state.landings) ? state.landings : []
  for (const node of [...gates, ...landings]) {
    if (typeof node?.id !== 'string') continue
    if (nodeIds.has(node.id))
      addProblem(problems, 'ADV-G38', '$.nodes', 'gate and landing identifiers must be unique')
    nodeIds.add(node.id)
  }
  validateAttestations(state.attestations, '$.attestations', problems)
}

function validateAdrRelationships(state, problems) {
  const adrRecords = Array.isArray(state.adrs) ? state.adrs : []
  const questionRecords = Array.isArray(state.questions) ? state.questions : []
  const adrs = new Map(
    adrRecords.filter((adr) => typeof adr?.id === 'string').map((adr) => [adr.id, adr]),
  )
  const questions = new Set(
    questionRecords
      .filter((question) => typeof question?.id === 'string')
      .map((question) => question.id),
  )
  for (const adr of adrRecords) {
    if (!isObject(adr)) continue
    for (const question of Array.isArray(adr.resolves) ? adr.resolves : []) {
      if (!questions.has(question)) {
        addProblem(
          problems,
          'ADV-G12',
          '$.adrs.' + adr.id + '.resolves',
          'references a missing question',
        )
      }
    }
    for (const superseded of Array.isArray(adr.supersedes) ? adr.supersedes : []) {
      if (!adrs.has(superseded) || superseded === adr.id) {
        addProblem(
          problems,
          'ADV-G12',
          '$.adrs.' + adr.id + '.supersedes',
          'references an invalid ADR',
        )
      }
    }
  }
  for (const adr of adrRecords) {
    if (!isObject(adr)) continue
    if (adr.lifecycle !== 'Superseded') continue
    const superseder = [...adrs.values()].find(
      (candidate) => candidate.lifecycle === 'Accepted' && candidate.supersedes?.includes(adr.id),
    )
    if (!superseder) {
      addProblem(
        problems,
        'ADV-G25',
        '$.adrs.' + adr.id,
        'a Superseded ADR needs an accepted ADR with a supersedes relationship',
      )
    }
  }
  for (const adr of adrRecords) {
    if (!isObject(adr)) continue
    for (const superseded of Array.isArray(adr.supersedes) ? adr.supersedes : []) {
      const target = adrs.get(superseded)
      if (adr.lifecycle === 'Accepted' && target?.lifecycle !== 'Superseded') {
        addProblem(
          problems,
          'ADV-G25',
          '$.adrs.' + adr.id + '.supersedes',
          'the superseded ADR must retain a Superseded current lifecycle',
        )
      }
    }
  }
}

function checkCanonical(stateText, state, problems, stateBytes) {
  // Bytes when the caller has them: a BOM survives the byte comparison and
  // vanishes from the decoded text, so a text-only check cannot see it.
  if (stateBytes !== undefined && !isCanonicalStateBytes(stateBytes, state)) {
    addProblem(
      problems,
      'ADV-G03',
      '$',
      'state bytes are not the deterministic canonical serialization',
    )
    return
  }
  if (!isCanonicalStateText(stateText, state)) {
    addProblem(
      problems,
      'ADV-G03',
      '$',
      'state bytes are not the deterministic canonical serialization',
    )
  }
}

function deriveQuestions(state, problems) {
  const questions = Object.create(null)
  for (const question of state.questions ?? []) {
    questions[question.id] = {
      id: question.id,
      resolved: false,
      resolver: null,
      // The contract's resolution scenario requires the resolver AND its
      // acceptance date, so the date is part of the derived answer rather than
      // something a consumer has to go and look up.
      resolvedAt: null,
    }
  }
  const resolvers = Object.create(null)
  for (const adr of state.adrs ?? []) {
    if (adr.lifecycle !== 'Accepted') continue
    for (const questionId of adr.resolves ?? []) {
      if (!questions[questionId]) {
        addProblem(
          problems,
          'ADV-G12',
          '$.adrs.' + adr.id + '.resolves',
          'references a missing question',
        )
        continue
      }
      if (resolvers[questionId]) {
        addProblem(
          problems,
          'ADV-G06',
          '$.adrs.' + adr.id + '.resolves',
          'multiple current accepted resolvers exist for ' + questionId,
        )
      }
      resolvers[questionId] = { id: adr.id, at: adr.acceptance?.at ?? null }
    }
  }
  for (const question of Object.values(questions)) {
    if (resolvers[question.id]) {
      question.resolved = true
      question.resolver = resolvers[question.id].id
      question.resolvedAt = resolvers[question.id].at
    }
  }
  return questions
}

function deriveNodes(state, problems, context) {
  const nodes = new Map()
  for (const node of [...(state.gates ?? []), ...(state.landings ?? [])]) {
    if (typeof node?.id === 'string') nodes.set(node.id, node)
  }
  const replacedBy = new Map()
  for (const node of nodes.values()) {
    if (node.replaces === null) continue
    if (!nodes.has(node.replaces)) {
      addProblem(
        problems,
        'ADV-G66',
        '$.nodes.' + node.id + '.replaces',
        'replacement target does not exist',
      )
      continue
    }
    if (replacedBy.has(node.replaces)) {
      addProblem(
        problems,
        'ADV-G66',
        '$.nodes.' + node.id + '.replaces',
        'two distinct nodes directly name the same replacement target',
      )
    }
    replacedBy.set(node.replaces, node.id)
    const oldNode = nodes.get(node.replaces)
    if (oldNode.kind !== node.kind)
      addProblem(problems, 'ADV-G66', '$.nodes.' + node.id, 'replacement must preserve node kind')
    if (node.replacement) {
      const expected = replacementDigest(oldNode, node)
      if (node.replacement.digest !== expected) {
        addProblem(
          problems,
          'ADV-G66',
          '$.nodes.' + node.id + '.replacement.digest',
          'replacement digest does not bind complete old/new semantic identities',
        )
      }
      if (node.replacement.attestation?.digest !== expected) {
        addProblem(
          problems,
          'ADV-G66',
          '$.nodes.' + node.id + '.replacement.attestation.digest',
          'replacement attestation is not bound to replacement digest',
        )
      }
    }
  }

  for (const node of nodes.values()) {
    const seen = new Set([node.id])
    let target = node.replaces
    while (target !== null && target !== undefined) {
      if (seen.has(target)) {
        addProblem(
          problems,
          'ADV-G66',
          '$.nodes.' + node.id + '.replaces',
          'replacement graph contains a cycle',
        )
        break
      }
      seen.add(target)
      target = nodes.get(target)?.replaces
    }
  }

  const currentIds = new Set([...nodes.keys()].filter((id) => !replacedBy.has(id)))
  const reverseRequires = new Map()
  const visiting = new Set()
  const visited = new Set()
  const visitPrerequisites = (id) => {
    if (visiting.has(id)) {
      addProblem(
        problems,
        'ADV-G10',
        '$.landings.' + id + '.requires',
        'prerequisite graph contains a cycle',
      )
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    const node = nodes.get(id)
    for (const prerequisite of node?.requires ?? []) {
      if (nodes.has(prerequisite)) visitPrerequisites(prerequisite)
    }
    visiting.delete(id)
    visited.add(id)
  }
  for (const landing of state.landings ?? []) {
    for (const prerequisite of landing.requires ?? []) {
      if (!nodes.has(prerequisite)) {
        addProblem(
          problems,
          'ADV-G12',
          '$.landings.' + landing.id + '.requires',
          'references a missing node',
        )
        continue
      }
      if (!reverseRequires.has(prerequisite)) reverseRequires.set(prerequisite, new Set())
      reverseRequires.get(prerequisite).add(landing.id)
    }
  }
  for (const landing of state.landings ?? []) visitPrerequisites(landing.id)
  for (const landing of state.landings ?? []) {
    if (!currentIds.has(landing.id)) continue
    for (const prerequisite of landing.requires ?? []) {
      if (!currentIds.has(prerequisite)) {
        addProblem(
          problems,
          'ADV-G66',
          '$.landings.' + landing.id + '.requires',
          'current node references a non-current prerequisite',
        )
      }
    }
  }

  const replacedTargets = [...replacedBy.keys()]
  for (const target of replacedTargets) {
    const queue = [target]
    const visited = new Set()
    while (queue.length) {
      const prerequisite = queue.shift()
      if (visited.has(prerequisite)) continue
      visited.add(prerequisite)
      for (const dependent of reverseRequires.get(prerequisite) ?? []) {
        if (!replacedBy.has(dependent)) {
          addProblem(
            problems,
            'ADV-G66',
            '$.nodes.' + dependent,
            'replacement dependent closure is incomplete',
          )
        }
        queue.push(dependent)
      }
    }
  }

  for (const node of nodes.values()) {
    if (node.replaces === null || node.kind === 'gate') continue
    const oldNode = nodes.get(node.replaces)
    if (!oldNode || oldNode.kind === 'gate') continue
    const expectedPrerequisites = new Set(
      (oldNode.requires ?? []).map((prerequisite) => replacedBy.get(prerequisite) ?? prerequisite),
    )
    const actualPrerequisites = new Set(node.requires ?? [])
    if (
      expectedPrerequisites.size !== actualPrerequisites.size ||
      [...expectedPrerequisites].some((prerequisite) => !actualPrerequisites.has(prerequisite))
    ) {
      addProblem(
        problems,
        'ADV-G66',
        '$.nodes.' + node.id + '.requires',
        'replacement must preserve prerequisites while repointing replaced identities',
      )
    }
  }

  for (const node of nodes.values()) {
    if (node.replaces === null) continue
    if (node.kind === 'gate' && hasOwn(node, 'delivery')) {
      addProblem(
        problems,
        'ADV-G66',
        '$.nodes.' + node.id + '.delivery',
        'gate replacement cannot carry delivery state',
      )
    }
    if (node.kind !== 'gate') {
      if (
        node.delivery.lifecycle !== 'Planned' ||
        node.delivery.completion !== null ||
        node.delivery.withdrawal !== null
      ) {
        addProblem(
          problems,
          'ADV-G66',
          '$.nodes.' + node.id + '.delivery',
          'replacement landing must start Planned without terminal evidence',
        )
      }
    }
  }

  return { nodes, currentIds, replacedBy }
}

function deriveGates(state, questions, problems) {
  const gates = Object.create(null)
  for (const gate of state.gates ?? []) {
    const question = questions[gate.predicate.question]
    if (!question) {
      addProblem(
        problems,
        'ADV-G09',
        '$.gates.' + gate.id + '.predicate.question',
        'predicate cannot be evaluated',
      )
      gates[gate.id] = { id: gate.id, satisfied: false, evaluable: false }
      continue
    }
    if (gate.predicate.name !== 'exactly-one-current-accepted-resolver') {
      addProblem(
        problems,
        'ADV-G09',
        '$.gates.' + gate.id + '.predicate.name',
        'predicate cannot be evaluated',
      )
      gates[gate.id] = { id: gate.id, satisfied: false, evaluable: false }
      continue
    }
    gates[gate.id] = { id: gate.id, satisfied: question.resolved === true, evaluable: true }
  }
  return gates
}

function deriveReadiness(state, nodeInfo, gates) {
  const satisfied = new Set(
    Object.entries(gates)
      .filter(([, gate]) => gate.satisfied)
      .map(([id]) => id),
  )
  for (const landing of state.landings ?? []) {
    if (landing.delivery.lifecycle === 'Complete') satisfied.add(landing.id)
  }
  const readiness = Object.create(null)
  for (const landing of state.landings ?? []) {
    const unsatisfied = (landing.requires ?? []).filter((id) => !satisfied.has(id))
    readiness[landing.id] = {
      state: unsatisfied.length === 0 ? 'Ready' : 'NotReady',
      unsatisfied,
      deliveryState: landing.delivery.lifecycle,
      authorizationAssessment:
        landing.delivery.lifecycle === 'Complete' || landing.delivery.lifecycle === 'Withdrawn'
          ? null
          : unsatisfied.length === 0
            ? 'AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION'
            : 'PREREQUISITES_NOT_READY',
      current: nodeInfo.currentIds.has(landing.id),
    }
  }
  return readiness
}

export function evaluateState(stateText, context = {}) {
  const problems = []
  let state
  try {
    state = parseStrictJson(stateText)
  } catch (error) {
    addProblem(problems, 'ADV-G01', '$', 'strict JSON parse failed: ' + error.message)
    const offset = /at byte (\d+)$/u.exec(error.message)?.[1]
    if (
      /(?:truncated|unterminated)/iu.test(error.message) ||
      (offset !== undefined && Number(offset) >= stateText.length - 1)
    ) {
      addProblem(problems, 'ADV-G23', '$', 'state appears truncated; no derived answer is produced')
    }
    return { ok: false, problems }
  }
  checkCanonical(stateText, state, problems, context.stateBytes)
  validateTopLevel(state, problems, context)
  if (isObject(state)) validateAdrRelationships(state, problems)
  if (problems.length > 0)
    return { ok: false, problems, state, canonical: canonicalSerialize(state) }

  const questions = deriveQuestions(state, problems)
  if (problems.length > 0)
    return { ok: false, problems, state, canonical: canonicalSerialize(state) }
  const nodeInfo = deriveNodes(state, problems, context)
  if (problems.length > 0)
    return { ok: false, problems, state, canonical: canonicalSerialize(state) }
  const gates = deriveGates(state, questions, problems)
  if (problems.length > 0)
    return { ok: false, problems, state, canonical: canonicalSerialize(state) }
  const readiness = deriveReadiness(state, nodeInfo, gates)
  const digests = {
    primitiveDigest: primitiveDigest(state),
    relationshipDigest: relationshipDigest(state),
  }
  const result = {
    ok: problems.length === 0,
    problems,
    state,
    canonical: canonicalSerialize(state),
    derived: { questions, gates, currentNodeIds: [...nodeInfo.currentIds].sort(), readiness },
    digests,
  }
  return result
}

export function canonicalizeStateText(stateText) {
  const state = parseStrictJson(stateText)
  return canonicalSerialize(state)
}

export function digestForPreimage(preimage) {
  return sha256Text(canonicalSerialize(preimage))
}

export {
  canonicalizeValue,
  NODE_ID,
  COMPLETION_POLICIES,
  expectedPolicy,
  semanticIdentityDigest,
  transitionDigest,
}
