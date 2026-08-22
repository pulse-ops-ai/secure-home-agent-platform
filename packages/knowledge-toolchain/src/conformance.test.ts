/**
 * THE CONFORMANCE SUITE — ADR-0015 §12 as corrected by ADR-0016 §9.
 *
 * Every negative case starts from a CONTROL that passes, changes exactly one
 * thing, and asserts the refusal names the rule it was meant to trigger. A
 * negative that fails earlier for an unrelated reason is not proof, and this
 * repository has paid for that mistake before — so each case asserts the *rule
 * identifier*, not merely that something failed.
 *
 * Fixtures live here, never under `knowledge/`. No real module is authored.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { admit } from './admit.js'
import { compile } from './compile.js'
import { packageBundle } from './packaging.js'
import { query, readForeign } from './query.js'
import { bundleDigest, manifestBytes, PACKAGE_FORMAT } from './identity.js'
import { attestationRevision, checkProofB, POLICY_V1 } from './attestation.js'
import { authoringEligibility } from './gates.js'
import { resolveReleaseMembers } from './set-release.js'
import { BLIND_SPOTS, COVERAGE, UNDECIDABLE_CLASSES } from './indicators.js'
import type { CatalogEntry, ContentReview, Refusal, ReviewEvidence, SourceFile } from './types.js'

const encoder = new TextEncoder()
const bytes = (text: string): Uint8Array => encoder.encode(text)

const OWNER = 'human:mike'
const AS_OF = '2026-08-01'
const GOVERNS = 'docs/decisions/ADR-0016-x.md'

const INDEX = `---
okf_version: "0.2"
---

# Bundle
`

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

const entry = (overrides: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: 'platform/example',
  owner: OWNER,
  asOf: AS_OF,
  limitations: 'Describes the model only.',
  governingSources: [GOVERNS],
  ...overrides,
})

const members = (conceptText = concept()): SourceFile[] => [
  { path: 'index.md', bytes: bytes(INDEX) },
  { path: 'model.md', bytes: bytes(conceptText) },
]

const digestOf = (set: readonly SourceFile[]): string => `sha256:${bundleDigest(set)}`

const review = (
  set: readonly SourceFile[],
  overrides: Partial<ContentReview> = {},
): ContentReview => ({
  policy: POLICY_V1,
  by: OWNER,
  at: '2026-08-02T00:00:00Z',
  sourceDigest: digestOf(set),
  ...overrides,
})

const repoPaths = new Set([GOVERNS])

const run = (
  set: readonly SourceFile[] = members(),
  overrides: Partial<CatalogEntry> = {},
  evidence?: ReviewEvidence,
) =>
  admit({
    members: set,
    entry: entry({ contentReview: review(set), ...overrides }),
    repositoryPaths: repoPaths,
    ...(evidence === undefined ? {} : { reviewEvidence: evidence }),
  })

const rules = (refusals: readonly Refusal[]): string[] => refusals.map((r) => r.rule)

/**
 * Secret-SHAPED fixtures, assembled at runtime.
 *
 * The indicators must see the exact shape, so the runtime string is exact —
 * but the repository secret scanner reads tracked source, and a complete
 * literal here would be a finding. Splitting the construction keeps the scanner
 * intact and unwidened: no allowlist entry, no disabled rule, and the fixture
 * loses nothing. These are public documentation samples, not credentials.
 */
const PEM_HEADER = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ')
const JWT_SAMPLE = [
  'eyJhbGciOiJIUzI1NiJ9',
  'eyJzdWIiOiIxMjM0NTY3ODkwIn0',
  'dBjftJeZ4CVPmB92K27uhbUJU1p1r',
].join('.')
const AWS_SAMPLE = ['AKIA', 'IOSFODNN', '7EXAMPLE'].join('')

// ── THE CONTROL ────────────────────────────────────────────────────────────
// Every negative below depends on this passing. If it stops passing, the
// negatives stop being evidence of anything.

describe('the control', () => {
  it('a fully conforming module is admitted', () => {
    const outcome = run()
    expect(outcome.refusals, 'the control must have no refusals').toEqual([])
    expect(outcome.admitted).toBe(true)
  })

  it('and is NOT publishable, because no Proof B producer exists', () => {
    const outcome = run()
    expect(outcome.admitted).toBe(true)
    expect(outcome.publishable).toBe(false)
    expect(outcome.publicationBlockReason).toBe('proof_b_unavailable')
  })
})

// ── OKF BASELINE AND VERSION PIN ───────────────────────────────────────────

describe('OKF baseline', () => {
  it('refuses a version other than 0.2', () => {
    const set = members()
    set[0] = { path: 'index.md', bytes: bytes('---\nokf_version: "0.3"\n---\n\n# Bundle\n') }
    expect(rules(run(set).refusals)).toContain('okf.version.pin')
  })

  it('refuses a concept with no frontmatter', () => {
    const set = members()
    set[1] = { path: 'model.md', bytes: bytes('# No frontmatter\n') }
    expect(rules(run(set).refusals)).toContain('okf.frontmatter.present')
  })

  it('refuses unparseable frontmatter', () => {
    const set = members()
    set[1] = { path: 'model.md', bytes: bytes('---\ntype: [unclosed\n---\n\n# x\n') }
    expect(rules(run(set).refusals)).toContain('okf.frontmatter.parses')
  })
})

// ── REPOSITORY PROFILE ─────────────────────────────────────────────────────

describe('repository-required metadata', () => {
  for (const field of [
    'type',
    'owner',
    'as_of',
    'limitations',
    'status',
    'stale_after',
    'governs',
  ]) {
    it(`refuses a module missing ${field}`, () => {
      const fm = concept()
      const stripped = fm
        .split('\n')
        .filter((line) => !line.startsWith(`${field}:`))
        .join('\n')
      expect(rules(run(members(stripped)).refusals)).toContain(`profile.${field}`)
    })
  }

  it('refuses a module missing generated.at', () => {
    const fm = concept().replace('generated:\n  by: human:mike\n  at: 2026-08-01T00:00:00Z\n', '')
    expect(rules(run(members(fm)).refusals)).toContain('profile.generated.at')
  })

  it('refuses a status outside the vocabulary rather than defaulting it', () => {
    expect(rules(run(members(concept({ status: 'published' }))).refusals)).toContain(
      'profile.status.vocabulary',
    )
  })

  it('refuses a malformed owner actor', () => {
    const set = members(concept({ owner: 'mike' }))
    expect(rules(run(set, { owner: 'mike' }).refusals)).toContain('profile.owner.actor')
  })
})

// ── CATALOG / FRONTMATTER MIRROR ───────────────────────────────────────────

describe('the catalog is authoritative and frontmatter mirrors it', () => {
  it('refuses an owner mismatch and names both values', () => {
    const set = members(concept({ owner: 'human:someone-else' }))
    const outcome = run(set)
    expect(rules(outcome.refusals)).toContain('mirror.owner')
    const detail = outcome.refusals.find((r) => r.rule === 'mirror.owner')?.detail ?? ''
    expect(detail).toContain(OWNER)
    expect(detail).toContain('human:someone-else')
  })

  it('refuses an as_of mismatch — regeneration must not assert stale facts are current', () => {
    expect(rules(run(members(concept({ as_of: '2026-08-16' }))).refusals)).toContain('mirror.asOf')
  })

  it('refuses a limitations mismatch', () => {
    expect(rules(run(members(concept({ limitations: 'Something else.' }))).refusals)).toContain(
      'mirror.limitations',
    )
  })

  it('refuses a governs mismatch', () => {
    expect(rules(run(members(concept({ governs: 'docs/other.md' }))).refusals)).toContain(
      'mirror.governingSources',
    )
  })
})

// ── EXECUTION-BEARING REFUSAL ──────────────────────────────────────────────

describe('execution-bearing content is refused', () => {
  it('refuses type: Attested Computation', () => {
    expect(rules(run(members(concept({ type: 'Attested Computation' }))).refusals)).toContain(
      'execution.attested-computation',
    )
  })

  for (const field of ['runtime', 'computation', 'executor', 'attester']) {
    it(`refuses ${field} under an ordinary type — by field, not by type`, () => {
      const set = members(concept({ [field]: 'anything' }))
      const found = rules(run(set).refusals)
      expect(found).toContain(`execution.${field}`)
      expect(found, 'the type is ordinary, so the type rule must NOT be what fired').not.toContain(
        'execution.attested-computation',
      )
    })
  }
})

// ── B INDICATORS, NAMED FOR THE INDICATOR ──────────────────────────────────

describe('prohibited-content indicators', () => {
  it('media.non-markdown-member', () => {
    const set = [...members(), { path: 'photo.bin', bytes: bytes('x\n') }]
    expect(rules(run(set).refusals)).toContain('media.non-markdown-member')
  })

  it('media.data-uri', () => {
    const set = members(`${concept()}\n![x](data:image/png;base64,AAAA)\n`)
    expect(rules(run(set).refusals)).toContain('media.data-uri')
  })

  it('media.markdown-image', () => {
    const set = members(`${concept()}\n![alt](https://example.test/opaque)\n`)
    expect(rules(run(set).refusals)).toContain('media.markdown-image')
  })

  it('media.html-element', () => {
    const set = members(`${concept()}\n<video src="x"></video>\n`)
    expect(rules(run(set).refusals)).toContain('media.html-element')
  })

  it('media.known-extension', () => {
    const set = members(`${concept()}\nSee front-door.jpg for the layout.\n`)
    expect(rules(run(set).refusals)).toContain('media.known-extension')
  })

  it('secret.pem-block', () => {
    const set = members(`${concept()}\n${PEM_HEADER}\n`)
    expect(rules(run(set).refusals)).toContain('secret.pem-block')
  })

  it('secret.jwt-shape', () => {
    expect(rules(run(members(`${concept()}\n${JWT_SAMPLE}\n`)).refusals)).toContain(
      'secret.jwt-shape',
    )
  })

  it('secret.known-prefix', () => {
    const set = members(`${concept()}\n${AWS_SAMPLE}\n`)
    expect(rules(run(set).refusals)).toContain('secret.known-prefix')
  })

  it('authorization.tuple-shape', () => {
    const set = members(`${concept()}\nuser:alice#member@document:budget\n`)
    expect(rules(run(set).refusals)).toContain('authorization.tuple-shape')
  })

  it('authorization.grant-key', () => {
    const set = members(concept({ grants: 'anything' }))
    expect(rules(run(set).refusals)).toContain('authorization.grant-key')
  })
})

describe('the coverage table is honest', () => {
  it('registers NO class-A detector', () => {
    const a = COVERAGE.filter((spec) => spec.kind === 'A')
    expect(a, 'an A class requires a completeness proof; there is none').toEqual([])
  })

  it('every registered indicator is B and names what it detects, not its class', () => {
    for (const spec of COVERAGE) {
      expect(spec.kind).toBe('B')
      expect(spec.detects.length).toBeGreaterThan(0)
      expect(spec.id, `${spec.id} must be named for the indicator`).not.toBe(spec.class)
    }
  })

  it('every B class names at least one blind spot', () => {
    for (const spec of COVERAGE) {
      expect(BLIND_SPOTS[spec.class], `${spec.class} must name its blind spot`).toBeDefined()
      expect((BLIND_SPOTS[spec.class] ?? []).length).toBeGreaterThan(0)
    }
  })

  it('no undecidable class has a detector', () => {
    for (const undecidable of UNDECIDABLE_CLASSES) {
      expect(
        COVERAGE.some((spec) => spec.class === undecidable),
        `${undecidable} is class C; inventing a lexical proxy for it is forbidden`,
      ).toBe(false)
    }
  })

  it('a permitted sentence that trips the obvious "currently" proxy is admitted', () => {
    // knowledge/README.md's own PERMITTED example. Its presence here is the
    // proof that no such proxy was built.
    const set = members(`${concept()}\nPeak pricing currently runs 16:00-21:00 on weekdays.\n`)
    expect(run(set).refusals).toEqual([])
  })
})

// ── ENVELOPE ───────────────────────────────────────────────────────────────

describe('envelope violations are refused, never normalized', () => {
  const cases: [string, SourceFile][] = [
    ['envelope.bom', { path: 'bom.md', bytes: new Uint8Array([0xef, 0xbb, 0xbf, 0x0a]) }],
    ['envelope.line-endings', { path: 'crlf.md', bytes: bytes('a\r\nb\n') }],
    ['envelope.trailing-newline', { path: 'tail.md', bytes: bytes('no newline') }],
    ['envelope.path.absolute', { path: '/abs.md', bytes: bytes('x\n') }],
    ['envelope.path.traversal', { path: '../up.md', bytes: bytes('x\n') }],
    ['envelope.path.posix', { path: 'a\\b.md', bytes: bytes('x\n') }],
    ['envelope.path.nfc', { path: 'café.md', bytes: bytes('x\n') }],
  ]
  for (const [rule, member] of cases) {
    it(`refuses ${rule}`, () => {
      expect(rules(run([...members(), member]).refusals)).toContain(rule)
    })
  }

  it('refuses a duplicate normalized path', () => {
    const dup = { path: 'model.md', bytes: bytes(concept()) }
    expect(rules(run([...members(), dup]).refusals)).toContain('envelope.path.duplicate')
  })

  it('does not rewrite the source it refuses', () => {
    const original = bytes('a\r\nb\n')
    const snapshot = Uint8Array.from(original)
    run([...members(), { path: 'crlf.md', bytes: original }])
    expect(original, 'admission must not normalize bytes it refuses').toEqual(snapshot)
  })
})

// ── REFERENCE INTEGRITY ────────────────────────────────────────────────────

describe('reference integrity at admission', () => {
  it('refuses an unresolvable bundle-internal reference', () => {
    const set = members(`${concept()}\nSee [other](/missing.md).\n`)
    expect(rules(run(set).refusals)).toContain('reference.internal')
  })

  it('admits a resolvable one', () => {
    const set = members(`${concept()}\nSee [index](/index.md).\n`)
    expect(run(set).refusals).toEqual([])
  })

  it('refuses an unresolvable governs target', () => {
    const outcome = admit({
      members: members(),
      entry: entry({ contentReview: review(members()), governingSources: ['docs/nope.md'] }),
      repositoryPaths: repoPaths,
    })
    expect(rules(outcome.refusals)).toContain('reference.governs')
  })
})

// ── PROOF A ────────────────────────────────────────────────────────────────

describe('Proof A — the toolchain binds the content', () => {
  it('refuses a missing attestation', () => {
    const outcome = admit({ members: members(), entry: entry(), repositoryPaths: repoPaths })
    expect(rules(outcome.refusals)).toContain('attestation.present')
  })

  it('refuses an unrecognized policy version', () => {
    const set = members()
    const outcome = admit({
      members: set,
      entry: entry({ contentReview: review(set, { policy: 'something-v2' }) }),
      repositoryPaths: repoPaths,
    })
    expect(rules(outcome.refusals)).toContain('attestation.policy')
  })

  it('refuses a stale digest — one byte changed after review', () => {
    const set = members()
    const stale = review(set)
    const mutated = members(`${concept()}\nOne more sentence.\n`)
    const outcome = admit({
      members: mutated,
      entry: entry({ contentReview: stale }),
      repositoryPaths: repoPaths,
    })
    expect(rules(outcome.refusals)).toContain('attestation.digest.binding')
  })

  it('refuses a malformed actor', () => {
    const set = members()
    const outcome = admit({
      members: set,
      entry: entry({ contentReview: review(set, { by: 'mike' }) }),
      repositoryPaths: repoPaths,
    })
    expect(rules(outcome.refusals)).toContain('attestation.actor')
  })

  it('a deterministic finding DOMINATES a valid attestation', () => {
    const set = members(`${concept()}\n${PEM_HEADER}\n`)
    const outcome = admit({
      members: set,
      entry: entry({ contentReview: review(set) }),
      repositoryPaths: repoPaths,
    })
    expect(outcome.admitted, 'no reviewer may sign past a detected secret').toBe(false)
    expect(rules(outcome.refusals)).toContain('secret.pem-block')
  })
})

// ── PROOF B ────────────────────────────────────────────────────────────────

describe('Proof B — governed review evidence, which this repository cannot produce', () => {
  /**
   * A stand-in for governed evidence, cast because NOTHING can construct it —
   * the brand is an unexported symbol (types.ts). The cast is the test leaving
   * the type system deliberately to reach `checkProofB`'s runtime rules; it is
   * exactly what ordinary consumer code CANNOT do, which `falsification.test.ts`
   * asserts at compile time.
   */
  const evidence = (
    set: readonly SourceFile[],
    overrides: Partial<Omit<ReviewEvidence, symbol>> = {},
  ): ReviewEvidence =>
    ({
      reviewer: OWNER,
      policy: POLICY_V1,
      sourceDigest: digestOf(set),
      attestationRevision: attestationRevision(review(set)),
      ...overrides,
    }) as unknown as ReviewEvidence

  it('Proof A alone is admitted but NOT publishable', () => {
    const outcome = run()
    expect(outcome.admitted).toBe(true)
    expect(outcome.publishable).toBe(false)
    expect(outcome.publicationBlockReason).toBe('proof_b_unavailable')
  })

  it('a self-asserted by: human:<id> is not Proof B', () => {
    const set = members()
    // The attestation names a human; nothing else does. That is not evidence.
    expect(checkProofB(review(set), undefined, bundleDigest(set))).toBe('proof_b_unavailable')
  })

  it('evidence naming a different actor does not satisfy the attestation', () => {
    const set = members()
    const outcome = run(set, {}, evidence(set, { reviewer: 'human:someone-else' }))
    expect(outcome.publishable).toBe(false)
    expect(outcome.publicationBlockReason).toBe('proof_b_actor_mismatch')
  })

  it('evidence for a different policy does not satisfy it', () => {
    const set = members()
    const outcome = run(set, {}, evidence(set, { policy: 'other-v1' }))
    expect(outcome.publicationBlockReason).toBe('proof_b_policy_mismatch')
  })

  it('a valid old Proof B replayed after the attestation mutated is refused', () => {
    const set = members()
    const old = evidence(set)
    // The attestation is edited afterwards — its actor swapped — while the
    // content is untouched. Proof A still binds; Proof B must not.
    const edited = review(set, { by: 'human:other' })
    const outcome = admit({
      members: set,
      entry: entry({ contentReview: edited }),
      repositoryPaths: repoPaths,
      reviewEvidence: old,
    })
    expect(outcome.admitted, 'the content is unchanged, so Proof A still holds').toBe(true)
    expect(outcome.publishable).toBe(false)
    expect(outcome.publicationBlockReason).toBe('proof_b_actor_mismatch')
  })

  it('a stale revision with a matching actor is still refused', () => {
    const set = members()
    const outcome = run(set, {}, evidence(set, { attestationRevision: 'stale' }))
    expect(outcome.publicationBlockReason).toBe('proof_b_stale_attestation')
  })

  it('fully bound evidence publishes — and only a caller can supply it', () => {
    const set = members()
    const outcome = run(set, {}, evidence(set))
    expect(outcome.admitted).toBe(true)
    expect(outcome.publishable).toBe(true)
    expect(outcome.publicationBlockReason).toBeUndefined()
  })
})

// ── GATES ──────────────────────────────────────────────────────────────────

describe('the two gates and their four states', () => {
  it('both shut → refused by both', () => {
    expect(authoringEligibility({ blockedByToolchain: true, blockedByRollout: true })).toEqual({
      eligible: false,
      refusedBy: 'both',
    })
  })

  it('rollout released, toolchain unproven → refused BY TOOLCHAIN', () => {
    expect(authoringEligibility({ blockedByToolchain: true, blockedByRollout: false })).toEqual({
      eligible: false,
      refusedBy: 'toolchain',
    })
  })

  it('toolchain proven, class not released → refused BY ROLLOUT', () => {
    expect(authoringEligibility({ blockedByToolchain: false, blockedByRollout: true })).toEqual({
      eligible: false,
      refusedBy: 'rollout',
    })
  })

  it('both open → authoring eligible, which is NOT admitted or publishable', () => {
    const decision = authoringEligibility({ blockedByToolchain: false, blockedByRollout: false })
    expect(decision).toEqual({ eligible: true })
    expect(decision, 'authoring eligibility carries no admission verdict').not.toHaveProperty(
      'admitted',
    )
  })

  // Migrated from `resolveSet`, which asked a SET-LEVEL GateState. ADR-0019
  // removed that gate; the property it protected is unchanged and now hangs off
  // release state instead.
  it('a Released release NEVER resolves a rollout-blocked member', () => {
    const resolution = resolveReleaseMembers('run', 'Released', [
      { id: 'platform/ok', gates: { blockedByToolchain: false, blockedByRollout: false } },
      { id: 'household/no', gates: { blockedByToolchain: false, blockedByRollout: true } },
    ])
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) return
    expect(resolution.resolved).toEqual(['platform/ok'])
    expect(resolution.refused).toEqual([{ module: 'household/no', refusedBy: 'rollout' }])
  })

  it('a Retired release resolves nothing at all, however open its members', () => {
    const resolution = resolveReleaseMembers('run', 'Retired', [
      { id: 'platform/ok', gates: { blockedByToolchain: false, blockedByRollout: false } },
    ])
    expect(resolution.ok).toBe(false)
    if (resolution.ok) return
    expect(resolution.refusedBy).toBe('release-state')
    expect(resolution.state).toBe('Retired')
  })
})

// ── PACKAGE IDENTITY ───────────────────────────────────────────────────────

describe('package identity', () => {
  /**
   * INDEPENDENT ORACLE. Built from the ADR text, not by calling the production
   * serializer twice — which would prove only that a function is deterministic.
   */
  const oracle = (set: readonly SourceFile[]): Uint8Array => {
    const rows = set
      .map((member) => ({
        path: member.path,
        digest: createHash('sha256').update(member.bytes).digest('hex'),
      }))
      .sort((a, b) => Buffer.from(a.path, 'utf8').compare(Buffer.from(b.path, 'utf8')))
    const out: number[] = [...encoder.encode(`${PACKAGE_FORMAT}\n`)]
    for (const row of rows) {
      out.push(...encoder.encode(row.path))
      out.push(0x00)
      out.push(...encoder.encode(row.digest))
      out.push(0x0a)
    }
    return Uint8Array.from(out)
  }

  /** Hex, because `expect(Buffer).toEqual(Buffer)` does NOT compare contents. */
  const hex = (value: Uint8Array): string => Buffer.from(value).toString('hex')

  it('agrees with an independent oracle, byte for byte', () => {
    const set = members()
    expect(hex(manifestBytes(set))).toBe(hex(oracle(set)))
  })

  it('and the oracle comparison is LIVE — a wrong separator is caught', () => {
    // The first draft of this oracle used a space where the ADR fixes NUL, and
    // `expect(Buffer).toEqual(Buffer)` passed anyway. This asserts the
    // comparison can fail, so the test above is evidence rather than decoration.
    const set = members()
    const wrong = Uint8Array.from([...oracle(set)].map((byte) => (byte === 0x00 ? 0x20 : byte)))
    expect(hex(manifestBytes(set))).not.toBe(hex(wrong))
  })

  it('is reproducible across two packagings', () => {
    const set = members()
    expect(bundleDigest(set)).toBe(bundleDigest(set))
  })

  it('does not depend on enumeration order', () => {
    const set = members()
    expect(bundleDigest([...set].reverse())).toBe(bundleDigest(set))
  })

  it('changes when one byte changes', () => {
    const set = members()
    const mutated: SourceFile[] = [
      set[0] as SourceFile,
      { path: 'model.md', bytes: bytes(`${concept()} `) },
    ]
    expect(bundleDigest(mutated)).not.toBe(bundleDigest(set))
  })

  it('changes when a path changes', () => {
    const set = members()
    const renamed: SourceFile[] = [
      set[0] as SourceFile,
      { path: 'other.md', bytes: (set[1] as SourceFile).bytes },
    ]
    expect(bundleDigest(renamed)).not.toBe(bundleDigest(set))
  })

  it('is not affected by YAML content beyond its bytes', () => {
    // Two documents with equivalent YAML but different bytes MUST differ:
    // identity is the bytes, not the parse.
    const a = members(concept())
    const b = members(concept().replace('type: model', 'type:  model'))
    expect(bundleDigest(a)).not.toBe(bundleDigest(b))
  })

  it('the packaged artifact is frozen from the caller perspective', () => {
    const outcome = run()
    expect(outcome.proof, 'control: the fixture is admitted').toBeDefined()
    if (outcome.proof === undefined) return
    const packaged = packageBundle(outcome.proof)
    expect(Object.isFrozen(packaged)).toBe(true)
    expect(Object.isFrozen(packaged.documents)).toBe(true)
  })
})

// ── TOLERANT CONSUMER ──────────────────────────────────────────────────────

describe('query tolerates what OKF requires a consumer to tolerate', () => {
  const foreign = (): SourceFile[] => [
    { path: 'index.md', bytes: bytes(INDEX) },
    {
      path: 'weird.md',
      bytes: bytes(
        '---\ntype: SomethingNobodyRegistered\nunknown_key: 1\n---\n\nSee [x](/gone.md).\n',
      ),
    },
  ]

  const open = () => {
    const compiled = compile(foreign())
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) throw new Error('unreachable')
    // FOREIGN input takes the foreign path — it is not laundered into the
    // artifact type that carries admitted knowledge.
    return readForeign(compiled.bundle)
  }

  it('tolerates an unknown type', () => {
    expect(open().read('weird.md')?.type).toBe('SomethingNobodyRegistered')
  })

  it('tolerates an unknown additional key and a missing optional field', () => {
    const concept_ = open().read('weird.md')
    expect(concept_).toBeDefined()
    expect(concept_?.title, 'a missing optional field is not an error').toBeUndefined()
  })

  it('tolerates a broken link in foreign input', () => {
    expect(() => open().list()).not.toThrow()
    expect(open().list()).toContain('weird.md')
  })

  it('exposes trust metadata as descriptive data only', () => {
    const outcome = run(members(concept({ status: 'draft' })))
    expect(outcome.proof).toBeDefined()
    if (outcome.proof === undefined) return
    const found = query(packageBundle(outcome.proof)).read('model.md')
    expect(found?.trust['status']).toBe('draft')
    // The shape is the proof: a Concept has no capability, grant, or authority
    // field for a trust value to flow into.
    expect(Object.keys(found ?? {}).sort()).toEqual(['body', 'path', 'title', 'trust', 'type'])
  })
})
