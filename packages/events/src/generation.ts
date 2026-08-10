/**
 * JSON Schema RENDERING for the events vocabulary — build tooling only
 * (imports Prettier; never exported from the package index). Same
 * explicit conversion contract as `@secure-home/contracts` (design D3):
 * target draft-2020-12, unrepresentable: "throw", io: "output",
 * reused: "ref". The pure catalog lives in `event-artifacts.ts`.
 */
import { format } from 'prettier'
import { z } from 'zod'
import {
  artifactPath,
  contractUrn,
  EVENT_ARTIFACTS,
  type ContractArtifact,
} from './event-artifacts.js'

export type { ContractArtifact } from './event-artifacts.js'
export { artifactPath, contractUrn, EVENT_ARTIFACTS } from './event-artifacts.js'

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
    out.set(artifactPath(artifact), await renderSchema(artifact))
  }
  return out
}
