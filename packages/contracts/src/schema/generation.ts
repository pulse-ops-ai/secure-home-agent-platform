/**
 * JSON Schema RENDERING (capability `runner-verification`, design D3).
 * Build tooling only: this module imports Prettier and is deliberately
 * NOT exported from the package index — importing it from the runtime
 * graph would drag a devDependency into production resolution (D8: the
 * package's only runtime dependency is Zod). The pure artifact catalog
 * lives in `contract-artifacts.ts`.
 *
 * Explicit conversion contract — library defaults are not authority:
 * target draft-2020-12, unrepresentable: "throw" (fail closed), io:
 * "output" (contract schemas use no transforms or defaults, so input and
 * output are identical by construction), reused: "ref" (shared primitives
 * emit $defs). The authored strict Zod schemas remain the parse authority;
 * this output is published projection. Identity uniqueness is structural
 * (keyed records), so it survives generation.
 */
import { format } from 'prettier'
import { z } from 'zod'
import {
  artifactPath,
  CONTRACT_ARTIFACTS,
  contractUrn,
  type ContractArtifact,
} from './contract-artifacts.js'

export type { ContractArtifact } from './contract-artifacts.js'
export { artifactPath, CONTRACT_ARTIFACTS, contractUrn } from './contract-artifacts.js'

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

/** Relative path (under `schemas/`) → exact file content. */
export const generateArtifacts = async (
  artifacts: readonly ContractArtifact[] = CONTRACT_ARTIFACTS,
): Promise<ReadonlyMap<string, string>> => {
  const out = new Map<string, string>()
  for (const artifact of artifacts) {
    out.set(artifactPath(artifact), await renderSchema(artifact))
  }
  return out
}
