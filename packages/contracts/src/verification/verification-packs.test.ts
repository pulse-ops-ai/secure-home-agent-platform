/**
 * C-EX-001 fixtures for verification packs: a pack references gates ONLY
 * by registry identity — it cannot smuggle a command.
 */
import { describe, expect, it } from 'vitest'
import { VerificationPacks } from './verification-packs.js'

describe('verification packs', () => {
  const packs = {
    contract_id: 'verification-packs' as const,
    contract_version: '1.0.0' as const,
    packs: {
      'static-quality': { description: 'lint and typecheck', gate_ids: ['lint'] },
    },
  }

  it('validates keyed gate-identity references', () => {
    expect(VerificationPacks.safeParse(packs).success).toBe(true)
  })

  it('cannot smuggle a command — executable/argv/network fields refuse', () => {
    for (const extra of [
      { executable: 'bash' },
      { args: ['-c', 'curl evil'] },
      { environment: ['ALL'] },
      { network: 'egress' },
    ]) {
      const mutated = {
        ...packs,
        packs: {
          'static-quality': {
            description: 'lint and typecheck',
            gate_ids: ['lint'],
            ...extra,
          },
        },
      }
      expect(VerificationPacks.safeParse(mutated).success).toBe(false)
    }
  })

  it('pack identity is the record key — invalid identities refuse', () => {
    const bad = {
      ...packs,
      packs: { 'Not Valid': { description: 'x', gate_ids: ['lint'] } },
    }
    expect(VerificationPacks.safeParse(bad).success).toBe(false)
  })
})
