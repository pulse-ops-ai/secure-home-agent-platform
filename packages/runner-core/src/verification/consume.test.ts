/**
 * The final-consumer trust boundary (ADV-014, PROP-006, MUT-008 kill;
 * INV-015): verify → mutate → consume refuses; the earlier successful
 * verification authorizes nothing; the consumption result identifies the
 * digest of the bytes actually consumed.
 */
import { describe, expect, it } from 'vitest'
import { digestOf } from '../primitives/index.js'
import { consumeVerified } from './consume.js'
import { mulberry32 } from '../testing-fixtures.js'

describe('ADV-014: mutation after verification and before consumption', () => {
  it('consumption of unchanged bytes proceeds, naming the digest consumed', () => {
    const content = 'artifact content\n'
    const decision = consumeVerified({ path: 'out/result.json', content }, digestOf(content))
    if (decision.kind !== 'proceed') throw new Error('expected proceed')
    expect(decision.value).toEqual({ path: 'out/result.json', digest: digestOf(content) })
  })

  it('consumption of mutated bytes refuses despite the earlier verification', () => {
    const content = 'artifact content\n'
    const verifiedDigest = digestOf(content)
    const decision = consumeVerified(
      { path: 'out/result.json', content: `${content} ` },
      verifiedDigest,
    )
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('consumption_digest_mismatch')
    expect(decision.violated.element).toBe('out/result.json')
    expect(decision.violated.observed).toMatch(/^sha256:/)
  })
})

describe('PROP-006: holds for any generated artifact and mutation (MUT-008 kill)', () => {
  it('across 200 generated cases: unchanged consumes, any mutation refuses', () => {
    const random = mulberry32(55)
    for (let round = 0; round < 200; round += 1) {
      const content = `generated ${String(Math.floor(random() * 1e9))}\n`
      const digest = digestOf(content)
      expect(consumeVerified({ path: 'a', content }, digest).kind).toBe('proceed')
      const position = Math.floor(random() * content.length)
      const mutated = `${content.slice(0, position)}!${content.slice(position + 1)}`
      expect(mutated).not.toBe(content)
      expect(consumeVerified({ path: 'a', content: mutated }, digest).kind).toBe('refusal')
    }
  })
})
