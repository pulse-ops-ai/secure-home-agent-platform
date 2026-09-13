#!/usr/bin/env node
/**
 * Read-only governance query.
 *
 * Two output forms — a human explanation and JSON — over ONE model. The forms
 * differ in presentation only; a second derivation behind the friendlier output
 * is how two answers start to disagree.
 *
 * THE AXES STAY SEPARATE, AND NOTHING HERE AUTHORIZES.
 *
 *   deliveryState          what the registry records
 *   prerequisiteReadiness  Ready / NotReady, plus the unsatisfied identifiers
 *   authorizationAssessment  PREREQUISITES_NOT_READY, or
 *                            AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION
 *
 * There is no third value. Collapsing readiness into a single "status" is
 * exactly the mistake that turns "nothing blocks this" into "you may start
 * this" — the second is a human decision recorded outside the repository, and
 * no registry state implies it. `AUTHORIZED` is not in this program's
 * vocabulary, and a property test asserts the string never appears in any
 * output.
 *
 * The command writes nothing.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkGovernanceState } from './check-governance-state.mjs'

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_STATE = 'governance/state.json'

const compareText = (left, right) => (left === right ? 0 : left < right ? -1 : 1)

/**
 * The answer for one landing, with every axis named separately.
 *
 * `authorizationAssessment` is null for a terminal delivery: asking whether a
 * completed landing may start is a question about a moment that has passed, and
 * answering it with a prospective value would read as a claim about the past.
 * The historical question is reported as its own field and asserts nothing.
 */
function landingAnswer(landing, derived) {
  const readiness = derived.readiness[landing.id]
  const terminal =
    landing.delivery.lifecycle === 'Complete' || landing.delivery.lifecycle === 'Withdrawn'
  return {
    id: landing.id,
    kind: landing.kind,
    current: readiness?.current ?? false,
    deliveryState: landing.delivery.lifecycle,
    completionPolicy: landing.delivery.completionPolicy,
    authorityAnchor: landing.authorityAnchor,
    prerequisiteReadiness: {
      state: readiness?.state ?? 'NotReady',
      unsatisfied: [...(readiness?.unsatisfied ?? [])].sort(compareText),
    },
    authorizationAssessment: readiness?.authorizationAssessment ?? null,
    historicalAuthorization: terminal
      ? 'RECORDED_DELIVERY_WITHOUT_LOCAL_AUTHORIZATION_CLAIM'
      : null,
  }
}

function gateAnswer(gate, derived) {
  const answer = derived.gates[gate.id]
  return {
    id: gate.id,
    kind: 'gate',
    predicate: gate.predicate,
    satisfied: answer?.satisfied ?? false,
    evaluable: answer?.evaluable ?? false,
  }
}

function questionAnswer(question, derived) {
  const answer = derived.questions[question.id]
  return {
    id: question.id,
    title: question.title,
    severity: question.severity,
    resolved: answer?.resolved ?? false,
    resolver: answer?.resolver ?? null,
    resolvedAt: answer?.resolvedAt ?? null,
  }
}

export function queryGovernanceState({
  root = DEFAULT_ROOT,
  statePath = DEFAULT_STATE,
  node,
} = {}) {
  // ONE evaluation path, the checker's. A query that evaluated the registry
  // with a lighter context of its own would answer questions the checker would
  // have refused — and it is the friendlier output that people would believe.
  const evaluation = checkGovernanceState({ root: resolve(root), statePath })
  if (!evaluation.derived) {
    // A refused registry produces no answer at all. Reporting readiness from a
    // state the checker rejects would be the most dangerous kind of output:
    // confident, well-formed, and derived from something invalid.
    return { ok: false, problems: evaluation.problems }
  }

  const state = evaluation.state
  const derived = evaluation.derived

  const landings = (state.landings ?? [])
    .map((landing) => landingAnswer(landing, derived))
    .sort((a, b) => compareText(a.id, b.id))
  const gates = (state.gates ?? [])
    .map((gate) => gateAnswer(gate, derived))
    .sort((a, b) => compareText(a.id, b.id))
  const questions = (state.questions ?? [])
    .map((question) => questionAnswer(question, derived))
    .sort((a, b) => compareText(a.id, b.id))

  if (node !== undefined) {
    const found =
      landings.find((member) => member.id === node) ?? gates.find((member) => member.id === node)
    if (!found) {
      return {
        ok: false,
        problems: [{ code: 'ADV-G12', path: '$.nodes.' + node, message: 'no such node' }],
      }
    }
    return { ok: true, problems: [], answer: { nodes: [found], gates: [], questions: [] } }
  }

  return { ok: true, problems: [], answer: { nodes: landings, gates, questions } }
}

/**
 * The explanation form.
 *
 * Written so each line names its axis. "Ready" appears next to
 * "authorization: requires external verification" precisely so a reader cannot
 * take the first as the second.
 */
export function explain(answer) {
  const lines = []
  if (answer.questions.length > 0) {
    lines.push('Questions')
    for (const question of answer.questions) {
      lines.push(
        `  ${question.id}  ${question.resolved ? 'resolved' : 'open'}` +
          `${question.resolver === null ? '' : ' by ' + question.resolver}` +
          `  (${question.severity})`,
      )
    }
    lines.push('')
  }
  if (answer.gates.length > 0) {
    lines.push('Gates')
    for (const gate of answer.gates) {
      lines.push(
        `  ${gate.id}  ${gate.satisfied ? 'satisfied' : 'unsatisfied'}` +
          `${gate.evaluable ? '' : ' (predicate not evaluable)'}`,
      )
    }
    lines.push('')
  }
  lines.push('Landings')
  for (const landing of answer.nodes) {
    lines.push(`  ${landing.id}`)
    lines.push(`    delivery state         ${landing.deliveryState}`)
    lines.push(
      `    prerequisite readiness ${landing.prerequisiteReadiness.state}` +
        (landing.prerequisiteReadiness.unsatisfied.length === 0
          ? ''
          : '; unsatisfied: ' + landing.prerequisiteReadiness.unsatisfied.join(', ')),
    )
    lines.push(
      `    authorization          ${
        landing.authorizationAssessment === null
          ? 'not applicable to a terminal delivery'
          : landing.authorizationAssessment
      }`,
    )
    lines.push(
      `    authority anchor       ${JSON.stringify(landing.authorityAnchor)} (external; this ` +
        'command does not verify it)',
    )
  }
  return lines.join('\n')
}

function usage() {
  return [
    'Usage: node scripts/query-governance-state.mjs [--root ROOT] [--state FILE]',
    '                                               [--node ID] [--json]',
    '',
    'Read-only. Reports delivery state, prerequisite readiness and authorization',
    'assessment as separate axes. It never reports authorization as granted.',
  ].join('\n')
}

function main() {
  const argv = process.argv.slice(2)
  const options = { root: DEFAULT_ROOT, state: DEFAULT_STATE, json: false, node: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--root' || argument === '--state' || argument === '--node') {
      options[argument.slice(2)] = argv[index + 1]
      index += 1
    } else if (argument === '--json') {
      options.json = true
    } else if (argument === '--help' || argument === '-h') {
      console.log(usage())
      return
    } else {
      console.error('✗ governance query — unknown argument: ' + argument)
      console.error(usage())
      process.exitCode = 2
      return
    }
  }

  const result = queryGovernanceState({
    root: options.root,
    statePath: options.state,
    node: options.node,
  })
  if (!result.ok) {
    console.error('✗ governance query — ' + result.problems.length + ' refusal(s)')
    for (const problem of result.problems) {
      console.error('    ' + problem.code + ' ' + problem.path + ' — ' + problem.message)
    }
    process.exitCode = 1
    return
  }
  console.log(options.json ? JSON.stringify(result.answer) : explain(result.answer))
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
