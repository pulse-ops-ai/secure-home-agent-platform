/**
 * The early-termination record (capability `runner-evidence`): what a run
 * leaves behind when it terminates before its production authority
 * acquisition completes — a request naming no profile, a profile that
 * fails to resolve, or an acquisition fault. Such a run cannot construct
 * an evidence bundle, because the bundle's authority identities never
 * came into existence, and fabricating them is prohibited.
 *
 * Two properties are structural rather than conventional:
 *
 *  - **No authority surface.** There is no field for an authority
 *    identity, capability grant, gate result, change set, or artifact —
 *    so a fabricated-authority record is unrepresentable, not merely
 *    forbidden.
 *  - **No success.** The outcome is the shared terminal vocabulary with
 *    the one success state ABSENT (`EarlyTerminationOutcome`), composed from
 *    the same option instances `RunOutcome` uses. A run that obtained no
 *    authority cannot claim it succeeded.
 *
 * `requester` states WHO was refused — the identity that asked for the
 * run, available at request time. It is not execution authority and
 * grants nothing. That the value is populated from the run request
 * rather than from a captured profile is NOT decidable from this shape
 * (an agent principal is shape-identical); L4 owns that proof.
 */
import { z } from 'zod'
import { ProfileRef, SemVer } from '@secure-home/contracts'
import { EvidenceTiming, Principal } from './evidence.js'
import { EarlyTerminationOutcome, RunId } from './run-record.js'

export const EARLY_TERMINATION_RECORD_ID = 'early-termination-record' as const
export const EARLY_TERMINATION_RECORD_VERSION = '1.0.0' as const

export const EarlyTerminationRecord = z.strictObject({
  contract_id: z.literal(EARLY_TERMINATION_RECORD_ID),
  contract_version: z.literal(EARLY_TERMINATION_RECORD_VERSION),
  run_id: RunId,
  /** WHO was refused. Not authority; grants nothing. */
  requester: Principal,
  /** WHAT was asked for, as data — or an explicit null when nothing was named. */
  requested_profile: ProfileRef.nullable(),
  /** The terminal outcome, success structurally absent. */
  outcome: EarlyTerminationOutcome,
  timing: EvidenceTiming,
})

export type EarlyTerminationRecordT = z.infer<typeof EarlyTerminationRecord>

SemVer.parse(EARLY_TERMINATION_RECORD_VERSION)
