/**
 * Behavioural parity for the typescript-typed-unsafe shard.
 *
 * Registration is not parity. Every policy here is exercised against two real
 * files and BOTH engines: the invalid fixture must be rejected by each, the
 * valid one accepted by each, and both rejections attributed to the same
 * semantic policy.
 *
 * The legacy assertion runs first and is not a formality. A fixture that fires
 * nothing under ESLint would "pass" on both sides and prove only that neither
 * engine enforces the policy.
 */
import { describe, expect, it } from 'vitest'

// @ts-ignore
import { configForRole, loadAuthorities, parityFor, roleFor } from '../src/run-parity.mjs'

const { policy, mappings } = loadAuthorities()
const legacy = new Map(
  mappings.mappings.filter((m: any) => m.engine === 'legacy').map((m: any) => [m.policy, m]),
)
const replacement = new Map(
  mappings.mappings.filter((m: any) => m.engine === 'replacement').map((m: any) => [m.policy, m]),
)
const shard = policy.policies.filter((p: any) => p.proof.shard === 'typescript-typed-unsafe')

describe('typescript-typed-unsafe shard', () => {
  it('covers every policy allocated to it', () => {
    expect(shard).toHaveLength(13)
  })

  for (const row of shard as { id: string }[]) {
    it(`${row.id}: both engines agree`, async () => {
      const result = await parityFor(
        row,
        legacy.get(row.id),
        replacement.get(row.id),
        configForRole(roleFor(row)),
      )
      expect(result.legacyRejects, 'the invalid fixture must fire under ESLint').toBe(true)
      expect(result.legacyAccepts, 'the valid fixture must not fire under ESLint').toBe(true)
      expect(result.replacementRejects, 'the invalid fixture must fire under Oxlint').toBe(true)
      expect(result.replacementAccepts, 'the valid fixture must not fire under Oxlint').toBe(true)
    })
  }
})
