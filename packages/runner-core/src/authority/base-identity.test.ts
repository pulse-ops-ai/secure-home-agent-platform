/**
 * ADV-004, L3's half: a base-identity mismatch INPUT yields refusal;
 * matching identities proceed. The assertion that the comparison ran at
 * workspace creation, before any model invocation, is L4's half and is
 * not claimed here.
 */
import { describe, expect, it } from 'vitest'
import { compareBaseIdentity } from './base-identity.js'
import { digestHex } from '../testing-fixtures.js'

describe('ADV-004 (comparison half): pinned base identity', () => {
  it('a matching observed identity proceeds', () => {
    const decision = compareBaseIdentity(digestHex('a'), digestHex('a'))
    expect(decision.kind).toBe('proceed')
  })

  it('a mismatching observed identity refuses naming both', () => {
    const decision = compareBaseIdentity(digestHex('a'), digestHex('b'))
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('base_identity_mismatch')
    expect(decision.violated.element).toBe(digestHex('a'))
    expect(decision.violated.observed).toBe(digestHex('b'))
  })

  it('a missing pinned identity is undecidable, never a match', () => {
    const decision = compareBaseIdentity('', digestHex('a'))
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('undecidable')
  })
})
