/**
 * C-ADV-007A/B + C-MUT-006 kill: the identity ledger is current-state
 * consistent AND historically append-only against the accepted base (a
 * rewritten or vanished accepted entry fails). C-PROP-005: one identity,
 * one byte set — every `$id` embeds the exact contract version. The git
 * fixtures proving the full seam live in `../schema/ledger-history.test.ts`;
 * here the same injectable guard runs against the REAL repository.
 */
import { env as processEnv } from 'node:process'
import { describe, expect, it } from 'vitest'
import {
  checkLedgerCurrentState,
  checkLedgerHistory,
  verifyLedgerHistory,
  type Ledger,
} from '../schema/ledger-history.js'
import { committedSchemas, currentLedger, digest, repoRoot } from './helpers.js'

describe('identity ledger (C-ADV-007A/B, C-MUT-006 kill)', () => {
  it('current state: every committed schema matches its ledger digest', () => {
    expect(checkLedgerCurrentState(currentLedger(), committedSchemas(), digest)).toEqual([])
  })

  it('007A: changed bytes with an unchanged ledger fail, identity named', () => {
    const files = new Map(committedSchemas())
    const [firstPath] = [...files.keys()]
    files.set(firstPath ?? '', `${files.get(firstPath ?? '') ?? ''} `)
    const failures = checkLedgerCurrentState(currentLedger(), files, digest)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('bytes do not match ledger digest')
  })

  it('007B: a rewritten accepted entry fails despite self-consistency', () => {
    const accepted: Ledger = { 'foo@1.0.0': 'sha256:aaaa' }
    const proposed: Ledger = { 'foo@1.0.0': 'sha256:bbbb' }
    const failures = checkLedgerHistory(accepted, proposed)
    expect(failures).toEqual(['accepted ledger entry rewritten: foo@1.0.0'])
  })

  it('a vanished accepted entry fails — entries never disappear', () => {
    const failures = checkLedgerHistory({ 'foo@1.0.0': 'sha256:aaaa' }, {})
    expect(failures).toEqual(['accepted ledger entry disappeared: foo@1.0.0'])
  })

  it('an appended new identity passes the historical comparison', () => {
    const accepted: Ledger = { 'foo@1.0.0': 'sha256:aaaa' }
    const proposed: Ledger = { 'foo@1.0.0': 'sha256:aaaa', 'foo@1.1.0': 'sha256:bbbb' }
    expect(checkLedgerHistory(accepted, proposed)).toEqual([])
  })

  it('historical comparison against the accepted base ledger (fail closed)', () => {
    // The REAL repository run of the same injectable guard the git
    // fixtures in ../schema/ledger-history.test.ts prove end-to-end:
    // base resolution must succeed (throw = failure, never a skip);
    // genesis is only a ledger absent at the resolved base.
    const failures = verifyLedgerHistory(
      {
        cwd: repoRoot,
        eventPath: processEnv['GITHUB_EVENT_PATH'],
        fallbackRef: 'origin/main',
        ledgerPath: 'schemas/identity-ledger.json',
      },
      currentLedger(),
    )
    expect(failures).toEqual([])
  })
})

describe('identity exactness (C-PROP-005)', () => {
  it('every $id embeds the exact contract version and appears in the ledger', () => {
    const ledger = currentLedger()
    const seen = new Set<string>()
    for (const [relPath, content] of committedSchemas()) {
      const schema = JSON.parse(content) as { $id?: string }
      const [id, file] = relPath.split('/')
      const version = (file ?? '').replace(/\.json$/, '')
      expect(schema.$id).toBe(`urn:secure-home:contract:${id}:${version}`)
      expect(seen.has(schema.$id ?? '')).toBe(false)
      seen.add(schema.$id ?? '')
      expect(ledger[`${id}@${version}`]).toBeDefined()
    }
  })

  it('distinct byte sets never share an identity digest', () => {
    const digests = Object.values(currentLedger())
    expect(new Set(digests).size).toBe(digests.length)
  })
})
