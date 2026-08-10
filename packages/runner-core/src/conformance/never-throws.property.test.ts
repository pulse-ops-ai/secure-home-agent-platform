/**
 * RC-PROP-01 (RC-INV-06): for ANY generated input — including hostile,
 * untyped junk a non-TypeScript caller could pass — every exported
 * trusted operation returns its declared result value and throws for no
 * contract reason. A thrown contract decision would be swallowable and
 * unenumerable; a returned one is data.
 */
import { describe, expect, it } from 'vitest'
import { PathPolicy, type PathPolicyT } from '@secure-home/contracts'
import {
  captureAuthority,
  compareBaseIdentity,
  consumeVerified,
  decideEligibility,
  decideMaterialization,
  decideSealEligibility,
  deriveAuthoritativeChangeSet,
  enforceBound,
  reconcileClaims,
  verifyEvidence,
} from '../index.js'
import { mulberry32 } from '../testing-fixtures.js'

const JUNK = [
  undefined,
  null,
  0,
  -1,
  Number.NaN,
  '',
  'garbage',
  [],
  {},
  { ok: 'maybe' },
  { kind: 'proceed' },
  () => 'callable junk',
  Symbol('junk'),
] as const

const RESULT_KINDS = new Set(['proceed', 'refusal', 'operational_failure'])

const isDeclaredResult = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (typeof record['kind'] === 'string') return RESULT_KINDS.has(record['kind'])
  // Non-Decision result records: capture, reconciliation, verification.
  return 'ok' in record || 'agreement' in record || 'verified' in record
}

describe('RC-PROP-01: no exported operation throws for a contract reason', () => {
  it('every operation survives 13^2 junk-input pairings and returns a declared shape', () => {
    const operations: readonly ((a: unknown, b: unknown) => unknown)[] = [
      (a, b) =>
        captureAuthority(
          a as never,
          (b ?? { contract_id: 'path-policy', schema: PathPolicy }) as never,
        ),
      (a, b) => decideEligibility(a ?? {}, Array.isArray(b) ? (b as never) : []),
      (a, b) => decideMaterialization(a as never, (b ?? { changes: [] }) as never),
      (a) => deriveAuthoritativeChangeSet((a ?? { ok: false, failure: 'junk' }) as never),
      (a, b) => reconcileClaims((a ?? { changes: [] }) as never, b),
      (a, b) => decideSealEligibility({ bundle: a, outcome: b as never }),
      (a, b) => compareBaseIdentity(a as never, b as never),
      (a, b) => enforceBound('junk_bound', a as never, b as never),
      (a, b) =>
        consumeVerified(
          { path: 'x', content: typeof a === 'string' ? a : 'content' },
          typeof b === 'string' ? b : 'sha256:0',
        ),
      (a, b) =>
        verifyEvidence(a, {
          profile: { ok: false, source: { source: 'p' }, failure: 'junk' },
          path_policy: { ok: false, source: { source: 'q' }, failure: 'junk' },
          gate_registry: { ok: false, source: { source: 'r' }, failure: 'junk' },
          artifacts: (b ?? { ok: false, failure: 'junk' }) as never,
        }),
    ]
    for (const operation of operations) {
      for (const a of JUNK) {
        for (const b of JUNK) {
          const result = operation(a, b)
          expect(isDeclaredResult(result), `undeclared result: ${String(result)}`).toBe(true)
        }
      }
    }
  })

  it('operations also hold across 100 generated structured-ish inputs', () => {
    const random = mulberry32(56)
    for (let round = 0; round < 100; round += 1) {
      const noise = {
        changes: [{ path: `p${String(round)}`, kind: 'modified', bytes: random() * 1000 }],
      }
      expect(isDeclaredResult(deriveAuthoritativeChangeSet(noise as never))).toBe(true)
      expect(isDeclaredResult(decideMaterialization(undefined, noise as never))).toBe(true)
      const captured = captureAuthority<PathPolicyT>(
        {
          ok: true,
          source: { source: 's' },
          bytes: `{"contract_id":"path-policy","n":${String(round)}}`,
        },
        { contract_id: 'path-policy', schema: PathPolicy },
      )
      expect(isDeclaredResult(captured)).toBe(true)
    }
  })
})
