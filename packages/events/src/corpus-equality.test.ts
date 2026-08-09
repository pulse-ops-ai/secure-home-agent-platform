/**
 * Corpus membership is EXACT (B3 of the implementation review): the set of
 * generated artifact identities, the set of committed schema files, and
 * the set of ledger entries must be equal — not subsets. A handwritten
 * schema with a matching ledger row, or an orphan ledger identity, is a
 * deterministic failure. This lives in `events` because only the outer
 * package may import both generators (the inward workspace edge).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CONTRACT_ARTIFACTS } from '@secure-home/contracts'
import { EVENT_ARTIFACTS } from './generation.js'

const here = dirname(fileURLToPath(import.meta.url))
const schemasRoot = resolve(here, '../../..', 'schemas')

const sorted = (values: Iterable<string>): string[] => [...values].sort()

describe('corpus set equality (generated == committed == ledger)', () => {
  const generatedIdentities = sorted(
    [...CONTRACT_ARTIFACTS, ...EVENT_ARTIFACTS].map(
      (artifact) => `${artifact.id}@${artifact.version}`,
    ),
  )

  const committedIdentities = (): string[] => {
    const out: string[] = []
    for (const dir of readdirSync(schemasRoot, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      for (const file of readdirSync(join(schemasRoot, dir.name))) {
        if (file.endsWith('.json')) {
          out.push(`${dir.name}@${file.replace(/\.json$/, '')}`)
        }
      }
    }
    return sorted(out)
  }

  const ledgerIdentities = (): string[] => {
    const ledger = JSON.parse(readFileSync(join(schemasRoot, 'identity-ledger.json'), 'utf8')) as {
      entries: Record<string, string>
    }
    return sorted(Object.keys(ledger.entries))
  }

  it('no un-generated schema can enter the committed corpus', () => {
    expect(committedIdentities()).toEqual(generatedIdentities)
  })

  it('no orphan or missing ledger identity exists', () => {
    expect(ledgerIdentities()).toEqual(generatedIdentities)
  })
})
