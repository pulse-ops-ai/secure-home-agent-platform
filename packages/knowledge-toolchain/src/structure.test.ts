/**
 * STRUCTURAL PROOFS — properties a behavioural test cannot establish.
 *
 * These scan the package's own production source. They are deliberately not
 * function-name assertions: a check that greps for `authorize` proves that a
 * word is absent, not that a capability is unreachable. Each test below asserts
 * something about the *shape* of the code — what it imports, what types it
 * exposes, what it can construct.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Concept } from './query.js'
import type { AdmissionOutcome } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))

const productionSources = (): readonly string[] =>
  readdirSync(here)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(here, name))

const read = (file: string): string => readFileSync(file, 'utf8')

const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

describe('admission is offline and deterministic', () => {
  it('no production module imports a network or model client', () => {
    const forbidden = [
      'node:http',
      'node:https',
      'node:net',
      'node:dgram',
      'undici',
      'axios',
      'openai',
      '@anthropic-ai',
      'node-fetch',
    ]
    const offenders: string[] = []
    for (const file of productionSources()) {
      const code = codeOnly(read(file))
      for (const module of forbidden) {
        if (code.includes(`'${module}`)) offenders.push(`${file}: ${module}`)
      }
    }
    expect(offenders, 'a model or network call in admission would end determinism').toEqual([])
  })

  it('no production module calls fetch', () => {
    const offenders = productionSources().filter((file) =>
      /\bfetch\s*\(/.test(codeOnly(read(file))),
    )
    expect(offenders).toEqual([])
  })

  it('the only runtime dependency is the YAML parser', () => {
    const manifest = JSON.parse(read(join(here, '..', 'package.json'))) as {
      dependencies?: Record<string, string>
    }
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(['yaml'])
  })
})

describe('no direct read: consumers cannot reach around the query seam', () => {
  it('no production module outside the compile boundary reads the filesystem', () => {
    // `compile` and `admit` take SUPPLIED BYTES — the toolchain never reads a
    // repository path on a caller's behalf, so a consumer cannot obtain source
    // through it. `query` takes a packaged artifact.
    const offenders = productionSources().filter((file) => {
      const code = codeOnly(read(file))
      return /\bfrom '(?:node:fs|node:fs\/promises)'/.test(code)
    })
    expect(
      offenders,
      'a filesystem import here would give a consumer a path around the query seam',
    ).toEqual([])
  })

  it('the query seam accepts a packaged artifact, never a path', () => {
    const code = codeOnly(read(join(here, 'query.ts')))
    expect(code).toContain('bundle: PackagedBundle')
    expect(code, 'a path parameter would reintroduce the direct read').not.toMatch(
      /\b(?:sourceRoot|filePath|directory)\b/,
    )
  })

  it('the public surface exports no file reader', () => {
    const index = codeOnly(read(join(here, 'index.ts')))
    for (const forbidden of ['readFile', 'readdir', 'loadFrom', 'openPath']) {
      expect(index, `${forbidden} would be a way around the seam`).not.toContain(forbidden)
    }
  })
})

describe('trust is not authority', () => {
  it('a Concept has no authority-bearing field, proven at the type level', () => {
    const concept: Concept = {
      path: 'x.md',
      type: 'model',
      title: undefined,
      body: '',
      trust: { verified: [{ by: 'human:mike' }] },
    }
    // @ts-expect-error a Concept carries no capability — there is no such field
    // for a trust value to flow into, and adding one would fail this line.
    const leaked: unknown = concept.capability
    expect(leaked).toBeUndefined()
  })

  it('an AdmissionOutcome grants nothing — it reports two facts and refusals', () => {
    const outcome: AdmissionOutcome = { admitted: true, publishable: false, refusals: [] }
    expect(Object.keys(outcome).sort()).toEqual(['admitted', 'publishable', 'refusals'])
    // @ts-expect-error admission is evidence, never a grant
    const granted: unknown = outcome.grants
    expect(granted).toBeUndefined()
  })

  it('no production module names a capability, authorization, or safety concept', () => {
    // Not a keyword ban for its own sake: this package must not GROW a
    // dependency on those planes. If one is ever needed the import would be
    // visible here first.
    const offenders: string[] = []
    for (const file of productionSources()) {
      const code = codeOnly(read(file))
      for (const term of [
        'capabilityGrant',
        'authorizationEnvelope',
        'safetyPolicy',
        'launchAssertion',
      ]) {
        if (code.includes(term)) offenders.push(`${file}: ${term}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('no production module imports a runner, profile, or authorization package', () => {
    const offenders: string[] = []
    for (const file of productionSources()) {
      const code = codeOnly(read(file))
      if (/from '@secure-home\/(?!.*testing)/.test(code)) offenders.push(file)
    }
    expect(
      offenders,
      'the knowledge plane must not depend on the execution or authority planes',
    ).toEqual([])
  })
})

describe('there is no Proof B producer in this package', () => {
  it('nothing constructs ReviewEvidence', () => {
    // The type is an INPUT. A factory here would be this repository inventing
    // reviewer authenticity, which ADR-0016 §5a explicitly refuses to do.
    const offenders = productionSources().filter((file) =>
      /(?:const|function)\s+\w*[Rr]eviewEvidence\s*[=(]/.test(codeOnly(read(file))),
    )
    expect(offenders).toEqual([])
  })

  it('the public surface exports no evidence factory', () => {
    const index = codeOnly(read(join(here, 'index.ts')))
    expect(index).toContain('ReviewEvidence')
    expect(index, 'exporting a producer would fabricate Proof B').not.toMatch(
      /export\s+\{[^}]*\bmakeReviewEvidence\b/,
    )
  })
})
