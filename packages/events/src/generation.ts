/**
 * JSON Schema generation for the events vocabulary — same explicit
 * conversion contract as `@secure-home/contracts` (design D3): target
 * draft-2020-12, unrepresentable: "throw", io: "output", reused: "ref".
 */
import { format } from 'prettier'
import { z } from 'zod'
import { EVIDENCE_BUNDLE_ID, EVIDENCE_BUNDLE_VERSION, EvidenceBundle } from './evidence.js'
import { RUN_EVENT_ID, RUN_EVENT_VERSION, RunEvent } from './run-events.js'
import { RUN_RECORD_ID, RUN_RECORD_VERSION, RunRecord } from './run-record.js'

export interface ContractArtifact {
  readonly id: string
  readonly version: string
  readonly schema: z.ZodType
}

export const EVENT_ARTIFACTS: readonly ContractArtifact[] = [
  { id: RUN_RECORD_ID, version: RUN_RECORD_VERSION, schema: RunRecord },
  { id: RUN_EVENT_ID, version: RUN_EVENT_VERSION, schema: RunEvent },
  {
    id: EVIDENCE_BUNDLE_ID,
    version: EVIDENCE_BUNDLE_VERSION,
    schema: EvidenceBundle,
  },
]

export const contractUrn = (id: string, version: string): string =>
  `urn:secure-home:contract:${id}:${version}`

/**
 * Prettier options mirroring the repository's .prettierrc.json: generated
 * bytes must equal the committed, repository-formatted bytes exactly, or
 * the drift check could never be byte-stable against the merge gate.
 */
const PRETTIER_JSON = {
  parser: 'json' as const,
  printWidth: 100,
  tabWidth: 2,
  endOfLine: 'lf' as const,
}

export const renderSchema = async (artifact: ContractArtifact): Promise<string> => {
  const projected = z.toJSONSchema(artifact.schema, {
    target: 'draft-2020-12',
    unrepresentable: 'throw',
    io: 'output',
    reused: 'ref',
  })
  const withId = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: contractUrn(artifact.id, artifact.version),
    ...Object.fromEntries(Object.entries(projected).filter(([key]) => key !== '$schema')),
  }
  return format(JSON.stringify(withId), PRETTIER_JSON)
}

export const generateArtifacts = async (
  artifacts: readonly ContractArtifact[] = EVENT_ARTIFACTS,
): Promise<ReadonlyMap<string, string>> => {
  const out = new Map<string, string>()
  for (const artifact of artifacts) {
    out.set(`${artifact.id}/${artifact.version}.json`, await renderSchema(artifact))
  }
  return out
}
