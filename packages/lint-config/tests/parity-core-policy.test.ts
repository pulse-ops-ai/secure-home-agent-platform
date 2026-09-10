/**
 * Behavioural conformance for the core-policy shard.
 *
 * Registration is not enforcement. Every policy here is exercised against two
 * real files: the invalid fixture must be rejected and the valid one accepted,
 * both attributed to this policy's own rule identity rather than to whatever
 * else the config happens to flag.
 *
 * Task 3.4 retired the second engine, so this is no longer a cross-engine
 * agreement test. It loses nothing that mattered. The legacy side was an
 * oracle of record for the migration, but the property that actually catches a
 * dead fixture was always the accept/reject PAIR: a fixture that fires nothing
 * fails `rejects`, and a fixture that fires unconditionally fails `accepts`.
 * Both still run, against the engine that now enforces in production.
 */
import { describe, expect, it } from 'vitest'

// @ts-ignore
import { configForRole, conformanceFor, loadAuthorities, roleFor } from '../src/run-parity.mjs'

const { policy, mappings } = loadAuthorities()
const replacement = new Map(
  mappings.mappings.filter((m: any) => m.engine === 'replacement').map((m: any) => [m.policy, m]),
)
const shard = policy.policies.filter((p: any) => p.proof.shard === 'core-policy')

describe('core-policy shard', () => {
  it('covers every policy allocated to it', () => {
    expect(shard).toHaveLength(16)
  })

  for (const row of shard as { id: string }[]) {
    it(`${row.id}: enforced, and only on the invalid fixture`, () => {
      const result = conformanceFor(row, replacement.get(row.id), configForRole(roleFor(row)))
      expect(result.rejects, 'the invalid fixture must fire under Oxlint').toBe(true)
      expect(result.accepts, 'the valid fixture must not fire under Oxlint').toBe(true)
    })
  }
})
