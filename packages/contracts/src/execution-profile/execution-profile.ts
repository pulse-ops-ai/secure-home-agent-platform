/**
 * The execution profile — the platform's authority shape (capability
 * `execution-profile`). Complete enough to express every ratified grant;
 * expression only — enforcement is L4/L9, credential custody is U2.
 */
import { z } from 'zod'
import {
  AdapterId,
  CapabilityGrant,
  Digest,
  ProfileRef,
  RoutingClass,
  SemVer,
} from '../primitives/index.js'

export const EXECUTION_PROFILE_ID = 'execution-profile' as const
export const EXECUTION_PROFILE_VERSION = '1.0.0' as const

export const ExecutionProfile = z.strictObject({
  contract_id: z.literal(EXECUTION_PROFILE_ID),
  contract_version: z.literal(EXECUTION_PROFILE_VERSION),
  identity: ProfileRef,
  runtime: z.strictObject({
    image_digest: Digest,
    adapter: AdapterId,
  }),
  capability: CapabilityGrant,
  execution: z.strictObject({
    routing_class: RoutingClass,
    model_route: z.string().min(1),
    fallback: z.string().min(1),
  }),
  limits: z.strictObject({
    wall_clock_seconds: z.int().positive(),
    cpu_cores: z.number().positive(),
    memory_bytes: z.int().positive(),
    pids: z.int().positive(),
    output_bytes: z.int().positive(),
  }),
  principal: z.strictObject({
    sub: z.string().min(1),
    actor_required: z.boolean(),
  }),
  // A named selection reference ONLY. No tool, mount, egress, or credential
  // field exists here: the knowledge group is structurally incapable of
  // granting (runner-adoption; knowledge-selection-model.md).
  knowledge: z.strictObject({
    selection: z.string().min(1),
  }),
  evidence: z.strictObject({
    contract: z.string().min(1),
  }),
})

export type ExecutionProfileT = z.infer<typeof ExecutionProfile>

/** Version constant with exact-semver shape, asserted at module load. */
SemVer.parse(EXECUTION_PROFILE_VERSION)
