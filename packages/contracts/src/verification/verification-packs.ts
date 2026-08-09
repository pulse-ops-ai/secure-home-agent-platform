/**
 * Verification packs (capability `runner-verification`): named groupings of
 * gate identities, keyed by pack id so identity uniqueness is structural
 * and survives into the generated JSON Schema. A pack references gates
 * ONLY by registry identity — no executable, argv, environment, or network
 * field exists, so a pack cannot smuggle a command.
 */
import { z } from 'zod'
import { GateId, SemVer } from '../primitives/index.js'

export const VERIFICATION_PACKS_ID = 'verification-packs' as const
export const VERIFICATION_PACKS_VERSION = '1.0.0' as const

export const PackId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/)

/** One pack's declaration; its identity is the record key. */
export const PackSpec = z.strictObject({
  description: z.string().min(1),
  gate_ids: z.array(GateId).min(1),
})

export const VerificationPacks = z.strictObject({
  contract_id: z.literal(VERIFICATION_PACKS_ID),
  contract_version: z.literal(VERIFICATION_PACKS_VERSION),
  packs: z.record(PackId, PackSpec),
})

export type PackSpecT = z.infer<typeof PackSpec>
export type VerificationPacksT = z.infer<typeof VerificationPacks>

SemVer.parse(VERIFICATION_PACKS_VERSION)
