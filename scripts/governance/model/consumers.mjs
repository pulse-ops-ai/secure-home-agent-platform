/** The closed PR-2 inventory. Discovery is across all tracked bytes, not a glob. */
import { canonicalSerialize, decodeUtf8, isObject } from './canonical.mjs'

export const CONSUMER_DISPOSITIONS = Object.freeze([
  'generated-region',
  'stable-pointer',
  'historical-record',
  'retained-semantic-prose',
  'not-a-governance-consumer',
])

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
        row.path.startsWith('docs/spikes/') || row.path.startsWith('openspec/specs/')
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
