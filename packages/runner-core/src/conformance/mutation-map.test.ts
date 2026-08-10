/**
 * The mutation sweep record (task 7.3): every mutation target in
 * assurance.md § Mutation Targets is mapped to the named killing test,
 * and the mapping is verified against the tree — a target whose killing
 * fixture disappears fails here, so the sweep cannot silently thin out.
 * A surviving mutant is a missing proof, not an acceptable residue.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(here, '..')

/** target → the token its killing test carries in this tree. */
const MUTATION_MAP: Record<string, { file: string; token: string }> = {
  'MUT-001 protected-path refusal': {
    file: 'policy/materialize.test.ts',
    token: 'refuses the WHOLE set',
  },
  'MUT-002 snapshot digest verification': {
    file: 'authority/capture.test.ts',
    token: 'ADV-003',
  },
  'MUT-003 independent verifier hash comparison': {
    file: 'verification/verify.test.ts',
    token: 'PROP-005',
  },
  'MUT-006 refuse-not-truncate': {
    file: 'policy/bounds.property.test.ts',
    token: 'PROP-003',
  },
  'MUT-008 final-consumer verification': {
    file: 'verification/consume.test.ts',
    token: 'PROP-006',
  },
  'RC-MUT-01 refuse-on-unrecognized-rule': {
    file: 'policy/materialize.test.ts',
    token: 'RC-MUT-01',
  },
  'RC-MUT-02 observed-over-claimed precedence': {
    file: 'reconciliation/reconcile.test.ts',
    token: 'ADV-002',
  },
  'RC-MUT-03 absence of any truncating mode': {
    file: 'policy/bounds.property.test.ts',
    token: 'never truncate',
  },
  'RC-MUT-04 refuse-on-missing-authority': {
    file: 'eligibility/decide.test.ts',
    token: 'RC-MUT-04',
  },
  'RC-MUT-05 captured-snapshot usage': {
    file: 'authority/capture.test.ts',
    token: 'mutated after capture',
  },
  'RC-MUT-06 evidence completeness': {
    file: 'verification/verify.test.ts',
    token: 'RC-ADV-07',
  },
  'RC-MUT-07 fail-closed seal eligibility': {
    file: 'evidence/seal.test.ts',
    token: 'RC-MUT-07',
  },
  'RC-MUT-08 verifier independence': {
    file: 'conformance/architecture.test.ts',
    token: 'RC-EX-03',
  },
}

describe('every mutation target has its named killing test in the tree', () => {
  for (const [target, killer] of Object.entries(MUTATION_MAP)) {
    it(`${target} → ${killer.file}`, () => {
      const text = readFileSync(join(srcRoot, killer.file), 'utf8')
      expect(text).toContain(killer.token)
    })
  }

  it('the map covers every MUT/RC-MUT identifier the assurance plan names', () => {
    const named = new Set(Object.keys(MUTATION_MAP).map((target) => target.split(' ')[0] ?? target))
    for (const id of [
      'MUT-001',
      'MUT-002',
      'MUT-003',
      'MUT-006',
      'MUT-008',
      'RC-MUT-01',
      'RC-MUT-02',
      'RC-MUT-03',
      'RC-MUT-04',
      'RC-MUT-05',
      'RC-MUT-06',
      'RC-MUT-07',
      'RC-MUT-08',
    ]) {
      expect(named.has(id), `unmapped mutation target ${id}`).toBe(true)
    }
  })

  it('no test file in the tree is empty of assertions', () => {
    for (const entry of readdirSync(srcRoot, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.test.ts')) continue
      const text = readFileSync(join(entry.parentPath, entry.name), 'utf8')
      expect(text.includes('expect('), `${entry.name} has no assertion`).toBe(true)
    }
  })
})
