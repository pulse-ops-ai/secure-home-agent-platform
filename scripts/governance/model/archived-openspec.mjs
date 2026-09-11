/**
 * THE ARCHIVED OPENSPEC IDENTITY OF A REVIEWED DELIVERY.
 *
 * `reviewed-delivery-v1` completion binds the whole child change, not a file:
 * a canonical change id, both stage roots, the complete member manifest with
 * per-member byte digests, a bundle digest over exactly those identity-bearing
 * fields, and two supporting provenance identities.
 *
 * The part worth reading twice is `reviewedIdentity`. It is a closed union of
 * two forms because the reviewed snapshot is NOT guaranteed to survive
 * delivery: a squash replaces the reviewed commits with one whose parent
 * predates them, and the branch is routinely deleted on merge. The reviewed
 * BYTES survive regardless, because archiving relocates members without editing
 * them — so the content form binds the accepted review record, and the commit
 * form binds the snapshot when it is still there.
 *
 * Requiring a commit was not merely fragile, it was satisfiable by accident:
 * "active root present, archive root absent" holds at EVERY pre-archive commit
 * on the default branch, so a mechanically valid but semantically wrong commit
 * passed while the human attestation carried the entire binding. The member-byte
 * comparison is what actually pins "reviewed".
 *
 * `archivedPackageIdentity` stays commit-only, and that asymmetry is a fact
 * rather than a preference: the archive lands in durable current history by
 * construction.
 */
import { canonicalSerialize } from './canonical.mjs'
import { ABSENT, OBSERVATION_ERROR, PRESENT } from '../git-tree/index.mjs'
import { canonicalPathSetProblems } from './paths.mjs'
import { sha256Bytes, sha256Text, isSha256 } from './digests.mjs'
import {
  CONTRACT as REVIEW_CONTRACT,
  REVIEW_FILE,
  ReviewContractError,
  compareUtf8,
  deltaSpecPaths,
  extractReviewBlock,
  planningProjection,
  validateReviewRecordShapeAndAcceptance,
} from '../../openspec-review-contract.mjs'

export const ARCHIVED_CONTRACT = 'archived-openspec-change-v1'

const ARCHIVED_FIELDS = [
  'schemaVersion',
  'contract',
  'changeId',
  'activeRoot',
  'archiveRoot',
  'members',
  'bundleSha256',
  'reviewedIdentity',
  'archivedPackageIdentity',
]

const MEMBER_FIELDS = ['path', 'contentSha256']
const IDENTITY_FIELDS = ['class', 'value', 'scope']
const CHANGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const DATED_PREFIX = /^(\d{4})-(\d{2})-(\d{2})-(.+)$/u
const OID = /^[0-9a-f]{40}$/u
const REGULAR_MODE = '100644'

/** The artifacts every ordinary post-genesis package must carry. */
const REQUIRED_MEMBERS = ['.openspec.yaml', 'proposal.md', 'design.md', 'assurance.md', 'tasks.md']

const add = (problems, code, path, message) => {
  problems.push({ code, path, message })
  return false
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function exactKeys(value, expected, path, problems, code) {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    return add(
      problems,
      code,
      path,
      `fields differ; expected ${wanted.join(', ')}; got ${actual.join(', ')}`,
    )
  }
  return true
}

/** A member path is relative, has no traversal, and names no absolute form. */
function safeMemberPath(value) {
  if (typeof value !== 'string' || value === '') return false
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) return false
  if (value.includes('\\')) return false
  const segments = value.split('/')
  return !segments.some((segment) => segment === '' || segment === '.' || segment === '..')
}

function isRealDate(y, m, d) {
  const [year, month, day] = [y, m, d].map(Number)
  if (month < 1 || month > 12) return false
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= lengths[month - 1]
}

/** The bundle preimage: identity-bearing fields only, provenance excluded. */
export function bundlePreimage(archived) {
  return {
    schemaVersion: 1,
    contract: ARCHIVED_CONTRACT,
    changeId: archived.changeId,
    activeRoot: archived.activeRoot,
    archiveRoot: archived.archiveRoot,
    // A completion-envelope ENTITY SET keyed by path: the same logical member
    // set must produce the same bundle identity whatever order it was authored
    // in. Digesting the authored order made the identity order-sensitive, which
    // turns a presentational difference into a different delivery.
    members: [...archived.members]
      .sort((left, right) => compareUtf8(left.path, right.path))
      .map((member) => ({
        path: member.path,
        contentSha256: member.contentSha256,
      })),
  }
}

export function bundleSha256(archived) {
  return sha256Text(canonicalSerialize(bundlePreimage(archived)))
}

/** An observed tree reduced to the manifest shape, refusing non-regular modes. */
function observedMembers(entries, path, problems, code, label) {
  const members = []
  for (const [relative, entry] of [...entries.entries()].sort((a, b) => compareUtf8(a[0], b[0]))) {
    if (entry.mode !== REGULAR_MODE) {
      add(
        problems,
        code,
        path,
        `${label}: ${relative} has Git mode ${entry.mode}; every member must be a regular ` +
          `${REGULAR_MODE} file`,
      )
      continue
    }
    if (entry.sha256 === undefined) {
      add(problems, code, path, `${label}: ${relative} could not be read as bytes`)
      continue
    }
    members.push({ path: relative, contentSha256: entry.sha256 })
  }
  return members
}

/**
 * Turn a tri-state observation into a decision, refusing on ERROR.
 *
 * The model, not the adapter, decides that an unanswerable question is fatal —
 * and it must be, because several rules REQUIRE an absence and an unobserved
 * path would otherwise satisfy them by default.
 */
function observed(status, expectation, path, problems, what) {
  if (status === OBSERVATION_ERROR) {
    add(
      problems,
      'ADV-G81',
      path,
      `${what} could not be observed; an unanswered repository question is a refusal, never a ` +
        'satisfied absence',
    )
    return false
  }
  return status === expectation
}

const sameMembers = (left, right) =>
  left.length === right.length &&
  left.every(
    (member, index) =>
      member.path === right[index].path && member.contentSha256 === right[index].contentSha256,
  )

const describe = (members) =>
  members.map((m) => `${m.path}@${m.contentSha256.slice(0, 8)}`).join(', ')

/**
 * The content-backed reviewed identity.
 *
 * It consumes the SHARED review contract, never a private copy: the same
 * `validateReviewRecordShapeAndAcceptance` the OpenSpec review gate applies to a
 * live change is applied here to an archived one. What this proves is bounded
 * and worth stating — the artifact carries its bound bytes, the record is a
 * complete ACCEPTING v2 record, and its manifest equals the archived planning
 * bytes. It proves nothing about who reviewed, their independence, or when an
 * unsigned record existed; those are procedural facts owned by the review
 * system, for the commit form equally.
 */
function verifyContentReviewedIdentity(archived, identity, path, problems, context) {
  const expectedScope = `${archived.archiveRoot}/${REVIEW_FILE}`

  if (identity.scope.length !== 1 || identity.scope[0] !== expectedScope) {
    return add(
      problems,
      'ADV-G81',
      path + '.scope',
      'a content-backed reviewed identity names exactly the accepted review artifact ' +
        `(${expectedScope}); an arbitrary package member is not a whole-package reviewed identity`,
    )
  }

  if (!context?.readBytes) {
    return add(problems, 'ADV-G81', path, 'the review artifact cannot be read locally')
  }

  let bytes
  try {
    bytes = context.readBytes(expectedScope)
  } catch (error) {
    return add(problems, 'ADV-G81', path, `the review artifact is unreadable: ${error.message}`)
  }
  if (bytes === undefined) {
    return add(problems, 'ADV-G81', path, 'the review artifact is missing')
  }

  // EXACT BYTES. Hashing a decoded round trip would make two files with the
  // same text but different encodings compare equal, and the whole point of a
  // content identity is that it is the bytes.
  const actual = sha256Bytes(bytes)
  if (actual !== identity.value) {
    return add(
      problems,
      'ADV-G81',
      path + '.value',
      'the identity value is not the SHA-256 of the review artifact bytes',
    )
  }

  // ...AND THOSE BYTES ARE THE DECLARED MEMBER'S BYTES.
  //
  // Without this the two halves of the evidence could describe different files:
  // the member manifest (and every tree observation) proves artifact A, while
  // the identity is the digest of whatever the read returned — B. Both halves
  // pass, and the accepting record validated is the one the archive does not
  // contain. The chain has to close:
  //
  //   identity.value == SHA256(read bytes) == members[review file].contentSha256
  //
  // and the observations below bind that member digest to the repository.
  const declaredReview = archived.members.find((member) => member.path === REVIEW_FILE)
  if (declaredReview === undefined) {
    return add(
      problems,
      'ADV-G81',
      path,
      `the package declares no ${REVIEW_FILE} member, so there is no reviewed record to bind`,
    )
  }
  if (declaredReview.contentSha256 !== actual) {
    return add(
      problems,
      'ADV-G81',
      path + '.value',
      `the reviewed record's bytes are not the declared ${REVIEW_FILE} member: identity ` +
        `${actual.slice(0, 12)} vs member ${declaredReview.contentSha256.slice(0, 12)}`,
    )
  }

  let record
  try {
    // Decoded only to PARSE; identity above was established on the bytes.
    record = validateReviewRecordShapeAndAcceptance(
      extractReviewBlock(Buffer.from(bytes).toString('utf8')),
    )
  } catch (error) {
    if (error instanceof ReviewContractError) {
      return add(
        problems,
        'ADV-G81',
        path,
        `the review artifact is not a complete accepting ${REVIEW_CONTRACT} record: ` +
          `${error.code}: ${error.message}`,
      )
    }
    throw error
  }

  // The expected set is the package's own planning projection, derived through
  // the shared contract so the two consumers cannot disagree about what counts.
  let expected
  try {
    expected = planningProjection(deltaSpecPaths(archived.members.map((m) => m.path)))
  } catch (error) {
    if (error instanceof ReviewContractError) {
      return add(problems, 'ADV-G81', path, `${error.code}: ${error.message}`)
    }
    throw error
  }

  const declared = record.reviewed_artifacts.map((artifact) => artifact.path).sort(compareUtf8)
  const wanted = [...expected].sort(compareUtf8)

  // EQUALITY, not containment. A record naming one planning file, or omitting a
  // delta spec, describes a review that did not read the package — and every
  // digest it does declare would still match.
  if (JSON.stringify(declared) !== JSON.stringify(wanted)) {
    const missing = wanted.filter((p) => !declared.includes(p))
    const extra = declared.filter((p) => !wanted.includes(p))
    return add(
      problems,
      'ADV-G81',
      path,
      'the review manifest is not the complete planning projection' +
        (missing.length > 0 ? `; missing ${missing.join(', ')}` : '') +
        (extra.length > 0 ? `; unexpected ${extra.join(', ')}` : ''),
    )
  }

  const byPath = new Map(archived.members.map((member) => [member.path, member.contentSha256]))
  for (const artifact of record.reviewed_artifacts) {
    const memberDigest = byPath.get(artifact.path)
    if (memberDigest === undefined) {
      return add(
        problems,
        'ADV-G81',
        path,
        `reviewed artifact ${artifact.path} is not an archived member`,
      )
    }
    if (memberDigest !== artifact.sha256) {
      return add(
        problems,
        'ADV-G81',
        path,
        `reviewed artifact ${artifact.path} was reviewed at ${artifact.sha256.slice(0, 12)} ` +
          `but the archived member is ${memberDigest.slice(0, 12)}`,
      )
    }
  }

  return true
}

/**
 * The commit-backed reviewed identity.
 *
 * Durability is REACHABILITY, not object presence. An object fetched through a
 * pull-request ref sits in the store with nothing keeping it alive; it can be
 * pruned, and it is not part of the repository's history. The recorded form is
 * never downgraded to the content form when it turns out to be unreachable —
 * the form is authored evidence, and repairing it here would let the checker
 * manufacture what it is supposed to verify.
 */
function verifyCommitReviewedIdentity(archived, identity, path, problems, context) {
  const observe = context?.observe
  if (!observe) {
    return add(problems, 'ADV-G81', path, 'repository observations are unavailable')
  }

  if (
    !observed(observe.commitExists(identity.value), PRESENT, path, problems, 'the reviewed commit')
  ) {
    return add(
      problems,
      'ADV-G81',
      path,
      'the reviewed commit object is absent; completion requires external verification',
    )
  }
  if (!observed(observe.isReachable(identity.value), PRESENT, path, problems, 'reachability')) {
    return add(
      problems,
      'ADV-G81',
      path,
      'the reviewed commit is present but not reachable from the current history, so it is ' +
        'not durable local proof; completion requires external verification',
    )
  }

  if (identity.value === archived.archivedPackageIdentity?.value) {
    return add(
      problems,
      'ADV-G85',
      path,
      'the reviewed and archived-package snapshots must be different commits',
    )
  }

  // Stage exclusivity, which only a snapshot can answer.
  const activeAt = observe.pathExistsAt(identity.value, archived.activeRoot)
  if (!observed(activeAt, PRESENT, path, problems, 'the active root at the reviewed snapshot')) {
    return activeAt === OBSERVATION_ERROR
      ? false
      : add(problems, 'ADV-G85', path, 'the active root is absent at the reviewed snapshot')
  }
  const archiveAt = observe.pathExistsAt(identity.value, archived.archiveRoot)
  if (!observed(archiveAt, ABSENT, path, problems, 'the archive root at the reviewed snapshot')) {
    return archiveAt === OBSERVATION_ERROR
      ? false
      : add(
          problems,
          'ADV-G85',
          path,
          'the archive root exists at the reviewed snapshot; reviewed is active-only',
        )
  }

  const tree = observe.treeAt(identity.value, archived.activeRoot)
  if (tree.status !== PRESENT) {
    return add(
      problems,
      'ADV-G85',
      path,
      `the reviewed active tree could not be observed (${tree.status})`,
    )
  }
  const seenMembers = observedMembers(
    tree.entries,
    path,
    problems,
    'ADV-G85',
    'reviewed active tree',
  )
  if (!sameMembers(seenMembers, archived.members)) {
    return add(
      problems,
      'ADV-G85',
      path,
      'the reviewed active tree does not match the declared members: observed ' +
        describe(seenMembers),
    )
  }
  return true
}

/**
 * The whole archived-OpenSpec identity.
 *
 * @param context.observe a rules-free repository observer
 * @param context.readBytes exact bytes of a repository-relative path
 */
export function validateArchivedOpenSpec(value, path, problems, context) {
  if (!isObject(value)) {
    return add(problems, 'ADV-G78', path, 'archivedOpenSpec must be an object')
  }
  if (!exactKeys(value, ARCHIVED_FIELDS, path, problems, 'ADV-G78')) return false

  if (value.schemaVersion !== 1) {
    return add(problems, 'ADV-G78', path + '.schemaVersion', 'must be 1')
  }
  if (value.contract !== ARCHIVED_CONTRACT) {
    return add(problems, 'ADV-G78', path + '.contract', `must be ${ARCHIVED_CONTRACT}`)
  }
  if (typeof value.changeId !== 'string' || !CHANGE_ID.test(value.changeId)) {
    return add(problems, 'ADV-G78', path + '.changeId', 'is not a canonical change id')
  }
  if (value.activeRoot !== `openspec/changes/${value.changeId}`) {
    return add(
      problems,
      'ADV-G78',
      path + '.activeRoot',
      `must be openspec/changes/${value.changeId}`,
    )
  }
  const archivePrefix = 'openspec/changes/archive/'
  if (typeof value.archiveRoot !== 'string' || !value.archiveRoot.startsWith(archivePrefix)) {
    return add(problems, 'ADV-G78', path + '.archiveRoot', 'must be under the archive root')
  }
  const dated = DATED_PREFIX.exec(value.archiveRoot.slice(archivePrefix.length))
  if (dated === null || !isRealDate(dated[1], dated[2], dated[3]) || dated[4] !== value.changeId) {
    return add(
      problems,
      'ADV-G78',
      path + '.archiveRoot',
      'must be a valid YYYY-MM-DD date followed by exactly the change id',
    )
  }

  // ── members ─────────────────────────────────────────────────────────────
  if (!Array.isArray(value.members)) {
    return add(problems, 'ADV-G79', path + '.members', 'must be an array')
  }
  // NON-VACUITY: an empty membership is an unanswered question, not a package
  // with nothing in it. Deriving "complete" from it would be the loudest
  // possible false green.
  if (value.members.length === 0) {
    return add(
      problems,
      'ADV-G79',
      path + '.members',
      'is empty; a required member set that resolves to nothing is refused',
    )
  }
  const seen = new Set()
  for (const [index, member] of value.members.entries()) {
    const memberPath = `${path}.members[${index}]`
    if (!isObject(member) || !exactKeys(member, MEMBER_FIELDS, memberPath, problems, 'ADV-G79')) {
      return false
    }
    if (!safeMemberPath(member.path)) {
      return add(problems, 'ADV-G84', memberPath + '.path', 'is not a safe relative member path')
    }
    if (!isSha256(member.contentSha256)) {
      return add(problems, 'ADV-G79', memberPath + '.contentSha256', 'must be a lowercase SHA-256')
    }
    if (seen.has(member.path)) {
      return add(problems, 'ADV-G79', memberPath + '.path', 'is a duplicate member path')
    }
    seen.add(member.path)
  }
  const sorted = [...value.members].sort((a, b) => compareUtf8(a.path, b.path))
  if (JSON.stringify(sorted) !== JSON.stringify(value.members)) {
    return add(problems, 'ADV-G79', path + '.members', 'must be sorted by canonical member path')
  }
  for (const required of REQUIRED_MEMBERS) {
    if (!seen.has(required)) {
      return add(
        problems,
        'ADV-G78',
        path + '.members',
        `the minimum OpenSpec package structure requires ${required}`,
      )
    }
  }
  // Two different questions, deliberately not merged:
  //   the review PLANNING PROJECTION covers every specs/**/*.md;
  //   the minimum PACKAGE requires at least one specs/**/spec.md.
  // A package carrying only `specs/foo/notes.md` has a planning projection and
  // no delta spec, and used to qualify because the projection was reused as the
  // membership test.
  const deltaSpecs = [...seen].filter(
    (member) => member.startsWith('specs/') && member.endsWith('/spec.md'),
  )
  if (deltaSpecs.length === 0) {
    return add(
      problems,
      'ADV-G78',
      path + '.members',
      'the minimum OpenSpec package structure requires at least one specs/**/spec.md',
    )
  }

  // ── bundle identity ─────────────────────────────────────────────────────
  if (!isSha256(value.bundleSha256)) {
    return add(problems, 'ADV-G80', path + '.bundleSha256', 'must be a lowercase SHA-256')
  }
  const recomputed = bundleSha256(value)
  if (recomputed !== value.bundleSha256) {
    return add(
      problems,
      'ADV-G80',
      path + '.bundleSha256',
      `does not match the canonical bundle preimage; expected ${recomputed}`,
    )
  }

  // ── provenance identities ───────────────────────────────────────────────
  const reviewed = value.reviewedIdentity
  const archivedPkg = value.archivedPackageIdentity
  for (const [identity, name] of [
    [reviewed, 'reviewedIdentity'],
    [archivedPkg, 'archivedPackageIdentity'],
  ]) {
    if (
      !isObject(identity) ||
      !exactKeys(identity, IDENTITY_FIELDS, `${path}.${name}`, problems, 'ADV-G81')
    ) {
      return false
    }
    // The SHARED canonical-path-set rule, not a second opinion. This used to
    // check only "non-empty array", so traversal, absolute paths, duplicates
    // and non-strings reached the observation layer through the nested
    // identities while every other scope in the registry refused them.
    const scopeProblems = canonicalPathSetProblems(identity.scope)
    if (scopeProblems.length > 0) {
      return add(problems, 'ADV-G84', `${path}.${name}.scope`, scopeProblems.join('; '))
    }
    if (identity.scope.length === 0) {
      return add(
        problems,
        'ADV-G81',
        `${path}.${name}.scope`,
        'must be a non-empty canonical scope',
      )
    }
  }

  if (archivedPkg.class !== 'local-git-commit') {
    return add(
      problems,
      'ADV-G81',
      path + '.archivedPackageIdentity.class',
      'must be local-git-commit; the archived package lands in durable current history by ' +
        'construction, so it needs no content alternative',
    )
  }
  if (!OID.test(archivedPkg.value)) {
    return add(problems, 'ADV-G81', path + '.archivedPackageIdentity.value', 'is not an object id')
  }

  if (!['local-git-commit', 'content-sha256'].includes(reviewed.class)) {
    return add(
      problems,
      'ADV-G81',
      path + '.reviewedIdentity.class',
      'must be local-git-commit or content-sha256; an external-git-commit is opaque and cannot ' +
        'satisfy completion',
    )
  }

  const observe = context?.observe
  if (!observe) {
    return add(problems, 'ADV-G81', path, 'repository observations are unavailable')
  }

  // ── the archived package, and the current snapshot ──────────────────────
  if (
    !observed(
      observe.commitExists(archivedPkg.value),
      PRESENT,
      path + '.archivedPackageIdentity',
      problems,
      'the archived-package commit',
    )
  ) {
    return add(
      problems,
      'ADV-G81',
      path + '.archivedPackageIdentity',
      'the archived-package commit object is absent',
    )
  }
  if (
    !observed(
      observe.isReachable(archivedPkg.value),
      PRESENT,
      path + '.archivedPackageIdentity',
      problems,
      'archived-package reachability',
    )
  ) {
    return add(
      problems,
      'ADV-G81',
      path + '.archivedPackageIdentity',
      'the archived-package commit is not reachable from the current history; the archive is ' +
        'expected to have landed durably, so this is a refusal rather than object presence',
    )
  }

  const archiveAtSnapshot = observe.pathExistsAt(archivedPkg.value, value.archiveRoot)
  if (
    !observed(
      archiveAtSnapshot,
      PRESENT,
      path + '.archivedPackageIdentity',
      problems,
      'the archive root at the archived snapshot',
    )
  ) {
    return archiveAtSnapshot === OBSERVATION_ERROR
      ? false
      : add(
          problems,
          'ADV-G85',
          path + '.archivedPackageIdentity',
          'the archive root is absent at the archived-package snapshot',
        )
  }
  const activeAtSnapshot = observe.pathExistsAt(archivedPkg.value, value.activeRoot)
  if (
    !observed(
      activeAtSnapshot,
      ABSENT,
      path + '.archivedPackageIdentity',
      problems,
      'the active root at the archived snapshot',
    )
  ) {
    return activeAtSnapshot === OBSERVATION_ERROR
      ? false
      : add(
          problems,
          'ADV-G85',
          path + '.archivedPackageIdentity',
          'the active root survives at the archived-package snapshot; archived is archive-only',
        )
  }
  const archivedTree = observe.treeAt(archivedPkg.value, value.archiveRoot)
  if (archivedTree.status !== PRESENT) {
    return add(
      problems,
      'ADV-G85',
      path,
      `the archived-package tree could not be observed (${archivedTree.status})`,
    )
  }
  const archivedObserved = observedMembers(
    archivedTree.entries,
    path,
    problems,
    'ADV-G85',
    'archived-package tree',
  )
  if (!sameMembers(archivedObserved, value.members)) {
    return add(
      problems,
      'ADV-G85',
      path,
      'the archived-package tree does not match the declared members: observed ' +
        describe(archivedObserved),
    )
  }

  // ── the CURRENT CHECKOUT, which a Git-tree observation cannot see ───────
  //
  // `ls-tree` answers what a COMMIT contains. A member edited in the working
  // tree, a member deleted from it, or an extra file dropped beside the archive
  // are all invisible there — and the contract's current-snapshot rules are
  // about what is on disk now. Both observations are required: the Git one
  // proves the snapshot, this one proves the checkout the checker is running
  // against actually matches it.
  if (!context?.checkout) {
    return add(problems, 'ADV-G85', path, 'the current checkout cannot be observed')
  }
  let checkoutActive
  let checkoutEntries
  try {
    checkoutActive = context.checkout.pathExists(value.activeRoot)
    checkoutEntries = context.checkout.tree(value.archiveRoot)
  } catch (error) {
    // A containment violation is a refusal, never an absence.
    return add(
      problems,
      'ADV-G84',
      path,
      `the current checkout is unsafe to read: ${error.message}`,
    )
  }
  if (checkoutActive) {
    return add(
      problems,
      'ADV-G85',
      path,
      'the active package still exists in the current checkout; the archive must replace it',
    )
  }
  if (checkoutEntries === undefined) {
    return add(problems, 'ADV-G85', path, 'the archive root is absent in the current checkout')
  }
  const currentObserved = observedMembers(
    checkoutEntries,
    path,
    problems,
    'ADV-G85',
    'current checkout',
  )
  if (!sameMembers(currentObserved, value.members)) {
    return add(
      problems,
      'ADV-G85',
      path,
      'the current checkout does not match the declared members: observed ' +
        describe(currentObserved),
    )
  }

  // ── the reviewed package, by its selected form ──────────────────────────
  // Class-dispatched, so a commit-stage rule is never applied to a content
  // identity and never silently skipped for one.
  return reviewed.class === 'local-git-commit'
    ? verifyCommitReviewedIdentity(value, reviewed, path + '.reviewedIdentity', problems, context)
    : verifyContentReviewedIdentity(value, reviewed, path + '.reviewedIdentity', problems, context)
}

/**
 * Applying a snapshot-stage rule to a content-backed identity is a CLASS ERROR.
 *
 * Exposed so the refusal is a behaviour a test can drive, rather than an
 * absence someone has to notice. A rule that silently does not apply and a rule
 * that vacuously passes look identical from outside; this makes them different.
 */
export function assertStageRuleApplicable(identity, ruleName) {
  if (identity?.class !== 'local-git-commit') {
    throw new ReviewContractError(
      'IDENTITY_CLASS_ERROR',
      `${ruleName} is a commit-snapshot rule and does not apply to a ${String(identity?.class)} ` +
        'reviewed identity',
    )
  }
  return true
}
