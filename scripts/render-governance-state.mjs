#!/usr/bin/env node
/**
 * Deterministic governance projections.
 *
 * A projection is OUTPUT, never an authority. Everything rendered here is
 * derived from the registry by the shared model; nothing is read back out of a
 * rendered document and nothing here decides a governance fact.
 *
 * Two modes, deliberately separate invocations:
 *   --check  renders and compares bytes. It writes nothing, ever.
 *   --write  renders and writes.
 *
 * The separation is the point. A checker that repairs what it finds cannot
 * report drift, because after the first run there is never any: a hand edit
 * inside a generated region would be silently reverted in CI and the author
 * would never learn their edit had no effect.
 *
 * TARGETS AND MARKERS ARE REGISTERED. An unregistered target, or a
 * generated-region marker the renderer does not own, is an error rather than a
 * file it happens not to visit — an unowned marker is a region nobody
 * regenerates and therefore a hand-maintained copy wearing a generated label.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkGovernanceState } from './check-governance-state.mjs'
import { decodeUtf8 } from './governance/model/index.mjs'
import { readContainedBytes } from './governance/git-tree/contained-read.mjs'

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_STATE = 'governance/state.json'

const BEGIN = (region) => `<!-- governance:begin ${region} -->`
const END = (region) => `<!-- governance:end ${region} -->`

/** Any governance marker, so an UNREGISTERED one can be named rather than skipped. */
const ANY_MARKER = /<!--\s*governance:(begin|end)\s+([A-Za-z0-9][A-Za-z0-9-]*)\s*-->/gu

const compareText = (left, right) => (left === right ? 0 : left < right ? -1 : 1)

/**
 * Markdown table-cell escaping, in the one order that is actually safe.
 *
 * BACKSLASHES FIRST. Escaping only the pipe is incomplete: a value ending in a
 * backslash turns the escape we add into an escaped backslash, and the pipe
 * behind it becomes a live column separator again — so authored free text like
 * a question title could inject a column into a generated projection. Doubling
 * backslashes before adding any of our own removes that.
 *
 * Newlines collapse to a space for the same reason: a line break inside a cell
 * ends the table row, and the rest of the value would render as a new row of
 * the generated region.
 */
const cell = (value) =>
  String(value).replace(/\\/gu, '\\\\').replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ')

function renderDecisionLifecycle(derived, state) {
  const lines = ['| Decision | Lifecycle | Resolves |', '| --- | --- | --- |']
  for (const adr of [...(state.adrs ?? [])].sort((a, b) => compareText(a.id, b.id))) {
    const resolves = [...(adr.resolves ?? [])].sort(compareText)
    lines.push(
      `| ${cell(adr.id)} | ${cell(adr.lifecycle)} | ${resolves.length === 0 ? '—' : cell(resolves.join(', '))} |`,
    )
  }
  void derived
  return lines.join('\n')
}

function renderQuestionSummary(derived, state) {
  const lines = [
    '| Question | Title | Severity | State | Resolved by |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const question of [...(state.questions ?? [])].sort((a, b) => compareText(a.id, b.id))) {
    const answer = derived.questions[question.id]
    lines.push(
      `| ${cell(question.id)} | ${cell(question.title)} | ${cell(question.severity)} | ` +
        `${answer?.resolved ? 'Resolved' : 'Open'} | ` +
        `${answer?.resolver === null || answer?.resolver === undefined ? '—' : cell(answer.resolver)} |`,
    )
  }
  return lines.join('\n')
}

function renderResolutionBanners(derived, state) {
  const lines = []
  for (const question of [...(state.questions ?? [])].sort((a, b) => compareText(a.id, b.id))) {
    const answer = derived.questions[question.id]
    lines.push(
      `- **${cell(question.id)}** — ${answer?.resolved ? 'resolved' : 'open'}` +
        `${answer?.resolvedAt === null || answer?.resolvedAt === undefined ? '' : ' on ' + cell(answer.resolvedAt)}` +
        `; ${cell(question.title)}`,
    )
  }
  return lines.join('\n')
}

function renderStateDocument(derived, state) {
  const lines = [
    '# Governance state',
    '',
    'Generated from `governance/state.json`. Do not edit by hand.',
    '',
    '## Decisions',
    '',
    renderDecisionLifecycle(derived, state),
    '',
    '## Questions',
    '',
    renderQuestionSummary(derived, state),
    '',
    '## Program',
    '',
    '| Node | Kind | Delivery | Readiness | Unsatisfied |',
    '| --- | --- | --- | --- | --- |',
  ]
  const gates = [...(state.gates ?? [])].sort((a, b) => compareText(a.id, b.id))
  for (const gate of gates) {
    lines.push(
      `| ${cell(gate.id)} | gate | — | ${derived.gates[gate.id]?.satisfied ? 'Satisfied' : 'Unsatisfied'} | — |`,
    )
  }
  for (const landing of [...(state.landings ?? [])].sort((a, b) => compareText(a.id, b.id))) {
    const readiness = derived.readiness[landing.id]
    const unsatisfied = [...(readiness?.unsatisfied ?? [])].sort(compareText)
    lines.push(
      `| ${cell(landing.id)} | ${cell(landing.kind)} | ${cell(landing.delivery.lifecycle)} | ` +
        `${cell(readiness?.state ?? '—')} | ${unsatisfied.length === 0 ? '—' : cell(unsatisfied.join(', '))} |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * The closed projection registry.
 *
 * `whole-file` targets are generated end to end; `region` targets carry exactly
 * the named generated regions and are otherwise hand-authored prose.
 */
export const PROJECTIONS = [
  { target: 'governance/STATE.md', mode: 'whole-file', region: null, render: renderStateDocument },
  {
    target: 'docs/decisions/INDEX.md',
    mode: 'region',
    region: 'decision-lifecycle',
    render: renderDecisionLifecycle,
  },
  {
    target: 'docs/architecture/unresolved-decisions.md',
    mode: 'region',
    region: 'question-summary',
    render: renderQuestionSummary,
  },
  {
    target: 'docs/architecture/unresolved-decisions.md',
    mode: 'region',
    region: 'resolution-banners',
    render: renderResolutionBanners,
  },
]

export const REGISTERED_REGIONS = new Set(
  PROJECTIONS.filter((projection) => projection.region !== null).map(
    (projection) => projection.region,
  ),
)
export const REGISTERED_TARGETS = new Set(PROJECTIONS.map((projection) => projection.target))

class RenderError extends Error {
  constructor(code, path, message) {
    super(message)
    this.code = code
    this.path = path
  }
}

/**
 * Replace exactly one registered region, preserving every byte outside it.
 *
 * A missing, duplicated, or inverted marker pair is an error rather than a
 * best-effort splice: guessing where a generated region begins is how a
 * generated region quietly grows to swallow hand-authored prose.
 */
function spliceRegion(document, region, body) {
  const begin = BEGIN(region)
  const end = END(region)
  const beginAt = document.indexOf(begin)
  const endAt = document.indexOf(end)
  if (beginAt === -1 || endAt === -1) {
    throw new RenderError('ADV-G22', region, 'the registered region markers are missing')
  }
  if (document.indexOf(begin, beginAt + 1) !== -1 || document.indexOf(end, endAt + 1) !== -1) {
    throw new RenderError('ADV-G22', region, 'the registered region markers are duplicated')
  }
  if (endAt < beginAt) {
    throw new RenderError('ADV-G22', region, 'the region end marker precedes its begin marker')
  }
  return document.slice(0, beginAt + begin.length) + '\n' + body + '\n' + document.slice(endAt)
}

/** Every governance marker a document carries, registered or not. */
export function markersIn(text) {
  const found = []
  for (const match of text.matchAll(ANY_MARKER)) found.push(match[2])
  return found
}

function readTarget(root, target) {
  const bytes = readContainedBytes(root, target)
  if (bytes === undefined) return undefined
  return decodeUtf8(bytes)
}

/**
 * Render every registered projection for one state.
 *
 * Returns `Map<target, { expected, actual }>`. Rendering is pure: this function
 * reads targets and produces bytes, and never writes.
 */
export function renderProjections({ root, state, derived }) {
  const results = new Map()
  for (const projection of PROJECTIONS) {
    const existing = readTarget(root, projection.target)
    if (projection.mode === 'whole-file') {
      results.set(projection.target, {
        expected: projection.render(derived, state),
        actual: existing,
      })
      continue
    }
    if (existing === undefined) {
      throw new RenderError(
        'ADV-G22',
        projection.target,
        'a registered projection target is missing',
      )
    }
    const current = results.get(projection.target)?.expected ?? existing
    results.set(projection.target, {
      expected: spliceRegion(current, projection.region, projection.render(derived, state)),
      actual: existing,
    })
  }
  return results
}

/**
 * A marker the renderer does not own.
 *
 * Scanned over the registered targets only. A wider scan would be defense in
 * depth at best — this is the mechanical half, and the contract is explicit
 * that human review owns unregistered prose.
 */
function unregisteredMarkers(root, problems) {
  for (const target of REGISTERED_TARGETS) {
    const text = readTarget(root, target)
    if (text === undefined) continue
    for (const region of markersIn(text)) {
      if (REGISTERED_REGIONS.has(region)) continue
      problems.push({
        code: 'ADV-G22',
        path: target + '#' + region,
        message:
          'the document carries generated-region markers the renderer does not register; an ' +
          'unowned region is a hand-maintained copy wearing a generated label',
      })
    }
  }
}

export function renderGovernanceState({
  root = DEFAULT_ROOT,
  statePath = DEFAULT_STATE,
  write = false,
} = {}) {
  const resolvedRoot = resolve(root)
  const problems = []

  // The checker's evaluation, not a second one: a projection is a view of what
  // the checker accepts, and the two must never be able to disagree about it.
  const evaluation = checkGovernanceState({ root: resolvedRoot, statePath })
  if (!evaluation.derived) {
    // Rendering a refused registry would publish a projection of a state the
    // checker does not accept.
    return { ok: false, wrote: [], problems: evaluation.problems }
  }

  unregisteredMarkers(resolvedRoot, problems)

  let rendered
  try {
    rendered = renderProjections({
      root: resolvedRoot,
      state: evaluation.state,
      derived: evaluation.derived,
    })
  } catch (error) {
    problems.push({
      code: error.code ?? 'ADV-G22',
      path: error.path ?? statePath,
      message: error.message,
    })
    return { ok: false, wrote: [], problems }
  }

  const wrote = []
  for (const [target, { expected, actual }] of rendered) {
    if (expected === actual) continue
    if (!write) {
      problems.push({
        code: 'ADV-G36',
        path: target,
        message:
          actual === undefined
            ? 'the registered projection has never been generated'
            : 'the generated projection no longer matches what the registry renders',
      })
      continue
    }
    writeFileSync(resolve(resolvedRoot, target), expected, 'utf8')
    wrote.push(target)
  }

  return { ok: problems.length === 0, wrote, problems }
}

function usage() {
  return [
    'Usage: node scripts/render-governance-state.mjs --check [--root ROOT] [--state FILE]',
    '       node scripts/render-governance-state.mjs --write [--root ROOT] [--state FILE]',
    '',
    '  --check  render and compare bytes. Writes nothing.',
    '  --write  render and write. A separate invocation, deliberately.',
  ].join('\n')
}

function main() {
  const argv = process.argv.slice(2)
  const options = { root: DEFAULT_ROOT, state: DEFAULT_STATE, mode: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--root' || argument === '--state') {
      options[argument.slice(2)] = argv[index + 1]
      index += 1
    } else if (argument === '--check' || argument === '--write') {
      if (options.mode !== undefined && options.mode !== argument.slice(2)) {
        console.error('✗ governance projections — --check and --write are separate invocations')
        process.exitCode = 2
        return
      }
      options.mode = argument.slice(2)
    } else if (argument === '--help' || argument === '-h') {
      console.log(usage())
      return
    } else {
      console.error('✗ governance projections — unknown argument: ' + argument)
      console.error(usage())
      process.exitCode = 2
      return
    }
  }
  if (options.mode === undefined) {
    console.error('✗ governance projections — one of --check or --write is required')
    console.error(usage())
    process.exitCode = 2
    return
  }

  const result = renderGovernanceState({
    root: options.root,
    statePath: options.state,
    write: options.mode === 'write',
  })
  if (!result.ok) {
    console.error('✗ governance projections — ' + result.problems.length + ' refusal(s)')
    for (const problem of result.problems) {
      console.error('    ' + problem.code + ' ' + problem.path + ' — ' + problem.message)
    }
    process.exitCode = 1
    return
  }
  console.log(
    options.mode === 'write'
      ? '✓ governance projections — ' + result.wrote.length + ' written'
      : '✓ governance projections — byte-for-byte no-op',
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

export { RenderError, BEGIN, END }
