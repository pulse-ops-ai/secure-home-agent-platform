/**
 * The run record (capability `runner-execution`): stable run identity, the
 * profile identity it launched from, and the enumerated terminal
 * vocabulary. Only COMPLETED maps to success; INDETERMINATE is a failure
 * class — ambiguity never classifies as success.
 */
import { z } from 'zod'
import { Digest, ProfileIdentity, SemVer } from '@secure-home/contracts'

export const RUN_RECORD_ID = 'run-record' as const
export const RUN_RECORD_VERSION = '1.0.0' as const

export const RunId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,127}$/, 'run id: lowercase, <=128 chars')

/** Closed, enumerated terminal vocabulary — platform-owned. */
export const TerminalState = z.enum([
  'COMPLETED',
  'REFUSED',
  'OPERATIONAL_FAILURE',
  'CANCELLED',
  'TIMED_OUT',
  'INDETERMINATE',
])

/** The complete success/failure mapping. COMPLETED is the only success. */
export const TERMINAL_SUCCESS: Readonly<Record<z.infer<typeof TerminalState>, boolean>> = {
  COMPLETED: true,
  REFUSED: false,
  OPERATIONAL_FAILURE: false,
  CANCELLED: false,
  TIMED_OUT: false,
  INDETERMINATE: false,
}

/** Failure classification carried as data (vocabulary per constitution D5). */
export const FailureClass = z.enum(['contract_refusal', 'operational'])

export const RunRecord = z.strictObject({
  contract_id: z.literal(RUN_RECORD_ID),
  contract_version: z.literal(RUN_RECORD_VERSION),
  run_id: RunId,
  profile: ProfileIdentity,
  terminal_state: TerminalState,
  failure: z
    .strictObject({
      class: FailureClass,
      detail: z.string().min(1),
    })
    .optional(),
  // Evidence is structurally mandatory: a run without evidence is not a
  // valid run (packages/events charter; runner-adoption).
  evidence: z.strictObject({
    bundle_digest: Digest,
  }),
})

export type RunIdT = z.infer<typeof RunId>
export type TerminalStateT = z.infer<typeof TerminalState>
export type RunRecordT = z.infer<typeof RunRecord>

SemVer.parse(RUN_RECORD_VERSION)
