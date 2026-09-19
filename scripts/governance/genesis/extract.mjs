#!/usr/bin/env node
/** The reviewed PR-2 extraction recipe. Emits candidates; never attests or activates. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import {
  createGenesisReader,
  createCommitReader,
  readCheckoutSnapshot,
  readPathHistory,
} from './observations.mjs'
import {
  ARCHIVE_STAGE,
  BRIDGE_RECORDS,
  TEMPORAL_SOURCE,
  decisionDeclaration,
  DECISION_INDEX,
} from '../model/decision-evidence.mjs'
import { auditHistoricalAcceptances } from './acceptance.mjs'
import { createHistoryReader, PRESENT } from '../history/index.mjs'
import { createGitTreeObserver } from '../git-tree/index.mjs'
import {
  canonicalSerialize,
  contentDigest,
  digestPreimage,
  genesisHistoricalCompletionDigest,
  primitiveDigest,
  primitiveSourceTuples,
  relationshipDigest,
  transitionDigest,
  parseGenesisAdrHeader,
  parseGenesisQuestions,
  parseGenesisProgram,
  validateGenesisSources,
} from '../model/index.mjs'
import {
  ARCHIVED_CONTRACT,
  absentMinimumArtifacts,
  bundlePreimage,
} from '../model/archived-openspec.mjs'
import { discoverConsumers, validateConsumerInventory } from '../model/consumers.mjs'

// External owner resumption authorization and durable PR-2A merge handoff.
// A pre-preparation snapshot is not an alternate input to this v1 extraction.
export const DURABLE_PREPARATION = '83e6cd8fa7d2d05ab246a39de039129b4056966d'
export const COMMON_SOURCE = TEMPORAL_SOURCE
const PLAN = 'openspec/changes/governance-state-substrate/'
const QUESTIONS = 'docs/architecture/unresolved-decisions.md'
const REPOSITORY = 'pulse-ops-ai/secure-home-agent-platform'
const SOURCE = { class: 'local-git-commit', value: COMMON_SOURCE }
const issue = (number) => ({ type: 'github-issue', repository: REPOSITORY, number })
const commit = (value, scope) => ({ class: 'local-git-commit', value, scope })

const DELIVERIES = [
  [
    'runner/L2',
    'runner-domain-contracts',
    '2026-08-10',
    '07b93cfa399dfd3d45e13c50aac08eafe2de8206',
    '1ca1311081b0483afa8ec060677aa039589b73f3',
    ['packages/contracts', 'packages/events', 'schemas'],
  ],
  [
    'runner/L3',
    'runner-core',
    '2026-08-10',
    '2d1b21e21731d989c29ed7c2abee0ebf9015c7f5',
    'e67d5ca677a8a8f64c2c6a94ee8328fd93e0134f',
    ['packages/runner-core'],
  ],
  [
    'runner/L4',
    'runner-control-orchestration',
    '2026-09-13',
    '1bc56e22624189a4fb6ddc731815de4ade298d54',
    DURABLE_PREPARATION,
    ['services/runner-control'],
  ],
  [
    'runner/L5',
    'runner-image-lineage',
    '2026-09-13',
    'f9ebace7affbd023e2fdd57d6a05fe7418b1b7d9',
    DURABLE_PREPARATION,
    ['deploy/images'],
  ],
  [
    'runner/L7',
    'runner-platform-adapters',
    '2026-09-13',
    '5403a8525f0e45f99ae7631a9c6f9741092e7f75',
    DURABLE_PREPARATION,
    ['agents/adapters/coding/claude-code', 'agents/adapters/coding/copilot-cli', 'deploy/images'],
  ],
]

function archiveEvidence(snapshot, recipe) {
  const [landingId, changeId, date, delivered, archived, scope] = recipe
  const archiveRoot = 'openspec/changes/archive/' + date + '-' + changeId
  const activeRoot = 'openspec/changes/' + changeId
  const members = [...snapshot.entries]
    .filter(([path]) => path.startsWith(archiveRoot + '/'))
    .map(([path, entry]) => {
      if (entry.mode !== '100644' || !entry.bytes)
        throw new Error('invalid historical archive member: ' + path)
      return { path: path.slice(archiveRoot.length + 1), contentSha256: contentDigest(entry.bytes) }
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  if (!members.length) throw new Error('ADV-G98: durable archive is absent: ' + archiveRoot)
  const archive = {
    schemaVersion: 1,
    contract: ARCHIVED_CONTRACT,
    changeId,
    activeRoot,
    archiveRoot,
    members,
    reviewedIdentity: commit(delivered, [activeRoot]),
    archivedPackageIdentity: commit(archived, [archiveRoot]),
  }
  archive.bundleSha256 = digestPreimage(bundlePreimage(archive))
  const evidence = {
    policy: 'reviewed-delivery-v1',
    deliveredIdentity: commit(delivered, scope),
    archivedOpenSpec: archive,
  }
  const waivedMinimumArtifacts = absentMinimumArtifacts(members)
  return {
    landingId,
    sourceSnapshotIdentity: SOURCE,
    evidence,
    packageDisposition: {
      type: 'historical-genesis-package-v1',
      landingId,
      sourceSnapshotIdentity: SOURCE,
      archiveBundleSha256: archive.bundleSha256,
      packageProfile: 'observed-historical-v1',
      waivedMinimumArtifacts,
      reviewWitness: 'not-required-commit-backed',
      rationale:
        `${landingId} is associated for MAN-G03 review with the complete ${changeId} package and the declared delivery scope. ` +
        (waivedMinimumArtifacts.length
          ? `The observed pre-contract package lacks only these modern minimum artifacts: ${waivedMinimumArtifacts.join(', ')}. `
          : 'No modern minimum artifact is missing. ') +
        'Every existing member and both historical stages remain byte-bound. This proposed historical disposition is not an owner attestation.',
    },
  }
}

function spikeEvidence(snapshot) {
  const root = 'docs/spikes/l6-copilot-cli'
  const paths = [...snapshot.entries.keys()].filter((path) => path.startsWith(root + '/')).sort()
  const identity = (path) => ({
    class: 'content-sha256',
    value: contentDigest(snapshot.entries.get(path).bytes),
    scope: [path],
  })
  return {
    landingId: 'runner/L6',
    sourceSnapshotIdentity: SOURCE,
    packageDisposition: null,
    evidence: {
      policy: 'reviewed-spike-evidence-v1',
      openSpecApplicability: 'not-applicable',
      mergedEvidencePullRequest: {
        type: 'github-pull-request',
        repository: REPOSITORY,
        number: 73,
      },
      mergedEvidenceIdentity: commit('e0e8b786201d3e92bbe05f286ae55b9e002c4109', paths),
      evidenceRoot: root,
      evidenceManifestIdentity: identity(root + '/MANIFEST.sha256'),
      findingsIdentity: identity(root + '/L6-Copilot-CLI-Spike-Findings.md'),
    },
  }
}

export function acceptanceProvenance(observation, declaration, path) {
  if (!observation?.transition) throw new Error('no unambiguous audited decision transition')
  return {
    actor: observation.actor,
    decisionDate: observation.decisionDate,
    authority: {
      type: 'task-contract',
      repository: REPOSITORY,
      id: declaration.indexRecords.length
        ? DECISION_INDEX + '#' + declaration.indexRecords[0].toLowerCase().replaceAll(' ', '-')
        : path,
    },
    // Exact reviewed transition, not the commit that delivered it to main.
    // The declaration supplies the actor; Git metadata never authenticates it.
    reviewedIdentity: observation.transition.identity,
  }
}

// Individually reviewed active-change surfaces, not an active-directory exemption.
// A new path must be reviewed explicitly; the pre-PR-2A count is not an input.
const ACTIVE_SURFACES = new Map([
  [
    'governance-state-substrate/proposal.md',
    'Migration proposal; replace live-state assertions with canonical pointers while preserving the authorized scope.',
  ],
  [
    'governance-state-substrate/design.md',
    'Governed substrate design; retain definitions and source-era examples, route live governance answers to the canonical query.',
  ],
  [
    'governance-state-substrate/assurance.md',
    'Proof obligations and source-era examples, not a new delivery-status authority.',
  ],
  [
    'governance-state-substrate/tasks.md',
    'Governed execution plan and authorization receipts; preserve historical receipts and route current delivery answers to the query.',
  ],
  [
    'governance-state-substrate/specs/governance-state/spec.md',
    'Normative governance requirements and scenario examples, not stored current conclusions.',
  ],
  [
    'knowledge-content-assurance/proposal.md',
    'Knowledge-assurance scope with copied current blockers; migrate only those current governance claims.',
  ],
  [
    'knowledge-content-assurance/design.md',
    'Knowledge-assurance mechanisms and prerequisite references; preserve semantics while linking current state.',
  ],
  [
    'knowledge-content-assurance/assurance.md',
    'Knowledge-assurance proof examples and prerequisite claims, not an exempt historical directory.',
  ],
  [
    'knowledge-content-assurance/tasks.md',
    'Knowledge-assurance execution dependencies; replace copied live governance answers with pointers.',
  ],
  [
    'knowledge-content-assurance/specs/knowledge-admission/spec.md',
    'Admission requirements reference decisions; preserve requirements and point to canonical lifecycle answers.',
  ],
  [
    'knowledge-promotion-path/proposal.md',
    'Promotion proposal with copied governance context; migrate the live assertions only.',
  ],
  [
    'knowledge-promotion-path/design.md',
    'Promotion mechanism definitions remain authored; live decision-state references become pointers.',
  ],
  [
    'knowledge-promotion-path/assurance.md',
    'Promotion proof cases remain authored, without a separate live blocker list.',
  ],
  [
    'knowledge-promotion-path/tasks.md',
    'Promotion work plan; retain historical tasks and link current governance facts.',
  ],
  [
    'knowledge-promotion-path/specs/knowledge-promotion/spec.md',
    'Promotion requirements retain normative meaning; current lifecycle answers are pointers.',
  ],
  [
    'okf-format-decision/proposal.md',
    'Format-decision proposal retains its source-era rationale, not a mutable resolution summary.',
  ],
  [
    'okf-format-decision/design.md',
    'Format design remains normative; live U7 and lifecycle claims are linked.',
  ],
  [
    'okf-format-decision/assurance.md',
    'Format proof requirements remain authored, with no independent resolution authority.',
  ],
  [
    'okf-format-decision/tasks.md',
    'Format execution history remains intact; current resolution answers are linked.',
  ],
  [
    'okf-format-decision/specs/knowledge-format/spec.md',
    'Knowledge-format requirements survive; copied current decision status becomes a pointer.',
  ],
  [
    'runner-adapter-conformance-seed/proposal.md',
    'Frozen PR-101 planning is not changed by PR-2; any future live-claim migration must respect its separate authorization.',
  ],
  [
    'runner-adapter-conformance-seed/design.md',
    'Frozen adapter design is not changed here; preserve semantics and require separately authorized pointer migration.',
  ],
  [
    'runner-adapter-conformance-seed/assurance.md',
    'Frozen adapter proof plan is not changed here; its own authorization governs any future metadata migration.',
  ],
  [
    'runner-adapter-conformance-seed/tasks.md',
    'Frozen adapter task contract remains untouched; this inventory grants no implementation or editing authority.',
  ],
  [
    'ts7-emit-proof-lifecycle/proposal.md',
    'Completed proof-lifecycle proposal; preserve historical reasoning and replace only genuinely live governance copies.',
  ],
  [
    'ts7-emit-proof-lifecycle/assurance.md',
    'Proof-lifecycle obligations remain intact; current governance answers must use the canonical query.',
  ],
  [
    'ts7-emit-proof-lifecycle/verification.md',
    'Completed cutover-lifecycle verification receipt, retained as source-era evidence rather than current governance authority.',
  ],
])

function inventoryFor(snapshot) {
  return {
    schemaVersion: 1,
    rows: discoverConsumers(snapshot).map((row) => {
      let disposition = 'stable-pointer'
      let retainedReason = null
      let generatedRegions = []
      const text = Buffer.from(snapshot.entries.get(row.path).bytes).toString('utf8')
      if (row.path === 'docs/decisions/INDEX.md') {
        disposition = 'generated-region'
        generatedRegions = ['decision-lifecycle']
      } else if (row.path === QUESTIONS) {
        disposition = 'generated-region'
        generatedRegions = ['question-summary', 'resolution-banners']
      } else if (
        row.path.startsWith('openspec/changes/archive/') ||
        row.path.startsWith('docs/spikes/') ||
        row.path.startsWith('openspec/specs/') ||
        BRIDGE_RECORDS.includes(row.path) ||
        (/^docs\/decisions\/ADR-\d{4}-.+\.md$/u.test(row.path) &&
          /^- \*\*Status:\*\* Accepted$/mu.test(text))
      ) {
        disposition = 'historical-record'
        retainedReason =
          'Immutable accepted contract or captured evidence at this exact source path; not a mutable current-state authority.'
      } else if (
        row.path.startsWith('tests/') ||
        row.path.startsWith('scripts/') ||
        row.path.startsWith('openspec/schemas/') ||
        /\.(?:ts|mjs)$/u.test(row.path) ||
        [
          'knowledge/catalog.json',
          'packages/lint-config/policy.schema.json',
          'pnpm-workspace.yaml',
          'pyproject.toml',
        ].includes(row.path)
      ) {
        disposition = 'not-a-governance-consumer'
        retainedReason =
          'Executable check, adversarial fixture, or authoring template; its literals exercise a contract rather than assert live governance state.'
      } else if (row.path === 'docs/architecture/agent-triage-and-escalation.md') {
        disposition = 'retained-semantic-prose'
        retainedReason =
          'Explains the triage mechanism and examples, not the live decision lifecycle or readiness registry.'
      } else if (row.path === 'docs/decisions/ADR-0020-place-runner-control-by-workload-class.md') {
        disposition = 'retained-semantic-prose'
        retainedReason =
          'Proposed decision text and its validated header mirror remain authored. This is neither acceptance nor a second live status authority.'
      } else if (row.path.startsWith('openspec/changes/')) {
        retainedReason = ACTIVE_SURFACES.get(row.path.slice('openspec/changes/'.length))
        if (!retainedReason)
          throw new Error('active governance surface needs individual disposition: ' + row.path)
        if (row.path === 'openspec/changes/ts7-emit-proof-lifecycle/verification.md')
          disposition = 'retained-semantic-prose'
      }
      return {
        ...row,
        disposition,
        generatedRegions,
        migrationLanding: 'PR-3',
        retainedReason,
        // The closed inventory row itself supplies the exact path; this is
        // its containing historical snapshot, not a delivery-policy identity.
        historicalIdentity: disposition === 'historical-record' ? SOURCE : null,
      }
    }),
  }
}

export function extractCandidate({ root, sourceRevision, inventoryRevision = sourceRevision }) {
  if (sourceRevision !== COMMON_SOURCE)
    throw new Error(
      'ADV-G110: this authorized extraction requires exact post-bridge source S; archive-stage M remains separate',
    )
  if (DURABLE_PREPARATION !== ARCHIVE_STAGE) throw new Error('archive-stage identity disagreement')
  const acceptanceAudit = auditHistoricalAcceptances({ root, sourceRevision })
  if (!acceptanceAudit.ok)
    throw new Error(
      'historical acceptance audit blocks candidate generation: ' +
        canonicalSerialize(acceptanceAudit.problems),
    )
  const readSnapshot = createGenesisReader(root)
  const reader = createHistoryReader(root)
  const snapshot = readSnapshot(sourceRevision)
  const sourceFor = (path, extractionRule, revision = sourceRevision) => {
    const entry = readSnapshot(revision).entries.get(path)
    if (!entry?.bytes) throw new Error('missing source: ' + path)
    return { path, revision, contentSha256: contentDigest(entry.bytes), extractionRule }
  }
  const adrs = [...snapshot.entries]
    .filter(([path]) => /^docs\/decisions\/ADR-\d{4}-.+\.md$/u.test(path))
    .map(([path, entry]) => {
      const adr = parseGenesisAdrHeader(path, entry.bytes)
      return {
        ...adr,
        acceptance:
          adr.lifecycle === 'Proposed'
            ? null
            : {
                contentDigest: contentDigest(entry.bytes),
                ...acceptanceProvenance(
                  acceptanceAudit.observations.find((item) => item.adrId === adr.id),
                  decisionDeclaration(
                    path,
                    entry.bytes,
                    snapshot.entries.get(DECISION_INDEX).bytes,
                  ),
                  path,
                ),
                outcome: adr.lifecycle === 'Rejected' ? 'rejected' : 'accepted',
                transitionDigest: '0'.repeat(64),
              },
      }
    })
  const questions = parseGenesisQuestions(QUESTIONS, snapshot.entries.get(QUESTIONS).bytes)
  const severitySources = new Map()
  for (const question of questions.filter((item) => item.severity === null)) {
    for (const record of readPathHistory(root, sourceRevision, QUESTIONS).reverse()) {
      const read = reader.readBytesAt(record.commit, QUESTIONS)
      if (read.status !== PRESENT) throw new Error('historical question source unreadable')
      const old = parseGenesisQuestions(QUESTIONS, read.bytes).find(
        (item) => item.id === question.id,
      )
      if (old?.severity) {
        question.severity = old.severity
        severitySources.set(question.id, record.commit)
        break
      }
    }
    if (question.severity === null)
      throw new Error('historical severity needs a human disposition: ' + question.id)
  }
  const historicalCompletions = [
    ...DELIVERIES.map((recipe) => archiveEvidence(snapshot, recipe)),
    spikeEvidence(snapshot),
  ].sort((a, b) => (a.landingId < b.landingId ? -1 : 1))
  const program = parseGenesisProgram(snapshot.entries.get(PLAN + 'design.md').bytes)
  const state = {
    schemaVersion: 1,
    adrs,
    questions,
    gates: [],
    landings: [],
    externalReferences: [],
    attestations: { genesis: {} },
  }
  for (const node of program) {
    const common = {
      id: node.id,
      kind: node.kind,
      authorityAnchor: issue(node.issue),
      replaces: null,
      replacement: null,
    }
    if (node.kind === 'gate') {
      const adrId = node.id === 'runner/GATE-U6' ? 'ADR-0013' : 'ADR-0020'
      state.gates.push({
        ...common,
        predicate: {
          name: 'exactly-one-current-accepted-resolver',
          question: node.id.slice('runner/GATE-'.length),
        },
        sources: [adrs.find((adr) => adr.id === adrId).path + '#decision'],
      })
    } else {
      const historical = historicalCompletions.find((row) => row.landingId === node.id)
      const landing = {
        ...common,
        requires: node.requires,
        delivery: {
          lifecycle: node.lifecycle,
          completionPolicy: node.completionPolicy,
          completion: historical
            ? {
                type: 'genesis-historical-completion-v1',
                digest: '0'.repeat(64),
                evidence: historical.evidence,
              }
            : null,
          withdrawal: null,
        },
      }
      if (historical)
        landing.delivery.completion.digest = genesisHistoricalCompletionDigest(landing, historical)
      state.landings.push(landing)
    }
  }
  for (const adr of adrs.filter((item) => item.acceptance))
    adr.acceptance.transitionDigest = transitionDigest({
      schemaVersion: 1,
      priorStateDigest: null,
      targetPrimitiveDigest: primitiveDigest(state),
      subject: adr.id,
      from: 'Proposed',
      to: adr.lifecycle,
      contentDigest: adr.acceptance.contentDigest,
      relationshipDigest: relationshipDigest(state),
    })
  const rows = primitiveSourceTuples(state).map((tuple) => {
    let source
    let human = false
    if (tuple.collection === 'adrs')
      source = sourceFor(
        adrs.find((adr) => adr.id === tuple.entityId).path,
        tuple.field === 'acceptance' ? 'adr-bytes-v1' : 'adr-header-v1',
      )
    else if (tuple.collection === 'questions')
      source = sourceFor(
        QUESTIONS,
        'question-table-v1',
        tuple.field === 'severity'
          ? (severitySources.get(tuple.entityId) ?? sourceRevision)
          : sourceRevision,
      )
    else {
      human = ['authorityAnchor', 'predicate', 'sources', 'delivery.completionPolicy'].includes(
        tuple.field,
      )
      const historical = historicalCompletions.some((row) => row.landingId === tuple.entityId)
      const rule =
        tuple.id === 'schemaVersion'
          ? 'schema-v1'
          : human
            ? 'human-declaration-v1'
            : historical && ['delivery.completion', 'delivery.lifecycle'].includes(tuple.field)
              ? 'historical-completion-v1'
              : 'program-table-v1'
      source = sourceFor(PLAN + 'design.md', rule)
    }
    return {
      ...tuple,
      source,
      classification: human ? 'externally-attested' : 'locally-verified',
      humanDisposition: human
        ? 'D6.2/D6.3 declaration is copied for owner review. The local table fixes vocabulary and enumeration; acceptance of the issue anchor, gate association and per-node policy remains externally attested, never established by issue open/closed state.'
        : null,
    }
  })
  const planningSources = []
  for (const revision of [
    '7a2d731837ea9f14cae09436ddb78e6e47607ee5',
    'fc1b9f4eef748f7cd0f6af7818bec94d3045f46e',
    '5447e78fa9d63ce2c20ea8de81a1cd321bdf9b6a',
    COMMON_SOURCE,
  ]) {
    for (const name of [
      'proposal.md',
      'design.md',
      'assurance.md',
      'tasks.md',
      'specs/governance-state/spec.md',
    ]) {
      const path = PLAN + name
      const entry = readSnapshot(revision).entries.get(path)
      planningSources.push({
        path,
        revision,
        blobOid: entry.oid,
        contentSha256: contentDigest(entry.bytes),
      })
    }
  }
  for (const name of ['bridge-evidence.json', 'bridge-verification.md']) {
    const path = PLAN + name
    const entry = snapshot.entries.get(path)
    planningSources.push({
      path,
      revision: sourceRevision,
      blobOid: entry.oid,
      contentSha256: contentDigest(entry.bytes),
    })
  }
  const manifest = {
    schemaVersion: 1,
    sourceSnapshotIdentity: SOURCE,
    rows,
    planningSources,
    historicalCompletions,
    decisionEvidence: acceptanceAudit.observations,
    historicalContext: {
      programMaterialization:
        'L1 is the post-ratification human program-materialization event (issues #19, #27 and #51–#58), not a lifecycle-less active node. L2 and L6 are roots under D6.3a.',
      originalRatifiedDag:
        'L2←L1 · L3←L2 · L4←L3 · L5←L4 · L6←L1 · L7←L5+GATE-U6(+L6) · L8←L7 · L9←L8+GATE-U4 · L10←L8+L9',
      sourceConflictDisposition:
        'D6.4 records issue #19 saying L5 is next and L7 waits on L5, with #53/#55 open, while repository delivery is complete. Seed delivery from the bound repository evidence; issue status is neither delivery proof nor authorization. Historical interpretation and MAN-G03 association await the real PR-3 owner ceremony. Decision dates and actors come from governed structural records; encoded Git timestamps are supporting metadata, not human acts or actual recording-time evidence. ADR-0022 post-ADR-0021 manual acceptance is immutable historical-process inconsistency evidence, neither precedent nor retroactive authorization. ADR-0023/ADR-0024 retain their original pre-transition RFC3339 bridge envelopes and source in the immutable historical receipt; the one-shot bridge is consumed and expired, not a runtime authorization primitive.',
      source: sourceFor(
        'openspec/changes/archive/2026-08-09-runner-baseline-adoption/tasks.md',
        'historical-context-v1',
      ),
    },
  }
  const inventorySnapshot =
    inventoryRevision === 'WORKTREE' ? readCheckoutSnapshot(root) : readSnapshot(inventoryRevision)
  const inventory = inventoryFor(inventorySnapshot)
  const problems = []
  validateGenesisSources(
    state,
    manifest,
    { readSnapshot, ...createCommitReader(root), observe: createGitTreeObserver(root) },
    problems,
  )
  validateConsumerInventory(inventory, inventorySnapshot, problems, snapshot)
  if (problems.length) throw new Error(canonicalSerialize(problems))
  return { state, manifest, inventory }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        root: { type: 'string' },
        source: { type: 'string' },
        'inventory-source': { type: 'string' },
        patch: { type: 'boolean' },
      },
    })
    const root = values.root
    const sourceRevision = values.source
    if (!root || !sourceRevision) throw new Error('explicit --root and --source are required')
    const inventoryRevision = values['inventory-source'] ?? sourceRevision
    const result = extractCandidate({ root, sourceRevision, inventoryRevision })
    const files = {
      'state.json': result.state,
      'source-manifest.json': result.manifest,
      'consumers.json': result.inventory,
    }
    if (values.patch) {
      process.stdout.write('*** Begin Patch\n')
      for (const [name, value] of Object.entries(files))
        process.stdout.write(
          '*** Add File: ' +
            resolve(root, 'tests/fixtures/governance/candidate/' + name) +
            '\n' +
            canonicalSerialize(value)
              .trimEnd()
              .split('\n')
              .map((line) => '+' + line)
              .join('\n') +
            '\n',
        )
      process.stdout.write('*** End Patch\n')
    } else process.stdout.write(canonicalSerialize(result))
  } catch (error) {
    console.error(String(error.message))
    process.exitCode = 1
  }
}
