/**
 * C-PROP-003 (closed dispositions), C-ADV-004 (identity uniqueness is
 * structural: keyed records make a second disposition for one gate
 * unrepresentable, in Zod AND in the generated JSON Schema), plus
 * networked-gate inexpressibility and the discriminated truncation
 * semantics (truncation can only ever be FAIL-with-reason).
 */
import { describe, expect, it } from 'vitest'
import { GateOutcome, GateRegistry, GateResults } from './gate-registry.js'
import { generateArtifacts } from './generation.js'

const spec = () => ({
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
  gates: Object.fromEntries(ids.map((id) => [id, spec()])),
})

describe('gate registry', () => {
  it('validates keyed gates (C-EX-001)', () => {
    expect(GateRegistry.safeParse(registry(['lint', 'unit-tests'])).success).toBe(true)
  })

  it('a networked gate is inexpressible', () => {
    const doc = registry(['lint'])
    doc.gates['lint'] = { ...spec(), network: 'egress' as never }
    expect(GateRegistry.safeParse(doc).success).toBe(false)
  })

  it('a shell-string gate is inexpressible (args must be an array)', () => {
    const doc = registry(['lint'])
    doc.gates['lint'] = { ...spec(), args: 'pnpm test' as never }
    expect(GateRegistry.safeParse(doc).success).toBe(false)
  })

  it('an invalid gate identity key refuses (C-ADV-004 registry half)', () => {
    expect(GateRegistry.safeParse(registry(['Lint'])).success).toBe(false)
    expect(GateRegistry.safeParse(registry([''])).success).toBe(false)
  })

  it('gate identity uniqueness survives into the generated JSON Schema', async () => {
    const artifacts = await generateArtifacts()
    const schema = JSON.parse(artifacts.get('gate-registry/1.0.0.json') ?? '{}') as {
      properties: { gates: Record<string, unknown> }
    }
    // A keyed object cannot carry two entries for one identity — the
    // uniqueness constraint is structural, not a lost refinement.
    expect(schema.properties.gates['type']).toBe('object')
    expect(schema.properties.gates['propertyNames']).toBeDefined()
  })
})

describe('gate outcomes (C-PROP-003)', () => {
  it('accepts exactly the closed vocabulary', () => {
    for (const disposition of ['PASS', 'SKIP_OK', 'SKIP_ENV'] as const) {
      expect(GateOutcome.safeParse({ disposition, truncated: false }).success).toBe(true)
    }
    expect(
      GateOutcome.safeParse({ disposition: 'FAIL', reason: 'exit 1', truncated: false }).success,
    ).toBe(true)
  })

  it('refuses every out-of-vocabulary disposition', () => {
    for (const bad of ['pass', 'SKIPPED', 'WARN', 'INDETERMINATE', 'skip_env', '']) {
      expect(GateOutcome.safeParse({ disposition: bad, truncated: false }).success).toBe(false)
    }
  })

  it('truncation is unrepresentable outside FAIL-with-reason', () => {
    // PASS/SKIP_OK/SKIP_ENV admit only truncated:false.
    for (const disposition of ['PASS', 'SKIP_OK', 'SKIP_ENV'] as const) {
      expect(GateOutcome.safeParse({ disposition, truncated: true }).success).toBe(false)
    }
    // FAIL without a reason is unrepresentable, truncated or not.
    expect(GateOutcome.safeParse({ disposition: 'FAIL', truncated: true }).success).toBe(false)
    expect(GateOutcome.safeParse({ disposition: 'FAIL', truncated: false }).success).toBe(false)
    expect(
      GateOutcome.safeParse({
        disposition: 'FAIL',
        reason: 'output truncated at 262144 bytes',
        truncated: true,
      }).success,
    ).toBe(true)
  })

  it('a result set is keyed by identity — a second disposition is unrepresentable', () => {
    expect(
      GateResults.safeParse({
        lint: { disposition: 'PASS', truncated: false },
        'unit-tests': { disposition: 'FAIL', reason: 'exit 1', truncated: false },
      }).success,
    ).toBe(true)
    // The old array-of-results shape (which could carry duplicates) refuses.
    expect(
      GateResults.safeParse([{ gate_id: 'lint', disposition: 'PASS', truncated: false }]).success,
    ).toBe(false)
    // Invalid identity keys refuse.
    expect(
      GateResults.safeParse({ 'Not-Valid': { disposition: 'PASS', truncated: false } }).success,
    ).toBe(false)
  })
})
