/**
 * Verification packs (capability `runner-verification`): named groupings of
 * gate identities. A pack references gates ONLY by registry identity — no
 * executable, argv, environment, or network field exists, so a pack cannot
 * smuggle a command.
 */
import { z } from 'zod'
import { GateId, SemVer } from './primitives.js'

export const VERIFICATION_PACKS_ID = 'verification-packs' as const
export const VERIFICATION_PACKS_VERSION = '1.0.0' as const

export const VerificationPack = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().min(1),
  gate_ids: z.array(GateId).min(1),
})

export const VerificationPacksBase = z.strictObject({
  contract_id: z.literal(VERIFICATION_PACKS_ID),
  contract_version: z.literal(VERIFICATION_PACKS_VERSION),
  packs: z.array(VerificationPack),
})

/** Parse authority: pack identities are unique. */
export const VerificationPacks = VerificationPacksBase.superRefine((value, ctx) => {
  const seen = new Set<string>()
  for (const [index, pack] of value.packs.entries()) {
    if (seen.has(pack.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate pack identity: ${pack.id}`,
        path: ['packs', index],
      })
    }
    seen.add(pack.id)
  }
})

export type VerificationPackT = z.infer<typeof VerificationPack>
export type VerificationPacksT = z.infer<typeof VerificationPacks>

SemVer.parse(VERIFICATION_PACKS_VERSION)
