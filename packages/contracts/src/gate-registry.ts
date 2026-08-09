/**
 * Gate registry and gate results (capability `runner-verification`).
 *
 * A gate is an exact executable plus argv array — never a shell string —
 * and its network field admits only "none": a networked gate is
 * inexpressible. Dispositions are the closed vocabulary
 * PASS | FAIL | SKIP_OK | SKIP_ENV, modeled as a discriminated union so
 * the illegal combinations are unrepresentable: PASS/SKIP_OK/SKIP_ENV
 * admit only truncated:false, and FAIL requires a non-empty reason
 * (truncation therefore can only ever be FAIL-with-reason).
 *
 * Registries and result sets are keyed by GateId, so identity uniqueness
 * is structural — it survives into the generated JSON Schema
 * (propertyNames pattern) instead of living only in a parse-time
 * refinement. (JSON itself collapses duplicate object keys at parse; the
 * contract makes a second disposition for one identity unrepresentable,
 * which is the stronger guarantee.)
 */
import { z } from 'zod'
import { GateId, SemVer } from './primitives.js'

export const GATE_REGISTRY_ID = 'gate-registry' as const
export const GATE_REGISTRY_VERSION = '1.0.0' as const

const EnvName = z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'environment-variable name')

/** One gate's execution declaration; its identity is the registry key. */
export const GateSpec = z.strictObject({
  executable: z.string().min(1),
  args: z.array(z.string()),
  timeout_seconds: z.int().positive(),
  max_output_bytes: z.int().positive(),
  environment_names: z.array(EnvName),
  network: z.literal('none'),
})

export const GateRegistry = z.strictObject({
  contract_id: z.literal(GATE_REGISTRY_ID),
  contract_version: z.literal(GATE_REGISTRY_VERSION),
  gates: z.record(GateId, GateSpec),
})

/** Closed disposition vocabulary — platform-owned. */
export const GateDisposition = z.enum(['PASS', 'FAIL', 'SKIP_OK', 'SKIP_ENV'])

/**
 * One gate's terminal outcome; its identity is the result-set key.
 * PASS/SKIP_OK/SKIP_ENV cannot be truncated; FAIL requires the reason.
 */
export const GateOutcome = z.discriminatedUnion('disposition', [
  z.strictObject({
    disposition: z.literal('PASS'),
    truncated: z.literal(false),
    reason: z.string().min(1).optional(),
  }),
  z.strictObject({
    disposition: z.literal('SKIP_OK'),
    truncated: z.literal(false),
    reason: z.string().min(1).optional(),
  }),
  z.strictObject({
    disposition: z.literal('SKIP_ENV'),
    truncated: z.literal(false),
    reason: z.string().min(1).optional(),
  }),
  z.strictObject({
    disposition: z.literal('FAIL'),
    truncated: z.boolean(),
    reason: z.string().min(1),
  }),
])

/** Exactly one terminal disposition per gate identity, structurally. */
export const GateResults = z.record(GateId, GateOutcome)

export type GateSpecT = z.infer<typeof GateSpec>
export type GateRegistryT = z.infer<typeof GateRegistry>
export type GateDispositionT = z.infer<typeof GateDisposition>
export type GateOutcomeT = z.infer<typeof GateOutcome>
export type GateResultsT = z.infer<typeof GateResults>

SemVer.parse(GATE_REGISTRY_VERSION)
