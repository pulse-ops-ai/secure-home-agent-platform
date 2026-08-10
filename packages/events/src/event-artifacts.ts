/**
 * The pure artifact catalog for the events vocabulary — no build tooling
 * on this module's import graph (the Prettier-using renderer lives in
 * `generation.ts`, which the package index never exports).
 */
import type { z } from 'zod'
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

/** Relative path (under `schemas/`) for an artifact's generated file. */
export const artifactPath = (artifact: Pick<ContractArtifact, 'id' | 'version'>): string =>
  `${artifact.id}/${artifact.version}.json`
