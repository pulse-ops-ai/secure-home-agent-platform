/**
 * The acquire-once proof net:
 *
 *  RO-EX-04    a consumed token is a structural error naming source and
 *              epoch, and performs NO host read
 *  RO-PROP-01  for any acquisition order, each source is read at most
 *              once per epoch and at most twice per run
 *  RO-ADV-04   source bytes mutating mid-run change no production decision
 *  RO-ADV-05   producer values are not expressible as verifier inputs
 */
import { describe, expect, expectTypeOf, it } from 'vitest'
import { AcquisitionSet } from './tokens.js'
import { runEpoch, type EpochResult } from './epochs.js'
import { CountingAuthoritySource, DOCUMENTS } from '../testing-fixtures.js'
import type { EpochValue } from './tokens.js'

const SOURCES = ['profile', 'path_policy', 'gate_registry'] as const

describe('RO-EX-04: a token is single-use within its epoch', () => {
  it('a second consumption is a structural error naming source and epoch', async () => {
    const port = new CountingAuthoritySource()
    const set = new AcquisitionSet('run-1', 'production', port, ['profile'])

    const first = await set.consume('profile')
    expect(first.ok).toBe(true)

    const second = await set.consume('profile')
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.kind).toBe('token_already_consumed')
    expect(second.error.source).toBe('profile')
    expect(second.error.epoch).toBe('production')
  })

  it('the refused second consumption performs NO host read', async () => {
    const port = new CountingAuthoritySource()
    const set = new AcquisitionSet('run-1', 'production', port, ['profile'])
    await set.consume('profile')
    const readsAfterFirst = port.reads.length
    await set.consume('profile')
    await set.consume('profile')
    expect(port.reads.length, 'a spent token must not reach the host at all').toBe(readsAfterFirst)
  })

  it('a source the epoch never declared is refused, not read', async () => {
    const port = new CountingAuthoritySource()
    const set = new AcquisitionSet('run-1', 'production', port, ['profile'])
    const outcome = await set.consume('gate_registry')
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error.kind).toBe('source_not_declared')
    expect(port.reads).toHaveLength(0)
  })

  it('a token consumed by a FAILING read is still spent — failure is not a retry', async () => {
    const port = new CountingAuthoritySource({
      profile: { ok: false, source: { source: 'profile' }, failure: 'disk unreadable' },
    })
    const set = new AcquisitionSet('run-1', 'production', port, ['profile'])
    await set.consume('profile')
    const outcome = await set.consume('profile')
    expect(outcome.ok).toBe(false)
    expect(port.reads).toHaveLength(1)
  })
})

describe('RO-PROP-01: at most once per epoch, at most twice per run', () => {
  const permutations = <T>(items: readonly T[]): T[][] => {
    if (items.length <= 1) return [[...items]]
    return items.flatMap((item, index) =>
      permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
        item,
        ...rest,
      ]),
    )
  }

  it('holds for every acquisition order, in both epochs', async () => {
    let checked = 0
    for (const order of permutations(SOURCES)) {
      const port = new CountingAuthoritySource()
      const production = new AcquisitionSet('run-p', 'production', port, SOURCES)
      const verification = new AcquisitionSet('run-p', 'verification', port, SOURCES)
      // Every source consumed twice per epoch; the second must be refused.
      for (const source of order) {
        await production.consume(source)
        await production.consume(source)
      }
      for (const source of order) {
        await verification.consume(source)
        await verification.consume(source)
      }
      for (const source of SOURCES) {
        const perRun = port.readsFor('run-p', source)
        expect(perRun.length, `${source} read ${String(perRun.length)} times in one run`).toBe(2)
        for (const epoch of ['production', 'verification'] as const) {
          expect(perRun.filter((read) => read.epoch === epoch)).toHaveLength(1)
        }
      }
      checked += 1
    }
    expect(checked).toBe(6)
  })

  it('a run that never verifies has read each source exactly once — never more', async () => {
    const port = new CountingAuthoritySource()
    const set = new AcquisitionSet('run-early', 'production', port, SOURCES)
    await runEpoch(set, [...SOURCES])
    for (const source of SOURCES) {
      expect(port.readsFor('run-early', source)).toHaveLength(1)
    }
  })
})

describe('RO-ADV-04: source bytes mutating mid-run change no production decision', () => {
  it('a document that changes after capture is not re-read, so the decision stands', async () => {
    let mutated = false
    const port = new CountingAuthoritySource()
    const mutating = {
      read: (request: { run_id: string; epoch: 'production' | 'verification'; source: string }) => {
        const document = DOCUMENTS[request.source]?.() ?? {}
        if (mutated) document['contract_version'] = '9.9.9'
        port.reads.push(request)
        return Promise.resolve({
          ok: true as const,
          source: { source: request.source },
          bytes: JSON.stringify(document),
        })
      },
    }
    const set = new AcquisitionSet('run-m', 'production', mutating, ['profile'])
    const before = await set.consume('profile')
    mutated = true
    const after = await set.consume('profile')

    expect(before.ok).toBe(true)
    expect(after.ok, 'the mutation must not get a second read').toBe(false)
    expect(port.reads).toHaveLength(1)
  })
})

describe('RO-ADV-05: producer values are unexpressible as verifier inputs', () => {
  it('the two epochs acquire through DIFFERENT tokens and DIFFERENT reads', async () => {
    const port = new CountingAuthoritySource()
    const production = new AcquisitionSet('run-v', 'production', port, ['profile'])
    const verification = new AcquisitionSet('run-v', 'verification', port, ['profile'])
    const produced = await production.consume('profile')
    const verified = await verification.consume('profile')
    expect(produced.ok && verified.ok).toBe(true)
    if (!produced.ok || !verified.ok) return
    expect(produced.value.epoch).toBe('production')
    expect(verified.value.epoch).toBe('verification')
    expect(port.readsFor('run-v')).toHaveLength(2)
  })

  it('a production value does not TYPE-CHECK where a verification value is required', () => {
    // The proof is at the type level, which is where "unexpressible"
    // has to hold: a runtime guard could be bypassed, a type error
    // cannot be written in the first place.
    expectTypeOf<EpochValue<'production'>>().not.toMatchTypeOf<EpochValue<'verification'>>()
    expectTypeOf<EpochResult<'production'>>().not.toMatchTypeOf<EpochResult<'verification'>>()
  })
})
