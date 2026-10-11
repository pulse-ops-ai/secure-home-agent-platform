/** Closed genesis and current inventories. Discovery scans every tracked byte. */
import { canonicalSerialize, decodeUtf8, isObject, parseStrictJson } from './canonical.mjs'
import { BRIDGE_RECORDS } from './decision-evidence.mjs'
import { CANDIDATE_PATHS } from './digests.mjs'
import { isCanonicalRepoPath } from './paths.mjs'

export const CONSUMER_DISPOSITIONS = Object.freeze([
  'generated-region',
  'stable-pointer',
  'historical-record',
  'retained-semantic-prose',
  'not-a-governance-consumer',
])

// D7.2c owns the path/explanation set, not knowledge-review metadata or byte
// pins. The frozen inventory selects these paths; its manifest's S witnesses
// the exact content adjudicated by the reviewed correction.
export const RETAINED_SEMANTIC_KNOWLEDGE = Object.freeze([
  Object.freeze({
    path: 'knowledge/platform/governance/decisions.md',
    explanation: 'Explains how decisions change and explicitly avoids individual decision state.',
  }),
  Object.freeze({
    path: 'knowledge/platform/governance/precedence.md',
    explanation:
      'Explains precedence and makes portable knowledge subordinate to governed contracts.',
  }),
  Object.freeze({
    path: 'knowledge/platform/worker-conventions/placement.md',
    explanation:
      'Explains durable placement conventions and carries no live worker or program state.',
  }),
])

function retainedModelKnowledgePaths() {
  const paths = RETAINED_SEMANTIC_KNOWLEDGE.map(({ path }) => path).sort()
  if (new Set(paths).size !== paths.length)
    throw new Error('D7.2c: frozen/model retained path-set mismatch: duplicate model path')
  return paths
}

/** The existing reason's contract-specific prefix selects from frozen data.
 * The model is a conformance assertion, never an intersection or discovery filter.
 */
export function retainedSemanticKnowledgePaths(inventory) {
  const frozenPaths = inventory.rows
    .filter(
      (row) =>
        row.disposition === 'retained-semantic-prose' &&
        typeof row.retainedReason === 'string' &&
        row.retainedReason.startsWith(
          'Exact-byte-reviewed portable-knowledge source, governed separately by ADR-0016.',
        ),
    )
    .map((row) => row.path)
    .sort()
  const modelPaths = retainedModelKnowledgePaths()
  if (
    new Set(frozenPaths).size !== frozenPaths.length ||
    canonicalSerialize(frozenPaths) !== canonicalSerialize(modelPaths)
  )
    throw new Error('D7.2c: frozen/model retained path-set mismatch')
  return frozenPaths
}

/** Before extraction may retain prose, compare inventory bytes with bound S. */
export function requireRetainedSemanticKnowledgeBytes(snapshot, sourceSnapshot) {
  // Once an inventory exists, re-extraction must conform to its frozen set too.
  // Initial extraction (before a candidate exists) uses the reviewed model set.
  const [consumerPath] = CANDIDATE_PATHS
  const frozen = snapshot.entries.get(consumerPath)
  const paths = frozen
    ? retainedSemanticKnowledgePaths(parseStrictJson(decodeUtf8(frozen.bytes)))
    : retainedModelKnowledgePaths()
  for (const path of paths) {
    const actual = snapshot.entries.get(path)
    const witness = sourceSnapshot.entries.get(path)
    if (
      actual?.mode !== '100644' ||
      witness?.mode !== '100644' ||
      !(actual.bytes instanceof Uint8Array) ||
      !(witness.bytes instanceof Uint8Array) ||
      !Buffer.from(actual.bytes).equals(Buffer.from(witness.bytes))
    )
      throw new Error('D7.2c: retained knowledge source changed; semantic review required: ' + path)
  }
}

const CLAIMS = [
  [
    'decision-lifecycle',
    /(?:ADR-\d{4}[\s\S]{0,160}\b(?:Accepted|Proposed|Superseded|Rejected)\b|(?:accepted|proposed) (?:ADR|set|decision))/iu,
  ],
  [
    'question-resolution',
    /(?:\bU(?:[1-9]|1[01])\b[\s\S]{0,120}\b(?:open|closed|resolved|unresolved)|(?:open|closed|resolved|unresolved)[\s\S]{0,80}\bU(?:[1-9]|1[01])\b)/iu,
  ],
  [
    'program-state',
    /(?:GATE-U[46]|\bL(?:[2-9]|10)\b[\s\S]{0,100}\b(?:Complete|Planned|InProgress|landed|blocked|next|waits|ready|prerequisite))/iu,
  ],
]

export function discoverConsumers(snapshot) {
  const result = []
  for (const [path, entry] of snapshot.entries) {
    if (!(entry.bytes instanceof Uint8Array))
      throw new Error('ADV-G46: unreadable tracked entry: ' + path)
    let text
    try {
      text = decodeUtf8(entry.bytes)
    } catch {
      // Still scan ASCII claims in arbitrary tracked bytes. Appending an
      // invalid UTF-8 byte must not hide an otherwise readable governance copy.
      text = Buffer.from(entry.bytes).toString('latin1')
    }
    const factClasses = CLAIMS.filter(([, pattern]) => pattern.test(text))
      .map(([name]) => name)
      .sort()
    if (factClasses.length) result.push({ path, factClasses })
  }
  return result.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

export function consumerCounts(inventory) {
  return Object.fromEntries(
    CONSUMER_DISPOSITIONS.map((disposition) => [
      disposition,
      inventory.rows.filter((row) => row.disposition === disposition).length,
    ]),
  )
}

export function validateConsumerInventory(
  inventory,
  snapshot,
  problems = [],
  historicalSnapshot = snapshot,
) {
  const add = (code, path, message) => problems.push({ code, path, message })
  const start = problems.length
  if (
    !isObject(inventory) ||
    inventory.schemaVersion !== 1 ||
    !Array.isArray(inventory.rows) ||
    Object.keys(inventory).sort().join(',') !== 'rows,schemaVersion'
  ) {
    add('ADV-G46', '$.consumers', 'inventory is a closed version-one rows object')
    return false
  }
  const seen = new Set()
  const discovered = new Map(discoverConsumers(snapshot).map((row) => [row.path, row.factClasses]))
  for (const row of inventory.rows) {
    const path = '$.consumers.' + row?.path
    if (
      !isObject(row) ||
      Object.keys(row).sort().join(',') !==
        'disposition,factClasses,generatedRegions,historicalIdentity,migrationLanding,path,retainedReason'
    ) {
      add('ADV-G46', path, 'inventory row has unknown or missing fields')
      continue
    }
    if (seen.has(row.path) || !snapshot.entries.has(row.path))
      add('ADV-G46', path, 'duplicate or absent inventory path')
    seen.add(row.path)
    if (!CONSUMER_DISPOSITIONS.includes(row.disposition))
      add('ADV-G46', path, 'unknown disposition')
    if (canonicalSerialize(row.factClasses) !== canonicalSerialize(discovered.get(row.path) ?? []))
      add('ADV-G46', path, 'fact classes differ from complete tracked-file discovery')
    if (!discovered.has(row.path) && row.disposition !== 'not-a-governance-consumer')
      add('ADV-G46', path, 'only an exact classified exclusion may have no detected claim')
    if (row.migrationLanding !== 'PR-3')
      add('ADV-G46', path, 'the atomic migration belongs to PR-3')
    if (
      !Array.isArray(row.generatedRegions) ||
      (row.disposition === 'generated-region') !== row.generatedRegions.length > 0
    )
      add('ADV-G46', path, 'generated region identifiers belong only to generated-region rows')
    if (
      ['retained-semantic-prose', 'not-a-governance-consumer', 'historical-record'].includes(
        row.disposition,
      ) &&
      (typeof row.retainedReason !== 'string' || !row.retainedReason.trim())
    )
      add('ADV-G47', path, 'retained material needs a specific reason')
    if (row.disposition === 'historical-record') {
      const archived = row.path.startsWith('openspec/changes/archive/')
      const acceptedDecision =
        /^docs\/decisions\/ADR-\d{4}-.+\.md$/u.test(row.path) &&
        /^- \*\*Status:\*\* Accepted$/mu.test(
          decodeUtf8(snapshot.entries.get(row.path)?.bytes ?? new Uint8Array()),
        )
      const recordedEvidence =
        row.path.startsWith('docs/spikes/') ||
        row.path.startsWith('openspec/specs/') ||
        BRIDGE_RECORDS.includes(row.path)
      // No blanket active-change exemption. An extra identity string is not proof.
      if (!archived && !acceptedDecision && !recordedEvidence)
        add('ADV-G54', path, 'historical status needs an archive or verified immutable record')
      if (
        row.historicalIdentity?.class !== 'local-git-commit' ||
        row.historicalIdentity.value !== historicalSnapshot.commit ||
        !historicalSnapshot.entries.has(row.path) ||
        Object.keys(row.historicalIdentity).sort().join(',') !== 'class,value'
      )
        add('ADV-G54', path, 'historical row must bind its exact observed source path')
    } else if (row.historicalIdentity !== null)
      add('ADV-G54', path, 'live rows carry no historical exemption')
  }
  for (const path of discovered.keys())
    if (!seen.has(path))
      add('ADV-G46', '$.consumers.' + path, 'detected governance surface has no inventory row')
  return problems.length === start
}

const ROW_FIELDS =
  'disposition,factClasses,generatedRegions,historicalIdentity,migrationLanding,path,retainedReason'
const FACT_CLASSES = new Set(CLAIMS.map(([name]) => name))

// These exact artifacts are owned by the registry, genesis proof and renderer.
// This is not a directory exemption, and does not include governance/README.md.
const CANONICAL_ARTIFACTS = new Set([
  'governance/state.json',
  'governance/consumers.json',
  'governance/genesis-source-manifest.json',
  'governance/STATE.md',
])

function decisionConsumerRow(path, factClasses) {
  return {
    path,
    factClasses,
    disposition: 'retained-semantic-prose',
    generatedRegions: [],
    historicalIdentity: null,
    migrationLanding: null,
    retainedReason:
      'Decision text and its checked lifecycle header remain authored; ' +
      'the registry owns current lifecycle and terminal bytes remain digest-bound.',
  }
}

/** Preserve every predecessor row exactly. No disappearance or reclassification
 * is implicit in a weaker scan result, a file move, or a lifecycle transition.
 */
export function preserveConsumerRows(before, after, problems) {
  const target = new Map((after?.rows ?? []).map((row) => [row?.path, row]))
  for (const row of before?.rows ?? [])
    if (
      isObject(row) &&
      canonicalSerialize(row) !== canonicalSerialize(target.get(row.path) ?? null)
    )
      problems.push({
        code: 'ADV-G46',
        path: '$.consumers.' + row.path,
        message: 'existing consumer rows cannot be removed or reclassified',
      })
}

/** Current coverage is separate from the immutable pre-migration observation.
 * The only v1 extension is an explicit row for a registered decision. History
 * proves that row and decision first arrived together in the initial lifecycle.
 */
export function validateCurrentConsumerInventory(bytes, frozen, state, snapshot, problems) {
  const add = (path, message) => problems.push({ code: 'ADV-G46', path, message })
  let inventory
  try {
    const text = decodeUtf8(bytes)
    inventory = parseStrictJson(text)
    if (canonicalSerialize(inventory) !== text) throw new Error('noncanonical consumer inventory')
    if (
      !isObject(inventory) ||
      inventory.schemaVersion !== 1 ||
      !Array.isArray(inventory.rows) ||
      Object.keys(inventory).sort().join(',') !== 'rows,schemaVersion'
    )
      throw new Error('inventory is a closed version-one rows object')
  } catch (error) {
    add('governance/consumers.json', error.message)
    return {}
  }
  const rows = new Map()
  const frozenPaths = new Set(frozen.rows.map((row) => row.path))
  const adrs = new Map((state.adrs ?? []).map((adr) => [adr.path, adr]))
  const discovered = discoverConsumers(snapshot)
  for (const row of inventory.rows) {
    const path = '$.consumers.' + row?.path
    if (
      !isObject(row) ||
      Object.keys(row).sort().join(',') !== ROW_FIELDS ||
      !isCanonicalRepoPath(row.path) ||
      !Array.isArray(row.factClasses) ||
      row.factClasses.some((name) => !FACT_CLASSES.has(name)) ||
      new Set(row.factClasses).size !== row.factClasses.length ||
      row.factClasses.join(',') !== [...row.factClasses].sort().join(',')
    ) {
      add(path, 'invalid closed consumer row')
      continue
    }
    if (rows.has(row.path)) add(path, 'duplicate consumer path')
    rows.set(row.path, row)
    if (!CANDIDATE_PATHS.includes(row.path) && !snapshot.entries.has(row.path))
      add(path, 'registered consumer path is absent')
    if (!frozenPaths.has(row.path)) {
      const adr = adrs.get(row.path)
      if (
        !adr ||
        !row.path.startsWith('docs/decisions/' + adr.id + '-') ||
        !row.path.endsWith('.md') ||
        !row.factClasses.includes('decision-lifecycle') ||
        canonicalSerialize(row) !==
          canonicalSerialize(decisionConsumerRow(row.path, row.factClasses))
      )
        add(path, 'new consumer rows are limited to explicitly registered decision mirrors')
    }
  }
  preserveConsumerRows(frozen, inventory, problems)
  for (const { path, factClasses } of discovered) {
    if (CANONICAL_ARTIFACTS.has(path)) continue
    const row = rows.get(path)
    if (!row) add('$.consumers.' + path, 'detected governance surface has no inventory row')
    else if (factClasses.some((name) => !row.factClasses.includes(name)))
      add('$.consumers.' + path, 'detected fact class is not covered by the registered row')
  }
  // Enumerate files as well as claims: malformed or absent lifecycle prose must
  // not hide an ADR from the registry/header checks.
  for (const path of snapshot.entries.keys())
    if (/^docs\/decisions\/ADR-\d{4}-.+\.md$/u.test(path) && !adrs.has(path))
      add('$.consumers.' + path, 'decision file has no registry record')
  for (const path of adrs.keys())
    if (!rows.has(path)) add('$.consumers.' + path, 'registered decision has no consumer row')
  return { inventory, discovered }
}
