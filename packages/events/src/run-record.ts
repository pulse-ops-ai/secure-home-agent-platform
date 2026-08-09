/**
 * The run record (capability `runner-execution`): stable run identity, the
 * profile identity it launched from, and the shared run outcome — a
 * discriminated union on the enumerated terminal vocabulary, so
 * contradictory states are unrepresentable: COMPLETED carries no failure,
 * REFUSED requires contract_refusal detail, OPERATIONAL_FAILURE requires
 * operational detail, and CANCELLED/TIMED_OUT/INDETERMINATE carry their
 * own explicit detail with no failure class to contradict.
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

/**
 * The ONE run-outcome shape, shared by the run record, the evidence
 * bundle, and the run.terminated event — never redefined.
 */
export const RunOutcome = z.discriminatedUnion('terminal_state', [
  z.strictObject({ terminal_state: z.literal('COMPLETED') }),
  z.strictObject({
    terminal_state: z.literal('REFUSED'),
    failure: z.strictObject({
      class: z.literal('contract_refusal'),
      detail: z.string().min(1),
    }),
  }),
  z.strictObject({
    terminal_state: z.literal('OPERATIONAL_FAILURE'),
    failure: z.strictObject({
      class: z.literal('operational'),
      detail: z.string().min(1),
    }),
  }),
  z.strictObject({
    terminal_state: z.literal('CANCELLED'),
    detail: z.string().min(1),
  }),
  z.strictObject({
    terminal_state: z.literal('TIMED_OUT'),
    detail: z.string().min(1),
  }),
  z.strictObject({
    terminal_state: z.literal('INDETERMINATE'),
    detail: z.string().min(1),
  }),
])

export const RunRecord = z.strictObject({
  contract_id: z.literal(RUN_RECORD_ID),
  contract_version: z.literal(RUN_RECORD_VERSION),
  run_id: RunId,
  profile: ProfileIdentity,
  outcome: RunOutcome,
  // Evidence is structurally mandatory: a run without evidence is not a
  // valid run (packages/events charter; runner-adoption).
  evidence: z.strictObject({
    bundle_digest: Digest,
  }),
})

export type RunIdT = z.infer<typeof RunId>
export type TerminalStateT = z.infer<typeof TerminalState>
export type RunOutcomeT = z.infer<typeof RunOutcome>
export type RunRecordT = z.infer<typeof RunRecord>

SemVer.parse(RUN_RECORD_VERSION)
