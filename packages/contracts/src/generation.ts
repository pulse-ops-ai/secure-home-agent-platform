/**
 * JSON Schema generation (capability `runner-verification`, design D3).
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
  EXECUTION_PROFILE_ID,
  EXECUTION_PROFILE_VERSION,
  ExecutionProfile,
} from './execution-profile.js'
import { GATE_REGISTRY_ID, GATE_REGISTRY_VERSION, GateRegistry } from './gate-registry.js'
import {
  LAUNCH_ASSERTION_ID,
  LAUNCH_ASSERTION_VERSION,
  LaunchAssertion,
} from './launch-assertion.js'
import { PATH_POLICY_ID, PATH_POLICY_VERSION, PathPolicy } from './path-policy.js'
import {
  VERIFICATION_PACKS_ID,
  VERIFICATION_PACKS_VERSION,
  VerificationPacks,
} from './verification-packs.js'

export interface ContractArtifact {
  readonly id: string
  readonly version: string
  readonly schema: z.ZodType
}

export const CONTRACT_ARTIFACTS: readonly ContractArtifact[] = [
  {
    id: EXECUTION_PROFILE_ID,
    version: EXECUTION_PROFILE_VERSION,
    schema: ExecutionProfile,
  },
  {
    id: LAUNCH_ASSERTION_ID,
    version: LAUNCH_ASSERTION_VERSION,
    schema: LaunchAssertion,
  },
  { id: PATH_POLICY_ID, version: PATH_POLICY_VERSION, schema: PathPolicy },
  { id: GATE_REGISTRY_ID, version: GATE_REGISTRY_VERSION, schema: GateRegistry },
  {
    id: VERIFICATION_PACKS_ID,
    version: VERIFICATION_PACKS_VERSION,
    schema: VerificationPacks,
  },
]

/** `$id` embeds the EXACT contract version: one identity, one byte set. */
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

/** Relative path (under `schemas/`) → exact file content. */
export const generateArtifacts = async (
  artifacts: readonly ContractArtifact[] = CONTRACT_ARTIFACTS,
): Promise<ReadonlyMap<string, string>> => {
  const out = new Map<string, string>()
  for (const artifact of artifacts) {
    out.set(`${artifact.id}/${artifact.version}.json`, await renderSchema(artifact))
  }
  return out
}
