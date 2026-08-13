/**
 * The mutation-target map (task 7.3).
 *
 * The map is itself a test, and it FAILS WHEN A REGISTERED TARGET IS
 * ABSENT FROM THE SWEEP rather than passing over a shorter list. That
 * distinction is the whole value: `RO-MUT-06` and `RO-MUT-07` were both
 * minted and both silently missing from an earlier sweep that named
 * `RO-MUT-01…05` and passed. A checklist that cannot notice its own gaps
 * certifies whatever it happens to contain.
 *
 * Each target names the mutation and the proof that kills it. The proof
 * must exist in this package's test corpus — a target pointing at a test
 * nobody wrote is exactly the gap this map exists to expose.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

interface MutationTarget {
  readonly id: string
  /** The behaviour a mutant would remove. */
  readonly mutation: string
  /** The proof identifiers whose failure signals the kill. */
  readonly killedBy: readonly string[]
}

/**
 * Every mutation target this landing registers. Adding a target here
 * without a proof that names it fails the map — which is the point.
 */
const TARGETS: readonly MutationTarget[] = [
  {
    id: 'RO-MUT-01',
    mutation: 'remove per-epoch token consumption so a source can be re-read',
    killedBy: ['RO-EX-04', 'RO-PROP-01'],
  },
  {
    id: 'RO-MUT-02',
    mutation: 'drop the outstanding-write check so the seal is no longer last',
    killedBy: ['RO-ADV-03'],
  },
  {
    id: 'RO-MUT-03',
    mutation: 'treat consent as satisfying eligibility, so a run spends without a core decision',
    killedBy: ['RO-ADV-01', 'RO-EX-05'],
  },
  {
    id: 'RO-MUT-04',
    mutation: 'accept caller-supplied argv in the scheduling interface',
    killedBy: ['ADV-006'],
  },
  {
    id: 'RO-MUT-05',
    mutation: 'fabricate an evidence bundle for a run that terminated in REQUESTED',
    killedBy: ['RO-ADV-07'],
  },
  {
    id: 'RO-MUT-06',
    mutation: 'source the requester from a captured profile instead of the run request',
    killedBy: ['RO-EX-08', 'RO-ADV-08'],
  },
  {
    id: 'RO-MUT-07',
    mutation:
      'replace a run_id-keyed structure with an unkeyed field, or drop the run_id from a port call',
    killedBy: ['RO-EX-09', 'RO-PROP-04'],
  },
  {
    id: 'RO-MUT-08',
    mutation: 'accept a captured profile without comparing its identity to the requested reference',
    killedBy: ['RO-EX-10'],
  },
  {
    id: 'RO-MUT-09',
    mutation: "ignore the consent record's run_id, making a past grant replayable",
    killedBy: ['RO-EX-11'],
  },
  {
    id: 'RO-MUT-10',
    mutation: 'move the base-identity assertion after the adapter invocation, or remove it',
    killedBy: ['RO-EX-13'],
  },
  {
    id: 'RO-MUT-11',
    mutation: 'discard the verification epoch values instead of verifying with them',
    killedBy: ['RO-EX-14'],
  },
  {
    id: 'RO-MUT-12',
    mutation: 'take the terminal transition before the seal, or emit the terminal event after it',
    killedBy: ['RO-EX-12', 'RO-EX-16'],
  },
  {
    id: 'RO-MUT-13',
    mutation: "discard the adapter's reported calls so they reach neither events nor evidence",
    killedBy: ['RO-EX-15'],
  },
  {
    id: 'RO-MUT-14',
    mutation: 'record EVIDENCE_SEALED before the write succeeds',
    killedBy: ['RO-EX-17'],
  },
  {
    id: 'RO-MUT-15',
    mutation: 'pass a refused capture onward as a snapshot',
    killedBy: ['RO-EX-18'],
  },
  {
    id: 'RO-MUT-16',
    mutation: 'collapse the refusal and operational variants at the evidence boundary',
    killedBy: ['RO-EX-19'],
  },
  {
    id: 'RO-MUT-17',
    mutation: 'digest sizes instead of content, or decide containment lexically',
    killedBy: ['RO-EX-20'],
  },
  {
    id: 'RO-MUT-18',
    mutation: 'remove the port-exception containment so run() can reject',
    killedBy: ['RO-EX-21'],
  },
  {
    id: 'RO-MUT-19',
    mutation: 'drop the verification-boundary cancellation check',
    killedBy: ['RO-EX-22'],
  },
  {
    id: 'RO-MUT-20',
    mutation: 'record the requester as the evidence principal',
    killedBy: ['RO-EX-23'],
  },
  {
    id: 'RO-MUT-21',
    mutation: 'keep the transition record in memory only',
    killedBy: ['RO-EX-25'],
  },
  {
    id: 'RO-MUT-22',
    mutation: "validate only the claim's version, not its run",
    killedBy: ['RO-EX-26'],
  },
  {
    id: 'RO-MUT-23',
    mutation: 'spread the caller body after the envelope fields',
    killedBy: ['RO-EX-27'],
  },
  {
    id: 'RO-MUT-24',
    mutation: "ignore a rejected transition and run the next phase's effects anyway",
    killedBy: ['RO-EX-28', 'RO-EX-29', 'RO-EX-31'],
  },
  {
    id: 'RO-MUT-25',
    mutation: 'batch the journal into a single write at conclusion',
    killedBy: ['RO-EX-32'],
  },
  {
    id: 'RO-MUT-26',
    mutation: 'claim the run lease and then not enforce it',
    killedBy: ['RO-EX-34'],
  },
  {
    id: 'RO-MUT-27',
    mutation: 'apply a finalization commit without retracting on failure',
    killedBy: ['RO-EX-38', 'RO-EX-43'],
  },
  {
    id: 'RO-MUT-28',
    mutation: 'emit the terminal event before the commit, binding it to an intention',
    killedBy: ['RO-EX-38', 'RO-EX-39'],
  },
  {
    id: 'RO-MUT-29',
    mutation: "trust the provider's self-reported outcome over a contradicting observation",
    killedBy: ['RO-EX-46'],
  },
  {
    id: 'RO-MUT-30',
    mutation: 'admit a credential value field on the adapter invocation',
    killedBy: ['RO-EX-45'],
  },
  {
    id: 'RO-MUT-31',
    mutation: 'earn commit_spend on consent alone, without opening a session',
    killedBy: ['RO-EX-51'],
  },
  {
    id: 'RO-MUT-32',
    mutation: 'hand the abort signal over without racing it — advisory cancellation',
    killedBy: ['RO-EX-53', 'RO-EX-54', 'RO-EX-55'],
  },
  {
    id: 'MUT-004',
    mutation: 'widen the executed command beyond the captured registry entry',
    killedBy: ['ADV-006'],
  },
  {
    id: 'MUT-005',
    mutation: 'classify INDETERMINATE as anything other than a failure',
    killedBy: ['RO-ADV-06'],
  },
  {
    id: 'MUT-009',
    mutation: 'renormalize SKIP_ENV to SKIP_OK somewhere downstream of recording',
    killedBy: ['ADV-015', 'PROP-007'],
  },
  {
    id: 'MUT-010',
    mutation: 'load code from observed workspace content',
    killedBy: ['ADV-018', 'RO-EX-03'],
  },
]

const testCorpus = (): string => {
  let corpus = ''
  for (const entry of readdirSync(srcRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.test.ts')) continue
    if (entry.name === 'mutation-map.test.ts') continue
    corpus += readFileSync(join(entry.parentPath, entry.name), 'utf8')
  }
  return corpus
}

describe('the mutation-target map is complete and live', () => {
  const corpus = testCorpus()

  it('every registered target names at least one proof', () => {
    for (const target of TARGETS) {
      expect(target.killedBy.length, `${target.id} registers no killing proof`).toBeGreaterThan(0)
    }
  })

  it('every killing proof named by a target EXISTS in the test corpus', () => {
    const missing: string[] = []
    for (const target of TARGETS) {
      for (const proof of target.killedBy) {
        if (!corpus.includes(proof)) missing.push(`${target.id} → ${proof}`)
      }
    }
    expect(missing, 'a target pointing at a test nobody wrote is an unswept mutation').toEqual([])
  })

  it('the sweep covers the CONTIGUOUS RO-MUT range — a gap is a failure, not a shorter list', () => {
    // The defect this catches: RO-MUT-06 and RO-MUT-07 were minted and a
    // sweep declaring "RO-MUT-01…05" passed without them.
    const registered = TARGETS.map((target) => target.id)
      .filter((id) => id.startsWith('RO-MUT-'))
      .map((id) => Number(id.replace('RO-MUT-', '')))
      .sort((a, b) => a - b)
    const expected = Array.from({ length: Math.max(...registered) }, (_, index) => index + 1)
    expect(registered, 'the RO-MUT range must have no holes').toEqual(expected)
  })

  it('every RO-MUT target the assurance artifact declares is registered here', () => {
    // The assurance artifact is the authority on what was minted. If it
    // declares a target this map has not registered, the map is stale
    // and the sweep is incomplete.
    const assurance = readFileSync(
      resolve(srcRoot, '../../../openspec/changes/runner-control-orchestration/assurance.md'),
      'utf8',
    )
    const declared = [...new Set(assurance.match(/RO-MUT-\d+/g) ?? [])].sort()
    const registered = TARGETS.map((target) => target.id)
      .filter((id) => id.startsWith('RO-MUT-'))
      .sort()
    expect(registered, 'the sweep must cover every target the assurance artifact mints').toEqual(
      declared,
    )
  })
})
