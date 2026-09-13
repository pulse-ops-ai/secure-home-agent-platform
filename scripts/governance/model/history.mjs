/**
 * PAIRWISE GOVERNANCE RULES — the only owner of two-revision semantics.
 *
 * Everything here needs two states to be answerable at all. Whether a lifecycle
 * moved backwards, whether a record disappeared, whether a replacement target
 * was current BEFORE the change, whether a first appearance is a sanctioned
 * replacement — none of these is visible in one snapshot, and PR-1 deliberately
 * does not claim them.
 *
 * The converse is just as deliberate: nothing here re-derives a target-state
 * fact. Both revisions are handed to the shared current-state model first, and
 * this module reads only what that model already validated. Reimplementing a
 * closure rule or a canonical form here would create a second authority that
 * could disagree with the checker every other consumer uses.
 *
 * The Git adapter supplies revisions and bytes and is never consulted about
 * meaning.
 */

import { canonicalSerialize, canonicalizeValue, isObject } from './canonical.mjs'
import { semanticIdentity } from './digests.mjs'

/** The observation vocabulary, as the adapters report it. */
const PRESENT = 'PRESENT'
const ABSENT = 'ABSENT'

/**
 * D5.1, as a table rather than prose.
 *
 * Staying in the same lifecycle is always legal — a revision that changes
 * nothing about a decision is not a transition.
 */
const LEGAL_ADR_TRANSITIONS = new Map([
  ['Proposed', new Set(['Proposed', 'Accepted', 'Rejected'])],
  ['Accepted', new Set(['Accepted', 'Superseded'])],
  ['Rejected', new Set(['Rejected'])],
  ['Superseded', new Set(['Superseded'])],
])

/**
 * D5a.2 and the delivery lifecycle. `Complete` and `Withdrawn` are terminal:
 * the only legal successor is themselves.
 */
const LEGAL_DELIVERY_TRANSITIONS = new Map([
  ['Planned', new Set(['Planned', 'InProgress', 'Complete', 'Withdrawn'])],
  ['InProgress', new Set(['InProgress', 'Complete', 'Withdrawn'])],
  ['Complete', new Set(['Complete'])],
  ['Withdrawn', new Set(['Withdrawn'])],
])

const LEGAL_WITHDRAWAL_SOURCES = new Set(['Planned', 'InProgress'])

/**
 * Which semantic-identity field moved, and therefore which refusal this is.
 *
 * One mechanism detects every in-place rule-input mutation — the whole labelled
 * semantic identity is compared — and the field name selects the code, so the
 * corpus can assert a predicate edit and a repointed anchor separately without
 * four near-identical comparisons drifting apart.
 */
const RULE_INPUT_CODES = new Map([
  ['predicate', 'ADV-G11'],
  ['requires', 'ADV-G13'],
  ['authorityAnchor', 'ADV-G14'],
  ['kind', 'ADV-G15'],
  ['completionPolicy', 'ADV-G15'],
  ['sources', 'ADV-G15'],
  ['reviewedOrderingIntent', 'ADV-G15'],
])

/**
 * Any key that would assert local authorization. Version one defines no such
 * record; the current model refuses it as an unknown field, and this module
 * reports that it was INTRODUCED, which is the pairwise fact.
 */
const AUTHORIZATION_KEY = /^authoriz/iu

const problem = (problems, code, path, message) => problems.push({ code, path, message })

const canonicalText = (value) => canonicalSerialize(canonicalizeValue(value ?? null))

const byId = (members) => {
  const index = new Map()
  for (const member of members ?? []) {
    if (isObject(member) && typeof member.id === 'string') index.set(member.id, member)
  }
  return index
}

const collections = ['adrs', 'questions', 'gates', 'landings', 'externalReferences']

/** Every key path whose final segment asserts authorization, at any depth. */
function authorizationClaims(value, path = '$', found = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((member, index) => authorizationClaims(member, path + '[' + index + ']', found))
    return found
  }
  if (!isObject(value)) return found
  for (const [key, member] of Object.entries(value)) {
    const here = path + '.' + key
    if (AUTHORIZATION_KEY.test(key)) found.set(here, canonicalText(member))
    authorizationClaims(member, here, found)
  }
  return found
}

function compareAuthorizationRecords(baseState, targetState, problems) {
  const before = authorizationClaims(baseState)
  const after = authorizationClaims(targetState)
  for (const [path, value] of after) {
    if (!before.has(path)) {
      problem(
        problems,
        'ADV-G18',
        path,
        'an authorization-evidence record was introduced; version one defines none and ' +
          'authorization is never local',
      )
    } else if (before.get(path) !== value) {
      problem(problems, 'ADV-G18', path, 'an authorization-evidence record was mutated')
    }
  }
  for (const path of before.keys()) {
    if (!after.has(path)) {
      problem(problems, 'ADV-G18', path, 'an authorization-evidence record was removed')
    }
  }
}

function compareRecordSurvival(baseState, targetState, problems) {
  for (const collection of collections) {
    const before = byId(baseState?.[collection])
    const after = byId(targetState?.[collection])
    for (const id of before.keys()) {
      if (after.has(id)) continue
      problem(
        problems,
        'ADV-G34',
        '$.' + collection + '.' + id,
        'an existing record was deleted or renumbered; identifiers are permanent',
      )
    }
  }
}

function compareDecisions(baseState, targetState, problems) {
  const before = byId(baseState?.adrs)
  const after = byId(targetState?.adrs)
  for (const [id, baseAdr] of before) {
    const targetAdr = after.get(id)
    if (!targetAdr) continue
    const path = '$.adrs.' + id

    const legal = LEGAL_ADR_TRANSITIONS.get(baseAdr.lifecycle)
    if (legal && !legal.has(targetAdr.lifecycle)) {
      problem(
        problems,
        'ADV-G08',
        path + '.lifecycle',
        `${baseAdr.lifecycle} -> ${targetAdr.lifecycle} is not a legal decision transition`,
      )
    }

    // `Accepted -> Superseded` keeps the acceptance record; it is the decision's
    // history, not a mutable field. So for any terminal base lifecycle the whole
    // acceptance object is immutable, which is what catches a byte swap that
    // moves the recorded digest along with the document.
    const terminal = baseAdr.lifecycle !== 'Proposed'
    if (terminal) {
      if (canonicalText(baseAdr.acceptance) !== canonicalText(targetAdr.acceptance)) {
        problem(
          problems,
          'ADV-G40',
          path + '.acceptance',
          'acceptance evidence of a decided ADR was mutated; the recorded digest and the ' +
            'accepted bytes are both pinned',
        )
      }
      if (baseAdr.path !== targetAdr.path) {
        problem(problems, 'ADV-G04h', path + '.path', 'accepted decision bytes were repointed')
      }
      if (canonicalText(baseAdr.resolves) !== canonicalText(targetAdr.resolves)) {
        problem(
          problems,
          'ADV-G40',
          path + '.resolves',
          "a decided ADR's relationships were mutated",
        )
      }
      if (canonicalText(baseAdr.supersedes) !== canonicalText(targetAdr.supersedes)) {
        problem(
          problems,
          'ADV-G40',
          path + '.supersedes',
          "a decided ADR's supersession was mutated",
        )
      }
    }
  }
}

/**
 * A resolved question's current resolver may not quietly disappear.
 *
 * Derived from the two evaluations rather than recomputed here: the shared
 * model already decided which questions are resolved and by what, and asking
 * that question twice is how two answers start to differ.
 */
function compareResolvers(base, target, problems) {
  const beforeQuestions = base.evaluation?.derived?.questions ?? {}
  const afterQuestions = target.evaluation?.derived?.questions ?? {}
  const resolvers = (state, questionId) =>
    (state?.adrs ?? [])
      .filter((adr) => Array.isArray(adr.resolves) && adr.resolves.includes(questionId))
      .map((adr) => adr.id)
      .sort()

  for (const [questionId, question] of Object.entries(beforeQuestions)) {
    if (question?.resolved !== true) continue
    const before = resolvers(base.evaluation?.state, questionId)
    const after = resolvers(target.evaluation?.state, questionId)
    const lost = before.filter((id) => !after.includes(id))
    if (lost.length > 0) {
      problem(
        problems,
        'ADV-G35',
        '$.questions.' + questionId,
        'the current resolver relationship of a resolved question disappeared: ' + lost.join(', '),
      )
      continue
    }
    if (afterQuestions[questionId]?.resolved !== true) {
      problem(
        problems,
        'ADV-G35',
        '$.questions.' + questionId,
        'a resolved question became unresolved',
      )
    }
  }
}

const nodesOf = (state) => [...(state?.gates ?? []), ...(state?.landings ?? [])]

function compareRuleInputs(baseState, targetState, problems) {
  const before = byId(nodesOf(baseState))
  const after = byId(nodesOf(targetState))
  for (const [id, baseNode] of before) {
    const targetNode = after.get(id)
    if (!targetNode) continue
    const baseIdentity = semanticIdentity(baseNode)
    const targetIdentity = semanticIdentity(targetNode)
    for (const field of Object.keys(baseIdentity)) {
      if (field === 'id' || field === 'schemaVersion') continue
      if (canonicalText(baseIdentity[field]) === canonicalText(targetIdentity[field])) continue
      problem(
        problems,
        RULE_INPUT_CODES.get(field) ?? 'ADV-G15',
        '$.nodes.' + id + '.' + field,
        'an identity-bearing rule input was mutated in place; a rule input changes only ' +
          'through the replacement protocol',
      )
    }
  }
}

function compareDelivery(baseState, targetState, problems) {
  const before = byId(baseState?.landings)
  const after = byId(targetState?.landings)
  for (const [id, baseLanding] of before) {
    const targetLanding = after.get(id)
    if (!targetLanding) continue
    const path = '$.landings.' + id + '.delivery'
    const from = baseLanding.delivery?.lifecycle
    const to = targetLanding.delivery?.lifecycle
    const legal = LEGAL_DELIVERY_TRANSITIONS.get(from)
    if (legal && !legal.has(to)) {
      problem(
        problems,
        'ADV-G29',
        path + '.lifecycle',
        `${from} -> ${to} is not a legal delivery transition; Complete and Withdrawn are terminal`,
      )
    }

    // Terminal evidence is immutable. Comparing the whole envelope catches a
    // removal, a digest edit, and an attestation swap with one rule.
    if (from === 'Complete') {
      if (
        canonicalText(baseLanding.delivery?.completion) !==
        canonicalText(targetLanding.delivery?.completion)
      ) {
        problem(
          problems,
          'ADV-G29',
          path + '.completion',
          'terminal delivery evidence was mutated or removed after completion',
        )
      }
    }
    if (from === 'Withdrawn') {
      if (
        canonicalText(baseLanding.delivery?.withdrawal) !==
        canonicalText(targetLanding.delivery?.withdrawal)
      ) {
        problem(
          problems,
          'ADV-G29',
          path + '.withdrawal',
          'terminal withdrawal evidence was mutated or removed after withdrawal',
        )
      }
    }

    if (to === 'Complete' && from !== 'Complete') {
      const completion = targetLanding.delivery?.completion
      if (!isObject(completion)) {
        problem(
          problems,
          'ADV-G29',
          path + '.completion',
          'a completion transition carries no envelope',
        )
      } else if (completion.from !== from) {
        // The envelope states the transition it records; a `from` that does not
        // match the base lifecycle is a claim about a revision that never
        // existed.
        problem(
          problems,
          'ADV-G29',
          path + '.completion.from',
          `the envelope records ${String(completion.from)} but the base lifecycle was ${String(from)}`,
        )
      }
    }

    if (to === 'Withdrawn' && from !== 'Withdrawn') {
      const withdrawal = targetLanding.delivery?.withdrawal
      if (!LEGAL_WITHDRAWAL_SOURCES.has(from)) {
        problem(
          problems,
          'ADV-G75',
          path + '.lifecycle',
          `a Withdrawn target requires a Planned or InProgress base, not ${String(from)}`,
        )
      }
      if (!isObject(withdrawal)) {
        problem(
          problems,
          'ADV-G75',
          path + '.withdrawal',
          'a withdrawal transition carries no envelope',
        )
      } else if (withdrawal.from !== from) {
        problem(
          problems,
          'ADV-G75',
          path + '.withdrawal.from',
          `the envelope records ${String(withdrawal.from)} but the base lifecycle was ${String(from)}`,
        )
      }
    }
  }
}

/**
 * Replacement is the only sanctioned way a gate or landing identity may appear
 * after genesis, and the proof is genuinely pairwise.
 *
 * The target-state model already proved the replacement GRAPH: paired shape,
 * digest and attestation validity, acyclicity, currentness, closure. What it
 * cannot see is whether the replaced identity was current BEFORE the change,
 * and whether the identity is new at all. Both are read here.
 */
function compareReplacement(baseState, targetState, problems) {
  const before = byId(nodesOf(baseState))
  const after = byId(nodesOf(targetState))

  const replacedInBase = new Set()
  for (const node of before.values()) {
    if (typeof node.replaces === 'string') replacedInBase.add(node.replaces)
  }

  for (const [id, targetNode] of after) {
    const baseNode = before.get(id)

    if (baseNode) {
      // An existing replacement relationship is itself a rule input: removing,
      // repointing, or reassociating it rewrites history.
      if (canonicalText(baseNode.replaces) !== canonicalText(targetNode.replaces)) {
        problem(
          problems,
          'ADV-G16',
          '$.nodes.' + id + '.replaces',
          'an existing replacement relationship was removed, repointed, or reassociated',
        )
      }
      if (canonicalText(baseNode.replacement) !== canonicalText(targetNode.replacement)) {
        problem(
          problems,
          'ADV-G16',
          '$.nodes.' + id + '.replacement',
          'an existing replacement digest or attestation was edited',
        )
      }
      continue
    }

    // A first appearance after genesis.
    const replaces = targetNode.replaces
    if (typeof replaces !== 'string') {
      problem(
        problems,
        'ADV-G16',
        '$.nodes.' + id,
        'a gate or landing identity first appears after genesis without a replacement ' +
          'relationship; version one has no unlinked node-introduction path',
      )
      continue
    }
    if (!before.has(replaces)) {
      problem(
        problems,
        'ADV-G16',
        '$.nodes.' + id + '.replaces',
        'the replaced identity ' + replaces + ' does not exist in the base revision',
      )
      continue
    }
    if (replacedInBase.has(replaces)) {
      problem(
        problems,
        'ADV-G16',
        '$.nodes.' + id + '.replaces',
        'the replacement target ' +
          replaces +
          ' was already non-current in the base revision; ' +
          'target-state currentness cannot substitute for base-state currentness',
      )
    }
    if (before.get(replaces).kind !== targetNode.kind) {
      problem(
        problems,
        'ADV-G16',
        '$.nodes.' + id + '.kind',
        'a replacement identity must preserve the replaced node kind',
      )
    }
    // Relationship, digest and attestation arrive together or not at all.
    const replacement = targetNode.replacement
    if (
      !isObject(replacement) ||
      !isObject(replacement.attestation) ||
      typeof replacement.digest !== 'string'
    ) {
      problem(
        problems,
        'ADV-G16',
        '$.nodes.' + id + '.replacement',
        'a replacement identity, its relationship, digest and attestation must arrive in the ' +
          'same revision',
      )
    }
  }
}

/**
 * The one genesis exception, admitted by binding.
 *
 * `base carries no registry` is necessary and nowhere near sufficient: every
 * commit before activation lacks a registry. The target's genesis evidence must
 * name this exact base, an equivalent freshness result, and the activation
 * identity. And a registry-less base whose ancestry ONCE held a registry is a
 * revert, not a genesis — version one defines no reactivation.
 */
function evaluateGenesisException({ baseCommit, targetState, ancestry, problems }) {
  const genesis = targetState?.attestations?.genesis

  if (!isObject(genesis) || Object.keys(genesis).length === 0) {
    problem(
      problems,
      'ADV-G41',
      '$.attestations.genesis',
      'the base carries no registry and the target records no genesis attestation; a registry ' +
        'appearing without bound genesis evidence is a deletion or the wrong base, never a ' +
        'second genesis',
    )
    return false
  }

  if (ancestry.status !== PRESENT) {
    problem(
      problems,
      'ADV-G41',
      '$.attestations.genesis',
      'whether the base is post-activation could not be observed; an unanswered repository ' +
        'question is a refusal, not a granted exception',
    )
    return false
  }
  if (ancestry.commits.length > 0) {
    problem(
      problems,
      'ADV-G41',
      '$.attestations.genesis',
      'the supplied registry-less base is post-activation: the registry existed at ' +
        ancestry.commits[0] +
        ' in its ancestry',
    )
    problem(
      problems,
      'ADV-G59',
      '$.attestations.genesis.activationIdentity',
      'a replacement activation after a revert is not a second genesis; version one defines no ' +
        'reactivation protocol',
    )
    return false
  }

  let bound = true
  if (genesis.activationBaseCommit !== baseCommit) {
    problem(
      problems,
      'ADV-G58',
      '$.attestations.genesis.activationBaseCommit',
      'the supplied base ' +
        baseCommit +
        ' is not the bound activation base ' +
        String(genesis.activationBaseCommit) +
        '; an unbound registry-less commit cannot claim ' +
        'the exception',
    )
    bound = false
  }
  if (genesis.activationFreshness?.outcome !== 'equivalent') {
    problem(
      problems,
      'ADV-G58',
      '$.attestations.genesis.activationFreshness.outcome',
      'the exception requires an equivalent activation-freshness result',
    )
    bound = false
  }
  if (!isObject(genesis.activationIdentity)) {
    problem(
      problems,
      'ADV-G58',
      '$.attestations.genesis.activationIdentity',
      'the exception is bound to one activation identity',
    )
    bound = false
  }
  return bound
}

/**
 * Compare two governance revisions.
 *
 * `base` and `target` are `{ present, evaluation }`, where `evaluation` is the
 * shared current-state model's verdict for that revision. Callers supply them;
 * this module never reads the repository.
 */
export function evaluateHistory({
  base,
  target,
  baseCommit,
  targetCommit,
  ancestry = { status: ABSENT, commits: [] },
}) {
  const problems = []

  if (!base?.resolved) {
    problem(
      problems,
      'ADV-G21',
      '$.base',
      'the explicit base did not resolve to a commit; history validation has no fallback to ' +
        'merge-base, HEAD~1, or any inferred revision',
    )
    return { ok: false, problems, comparison: 'refused' }
  }
  if (!target?.resolved) {
    problem(problems, 'ADV-G21', '$.target', 'the target revision did not resolve to a commit')
    return { ok: false, problems, comparison: 'refused' }
  }
  if (baseCommit === targetCommit) {
    problem(
      problems,
      'ADV-G21',
      '$.base',
      'the explicit base selects the target revision itself; a comparison window that contains ' +
        'no change proves nothing and is refused rather than passed',
    )
    return { ok: false, problems, comparison: 'refused' }
  }

  // AN INVALID REVISION DOES NOT SUPPRESS THE PAIRWISE FINDING.
  //
  // Both revisions go through the shared current-state model, and its refusals
  // are reported. They are not, however, a reason to stop: an
  // `Accepted -> Proposed` regression also leaves acceptance evidence on a
  // Proposed decision, so the current model refuses the target for its own
  // reason — and returning there would report the symptom while the regression,
  // the only fact a second revision can establish, went unnamed. The two are
  // independent findings and both are reported.
  const stateProblems = []
  for (const revision of [base, target]) {
    if (revision.present && revision.evaluation && !revision.evaluation.ok) {
      for (const member of revision.evaluation.problems) stateProblems.push(member)
    }
  }

  if (!target.present) {
    problem(
      problems,
      'ADV-G34',
      '$',
      'the registry is absent from the target revision; a registry that once existed cannot ' +
        'disappear',
    )
    for (const member of stateProblems) problems.push(member)
    return { ok: false, problems, comparison: 'refused' }
  }

  if (!base.present) {
    const admitted = evaluateGenesisException({
      baseCommit,
      targetState: target.evaluation?.state,
      ancestry,
      problems,
    })
    for (const member of stateProblems) problems.push(member)
    return {
      ok: admitted && problems.length === 0,
      problems,
      comparison: admitted ? 'genesis' : 'refused',
    }
  }

  const baseState = base.evaluation?.state
  const targetState = target.evaluation?.state

  compareAuthorizationRecords(baseState, targetState, problems)
  compareRecordSurvival(baseState, targetState, problems)
  compareDecisions(baseState, targetState, problems)
  compareResolvers(base, target, problems)
  compareRuleInputs(baseState, targetState, problems)
  compareDelivery(baseState, targetState, problems)
  compareReplacement(baseState, targetState, problems)

  for (const member of stateProblems) problems.push(member)
  return { ok: problems.length === 0, problems, comparison: 'pairwise' }
}

export { LEGAL_ADR_TRANSITIONS, LEGAL_DELIVERY_TRANSITIONS, LEGAL_WITHDRAWAL_SOURCES }
