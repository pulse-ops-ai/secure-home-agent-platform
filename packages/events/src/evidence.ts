/**
 * The evidence bundle and catalog (capability `runner-evidence`):
 * representationally complete so L3/L4 never change the contract on first
 * consumption. Shapes only — populating, sealing, and independently
 * verifying evidence is L3 behavior.
 *
 * Consumes the AUTHORITATIVE shared shapes, never structural bases:
 * gate results are the keyed, discriminated `GateResults` (INV-016 holds
 * at the evidence boundary), the outcome is the shared `RunOutcome`
 * union, and operations reuse the event stream's `OperationRecord`.
 *
 * Container-runtime identity appears ONLY as an opaque data value:
 * changing runtime changes evidence values, never schemas
 * (runner-adoption INV-012). No field in these authority structures is
 * designated for credential-value transport.
 */
import { z } from 'zod'
import {
  AdapterId,
  AuthorityIdentity,
  CapabilityGrant,
  Digest,
  GateResults,
  ProfileIdentity,
  SemVer,
} from '@secure-home/contracts'
import { RunId, RunOutcome } from './run-record.js'
import { CallId, OperationRecord } from './run-events.js'

export const EVIDENCE_BUNDLE_ID = 'evidence-bundle' as const
export const EVIDENCE_BUNDLE_VERSION = '2.0.0' as const

/**
 * The identities an independent verifier re-derives. Version 2.0.0
 * (runner-contract-corrections D2): the digest-bound contract identities
 * of the governing path policy and gate registry are MANDATORY — an
 * evidence bundle that cannot name the authority that governed its run
 * does not validate.
 */
export const EvidenceIdentities = z.strictObject({
  run_id: RunId,
  profile: ProfileIdentity,
  image_digest: Digest,
  argv_digest: Digest,
  path_policy: AuthorityIdentity,
  gate_registry: AuthorityIdentity,
  /** Opaque data — never a schema branch. */
  runtime: z.string().min(1),
  provider: z.string().min(1),
  adapter: AdapterId,
})

/** `sub`, and an actor or the explicit autonomous/no-actor marker. */
export const Principal = z.strictObject({
  sub: z.string().min(1),
  acting: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('actor'), sub: z.string().min(1) }),
    z.strictObject({ kind: z.literal('autonomous') }),
  ]),
})

/** One operation as recorded in the run, correlated by call id. */
export const EvidenceOperation = z.strictObject({
  call_id: CallId,
  operation: OperationRecord,
})

export const ArtifactEntry = z.strictObject({
  path: z.string().min(1),
  digest: Digest,
  bytes: z.int().nonnegative(),
})

export const FileChange = z.strictObject({
  path: z.string().min(1),
  kind: z.enum(['created', 'modified', 'deleted']),
})

/**
 * Observed versus claimed change sets, with the reconciliation record. The
 * observed set is authoritative by construction — the field admits nothing
 * else.
 */
export const ChangeSets = z.strictObject({
  authoritative: z.literal('observed'),
  observed: z.array(FileChange),
  claimed: z.array(FileChange),
  reconciliation: z.strictObject({
    agreement: z.boolean(),
    disagreements: z.array(
      z.strictObject({
        path: z.string().min(1),
        detail: z.string().min(1),
      }),
    ),
  }),
})

export const EvidenceTiming = z.strictObject({
  started_at: z.iso.datetime(),
  finished_at: z.iso.datetime(),
  duration_seconds: z.number().nonnegative(),
})

export const EvidenceBundle = z.strictObject({
  contract_id: z.literal(EVIDENCE_BUNDLE_ID),
  contract_version: z.literal(EVIDENCE_BUNDLE_VERSION),
  identities: EvidenceIdentities,
  principal: Principal,
  /** The one authored grant shape — what was ACTUALLY granted. */
  granted_capabilities: CapabilityGrant,
  operations: z.strictObject({
    attempted: z.array(EvidenceOperation),
    permitted: z.array(EvidenceOperation),
    denied: z.array(EvidenceOperation),
  }),
  gate_results: GateResults,
  artifacts: z.array(ArtifactEntry),
  change_sets: ChangeSets,
  outcome: RunOutcome,
  timing: EvidenceTiming,
})

export type EvidenceBundleT = z.infer<typeof EvidenceBundle>

SemVer.parse(EVIDENCE_BUNDLE_VERSION)
