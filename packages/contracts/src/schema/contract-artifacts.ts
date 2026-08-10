/**
 * The pure artifact catalog: contract identities and their authored
 * schemas. NO build tooling here — this module is safe on the runtime
 * import graph (the renderer, which needs Prettier, lives in
 * `generation.ts` and is deliberately NOT exported from the package
 * index; contracts' only runtime dependency stays Zod, per D8).
 */
import type { z } from 'zod'
import {
  EXECUTION_PROFILE_ID,
  EXECUTION_PROFILE_VERSION,
  ExecutionProfile,
} from '../execution-profile/index.js'
import {
  LAUNCH_ASSERTION_ID,
  LAUNCH_ASSERTION_VERSION,
  LaunchAssertion,
} from '../launch-assertion/index.js'
import { PATH_POLICY_ID, PATH_POLICY_VERSION, PathPolicy } from '../path-policy/index.js'
import { PATH_POLICY_V1_VERSION, PathPolicyV1 } from '../path-policy/v1.js'
import {
  GATE_REGISTRY_ID,
  GATE_REGISTRY_VERSION,
  GateRegistry,
  VERIFICATION_PACKS_ID,
  VERIFICATION_PACKS_VERSION,
  VerificationPacks,
} from '../verification/index.js'

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
  // Superseded 1.0.0 retained and still generated (corrections D3): the
  // ledger appends, never rewrites, and published versions stay published.
  { id: PATH_POLICY_ID, version: PATH_POLICY_V1_VERSION, schema: PathPolicyV1 },
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

/** Relative path (under `schemas/`) for an artifact's generated file. */
export const artifactPath = (artifact: Pick<ContractArtifact, 'id' | 'version'>): string =>
  `${artifact.id}/${artifact.version}.json`
