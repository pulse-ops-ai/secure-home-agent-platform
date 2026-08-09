/**
 * C-PROP-003 (closed dispositions), C-ADV-004 (duplicate identities refuse
 * in registry AND result set), plus networked-gate inexpressibility and
 * truncation-is-FAIL (runner-verification requirements).
 */
import { describe, expect, it } from 'vitest'
import { GateRegistry, GateResult, GateResultSet } from './gate-registry.js'

const gate = (id: string) => ({
  id,
  executable: 'pnpm',
  args: ['test'],
  timeout_seconds: 900,
  max_output_bytes: 262144,
  environment_names: ['PATH', 'HOME'],
  network: 'none' as const,
})

const registry = (ids: readonly string[]) => ({
  contract_id: 'gate-registry' as const,
  contract_version: '1.0.0' as const,
  gates: ids.map(gate),
})

describe('gate registry', () => {
  it('validates unique gates (C-EX-001)', () => {
    expect(GateRegistry.safeParse(registry(['lint', 'unit-tests'])).success).toBe(true)
  })

  it('a networked gate is inexpressible', () => {
    const doc = registry(['lint'])
    const mutated = {
      ...doc,
      gates: [{ ...doc.gates[0], network: 'egress' }],
    }
    expect(GateRegistry.safeParse(mutated).success).toBe(false)
  })

  it('a shell-string gate is inexpressible (args must be an array)', () => {
    const doc = registry(['lint'])
    const mutated = { ...doc, gates: [{ ...doc.gates[0], args: 'pnpm test' }] }
    expect(GateRegistry.safeParse(mutated).success).toBe(false)
  })

  it('duplicate gate identity refuses, naming the duplicate (C-ADV-004)', () => {
    const result = GateRegistry.safeParse(registry(['lint', 'lint']))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('duplicate gate identity')
    }
  })
})

describe('gate dispositions (C-PROP-003)', () => {
  it('accepts exactly the closed vocabulary', () => {
    for (const disposition of ['PASS', 'SKIP_OK', 'SKIP_ENV'] as const) {
      expect(
        GateResult.safeParse({
          gate_id: 'lint',
          disposition,
          truncated: false,
        }).success,
      ).toBe(true)
    }
    expect(
      GateResult.safeParse({
        gate_id: 'lint',
        disposition: 'FAIL',
        reason: 'exit 1',
        truncated: false,
      }).success,
    ).toBe(true)
  })

  it('refuses every out-of-vocabulary disposition', () => {
    for (const bad of ['pass', 'SKIPPED', 'WARN', 'INDETERMINATE', 'skip_env', '']) {
      expect(
        GateResult.safeParse({ gate_id: 'lint', disposition: bad, truncated: false }).success,
      ).toBe(false)
    }
  })

  it('truncation classifies as FAIL with an explicit reason', () => {
    expect(
      GateResult.safeParse({ gate_id: 'lint', disposition: 'PASS', truncated: true }).success,
    ).toBe(false)
    expect(
      GateResult.safeParse({ gate_id: 'lint', disposition: 'FAIL', truncated: true }).success,
    ).toBe(false)
    expect(
      GateResult.safeParse({
        gate_id: 'lint',
        disposition: 'FAIL',
        reason: 'output truncated at 262144 bytes',
        truncated: true,
      }).success,
    ).toBe(true)
  })

  it('a second terminal disposition for one gate refuses (C-ADV-004)', () => {
    const result = GateResultSet.safeParse({
      results: [
        { gate_id: 'lint', disposition: 'PASS', truncated: false },
        { gate_id: 'lint', disposition: 'FAIL', reason: 'x', truncated: false },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('duplicate gate identity')
    }
  })
})
