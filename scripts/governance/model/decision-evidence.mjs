/** D12 temporal semantics, shared by extraction and current/history validation.
 * Observers supply immutable bytes; this module owns selection and agreement.
 * Local proof does not authenticate the human whose declaration is retained.
 */
import { canonicalSerialize, decodeUtf8 } from './canonical.mjs'
import { contentDigest } from './digests.mjs'

export const DECISION_INDEX = 'docs/decisions/INDEX.md'
export const DECISION_PLAN = 'openspec/changes/governance-state-substrate/'
export const DECISION_RULE = 'governed-decision-date-transition-v1'
export const ARCHIVE_STAGE = '83e6cd8fa7d2d05ab246a39de039129b4056966d'
export const TEMPORAL_SOURCE = 'c82fda72927464d813ec769aee53f4079ebe3b20'
export const PREPARED_ARCHIVES = new Map([
  ['runner/L4', 'openspec/changes/archive/2026-09-13-runner-control-orchestration'],
  ['runner/L5', 'openspec/changes/archive/2026-09-13-runner-image-lineage'],
  ['runner/L7', 'openspec/changes/archive/2026-09-13-runner-platform-adapters'],
])
export const BRIDGE_PATH = DECISION_PLAN + 'bridge-evidence.json'
export const BRIDGE_RECORDS = [BRIDGE_PATH, DECISION_PLAN + 'bridge-verification.md']
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const textOf = (bytes) => decodeUtf8(bytes)
const headerOf = (text) => text.split(/^\s*---\s*$/mu)[0]
export function decisionStatus(bytes) {
  const matches = [...headerOf(textOf(bytes)).matchAll(/^- \*\*Status:\*\* (\w+)$/gmu)]
  if (matches.length !== 1) throw new Error('missing or duplicate lifecycle header')
  return matches[0][1]
}
const local = (value) => ({ class: 'local-git-commit', value })
const same = (a, b) => canonicalSerialize(a) === canonicalSerialize(b)

export function isDecisionDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function one(values, description) {
  const distinct = [...new Set(values)]
  if (distinct.length !== 1) throw new Error('missing or conflicting ' + description)
  return distinct[0]
}

/** Human declarations only: never author/committer names or metadata dates. */
export function decisionDeclaration(path, bytes, indexBytes) {
  const header = headerOf(textOf(bytes))
  const id = /^# (ADR-\d{4}): /mu.exec(header)?.[1]
  const lifecycle = decisionStatus(bytes)
  if (!id || !['Accepted', 'Rejected'].includes(lifecycle))
    throw new Error('not an Accepted/Rejected ADR: ' + path)
  const dates = []
  const actors = []
  const readDate = (value) => {
    if (!isDecisionDate(value)) throw new Error('invalid governed decision date: ' + id)
    dates.push(value)
  }
  const readActor = (value) => {
    const found = [...value.matchAll(/@[A-Za-z0-9][A-Za-z0-9-]*/gu)].map((m) => m[0])
    if (!found.length) throw new Error('unparseable declared actor: ' + id)
    actors.push(...found)
  }
  let headerDate = false
  for (const line of header.split('\n')) {
    if (new RegExp('^\\s*[-*]?\\s*\\**' + lifecycle + '\\**\\s*:', 'iu').test(line)) {
      const match = new RegExp('^- \\*\\*' + lifecycle + ':\\*\\* (.+)$', 'u').exec(line)
      if (!match) throw new Error('unparseable decision-date header: ' + id)
      if (headerDate) throw new Error('duplicate decision-date header: ' + id)
      readDate(match[1])
      headerDate = true
    }
    const actor = /^- \*\*(?:Deciders?|Accepted by|Rejected by):\*\* (.+)$/u.exec(line)
    if (/^\s*[-*]?\s*\**(?:Deciders?|Accepted by|Rejected by)\**\s*:/iu.test(line) && !actor)
      throw new Error('unparseable actor declaration: ' + id)
    if (actor) readActor(actor[1])
  }
  const index = indexBytes === undefined ? '' : textOf(indexBytes)
  const headings = [...index.matchAll(/^#{2,3} (.+)$/gmu)]
  const indexRecords = []
  for (let i = 0; i < headings.length; i += 1) {
    const title = headings[i][1]
    const section = index.slice(headings[i].index, headings[i + 1]?.index ?? index.length)
    const scope = /^\| \*\*Scope\*\* \| (.+) \|$/mu.exec(section)?.[1] ?? ''
    const range = /^ADR-(\d{4}) (?:…|through) ADR-(\d{4}), as one set$/u.exec(scope)
    const number = Number(id.slice(4))
    if (!(
      title === id + ' ' + (lifecycle === 'Accepted' ? 'acceptance' : 'rejection') + ' record' ||
      (title === 'Acceptance record' &&
        range &&
        number >= Number(range[1]) &&
        number <= Number(range[2]))
    ))
      continue
    const declarations = [
      ...section.matchAll(new RegExp('^\\| \\*\\*' + lifecycle + '\\*\\* \\| (.+) \\|$', 'gmu')),
    ]
    const by = [
      ...section.matchAll(new RegExp('^\\| \\*\\*' + lifecycle + ' by\\*\\* \\| (.+) \\|$', 'gmu')),
    ]
    if (declarations.length !== 1 || by.length !== 1)
      throw new Error('incomplete/duplicate structured INDEX decision record: ' + id)
    readDate(declarations[0][1])
    readActor(by[0][1])
    indexRecords.push(title)
  }
  return {
    id,
    lifecycle,
    decisionDate: one(dates, id + ' decision date'),
    actor: one(actors, id + ' declared actor'),
    headerDate,
    indexRecords,
  }
}

function regular(snapshot, path) {
  const entry = snapshot.entries.get(path)
  if (!entry?.bytes || entry.mode !== '100644')
    throw new Error('unavailable regular source: ' + path)
  return entry.bytes
}

/** Reviewed historical selection is read from its bound planning source, not
 * guessed from first-main occurrence or the date that happens to match. */
export function reviewedDecisionSelections(snapshot, context) {
  const design = textOf(regular(snapshot, DECISION_PLAN + 'design.md'))
  const selections = new Map()
  for (const match of design.matchAll(
    /^\| (ADR-\d{4})(?:–(ADR-\d{4}))? \| `(\d{4}-\d{2}-\d{2})` \| `([0-9a-f]{40})` \| `([^`]+)` \|$/gmu,
  )) {
    const first = Number(match[1].slice(4)),
      last = Number((match[2] ?? match[1]).slice(4))
    if (last < first || last - first > 9999) throw new Error('invalid reviewed selection range')
    for (let n = first; n <= last; n++) {
      const id = 'ADR-' + String(n).padStart(4, '0')
      if (selections.has(id)) throw new Error('duplicate reviewed transition selection: ' + id)
      selections.set(id, { revision: match[4], decisionDate: match[3], gitCommitterAt: match[5] })
    }
  }
  // D13 is historical receipt replay, never a permission to perform a bridge.
  // The exact pair commit has receipt.base as its sole parent. A main delivery
  // merge containing the same bytes cannot become another acceptance object.
  if (snapshot.entries.has(BRIDGE_PATH)) {
    const receiptBytes = regular(snapshot, BRIDGE_PATH)
    const receipt = JSON.parse(textOf(receiptBytes))
    if (
      receipt.preimage?.contract !== 'pre-registry-adr-pair-v1' ||
      !same(
        receipt.preimage.subjects?.map((s) => s.id),
        ['ADR-0023', 'ADR-0024'],
      )
    )
      throw new Error('invalid historical bridge subject binding')
    const matches = context.commitsChangingPath(snapshot.commit, BRIDGE_PATH).filter((revision) => {
      const commit = context.readCommit(revision)
      return (
        same(commit.parents, [receipt.preimage.base.value]) &&
        contentDigest(regular(context.readSnapshot(revision), BRIDGE_PATH)) ===
          contentDigest(receiptBytes)
      )
    })
    if (matches.length !== 1)
      throw new Error('missing or ambiguous exact historical pair transition')
    for (const subject of receipt.preimage.subjects) {
      if (selections.has(subject.id)) throw new Error('duplicate pair selection')
      const bytes = regular(snapshot, subject.path)
      if (contentDigest(bytes) !== subject.contentDigest)
        throw new Error('historical bridge decided bytes differ')
      selections.set(subject.id, { revision: matches[0], bridge: receipt })
    }
  }
  return selections
}

function sourceRecord(snapshot, path, selector) {
  return {
    path,
    revision: snapshot.commit,
    contentSha256: contentDigest(regular(snapshot, path)),
    selector,
  }
}

/** Observe one selected transition. An explicit conflicting message date is
 * refused; Git prose never fills a missing structural human declaration. */
function observeDecision(path, snapshot, selection, context) {
  if (!selection) throw new Error('NO_REVIEWED_TRANSITION_SELECTION')
  const bytes = regular(snapshot, path)
  const declaration = decisionDeclaration(path, bytes, regular(snapshot, DECISION_INDEX))
  const commit = context.readCommit(selection.revision)
  if (commit.parents.length !== 1)
    throw new Error('selected object is not an exact single-parent transition')
  const transition = context.readSnapshot(selection.revision)
  const predecessor = context.readSnapshot(commit.parents[0])
  if (decisionStatus(regular(predecessor, path)) !== 'Proposed')
    throw new Error('selected predecessor is not Proposed')
  const decided = regular(transition, path)
  if (contentDigest(decided) !== contentDigest(bytes))
    throw new Error('selected exact decided bytes differ')
  const declared = decisionDeclaration(path, decided, regular(transition, DECISION_INDEX))
  if (declared.decisionDate !== declaration.decisionDate || declared.actor !== declaration.actor)
    throw new Error('conflicting source/transition decision declarations')
  if (selection.decisionDate && selection.decisionDate !== declared.decisionDate)
    throw new Error('reviewed decision date differs')
  if (selection.gitCommitterAt && selection.gitCommitterAt !== commit.gitCommitterAt)
    throw new Error('reviewed encoded committer timestamp differs')
  const message = textOf(commit.message)
  const dates = [
    ...message.matchAll(
      new RegExp(
        declaration.id +
          '(?:\\s+[^\\n]{0,80}?)?\\s+(?:accepted|rejected)(?: on)?\\s+(\\d{4}-\\d{2}-\\d{2})',
        'giu',
      ),
    ),
  ].map((m) => m[1])
  if (dates.some((date) => date !== declaration.decisionDate))
    throw new Error('conflicting transition message decision date')
  const sources = []
  for (const [view, record] of [
    [snapshot, declaration],
    [transition, declared],
  ]) {
    // Even a header without a date still carries actor/lifecycle declarations.
    sources.push(sourceRecord(view, path, 'adr-decision-header-v1'))
    if (record.indexRecords.length)
      sources.push(sourceRecord(view, DECISION_INDEX, 'index-decision-record-v1'))
  }
  const distinct = [...new Map(sources.map((s) => [canonicalSerialize(s), s])).values()].sort(
    (a, b) =>
      ['path', 'revision', 'contentSha256', 'selector'].map((f) => cmp(a[f], b[f])).find(Boolean) ??
      0,
  )
  const committerUtcDateDiffers = commit.gitCommitterAt.slice(0, 10) !== declared.decisionDate
  return {
    adrId: declaration.id,
    decisionDate: declared.decisionDate,
    actor: declared.actor,
    sources: distinct,
    transition: {
      identity: local(selection.revision),
      predecessorIdentity: local(commit.parents[0]),
      contentDigest: contentDigest(decided),
      messageSha256: contentDigest(commit.message),
      gitAuthorAt: commit.gitAuthorAt,
      gitCommitterAt: commit.gitCommitterAt,
    },
    extractionRule: DECISION_RULE,
    classification: 'locally-verified',
    committerUtcDateDiffers,
    disposition: null,
  }
}

/** The disposition is reviewed human provenance, not generated authorization. */
export function decisionDivergenceDisposition(row) {
  return {
    kind: 'decision-date-git-committer-date-divergence-v1',
    decisionDate: row.decisionDate,
    committerUtcDate: row.transition.gitCommitterAt.slice(0, 10),
    authority: {
      type: 'task-contract',
      repository: 'pulse-ops-ai/secure-home-agent-platform',
      id: DECISION_PLAN + 'design.md#d123-generic-extraction-and-the-positive-historical-corpus',
    },
    rationale:
      'The agreeing structural decision records and exact transition declare ' +
      row.decisionDate +
      '; its encoded Git committer UTC date differs. This comparison establishes neither actual recording time nor human identity. The source-bound disposition requires independent manual provenance review.',
  }
}

export function auditDecisionEvidence(snapshot, context) {
  const observations = [],
    problems = []
  let selections
  try {
    selections = reviewedDecisionSelections(context.selectionSnapshot ?? snapshot, context)
  } catch (error) {
    problems.push({ id: '$.selection', reason: error.message })
    selections = new Map()
  }
  for (const [path, entry] of [...snapshot.entries].sort(([a], [b]) => cmp(a, b))) {
    if (!/^docs\/decisions\/ADR-\d{4}-.+\.md$/u.test(path)) continue
    const id = /ADR-\d{4}/u.exec(path)[0]
    try {
      const status = decisionStatus(entry.bytes)
      if (status === 'Proposed') continue
      if (!['Accepted', 'Rejected'].includes(status))
        throw new Error('unparseable terminal lifecycle')
      const row = observeDecision(path, snapshot, selections.get(id), context)
      if (row.committerUtcDateDiffers) row.disposition = decisionDivergenceDisposition(row)
      observations.push(row)
    } catch (error) {
      problems.push({ id, reason: error.message })
    }
  }
  return {
    ok: problems.length === 0,
    observations,
    problems,
    sourceSnapshotIdentity: local(snapshot.commit),
    manualProvenance:
      'Local verification establishes exact objects, bytes and encoded Git metadata only; human authorship and disposition review remain independent manual provenance.',
  }
}

/** Re-observe independently: rehashing a submitted row cannot change selection,
 * source coverage, metadata, date/actor agreement, or decided-byte identity. */
export function validateDecisionEvidence(seed, manifest, context, problems) {
  const refuse = (message) =>
    problems.push({ code: 'ADV-G104', path: '$.sourceManifest.decisionEvidence', message })
  if (!Array.isArray(manifest.decisionEvidence)) {
    refuse('complete closed decisionEvidence set required')
    return
  }
  try {
    const audit = auditDecisionEvidence(
      context.readSnapshot(manifest.sourceSnapshotIdentity.value),
      { ...context, selectionSnapshot: context.readSnapshot(TEMPORAL_SOURCE) },
    )
    for (const problem of audit.problems) refuse(problem.id + ': ' + problem.reason)
    const expected = audit.observations
    if (!same(manifest.decisionEvidence, expected))
      refuse(
        'decision evidence differs from independently observed complete source/transition corpus',
      )
    const terminal = seed.adrs.filter((adr) => adr.acceptance)
    if (!same(terminal.map((adr) => adr.id).sort(), expected.map((row) => row.adrId).sort()))
      refuse('decision evidence coverage differs from terminal ADRs')
    for (const adr of terminal) {
      const row = expected.find((item) => item.adrId === adr.id)
      if (
        !row ||
        adr.acceptance.decisionDate !== row.decisionDate ||
        adr.acceptance.actor !== row.actor ||
        adr.acceptance.contentDigest !== row.transition.contentDigest ||
        !same(adr.acceptance.reviewedIdentity, row.transition.identity)
      )
        refuse('seed decision evidence disagrees with exact historical sources: ' + adr.id)
    }
  } catch (error) {
    refuse(error.message)
  }
}
