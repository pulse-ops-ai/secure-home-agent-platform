/**
 * Corpus membership is EXACT and EXHAUSTIVE (implementation review B3 +
 * its delta blocker): every `.json` beneath `schemas/` — recursively, at
 * any depth, including the root — must be a generated artifact path,
 * with exactly one exclusion: `schemas/identity-ledger.json`. A
 * handwritten root-level file (`schemas/fake-contract.json`), a nested
 * one (`schemas/execution-profile/hidden/evil.json`), or an orphan
 * ledger identity all fail deterministically. This lives in `events`
 * because only the outer package may import both artifact catalogs (the
 * inward workspace edge).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { artifactPath, CONTRACT_ARTIFACTS } from '@secure-home/contracts'
import { EVENT_ARTIFACTS } from './event-artifacts.js'

const here = dirname(fileURLToPath(import.meta.url))
const schemasRoot = resolve(here, '../../..', 'schemas')

const LEDGER = 'identity-ledger.json'

const sorted = (values: Iterable<string>): string[] => [...values].sort()

describe('corpus set equality (generated == committed == ledger)', () => {
  const generatedPaths = sorted(
    [...CONTRACT_ARTIFACTS, ...EVENT_ARTIFACTS].map((artifact) => artifactPath(artifact)),
  )
  const generatedIdentities = sorted(
    [...CONTRACT_ARTIFACTS, ...EVENT_ARTIFACTS].map(
      (artifact) => `${artifact.id}@${artifact.version}`,
    ),
  )

  const committedJsonPaths = (): string[] => {
    // Recursive: every .json at ANY depth under schemas/, root included.
    const out: string[] = []
    for (const entry of readdirSync(schemasRoot, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const parent = entry.parentPath
      const rel = join(parent, entry.name)
        .slice(schemasRoot.length + 1)
        .split(sep)
        .join('/')
      if (rel === LEDGER) continue
      out.push(rel)
    }
    return sorted(out)
  }

  const ledgerIdentities = (): string[] => {
    const ledger = JSON.parse(readFileSync(join(schemasRoot, LEDGER), 'utf8')) as {
      entries: Record<string, string>
    }
    return sorted(Object.keys(ledger.entries))
  }

  it('every committed .json under schemas/ is exactly a generated artifact path', () => {
    expect(committedJsonPaths()).toEqual(generatedPaths)
  })

  it('no orphan or missing ledger identity exists', () => {
    expect(ledgerIdentities()).toEqual(generatedIdentities)
  })
})
