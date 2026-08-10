/**
 * PROP-003 (RC-MUT-03 support): for ANY generated bound/measured pair,
 * the result is proceed at-or-under the bound and a refusal naming the
 * bound above it — never a truncated variant, and the exactly-at edge is
 * deterministic across repeated evaluation.
 */
import { describe, expect, it } from 'vitest'
import { enforceBound } from './bounds.js'
import { mulberry32 } from '../testing-fixtures.js'

describe('PROP-003: bounds refuse, never truncate', () => {
  it('holds across 500 generated cases including the exact edge', () => {
    const random = mulberry32(52)
    for (let index = 0; index < 500; index += 1) {
      const declared = Math.floor(random() * 100000)
      const roll = random()
      const measured =
        roll < 0.25
          ? declared // exactly at the bound — must proceed
          : roll < 0.5
            ? declared + 1 + Math.floor(random() * 1000) // strictly over
            : Math.floor(random() * (declared + 1)) // at or under
      const decision = enforceBound('generated_bound', measured, declared)
      if (measured > declared) {
        expect(decision.kind).toBe('refusal')
        if (decision.kind !== 'refusal') throw new Error('expected refusal')
        expect(decision.code).toBe('over_bound')
        expect(decision.violated.element).toBe('generated_bound')
        expect(decision.violated.observed).toBe(String(measured))
      } else {
        expect(decision.kind).toBe('proceed')
        if (decision.kind !== 'proceed') throw new Error('expected proceed')
        // No truncated, sampled, or partial variant exists to return.
        expect(decision.value).toEqual({
          bound: 'generated_bound',
          measured,
          declared,
        })
      }
      // The edge decides identically on repeated evaluation.
      expect(enforceBound('generated_bound', measured, declared)).toEqual(decision)
    }
  })

  it('a non-finite measurement is undecidable, never in-bounds', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const decision = enforceBound('b', bad, 100)
      expect(decision.kind).toBe('refusal')
      if (decision.kind !== 'refusal') throw new Error('expected refusal')
      expect(decision.code).toBe('undecidable')
    }
  })
})
