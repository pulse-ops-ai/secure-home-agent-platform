/** TEST-ONLY: print rehashed copies for hostile/alternative-history fixtures.
 * Never writes; never runs against the subject repository; never owner authorship.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  acceptanceDigest,
  activationFreshnessPreimage,
  canonicalSerialize,
  candidateFreezeIdentity,
  CANDIDATE_PATHS,
  contentDigest,
  digestPreimage,
  extractFreshnessInputs,
  genesisHistoricalCompletionDigest,
  primitiveSourceTuples,
} from '../../../../scripts/governance/model/index.mjs'
import { bundleSha256 } from '../../../../scripts/governance/model/archived-openspec.mjs'
import { PREPARED_ARCHIVES } from '../../../../scripts/governance/model/decision-evidence.mjs'
import { createGenesisReader } from '../../../../scripts/governance/genesis/observations.mjs'
import { fixtureEnvelopes } from './envelope.mjs'

const root = resolve(process.argv[2])
if (root === resolve(fileURLToPath(new URL('../../../../', import.meta.url))))
  throw new Error('hostile rebindings require an isolated test repository')
const mode = process.argv[3]
const read = (path) => readFileSync(resolve(root, path))
const [inventory, manifest, seed] = CANDIDATE_PATHS.map((path) => JSON.parse(read(path)))
const readSnapshot = createGenesisReader(root)

if (mode === 'candidate') {
  const nextSource = process.argv[4]
  if (nextSource) {
    const oldSource = manifest.sourceSnapshotIdentity.value
    manifest.sourceSnapshotIdentity.value = nextSource
    for (const row of manifest.decisionEvidence)
      for (const source of row.sources)
        if (source.revision === oldSource) {
          source.revision = nextSource
          source.contentSha256 = contentDigest(
            readSnapshot(nextSource).entries.get(source.path).bytes,
          )
        }
    for (const row of manifest.rows)
      if (row.source.revision === oldSource) {
        row.source.revision = nextSource
        row.source.contentSha256 = contentDigest(
          readSnapshot(nextSource).entries.get(row.source.path).bytes,
        )
      }
    manifest.historicalContext.source.revision = nextSource
    manifest.historicalContext.source.contentSha256 = contentDigest(
      readSnapshot(nextSource).entries.get(manifest.historicalContext.source.path).bytes,
    )
    for (const row of inventory.rows)
      if (row.historicalIdentity) row.historicalIdentity.value = nextSource
  }
  for (const row of manifest.historicalCompletions) {
    if (nextSource) row.sourceSnapshotIdentity.value = nextSource
    const archive = row.evidence.archivedOpenSpec
    if (archive && nextSource) {
      if (
        PREPARED_ARCHIVES.has(row.landingId) &&
        archive.archiveRoot !== PREPARED_ARCHIVES.get(row.landingId)
      )
        archive.archivedPackageIdentity.value = nextSource
      archive.bundleSha256 = bundleSha256(archive)
      row.packageDisposition.archiveBundleSha256 = archive.bundleSha256
      row.packageDisposition.sourceSnapshotIdentity.value = nextSource
    }
    const landing = seed.landings.find((node) => node.id === row.landingId)
    landing.delivery.completion = {
      type: 'genesis-historical-completion-v1',
      digest: '0'.repeat(64),
      evidence: row.evidence,
    }
    landing.delivery.completion.digest = genesisHistoricalCompletionDigest(landing, row)
  }
  for (const adr of seed.adrs)
    if (adr.acceptance) adr.acceptance.transitionDigest = acceptanceDigest(seed, adr)
  const values = new Map(primitiveSourceTuples(seed).map((row) => [row.id, row.value]))
  for (const row of manifest.rows) if (values.has(row.id)) row.value = values.get(row.id)
  console.log(
    JSON.stringify(
      Object.fromEntries(
        CANDIDATE_PATHS.map((path, index) => [
          path,
          canonicalSerialize([inventory, manifest, seed][index]),
        ]),
      ),
    ),
  )
} else if (mode === 'forged-envelope') {
  // Construct a self-consistent CLAIM, including on deliberately invalid inputs.
  // The real entry point, not this helper, must refuse the claim.
  const base = process.argv[4]
  const frozen = {
    seed,
    manifest,
    inventory,
    identity: candidateFreezeIdentity(new Map(CANDIDATE_PATHS.map((path) => [path, read(path)]))),
  }
  const extracted = extractFreshnessInputs(frozen, readSnapshot(base), { readSnapshot })
  const state = fixtureEnvelopes(seed, manifest, base, {
    candidateFreezeIdentity: frozen.identity,
    activationFreshnessDigest: digestPreimage(
      activationFreshnessPreimage(frozen.identity, base, extracted),
    ),
  })
  process.stdout.write(canonicalSerialize(state))
} else throw new Error('unknown test rebind mode')
