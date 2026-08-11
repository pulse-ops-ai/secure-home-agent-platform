/**
 * First-consumer contract conformance (task 7.4; the ratified "inert
 * contract × first consumer arrives" interaction): this package
 * RE-VALIDATES every L2 contract it consumes with its own suite rather
 * than trusting L2's passing suite — the published corpus for each
 * consumed contract is re-checked for identity exactness, strict
 * posture, and structural neutrality, and the authored Zod schemas are
 * exercised through this package's own fixtures.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ExecutionProfile, GateRegistry, GateResults, PathPolicy } from '@secure-home/contracts'
import { EvidenceBundle, RunRecord } from '@secure-home/events'
import { profileDocument, policyDocument, registryDocument } from '../testing-fixtures.js'

const here = dirname(fileURLToPath(import.meta.url))
const schemasRoot = resolve(here, '../../../..', 'schemas')

/** The contracts this package consumes, at the versions it consumes. */
const CONSUMED = [
  'execution-profile/1.0.0.json',
  'path-policy/2.0.0.json',
  'gate-registry/1.0.0.json',
  'evidence-bundle/2.0.0.json',
  'run-record/1.0.0.json',
] as const

const FORBIDDEN_STRUCTURAL_NAMES = [
  'claude',
  'copilot',
  'codex',
  'anthropic',
  'openai',
  'langgraph',
  'pydantic',
  'docker',
  'containerd',
  'kata',
  'runc',
  'gvisor',
]

const structuralStrings = (node: unknown, out: string[]): void => {
  if (Array.isArray(node)) {
    for (const item of node) structuralStrings(item, out)
    return
  }
  if (node === null || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'properties' || key === '$defs') {
      out.push(...Object.keys(value as Record<string, unknown>))
    }
    if (key === 'enum' && Array.isArray(value)) {
      out.push(...value.filter((entry): entry is string => typeof entry === 'string'))
    }
    if (key === 'const' && typeof value === 'string') out.push(value)
    structuralStrings(value, out)
  }
}

describe('the published corpus of every consumed contract re-validates here', () => {
  for (const relPath of CONSUMED) {
    const content = readFileSync(join(schemasRoot, relPath), 'utf8')
    const schema = JSON.parse(content) as Record<string, unknown>

    it(`${relPath}: $id embeds the exact consumed version`, () => {
      const [id, file] = relPath.split('/')
      const version = (file ?? '').replace(/\.json$/, '')
      expect(schema['$id']).toBe(`urn:secure-home:contract:${id ?? ''}:${version}`)
    })

    it(`${relPath}: strict posture holds at every object with properties`, () => {
      const assertStrict = (node: unknown): void => {
        if (Array.isArray(node)) {
          node.forEach(assertStrict)
          return
        }
        if (node === null || typeof node !== 'object') return
        const record = node as Record<string, unknown>
        if (record['type'] === 'object' && record['properties'] !== undefined) {
          expect(record['additionalProperties']).toBe(false)
        }
        Object.values(record).forEach(assertStrict)
      }
      assertStrict(schema)
    })

    it(`${relPath}: no provider, framework, or runtime name in a structural position`, () => {
      const names: string[] = []
      structuralStrings(schema, names)
      for (const name of names) {
        const tokens = name.toLowerCase().split(/[^a-z0-9]+/)
        for (const forbidden of FORBIDDEN_STRUCTURAL_NAMES) {
          expect(tokens.includes(forbidden), `"${name}" contains "${forbidden}"`).toBe(false)
        }
      }
    })
  }
})

describe('the authored schemas behave as this consumer requires', () => {
  it('every fixture document this suite decides from validates against its contract', () => {
    expect(ExecutionProfile.safeParse(profileDocument()).success).toBe(true)
    expect(PathPolicy.safeParse(policyDocument()).success).toBe(true)
    expect(GateRegistry.safeParse(registryDocument()).success).toBe(true)
  })

  it('the consumed contracts refuse what this consumer depends on them refusing', () => {
    expect(PathPolicy.safeParse({ ...policyDocument(), prohibited_rules: ['.git'] }).success).toBe(
      false,
    )
    expect(GateResults.safeParse({ lint: { disposition: 'PASS', truncated: true } }).success).toBe(
      false,
    )
    expect(RunRecord.safeParse({ contract_id: 'run-record' }).success).toBe(false)
    expect(EvidenceBundle.safeParse({ contract_id: 'evidence-bundle' }).success).toBe(false)
  })
})
