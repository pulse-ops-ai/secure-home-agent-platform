import {
  canonicalSerialize,
  canonicalizeValue,
  decodeUtf8,
  hasOwn,
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
const EVIDENCE_FIELDS = [
  'type',
  'deliveredIdentity',
  'policyEvidenceIdentities',
  'archivedOpenSpec',
  'evidenceRoot',
  'manifest',
  'findings',
  'mergedPullRequest',
  'mergedCommit',
  'noOpenSpec',
  'contentDigest',
  'decisionIdentity',
  'authorityAnchor',
]
const DELIVERY_FIELDS = ['lifecycle', 'completionPolicy', 'completion', 'withdrawal']
const COMPLETION_FIELDS = ['from', 'to', 'digest', 'evidence', 'attestation']
const WITHDRAWAL_FIELDS = ['from', 'to', 'digest', 'evidence', 'attestation']
const REPLACEMENT_FIELDS = ['digest', 'attestation']
const IDENTITY_FIELDS = ['class', 'value', 'scope']
const ARTIFACT_FIELDS = ['path', 'contentDigest']
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

function validDate(value, path, problems) {
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

function parseHeaderRelationship(text, labels, expression, path, problems) {
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
    validateSet(value.scope, path + '.scope', problems, (member, memberPath, memberProblems) =>
      validRepoPath(member, memberPath, memberProblems),
    )
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
  if (typeof value.at !== 'string' || !validTimestamp(value.at, path + '.at', problems))
    return false
  if (value.outcome !== expectedOutcome) {
    addProblem(problems, 'ADV-G19', path + '.outcome', 'does not match the protocol outcome')
  }
  validateTypedAnchor(value.authority, path + '.authority', problems)
  return true
}

function validateArtifact(value, path, problems, context) {
  if (!requireObject(value, path, problems)) return false
  checkFields(value, ARTIFACT_FIELDS, path, problems)
  requiredFields(value, ARTIFACT_FIELDS, path, problems)
  if (!validRepoPath(value.path, path + '.path', problems) || !isSha256(value.contentDigest)) {
    if (!isSha256(value.contentDigest))
      addProblem(problems, 'ADV-G19', path + '.contentDigest', 'must be a lowercase SHA-256')
    return false
  }
  verifyContent(value.path, value.contentDigest, path, problems, context)
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

function verifyIdentity(value, path, problems, context) {
  if (!value || typeof value !== 'object') return
  if (value.class === 'local-git-commit') {
    if (!context?.hasLocalGitObject || !context.hasLocalGitObject(value.value)) {
      addProblem(
        problems,
        'ADV-G33',
        path,
        'local Git object is absent; completion requires external verification',
      )
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

function validateEvidence(value, path, problems, context, policy) {
  const evidenceCode =
    policy === 'withdrawal'
      ? 'ADV-G67'
      : policy === 'reviewed-spike-evidence-v1'
        ? 'ADV-G27'
        : 'ADV-G26'
  if (!requireObject(value, path, problems, evidenceCode)) return false
  checkFields(value, EVIDENCE_FIELDS, path, problems)
  if (typeof value.type !== 'string') {
    addProblem(problems, 'ADV-G30', path + '.type', 'evidence type is required')
    return false
  }

  if (policy === 'reviewed-delivery-v1') {
    if (!['reviewed-delivery', 'reviewed-delivery-v1'].includes(value.type)) {
      addProblem(problems, 'ADV-G30', path + '.type', 'does not match reviewed-delivery-v1')
    }
    if (
      !validateIdentity(value.deliveredIdentity, path + '.deliveredIdentity', problems, {
        requireScope: true,
        requireOfflineProof: true,
      })
    )
      return false
    verifyIdentity(value.deliveredIdentity, path + '.deliveredIdentity', problems, context)
    validateSet(
      value.policyEvidenceIdentities,
      path + '.policyEvidenceIdentities',
      problems,
      (member, memberPath, memberProblems) => {
        validateIdentity(member, memberPath, memberProblems)
        verifyIdentity(member, memberPath, memberProblems, context)
      },
    )
    validateArtifact(value.archivedOpenSpec, path + '.archivedOpenSpec', problems, context)
    return true
  }

  if (policy === 'reviewed-spike-evidence-v1') {
    if (!['reviewed-spike-evidence', 'reviewed-spike-evidence-v1'].includes(value.type)) {
      addProblem(problems, 'ADV-G30', path + '.type', 'does not match reviewed-spike-evidence-v1')
    }
    if (
      !validateIdentity(value.deliveredIdentity, path + '.deliveredIdentity', problems, {
        requireScope: true,
      })
    )
      return false
    verifyIdentity(value.deliveredIdentity, path + '.deliveredIdentity', problems, context)
    validateSet(
      value.policyEvidenceIdentities,
      path + '.policyEvidenceIdentities',
      problems,
      (member, memberPath, memberProblems) => {
        validateIdentity(member, memberPath, memberProblems)
        verifyIdentity(member, memberPath, memberProblems, context)
      },
    )
    for (const field of [
      'noOpenSpec',
      'evidenceRoot',
      'manifest',
      'findings',
      'mergedPullRequest',
      'mergedCommit',
    ]) {
      if (!hasOwn(value, field))
        addProblem(
          problems,
          'ADV-G27',
          path + '.' + field,
          'spike evidence is missing a required bound field',
        )
    }
    if (value.noOpenSpec !== true)
      addProblem(
        problems,
        'ADV-G28',
        path + '.noOpenSpec',
        'spike evidence must explicitly state no OpenSpec applicability',
      )
    if (hasOwn(value, 'archivedOpenSpec') && value.archivedOpenSpec !== null)
      addProblem(
        problems,
        'ADV-G28',
        path + '.archivedOpenSpec',
        'spike evidence cannot manufacture or carry an OpenSpec archive',
      )
    if (!validRepoPath(value.evidenceRoot, path + '.evidenceRoot', problems)) return false
    validateArtifact(value.manifest, path + '.manifest', problems, context)
    validateArtifact(value.findings, path + '.findings', problems, context)
    validateTypedAnchor(value.mergedPullRequest, path + '.mergedPullRequest', problems)
    validateIdentity(value.mergedCommit, path + '.mergedCommit', problems, { requireScope: true })
    if (value.mergedCommit)
      verifyIdentity(value.mergedCommit, path + '.mergedCommit', problems, context)
    return true
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

  addProblem(problems, 'ADV-G30', path + '.type', 'unknown evidence policy')
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
  if (typeof acceptance.at !== 'string' || !validTimestamp(acceptance.at, path + '.at', problems))
    return
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
    if (
      value.withdrawal !== null ||
      !requireObject(value.completion, path + '.completion', problems, 'ADV-G26')
    )
      return
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
    if (
      value.completion !== null ||
      !requireObject(value.withdrawal, path + '.withdrawal', problems, 'ADV-G67')
    )
      return
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
  if (typeof value.at !== 'string' || !validTimestamp(value.at, path + '.at', problems)) return
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

function validateAttestations(value, path, problems) {
  if (!requireObject(value, path, problems)) return
  checkFields(value, ['genesis', 'genesisCompletion'], path, problems)
  requiredFields(value, ['genesis'], path, problems)
  if (!isObject(value.genesis))
    addProblem(problems, 'ADV-G19', path + '.genesis', 'genesis attestation must be an object')
  else if (Object.keys(value.genesis).length > 0)
    addProblem(
      problems,
      'ADV-G02',
      path + '.genesis',
      'genesis attestation machinery is owned by a later PR-2 task',
    )
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

function checkCanonical(stateText, state, problems) {
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
    questions[question.id] = { id: question.id, resolved: false, resolver: null }
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
      resolvers[questionId] = adr.id
    }
  }
  for (const question of Object.values(questions)) {
    if (resolvers[question.id]) {
      question.resolved = true
      question.resolver = resolvers[question.id]
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
  checkCanonical(stateText, state, problems)
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
