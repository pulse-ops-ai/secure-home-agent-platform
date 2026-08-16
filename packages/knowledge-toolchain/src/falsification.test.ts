/**
 * INDEPENDENT FALSIFICATION OF 2B — the reviewer's findings, as tests.
 *
 * Each block states the defect, builds a VALID control, changes one thing, and
 * asserts the failure for the intended reason. A compiler or setup failure is
 * not a RED here: every case reaches the mechanism it is about.
 */
import { describe, expect, it } from 'vitest'
import { admit, compile, packageBundle, query } from './index.js'
import { authoringEligibility, resolveSet } from './gates.js'
import { bundleDigest, POLICY_V1 } from './index.js'
import type { CatalogEntry, ContentReview, Refusal, SourceFile } from './types.js'

const encoder = new TextEncoder()
const bytes = (text: string): Uint8Array => encoder.encode(text)

const OWNER = 'human:mike'
const AS_OF = '2026-08-01'
const GOVERNS = 'docs/decisions/ADR-0016-x.md'
const INDEX = '---\nokf_version: "0.2"\n---\n\n# Bundle\n'

const concept = (overrides: Record<string, string> = {}): string => {
  const fm: Record<string, string> = {
    type: 'model',
    owner: OWNER,
    as_of: AS_OF,
    limitations: 'Describes the model only.',
    status: 'draft',
    stale_after: '2027-01-01',
    governs: GOVERNS,
    ...overrides,
  }
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`)
  return `---\n${lines.join('\n')}\ngenerated:\n  by: human:mike\n  at: 2026-08-01T00:00:00Z\n---\n\n# A concept\n\nProse.\n`
}

const members = (conceptText = concept(), path = 'model.md'): SourceFile[] => [
  { path: 'index.md', bytes: bytes(INDEX) },
  { path, bytes: bytes(conceptText) },
]

const entry = (overrides: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: 'platform/example',
  owner: OWNER,
  asOf: AS_OF,
  limitations: 'Describes the model only.',
  governingSources: [GOVERNS],
  ...overrides,
})

const review = (set: readonly SourceFile[]): ContentReview => ({
  policy: POLICY_V1,
  by: OWNER,
  at: '2026-08-02T00:00:00Z',
  sourceDigest: `sha256:${bundleDigest(set)}`,
})

const repoPaths = new Set([GOVERNS])
const rules = (refusals: readonly Refusal[]): string[] => refusals.map((r) => r.rule)

const run = (set: readonly SourceFile[] = members(), overrides: Partial<CatalogEntry> = {}) =>
  admit({
    members: set,
    entry: entry({ contentReview: review(set), ...overrides }),
    repositoryPaths: repoPaths,
  })

const admittedPackage = () => {
  const set = members()
  const outcome = run(set)
  expect(outcome.admitted, 'control: the fixture must be admitted').toBe(true)
  if (outcome.proof === undefined) throw new Error('control: admission yields a proof')
  return { set, packaged: packageBundle(outcome.proof) }
}

// ══ P0 — Proof B is publicly forgeable ════════════════════════════════════

describe('P0: governed Proof B cannot be minted by ordinary consumer code', () => {
  it('control: without evidence, an admitted module is not publishable', () => {
    const outcome = run()
    expect(outcome.admitted).toBe(true)
    expect(outcome.publishable).toBe(false)
    expect(outcome.publicationBlockReason).toBe('proof_b_unavailable')
  })

  it('an ordinary object literal cannot satisfy ReviewEvidence', () => {
    // THE DEFECT. `ReviewEvidence` was a plain structural interface, so any
    // consumer could write this literal and publish. The absence of a factory
    // named `makeReviewEvidence` is a naming convention, not a boundary.
    //
    // This must be a COMPILE error, not a runtime one — hence the directive,
    // which fails the build if the shape ever becomes constructible again.
    const set = members()
    const forged = {
      reviewer: OWNER,
      policy: POLICY_V1,
      sourceDigest: `sha256:${bundleDigest(set)}`,
      attestationRevision: `${POLICY_V1}|${OWNER}|2026-08-02T00:00:00Z|sha256:${bundleDigest(set)}`,
    }
    const outcome = admit({
      members: set,
      entry: entry({ contentReview: review(set) }),
      repositoryPaths: repoPaths,
      // @ts-expect-error governed evidence is opaque; a structural literal is not it
      reviewEvidence: forged,
    })
    // THE DIRECTIVE ABOVE IS THE PROOF. If `ReviewEvidence` becomes
    // constructible by shape again, it goes unused and `tsc` fails the build —
    // a stronger guarantee than any runtime assertion here, and it matches the
    // stated threat model: ordinary structurally typed code, not a caller who
    // has deliberately cast their way out of the type system.
    expect(outcome, 'the fixture reached admission').toBeDefined()
    expect(outcome.admitted, 'and the module itself is otherwise valid').toBe(true)
  })
})

// ══ P1 — the packaged artifact is mutable ═════════════════════════════════

describe('P1: a packaged artifact cannot drift from its digest', () => {
  it('control: packaging an admitted bundle yields a stable digest', () => {
    const { packaged } = admittedPackage()
    expect(packaged.digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('mutating the ORIGINAL source bytes after packaging cannot change the package', () => {
    const set = members()
    const outcome = run(set)
    if (outcome.proof === undefined) throw new Error('control: admitted')
    const packaged = packageBundle(outcome.proof)
    const before = packaged.manifest()
    const original = set[1] as SourceFile
    original.bytes[0] = 0x58
    expect(Buffer.from(packaged.manifest()).toString('hex')).toBe(
      Buffer.from(before).toString('hex'),
    )
  })

  it("the packaged BYTES are a copy, not a view of the caller's buffer", () => {
    // The manifest is computed once at construction, so it cannot catch this:
    // a package that kept a reference to the caller's buffer would still report
    // the original digest while serving mutated content. This reads the bytes
    // back out, which is the only place the aliasing is visible.
    const set = members()
    const outcome = run(set)
    if (outcome.proof === undefined) throw new Error('control: admitted')
    const packaged = packageBundle(outcome.proof)
    const before = Buffer.from(packaged.members[1]?.bytes() ?? new Uint8Array()).toString('hex')

    const original = set[1] as SourceFile
    original.bytes[0] = 0x58

    const after = Buffer.from(packaged.members[1]?.bytes() ?? new Uint8Array()).toString('hex')
    expect(after, "packaged content must not follow the caller's buffer").toBe(before)
  })

  it('and a byte handed back cannot be mutated into the package', () => {
    const { packaged } = admittedPackage()
    const handed = packaged.members[1]?.bytes()
    expect(handed).toBeDefined()
    if (handed === undefined) return
    const before = Buffer.from(packaged.members[1]?.bytes() ?? new Uint8Array()).toString('hex')
    handed[0] = 0x58
    expect(Buffer.from(packaged.members[1]?.bytes() ?? new Uint8Array()).toString('hex')).toBe(
      before,
    )
  })

  it('the returned manifest cannot be mutated in place', () => {
    const { packaged } = admittedPackage()
    const first = packaged.manifest()
    first[0] = 0x58
    expect(packaged.manifest()[0], 'each call must return a fresh copy').not.toBe(0x58)
  })

  it('nested frontmatter cannot be mutated behind the fixed digest', () => {
    const { packaged } = admittedPackage()
    const document = packaged.documents[0]
    expect(document).toBeDefined()
    if (document === undefined) return
    const nested = document.frontmatter['generated'] as Record<string, unknown> | undefined
    expect(nested, 'control: the fixture has nested frontmatter').toBeDefined()
    try {
      ;(nested as Record<string, unknown>)['by'] = 'human:someone-else'
    } catch {
      /* frozen — the desired outcome */
    }
    const reread = packaged.documents[0]?.frontmatter['generated'] as Record<string, unknown>
    expect(reread['by'], 'nested trust data must not be editable').toBe('human:mike')
  })

  it('query semantics cannot change behind the digest', () => {
    const { packaged } = admittedPackage()
    const reader = query(packaged)
    const before = reader.read('model.md')?.trust
    const document = packaged.documents[0]
    if (document === undefined) return
    try {
      ;(document.frontmatter as Record<string, unknown>)['status'] = 'stable'
    } catch {
      /* frozen */
    }
    expect(query(packaged).read('model.md')?.trust).toEqual(before)
  })
})

// ══ ROUND 2 · P1 — the admitted snapshot aliases caller bytes ════════════

describe('R2 P1: admission owns the bytes it admitted', () => {
  it('control: an admitted module packages to a stable digest', () => {
    const { packaged } = admittedPackage()
    expect(packaged.digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('A: mutating the ORIGINAL bytes after admit cannot reach the package', () => {
    // THE DEFECT. `admit` returned a proof holding the caller's buffers, so
    // the boundary was ADMIT(reference) -> caller edits -> PACKAGE(B). Copying
    // in `packageBundle` is too late: by then the proof already describes B.
    const set = members()
    const outcome = run(set)
    expect(outcome.admitted, 'control: admitted').toBe(true)
    if (outcome.proof === undefined) throw new Error('control: proof')

    const original = set[1] as SourceFile
    original.bytes[0] = 0x58

    const packaged = packageBundle(outcome.proof)
    const served = Buffer.from(packaged.members[1]?.bytes() ?? new Uint8Array()).toString('utf8')
    expect(served.startsWith('X'), 'the package must not contain the later edit').toBe(false)
    expect(served.startsWith('-'), 'it must contain what was admitted').toBe(true)
  })

  it('B: the admitted state cannot be changed through the proof itself', () => {
    const set = members()
    const outcome = run(set)
    if (outcome.proof === undefined) throw new Error('control: proof')
    const before = packageBundle(outcome.proof).digest

    // NOTHING IS REACHABLE. The proof carries no fields — the snapshot lives in
    // a module-private map keyed by the token — so there is no mutable buffer
    // to reach for. The directive is the proof: if the snapshot is ever exposed
    // on the proof again, it goes unused and the build fails.
    // @ts-expect-error the admitted snapshot is not reachable from the proof
    const reachable: unknown = outcome.proof.bundle
    expect(reachable).toBeUndefined()

    // And the packaged result is identical across repeated packagings.
    expect(packageBundle(outcome.proof).digest, 'admitted state must be fixed').toBe(before)
  })

  it('C: bytes, frontmatter, manifest and digest describe ONE snapshot', () => {
    const set = members()
    const outcome = run(set)
    if (outcome.proof === undefined) throw new Error('control: proof')

    const original = set[1] as SourceFile
    original.bytes[0] = 0x58

    const packaged = packageBundle(outcome.proof)
    const raw = Buffer.from(packaged.members[1]?.bytes() ?? new Uint8Array()).toString('utf8')
    const document = packaged.documents[0]
    expect(document).toBeDefined()
    if (document === undefined) return

    // raw bytes agree with the parse
    expect(raw).toContain('# A concept')
    expect(document.frontmatter['owner']).toBe(OWNER)
    expect(Buffer.from(document.bytes()).toString('utf8')).toBe(raw)

    // and the manifest/digest describe those same bytes
    const recomputed = bundleDigest([
      { path: 'index.md', bytes: bytes(INDEX) },
      { path: 'model.md', bytes: Uint8Array.from(document.bytes()) },
    ])
    expect(packaged.digest, 'the digest describes the admitted snapshot').toBe(recomputed)
  })
})

// ══ ROUND 2 · P1 — a bare CR is not LF ═══════════════════════════════════

describe('R2 P1: any CR byte is refused, not only CRLF', () => {
  it('control: an LF-only source is admitted', () => {
    expect(run().refusals).toEqual([])
  })

  it('refuses a LONE CR, by the line-ending rule', () => {
    // ADR-0015 requires LF. The check tested for the CR/LF PAIR, so a classic
    // Mac-style bare CR passed the envelope entirely.
    // Contract-valid in every other respect: a real concept whose body carries
    // one bare CR, so the only rule that can fire is the line-ending one.
    const text = `${concept()}A line ending in a bare CR:\rand more.\n`
    const found = rules(run(members(text)).refusals)
    expect(found, 'a bare CR is not an LF line ending').toContain('envelope.line-endings')
  })

  it('still refuses CRLF', () => {
    const found = rules(run(members(`${concept()}a\r\nb\n`)).refusals)
    expect(found).toContain('envelope.line-endings')
  })
})

// ══ P1 — wrong-type metadata bypass ═══════════════════════════════════════

describe('P1: a wrong-typed required field fails a SHAPE rule, not silently', () => {
  it('control: correctly typed metadata is admitted', () => {
    expect(run().refusals).toEqual([])
  })

  const wrong: [string, string][] = [
    ['type', '[model]'],
    ['owner', '[human:mike]'],
    ['as_of', '[2026-08-01]'],
    ['limitations', '[a]'],
    ['status', '[draft]'],
    ['stale_after', '[2027-01-01]'],
    ['governs', '[]'],
  ]
  for (const [field, value] of wrong) {
    it(`refuses ${field} with the wrong type, by a shape rule`, () => {
      const found = rules(run(members(concept({ [field]: value }))).refusals)
      expect(found, `${field} must be caught by a shape rule`).toContain(`profile.${field}.type`)
    })
  }

  it('the mirror never skips comparison because the type is wrong', () => {
    // `owner: [human:mike]` parses to an array. The mirror previously guarded
    // on `typeof === 'string'` and silently skipped, so a wrong-typed value
    // passed the authority check it was supposed to fail.
    const found = rules(run(members(concept({ owner: '[human:mike]' }))).refusals)
    expect(found).toContain('profile.owner.type')
  })
})

// ══ P1 — admitted state is not carried structurally ═══════════════════════

describe('P1: only ADMITTED knowledge reaches the repository artifact type', () => {
  it('control: an admitted bundle packages', () => {
    expect(admittedPackage().packaged.digest).toBeDefined()
  })

  it('an UNADMITTED candidate cannot be packaged as repository knowledge', () => {
    // THE DEFECT. `packageBundle(compile(anything))` produced the same
    // `PackagedBundle` that `query` consumes, so admission was advisory: a
    // comment claimed the input was admitted and nothing enforced it.
    const junk = members(concept({ type: 'Attested Computation' }))
    const compiled = compile(junk)
    expect(compiled.ok, 'control: it compiles — admission is what refuses it').toBe(true)
    if (!compiled.ok) return
    // The directive is the proof: packaging a `CompiledBundle` no longer
    // type-checks, so `compile(anything) -> packageBundle -> query` is closed.
    expect(() =>
      // @ts-expect-error packaging requires proof of admission, not a CompiledBundle
      packageBundle(compiled.bundle),
    ).toThrow()

    // And the candidate really is refused by admission — so this is the
    // unadmitted case, not merely an unpackageable one.
    const outcome = run(junk)
    expect(outcome.admitted).toBe(false)
    expect(outcome.proof, 'no admission, no proof to package with').toBeUndefined()
  })
})

// ══ P1 — internal reference resolution ════════════════════════════════════

describe('P1: internal references resolve relative to the source document', () => {
  it('control: a valid root-absolute link is admitted', () => {
    expect(run(members(`${concept()}\nSee [index](/index.md).\n`)).refusals).toEqual([])
  })

  it('refuses a bare relative link to a missing file', () => {
    const found = rules(run(members(`${concept()}\nSee [x](missing.md).\n`)).refusals)
    expect(found, 'a relative link is a reference too').toContain('reference.internal')
  })

  it('admits a valid relative link', () => {
    expect(run(members(`${concept()}\nSee [i](index.md).\n`)).refusals).toEqual([])
  })

  it('resolves a nested document relative to its own directory', () => {
    const set: SourceFile[] = [
      { path: 'index.md', bytes: bytes(INDEX) },
      { path: 'group/a.md', bytes: bytes(`${concept()}\nSee [b](b.md).\n`) },
      { path: 'group/b.md', bytes: bytes(concept()) },
    ]
    expect(run(set).refusals, 'group/a.md → group/b.md must resolve').toEqual([])
  })

  it('refuses a nested relative link that escapes to nothing', () => {
    const set: SourceFile[] = [
      { path: 'index.md', bytes: bytes(INDEX) },
      { path: 'group/a.md', bytes: bytes(`${concept()}\nSee [b](gone.md).\n`) },
    ]
    expect(rules(run(set).refusals)).toContain('reference.internal')
  })
})

// ══ P1 — the set toolchain gate is decorative ═════════════════════════════

describe('P1: BOTH set gates are load-bearing before member resolution', () => {
  const openMember = [
    { id: 'platform/ok', gates: { blockedByToolchain: false, blockedByRollout: false } },
  ]

  it('control: a fully open set resolves its open member', () => {
    const resolution = resolveSet(
      { blockedByToolchain: false, blockedByRollout: false },
      openMember,
    )
    expect('resolved' in resolution && resolution.resolved).toEqual(['platform/ok'])
  })

  it('a set blocked by TOOLCHAIN resolves nothing, even with open members', () => {
    // THE DEFECT. `resolveSet` consulted only `blockedByRollout`, so the set's
    // toolchain gate was decorative.
    const resolution = resolveSet({ blockedByToolchain: true, blockedByRollout: false }, openMember)
    expect(resolution).toEqual({ refusedBy: 'set-toolchain' })
  })

  it('a set blocked by ROLLOUT resolves nothing', () => {
    const resolution = resolveSet({ blockedByToolchain: false, blockedByRollout: true }, openMember)
    expect(resolution).toEqual({ refusedBy: 'set-rollout' })
  })

  it('a set blocked by both names both', () => {
    const resolution = resolveSet({ blockedByToolchain: true, blockedByRollout: true }, openMember)
    expect(resolution).toEqual({ refusedBy: 'set-both' })
  })

  it('and authoring eligibility still distinguishes its own four states', () => {
    expect(authoringEligibility({ blockedByToolchain: true, blockedByRollout: false })).toEqual({
      eligible: false,
      refusedBy: 'toolchain',
    })
  })
})
