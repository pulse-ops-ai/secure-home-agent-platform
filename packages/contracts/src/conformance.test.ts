/**
 * Corpus conformance (capability `runner-verification`), re-runnable at
 * L7/L8:
 *
 *  C-EX-002  no structural runtime authority; neutrality scan
 *  C-EX-003  strict posture survives generation
 *  C-EX-004  inert: no importer outside the L2 contract layer
 *  C-PROP-004 generation determinism; mutation ⇒ compare fails
 *  C-PROP-005 one identity, one byte set ($id embeds exact version)
 *  C-ADV-002 no designated credential-value slot in the corpus
 *  C-ADV-003 hand-edited output ⇒ drift fails naming the file
 *  C-ADV-005 provider names never occupy structural positions
 *  C-ADV-007A/B + C-MUT-006 kill: the identity ledger is current-state
 *            consistent AND historically append-only against the accepted
 *            base (a rewritten or vanished accepted entry fails).
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { generateArtifacts } from './generation.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const schemasRoot = join(repoRoot, 'schemas')

const digest = (content: string): string =>
  `sha256:${createHash('sha256').update(content).digest('hex')}`

const committedSchemas = (): ReadonlyMap<string, string> => {
  const out = new Map<string, string>()
  for (const dir of readdirSync(schemasRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    for (const file of readdirSync(join(schemasRoot, dir.name))) {
      if (!file.endsWith('.json')) continue
      out.set(`${dir.name}/${file}`, readFileSync(join(schemasRoot, dir.name, file), 'utf8'))
    }
  }
  return out
}

type Ledger = Readonly<Record<string, string>>

const currentLedger = (): Ledger =>
  (
    JSON.parse(readFileSync(join(schemasRoot, 'identity-ledger.json'), 'utf8')) as {
      entries: Ledger
    }
  ).entries

/**
 * The two guard layers (D5). Pure so C-ADV-007A/B are provable as unit
 * cases regardless of git state; the git-sourced base comparison below
 * applies the same function to the real accepted ledger when resolvable.
 */
export const checkLedgerCurrentState = (
  ledger: Ledger,
  files: ReadonlyMap<string, string>,
): string[] => {
  const failures: string[] = []
  for (const [relPath, content] of files) {
    const [id, file] = relPath.split('/')
    const identity = `${id}@${(file ?? '').replace(/\.json$/, '')}`
    const recorded = ledger[identity]
    if (recorded === undefined) {
      failures.push(`no ledger entry for ${identity}`)
    } else if (recorded !== digest(content)) {
      failures.push(`bytes do not match ledger digest for ${identity}`)
    }
  }
  return failures
}

export const checkLedgerHistory = (accepted: Ledger, proposed: Ledger): string[] => {
  const failures: string[] = []
  for (const [identity, acceptedDigest] of Object.entries(accepted)) {
    const now = proposed[identity]
    if (now === undefined) {
      failures.push(`accepted ledger entry disappeared: ${identity}`)
    } else if (now !== acceptedDigest) {
      failures.push(`accepted ledger entry rewritten: ${identity}`)
    }
  }
  return failures
}

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
  const record = node as Record<string, unknown>
  for (const [key, value] of Object.entries(record)) {
    if (key === 'properties' || key === '$defs') {
      out.push(...Object.keys(value as Record<string, unknown>))
    }
    if (key === 'enum' && Array.isArray(value)) {
      out.push(...value.filter((v): v is string => typeof v === 'string'))
    }
    if (key === 'const' && typeof value === 'string') out.push(value)
    structuralStrings(value, out)
  }
}

describe('generation determinism (C-PROP-004)', () => {
  it('double generation is byte-identical', async () => {
    const first = await generateArtifacts()
    const second = await generateArtifacts()
    expect([...first.keys()]).toEqual([...second.keys()])
    for (const [relPath, content] of first) {
      expect(second.get(relPath)).toBe(content)
    }
  })

  it('any single mutation of output fails the comparison', async () => {
    const generated = await generateArtifacts()
    for (const [relPath, content] of generated) {
      const tampered = content.replace('"type": "object"', '"type": "object" ')
      expect(tampered).not.toBe(content)
      expect(digest(tampered)).not.toBe(digest(content))
      void relPath
    }
  })
})

describe('drift against committed output (C-ADV-003)', () => {
  it('committed schemas equal regenerated bytes, file by file', async () => {
    const generated = await generateArtifacts()
    const committed = committedSchemas()
    for (const [relPath, content] of generated) {
      expect(committed.get(relPath), `schemas/${relPath} missing or drifted`).toBe(content)
    }
  })

  it('a hand-edited file is named by the comparison', async () => {
    const generated = await generateArtifacts()
    const committed = new Map(committedSchemas())
    const [firstPath] = [...generated.keys()]
    expect(firstPath).toBeDefined()
    committed.set(firstPath ?? '', `${committed.get(firstPath ?? '') ?? ''} `)
    const divergent = [...generated].filter(
      ([relPath, content]) => committed.get(relPath) !== content,
    )
    expect(divergent.map(([relPath]) => relPath)).toEqual([firstPath])
  })
})

describe('identity ledger (C-ADV-007A/B, C-MUT-006 kill)', () => {
  it('current state: every committed schema matches its ledger digest', () => {
    expect(checkLedgerCurrentState(currentLedger(), committedSchemas())).toEqual([])
  })

  it('007A: changed bytes with an unchanged ledger fail, identity named', () => {
    const files = new Map(committedSchemas())
    const [firstPath] = [...files.keys()]
    files.set(firstPath ?? '', `${files.get(firstPath ?? '') ?? ''} `)
    const failures = checkLedgerCurrentState(currentLedger(), files)
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

  it('historical comparison against the accepted base ledger (git; genesis-aware)', () => {
    // Shallow checkouts may not resolve a merge base; the pure function
    // above proves the guard's logic, and this applies it to the real
    // accepted state whenever the repository history is available.
    let baseText: string | undefined
    try {
      const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim()
      baseText = execFileSync('git', ['show', `${base}:schemas/identity-ledger.json`], {
        cwd: repoRoot,
        encoding: 'utf8',
      })
    } catch {
      baseText = undefined // genesis or unavailable history: nothing accepted yet
    }
    if (baseText !== undefined) {
      const accepted = (JSON.parse(baseText) as { entries: Ledger }).entries
      expect(checkLedgerHistory(accepted, currentLedger())).toEqual([])
    }
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

describe('corpus neutrality and slot scans (C-EX-002, C-ADV-002, C-ADV-005)', () => {
  it('no provider, framework, or runtime name in a structural position', () => {
    for (const [relPath, content] of committedSchemas()) {
      const names: string[] = []
      structuralStrings(JSON.parse(content), names)
      for (const name of names) {
        // Token equality, not raw substring: "truncated" must not trip
        // "runc". Structural names are snake_case/dotted, so tokens are
        // the meaningful unit.
        const tokens = name.toLowerCase().split(/[^a-z0-9]+/)
        for (const forbidden of FORBIDDEN_STRUCTURAL_NAMES) {
          expect(
            tokens.includes(forbidden),
            `schemas/${relPath}: "${name}" contains token "${forbidden}"`,
          ).toBe(false)
        }
      }
    }
  })

  it('no designated credential-value slot exists anywhere in the corpus', () => {
    for (const [relPath, content] of committedSchemas()) {
      const names: string[] = []
      structuralStrings(JSON.parse(content), names)
      for (const name of names) {
        if (name === 'contains_secret_values') continue
        expect(
          /(^|_)(secret|token|password|credential_value|api_key)(_|$)?/.test(name),
          `schemas/${relPath}: suspicious slot "${name}"`,
        ).toBe(false)
      }
    }
  })

  it('strict posture survives generation everywhere (C-EX-003)', () => {
    const assertStrict = (node: unknown, where: string): void => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => assertStrict(item, `${where}[${index}]`))
        return
      }
      if (node === null || typeof node !== 'object') return
      const record = node as Record<string, unknown>
      if (record['type'] === 'object' && record['properties'] !== undefined) {
        expect(record['additionalProperties'], `${where} is not strict`).toBe(false)
      }
      for (const [key, value] of Object.entries(record)) {
        // Record-typed maps (propertyNames) legitimately allow additional
        // properties; they carry no `properties` block and are skipped by
        // the guard above.
        assertStrict(value, `${where}.${key}`)
      }
    }
    for (const [relPath, content] of committedSchemas()) {
      assertStrict(JSON.parse(content), `schemas/${relPath}`)
    }
  })
})

describe('inertness (C-EX-004)', () => {
  it('no production consumer outside the L2 contract layer imports the contracts', () => {
    const layer = new Set(['packages/contracts', 'packages/events'])
    const offenders: string[] = []
    for (const group of ['packages', 'services', 'apps']) {
      const groupDir = join(repoRoot, group)
      for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const memberDir = `${group}/${entry.name}`
        let manifest: Record<string, unknown>
        try {
          manifest = JSON.parse(
            readFileSync(join(groupDir, entry.name, 'package.json'), 'utf8'),
          ) as Record<string, unknown>
        } catch {
          continue
        }
        const runtimeDeps = Object.keys(
          (manifest['dependencies'] as Record<string, string> | undefined) ?? {},
        )
        const touches = runtimeDeps.some(
          (dep) => dep === '@secure-home/contracts' || dep === '@secure-home/events',
        )
        if (touches && !layer.has(memberDir)) offenders.push(memberDir)
      }
    }
    expect(offenders).toEqual([])
  })
})
