/**
 * ADR-0019 SET RELEASES — the twenty architecture cases, made mechanical.
 *
 * ADR-0019 answers all twenty from its rules. An architecture answer is not a
 * mechanism, so each one is a test that reaches the code here.
 */
import { describe, expect, it } from 'vitest'
import {
  applyTaskDelta,
  buildSetReleaseCandidate,
  canonicalResolvedSelection,
  canonicalSetReleaseManifest,
  canonicalTaskDelta,
  digestSetReleaseManifest,
  digestResolvedSelection,
  digestTaskDelta,
  isCanonicalSetReleaseManifest,
  lookupSetRelease,
  releaseTransitionDecision,
  validateNewSetReleaseAgainstRegistry,
  parseSetReleaseManifest,
  releaseAdoptionDecision,
  releaseManifestPath,
  releaseRunDecision,
  validateSetReleaseRecord,
} from './set-release.js'
import type { LogicalRelease, MemberCandidate, SetFamily, SetReleaseRecord } from './set-release.js'

const DIGEST_A = 'a'.repeat(64)
const DIGEST_B = 'b'.repeat(64)
const DIGEST_C = 'c'.repeat(64)

const member = (over: Partial<MemberCandidate> & { id: string }): MemberCandidate => ({
  version: '1.0.0',
  sourceDigest: `sha256:${DIGEST_A}`,
  status: 'Validated',
  blockedByToolchain: false,
  blockedByRollout: false,
  ...over,
})

const family = (over: Partial<SetFamily> = {}): SetFamily => ({
  id: 'demo-default',
  runnerClass: 'coding-runner',
  required: ['platform/one'],
  optional: [],
  deny: ['household/*'],
  allowTaskAdditions: false,
  allowTaskNarrowing: true,
  maxBytes: 1048576,
  maxFreshnessDays: 180,
  requiredFailure: 'reject-run',
  optionalFailure: 'warn',
  overrideAuthority: 'profile-change-review',
  ...over,
})

const bytesOf = (release: LogicalRelease): Uint8Array => {
  const r = canonicalSetReleaseManifest(release)
  if (!r.ok) throw new Error(`unexpected refusal: ${JSON.stringify(r.refusals)}`)
  return r.value
}

const built = (f: SetFamily, modules: readonly MemberCandidate[], version = '1.0.0') =>
  buildSetReleaseCandidate(f, version, modules)

const rulesOf = (r: { ok: boolean; refusals?: readonly { rule: string }[] }): string[] =>
  (r.refusals ?? []).map((x) => x.rule)

describe('ADR-0019 release preconditions', () => {
  it('1. refuses a release whose required member has no version', () => {
    const r = built(family(), [member({ id: 'platform/one', version: null })])
    expect(r.ok).toBe(false)
    expect(rulesOf(r)).toContain('release.member-unversioned')
  })

  it('2. refuses a release whose OPTIONAL member has no version', () => {
    const r = built(family({ optional: ['platform/two'] }), [
      member({ id: 'platform/one' }),
      member({ id: 'platform/two', version: null }),
    ])
    expect(r.ok).toBe(false)
    expect(rulesOf(r)).toContain('release.member-unversioned')
  })

  it('3. refuses a rollout-blocked member — release is not a back door', () => {
    const r = built(family(), [member({ id: 'platform/one', blockedByRollout: true })])
    expect(r.ok).toBe(false)
    expect(rulesOf(r)).toContain('release.member-rollout-blocked')
  })

  it('15. refuses when a household member is blocked even though the rest are valid', () => {
    const r = built(family({ required: ['platform/one', 'household/topology'] }), [
      member({ id: 'platform/one' }),
      member({
        id: 'household/topology',
        version: null,
        sourceDigest: null,
        status: 'Planned',
        blockedByRollout: true,
      }),
    ])
    expect(r.ok).toBe(false)
    expect(rulesOf(r)).toContain('release.member-rollout-blocked')
  })

  it('18. keeps a member eligible as it progresses Validated -> Packaged -> Published', () => {
    const digests = ['Validated', 'Packaged', 'Published'].map((status) => {
      const r = built(family(), [member({ id: 'platform/one', status })])
      expect(r.ok).toBe(true)
      return r.ok ? r.value.releaseDigest : ''
    })
    // identity unchanged: progressing must never disqualify, and must not
    // silently re-identify the release either
    expect(new Set(digests).size).toBe(1)
  })

  it('refuses Planned, Source-ready, Deprecated, and Retired members', () => {
    for (const status of ['Planned', 'Source-ready', 'Deprecated', 'Retired']) {
      const r = built(family(), [member({ id: 'platform/one', status })])
      expect(r.ok, status).toBe(false)
      expect(rulesOf(r)).toContain('release.member-lifecycle')
    }
  })
})

describe('ADR-0019 release immutability', () => {
  const base = built(family(), [member({ id: 'platform/one' })])
  const baseDigest = base.ok ? base.value.releaseDigest : ''

  it('4/5. a stored release keeps its pinned member version and digest when the module moves on', () => {
    const stored = base.ok ? base.value.release : (undefined as never)
    const storedBytes = bytesOf(stored)
    // The module advances in the catalog; the STORED release is unchanged,
    // because validation never consults the current module row.
    const record: SetReleaseRecord = {
      familyId: 'demo-default',
      version: '1.0.0',
      manifestPath: releaseManifestPath('demo-default', '1.0.0'),
      releaseDigest: digestSetReleaseManifest(storedBytes),
      releaseReview: {
        policy: 'knowledge-set-release-review-v1',
        by: 'human:reviewer',
        at: '2026-08-21T00:00:00Z',
        releaseDigest: digestSetReleaseManifest(storedBytes),
      },
      state: 'Released',
    }
    const ok = validateSetReleaseRecord(record, storedBytes, new Set(['demo-default']))
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.value.required[0]?.version).toBe('1.0.0')
      expect(ok.value.required[0]?.digest).toBe(DIGEST_A)
    }
  })

  it('6/7/8. any identity-bearing change moves the digest', () => {
    const variants: SetFamily[] = [
      family({ deny: ['household/*', 'platform/two'] }),
      family({ maxFreshnessDays: 90 }),
      family({ allowTaskAdditions: true }),
    ]
    for (const f of variants) {
      const r = built(f, [member({ id: 'platform/one' })])
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.releaseDigest).not.toBe(baseDigest)
    }
  })

  it('11. a later catalog module does not enter an existing release', () => {
    const stored = base.ok ? base.value.release : (undefined as never)
    const after = bytesOf(stored)
    expect(digestSetReleaseManifest(after)).toBe(baseDigest)
    expect(new TextDecoder().decode(after)).not.toContain('platform/newcomer')
  })

  it('20. reordering required, optional, or deny changes nothing', () => {
    const a = built(
      family({
        required: ['platform/one', 'platform/two'],
        optional: ['platform/three'],
        deny: ['a/*', 'b/*'],
      }),
      [
        member({ id: 'platform/one' }),
        member({ id: 'platform/two', sourceDigest: `sha256:${DIGEST_B}` }),
        member({ id: 'platform/three', sourceDigest: `sha256:${DIGEST_C}` }),
      ],
    )
    const b = built(
      family({
        required: ['platform/two', 'platform/one'],
        optional: ['platform/three'],
        deny: ['b/*', 'a/*'],
      }),
      [
        member({ id: 'platform/three', sourceDigest: `sha256:${DIGEST_C}` }),
        member({ id: 'platform/two', sourceDigest: `sha256:${DIGEST_B}` }),
        member({ id: 'platform/one' }),
      ],
    )
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(a.value.releaseDigest).toBe(b.value.releaseDigest)
  })
})

describe('ADR-0019 release records, lookup, and state', () => {
  const cand = buildSetReleaseCandidate(family(), '1.0.0', [member({ id: 'platform/one' })])
  const bytes = cand.ok ? cand.value.manifest : new Uint8Array()
  const digest = cand.ok ? cand.value.releaseDigest : ''
  const record = (over: Partial<SetReleaseRecord> = {}): SetReleaseRecord => ({
    familyId: 'demo-default',
    version: '1.0.0',
    manifestPath: releaseManifestPath('demo-default', '1.0.0'),
    releaseDigest: digest,
    releaseReview: {
      policy: 'knowledge-set-release-review-v1',
      by: 'human:reviewer',
      at: '2026-08-21T00:00:00Z',
      releaseDigest: digest,
    },
    state: 'Released',
    ...over,
  })
  const families = new Set(['demo-default'])

  it('accepts a well-formed record — the control the negatives need', () => {
    expect(validateSetReleaseRecord(record(), bytes, families).ok).toBe(true)
  })

  it('19. a review written after the digest does not change the digest', () => {
    const before = digestSetReleaseManifest(bytes)
    const withReview = record({
      releaseReview: {
        policy: 'knowledge-set-release-review-v1',
        by: 'human:someone-else',
        at: '2027-01-01T12:34:56Z',
        releaseDigest: before,
      },
    })
    // The review is not an input to the manifest, so the bytes and the digest
    // are identical before and after it exists.
    expect(digestSetReleaseManifest(bytes)).toBe(before)
    expect(validateSetReleaseRecord(withReview, bytes, families).ok).toBe(true)
  })

  it('refuses a review that binds a different digest', () => {
    const r = validateSetReleaseRecord(
      record({
        releaseReview: {
          policy: 'knowledge-set-release-review-v1',
          by: 'human:reviewer',
          at: '2026-08-21T00:00:00Z',
          releaseDigest: `sha256:${DIGEST_B}`,
        },
      }),
      bytes,
      families,
    )
    expect(r.ok).toBe(false)
    expect(rulesOf(r)).toContain('record.review-binding')
  })

  it('refuses a wrong policy, a non-human actor, and a bad instant', () => {
    for (const [over, rule] of [
      [{ policy: 'portable-knowledge-prohibited-content-v1' }, 'record.review-policy'],
      [{ by: 'process:ci' }, 'record.review-actor'],
      [{ at: '2026-08-21' }, 'record.review-at'],
    ] as const) {
      const r = validateSetReleaseRecord(
        record({
          releaseReview: {
            policy: 'knowledge-set-release-review-v1',
            by: 'human:reviewer',
            at: '2026-08-21T00:00:00Z',
            releaseDigest: digest,
            ...over,
          },
        }),
        bytes,
        families,
      )
      expect(r.ok).toBe(false)
      expect(rulesOf(r)).toContain(rule)
    }
  })

  it('refuses a declared digest that does not hash the manifest', () => {
    const r = validateSetReleaseRecord(
      record({ releaseDigest: `sha256:${DIGEST_B}` }),
      bytes,
      families,
    )
    expect(r.ok).toBe(false)
    expect(rulesOf(r)).toContain('record.digest')
  })

  it('refuses a manifestPath that is not the derived path', () => {
    const r = validateSetReleaseRecord(
      record({ manifestPath: 'knowledge/releases/elsewhere.manifest' }),
      bytes,
      families,
    )
    expect(r.ok).toBe(false)
    expect(rulesOf(r)).toContain('record.manifest-path')
  })

  it('12. an older release stays exactly resolvable once a newer one exists', () => {
    const older = record()
    const newerCand = buildSetReleaseCandidate(family({ maxFreshnessDays: 90 }), '1.1.0', [
      member({ id: 'platform/one' }),
    ])
    expect(newerCand.ok).toBe(true)
    const newer = record({
      version: '1.1.0',
      manifestPath: releaseManifestPath('demo-default', '1.1.0'),
      releaseDigest: newerCand.ok ? newerCand.value.releaseDigest : '',
    })
    const registry = [older, newer]
    expect(lookupSetRelease(registry, 'demo-default', '1.0.0')?.releaseDigest).toBe(digest)
    expect(lookupSetRelease(registry, 'demo-default', '1.1.0')?.releaseDigest).not.toBe(digest)
    // and the older manifest still validates on its own terms
    expect(validateSetReleaseRecord(older, bytes, families).ok).toBe(true)
  })

  it('16. a family candidate moving toward 1.1.0 inherits no eligibility', () => {
    // Eligibility is a property of a RELEASE RECORD. A candidate has none,
    // because there is no record to carry a state.
    const registry = [record()]
    expect(lookupSetRelease(registry, 'demo-default', '1.1.0')).toBeUndefined()
    expect(lookupSetRelease(registry, 'demo-default', '1.0.0')?.state).toBe('Released')
  })

  it('17. Deprecated and Released coexist with executable request semantics', () => {
    expect(releaseAdoptionDecision('Released').allowed).toBe(true)
    expect(releaseAdoptionDecision('Deprecated').allowed).toBe(false)
    expect(releaseAdoptionDecision('Retired').allowed).toBe(false)
    // deprecation restricts ADOPTION; retirement restricts EXECUTION
    expect(releaseRunDecision('Released').allowed).toBe(true)
    expect(releaseRunDecision('Deprecated').allowed).toBe(true)
    expect(releaseRunDecision('Retired').allowed).toBe(false)
  })

  it('state changes never touch identity', () => {
    for (const state of ['Released', 'Deprecated', 'Retired'] as const) {
      const r = validateSetReleaseRecord(record({ state }), bytes, families)
      expect(r.ok, state).toBe(true)
      expect(digestSetReleaseManifest(bytes)).toBe(digest)
    }
  })

  it('13/14. a release carries no capability and needs nothing published', () => {
    const text = new TextDecoder().decode(bytes)
    for (const forbidden of ['tool', 'sandbox', 'authorization', 'capability', 'credential']) {
      expect(text.toLowerCase()).not.toContain(forbidden)
    }
    // every member here is merely Validated: publication is not a precondition
    expect(cand.ok).toBe(true)
  })
})

describe('ADR-0019 strict parsing — a stored manifest must be canonical', () => {
  const cand = buildSetReleaseCandidate(
    family({
      required: ['platform/one', 'platform/two'],
      optional: ['platform/three'],
      deny: ['a/*', 'household/*'],
    }),
    '1.0.0',
    [
      member({ id: 'platform/one' }),
      member({ id: 'platform/two', sourceDigest: `sha256:${DIGEST_B}` }),
      member({ id: 'platform/three', sourceDigest: `sha256:${DIGEST_C}` }),
    ],
  )
  const good = cand.ok ? cand.value.manifest : new Uint8Array()
  const text = new TextDecoder().decode(good)
  const asBytes = (s: string): Uint8Array => new TextEncoder().encode(s)

  it('round-trips: parse then serialize reproduces the exact input bytes', () => {
    const parsed = parseSetReleaseManifest(good)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const again = canonicalSetReleaseManifest(parsed.value)
    expect(again.ok).toBe(true)
    if (again.ok) expect(Array.from(again.value)).toEqual(Array.from(good))
  })

  it('accepts its own canonical output — the control', () => {
    expect(isCanonicalSetReleaseManifest(good).ok).toBe(true)
  })

  const refusals: readonly [string, Uint8Array, string][] = [
    ['CRLF', asBytes(text.replace(/\n/g, '\r\n')), 'manifest.cr'],
    ['missing final LF', asBytes(text.slice(0, -1)), 'manifest.final-lf'],
    ['byte-order mark', asBytes(`\uFEFF${text}`), 'manifest.bom'],
    [
      'wrong prefix',
      asBytes(text.replace('okf-set-release-v1', 'okf-set-release-v2')),
      'manifest.prefix',
    ],
    [
      'scalars out of order',
      asBytes(
        text.replace(
          'family demo-default\nversion 1.0.0\n',
          'version 1.0.0\nfamily demo-default\n',
        ),
      ),
      'manifest.scalar-order',
    ],
    ['missing scalar', asBytes(text.replace(/^runnerClass .*\n/m, '')), 'manifest.scalar-order'],
    [
      'repeated scalar',
      asBytes(text.replace('maxBytes 1048576\n', 'maxBytes 1048576\nmaxBytes 1048576\n')),
      'manifest.scalar-order',
    ],
    ['unknown field', asBytes(`${text}surprise value\n`), 'manifest.unknown-field'],
    [
      'bad boolean',
      asBytes(text.replace('allowTaskAdditions false', 'allowTaskAdditions False')),
      'manifest.boolean',
    ],
    [
      'bad integer',
      asBytes(text.replace('maxBytes 1048576', 'maxBytes 01048576')),
      'manifest.integer',
    ],
    [
      'bad version grammar',
      asBytes(text.replace('version 1.0.0', 'version v1.0')),
      'manifest.version',
    ],
    [
      'prefixed member digest',
      asBytes(text.replace(DIGEST_A, `sha256:${DIGEST_A}`)),
      'manifest.member',
    ],
    [
      'uppercase digest',
      asBytes(text.replace(DIGEST_A, DIGEST_A.toUpperCase())),
      'manifest.member',
    ],
    [
      'duplicate deny',
      asBytes(text.replace('deny a/*\n', 'deny a/*\ndeny a/*\n')),
      'manifest.sort',
    ],
    [
      'unsorted deny',
      asBytes(text.replace('deny a/*\ndeny household/*\n', 'deny household/*\ndeny a/*\n')),
      'manifest.sort',
    ],
    [
      'section out of order',
      asBytes(text.replace(/^deny a\/\*\n/m, '').concat('deny a/*\n')),
      'manifest.section-order',
    ],
  ]

  for (const [name, bytes, rule] of refusals) {
    it(`refuses ${name}`, () => {
      const r = parseSetReleaseManifest(bytes)
      const strict = r.ok ? isCanonicalSetReleaseManifest(bytes) : r
      expect(strict.ok, name).toBe(false)
      // The EXACT rule, never its prefix: a refusal from a different rule is a
      // test passing for the wrong reason, and it hid a surviving mutant here.
      if (!strict.ok) expect(rulesOf(strict), name).toContain(rule)
    })
  }

  it('22. refuses NUL, LF, CR, and whitespace injected into a logical value', () => {
    for (const bad of ['a b', `a${'\u0000'}b`, 'a\nb', 'a\rb']) {
      const r = canonicalSetReleaseManifest({
        family: bad,
        version: '1.0.0',
        runnerClass: 'coding-runner',
        allowTaskAdditions: false,
        allowTaskNarrowing: true,
        maxBytes: 1,
        maxFreshnessDays: 1,
        requiredFailure: 'reject-run',
        optionalFailure: 'warn',
        overrideAuthority: 'profile-change-review',
        deny: [],
        required: [{ id: 'platform/one', version: '1.0.0', digest: DIGEST_A }],
        optional: [],
      })
      expect(r.ok, JSON.stringify(bad)).toBe(false)
      expect(rulesOf(r)).toContain('manifest.token')
    }
  })

  it('refuses a member that is both required and optional', () => {
    const r = canonicalSetReleaseManifest({
      family: 'demo-default',
      version: '1.0.0',
      runnerClass: 'coding-runner',
      allowTaskAdditions: false,
      allowTaskNarrowing: true,
      maxBytes: 1,
      maxFreshnessDays: 1,
      requiredFailure: 'reject-run',
      optionalFailure: 'warn',
      overrideAuthority: 'profile-change-review',
      deny: [],
      required: [{ id: 'platform/one', version: '1.0.0', digest: DIGEST_A }],
      optional: [{ id: 'platform/one', version: '1.0.0', digest: DIGEST_A }],
    })
    expect(r.ok).toBe(false)
    expect(rulesOf(r)).toContain('manifest.overlap')
  })
})

describe('ADR-0019 §11 task delta produces a manifest, never a version', () => {
  const cand = buildSetReleaseCandidate(
    family({ required: ['platform/one'], optional: ['platform/two'], allowTaskAdditions: true }),
    '1.0.0',
    [
      member({ id: 'platform/one' }),
      member({ id: 'platform/two', sourceDigest: `sha256:${DIGEST_B}` }),
    ],
  )
  const release = cand.ok ? cand.value.release : (undefined as never)
  const baseDigest = cand.ok ? cand.value.releaseDigest : ''
  const catalogue = [
    member({ id: 'platform/one' }),
    member({ id: 'platform/two', sourceDigest: `sha256:${DIGEST_B}` }),
    member({ id: 'platform/three', sourceDigest: `sha256:${DIGEST_C}` }),
    member({
      id: 'household/topology',
      version: null,
      sourceDigest: null,
      status: 'Planned',
      blockedByRollout: true,
    }),
  ]

  it('9. narrowing leaves the base release identical and digests the result separately', () => {
    const r = applyTaskDelta(release, { add: [], narrow: ['platform/two'] }, catalogue)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.releaseDigest).toBe(baseDigest)
    expect(r.value.modules.map((m) => m.id)).toEqual(['platform/one'])
    const resolved = canonicalResolvedSelection(r.value)
    expect(resolved.ok).toBe(true)
    if (resolved.ok) expect(digestResolvedSelection(resolved.value)).not.toBe(baseDigest)
    // and no set version was minted anywhere
    expect(Object.keys(r.value)).not.toContain('resolvedSetVersion')
  })

  it('10. an addition resolves to an exact id, version, and digest', () => {
    const r = applyTaskDelta(release, { add: ['platform/three'], narrow: [] }, catalogue)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const added = r.value.modules.find((m) => m.id === 'platform/three')
    expect(added).toEqual({ id: 'platform/three', version: '1.0.0', digest: DIGEST_C })
    expect(r.value.releaseDigest).toBe(baseDigest)
  })

  it('deny beats an addition', () => {
    const r = applyTaskDelta(release, { add: ['household/topology'], narrow: [] }, catalogue)
    expect(r.ok).toBe(false)
    expect(rulesOf(r)).toContain('delta.denied')
  })

  it('refuses additions and narrowing the release does not permit', () => {
    const closed = buildSetReleaseCandidate(
      family({ allowTaskAdditions: false, allowTaskNarrowing: false }),
      '1.0.0',
      [member({ id: 'platform/one' })],
    )
    expect(closed.ok).toBe(true)
    if (!closed.ok) return
    expect(
      rulesOf(
        applyTaskDelta(closed.value.release, { add: ['platform/three'], narrow: [] }, catalogue),
      ),
    ).toContain('delta.additions-forbidden')
    expect(
      rulesOf(
        applyTaskDelta(closed.value.release, { add: [], narrow: ['platform/one'] }, catalogue),
      ),
    ).toContain('delta.narrowing-forbidden')
  })

  it('refuses an added module that fails the member preconditions', () => {
    const open = buildSetReleaseCandidate(family({ allowTaskAdditions: true, deny: [] }), '1.0.0', [
      member({ id: 'platform/one' }),
    ])
    expect(open.ok).toBe(true)
    if (!open.ok) return
    const r = applyTaskDelta(
      open.value.release,
      { add: ['household/topology'], narrow: [] },
      catalogue,
    )
    expect(r.ok).toBe(false)
    expect(rulesOf(r)).toContain('release.member-rollout-blocked')
  })

  it('the delta form is canonical and order-insensitive', () => {
    const a = canonicalTaskDelta({ add: ['p/b', 'p/a'], narrow: ['q/d', 'q/c'] })
    const b = canonicalTaskDelta({ add: ['p/a', 'p/b'], narrow: ['q/c', 'q/d'] })
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(digestTaskDelta(a.value)).toBe(digestTaskDelta(b.value))
  })

  it('refuses a delta that both adds and narrows one id', () => {
    const r = canonicalTaskDelta({ add: ['p/a'], narrow: ['p/a'] })
    expect(r.ok).toBe(false)
    expect(rulesOf(r)).toContain('delta.contradiction')
  })
})

describe('ADR-0019 a used version is never reused', () => {
  const rec = (version: string, digest: string, state: 'Released' | 'Deprecated' | 'Retired') => ({
    familyId: 'demo-default',
    version,
    manifestPath: releaseManifestPath('demo-default', version),
    releaseDigest: digest,
    releaseReview: {
      policy: 'knowledge-set-release-review-v1',
      by: 'human:reviewer',
      at: '2026-08-21T00:00:00Z',
      releaseDigest: digest,
    },
    state,
  })

  it('accepts a version the registry has never used — the control', () => {
    const r = validateNewSetReleaseAgainstRegistry(
      { familyId: 'demo-default', version: '1.1.0', releaseDigest: `sha256:${DIGEST_B}` },
      [rec('1.0.0', `sha256:${DIGEST_A}`, 'Released')],
    )
    expect(r.ok).toBe(true)
  })

  // A DIFFERENT DIGEST IS NOT THE TEST. Proving the digest changed proves only
  // that identity is sensitive; the ADR rule is that the VERSION may not recur.
  const clashes: readonly [string, string, 'Released' | 'Deprecated' | 'Retired'][] = [
    ['different digest', DIGEST_B, 'Released'],
    ['identical digest', DIGEST_A, 'Released'],
    ['deprecated predecessor', DIGEST_B, 'Deprecated'],
    ['retired predecessor', DIGEST_B, 'Retired'],
  ]
  for (const [name, digest, state] of clashes) {
    it(`refuses reuse: ${name}`, () => {
      const r = validateNewSetReleaseAgainstRegistry(
        { familyId: 'demo-default', version: '1.0.0', releaseDigest: `sha256:${digest}` },
        [rec('1.0.0', `sha256:${DIGEST_A}`, state)],
      )
      expect(r.ok, name).toBe(false)
      expect(rulesOf(r), name).toContain('release.version-reused')
    })
  }

  it('lookup throws on an ambiguous registry rather than picking one', () => {
    const registry = [
      rec('1.0.0', `sha256:${DIGEST_A}`, 'Released'),
      rec('1.0.0', `sha256:${DIGEST_B}`, 'Released'),
    ]
    expect(() => lookupSetRelease(registry, 'demo-default', '1.0.0')).toThrow(/ambiguous/)
  })
})

describe('ADR-0019 §8 release state transitions', () => {
  it('allows only the governed order', () => {
    expect(releaseTransitionDecision('Released', 'Deprecated').allowed).toBe(true)
    expect(releaseTransitionDecision('Deprecated', 'Retired').allowed).toBe(true)
  })

  it('refuses every reverse and skipping transition', () => {
    for (const [from, to] of [
      ['Deprecated', 'Released'],
      ['Retired', 'Deprecated'],
      ['Retired', 'Released'],
      ['Released', 'Retired'],
    ] as const) {
      const d = releaseTransitionDecision(from, to)
      expect(d.allowed, `${from} -> ${to}`).toBe(false)
    }
  })

  it('treats same-state as a no-op, not a transition', () => {
    for (const state of ['Released', 'Deprecated', 'Retired'] as const) {
      expect(releaseTransitionDecision(state, state).allowed).toBe(true)
    }
  })
})

describe('ADR-0019 §2 a task addition never substitutes a pinned member', () => {
  const B_DIGEST = `sha256:${DIGEST_B}`
  const C_DIGEST = `sha256:${DIGEST_C}`
  const rel = buildSetReleaseCandidate(
    family({
      required: ['platform/one'],
      optional: ['platform/two'],
      deny: [],
      allowTaskAdditions: true,
    }),
    '1.0.0',
    [
      member({ id: 'platform/one', sourceDigest: B_DIGEST }),
      member({ id: 'platform/two', sourceDigest: B_DIGEST }),
    ],
  )
  // the catalog has since moved on
  const current = [
    member({ id: 'platform/one', sourceDigest: B_DIGEST }),
    member({ id: 'platform/two', version: '1.1.0', sourceDigest: C_DIGEST }),
    member({ id: 'platform/three', sourceDigest: C_DIGEST }),
  ]

  for (const [name, delta] of [
    ['a pinned optional member', { add: ['platform/two'], narrow: [] }],
    ['a pinned required member', { add: ['platform/one'], narrow: [] }],
    [
      'narrow then add — laundering the substitution',
      { add: ['platform/two'], narrow: ['platform/two'] },
    ],
  ] as const) {
    it(`refuses adding ${name}`, () => {
      expect(rel.ok).toBe(true)
      if (!rel.ok) return
      const r = applyTaskDelta(rel.value.release, delta, current)
      expect(r.ok, name).toBe(false)
      expect(rulesOf(r), name).toContain('delta.add-already-selected')
    })
  }

  it('still allows adding a module the release does not carry', () => {
    expect(rel.ok).toBe(true)
    if (!rel.ok) return
    const r = applyTaskDelta(rel.value.release, { add: ['platform/three'], narrow: [] }, current)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // and the pinned member keeps its pinned revision, not the current one
    const two = r.value.modules.find((m) => m.id === 'platform/two')
    expect(two).toEqual({ id: 'platform/two', version: '1.0.0', digest: DIGEST_B })
    expect(r.value.releaseDigest).toBe(rel.value.releaseDigest)
  })
})

describe('ADR-0019 identity grammar is total', () => {
  it('refuses ids the repository grammar refuses', () => {
    for (const id of ['1group/name', 'group/1name', '-group/name', 'group/-name', 'Group/name']) {
      const r = buildSetReleaseCandidate(family({ required: [id] }), '1.0.0', [member({ id })])
      expect(r.ok, id).toBe(false)
    }
  })

  it('refuses a member sourceDigest that is not a catalog attestation', () => {
    for (const bad of [
      DIGEST_A,
      `SHA256:${DIGEST_A}`,
      'sha256:abc',
      `sha256:${DIGEST_A.toUpperCase()}`,
    ]) {
      const r = buildSetReleaseCandidate(family(), '1.0.0', [
        member({ id: 'platform/one', sourceDigest: bad }),
      ])
      expect(r.ok, bad).toBe(false)
      expect(rulesOf(r), bad).toContain('release.member-digest-form')
    }
  })

  it('refuses an integer whose decimal spelling would not round-trip', () => {
    const r = canonicalSetReleaseManifest({
      family: 'demo-default',
      version: '1.0.0',
      runnerClass: 'coding-runner',
      allowTaskAdditions: false,
      allowTaskNarrowing: true,
      maxBytes: Number.MAX_SAFE_INTEGER + 2,
      maxFreshnessDays: 1,
      requiredFailure: 'reject-run',
      optionalFailure: 'warn',
      overrideAuthority: 'profile-change-review',
      deny: [],
      required: [{ id: 'platform/one', version: '1.0.0', digest: DIGEST_A }],
      optional: [],
    })
    expect(r.ok).toBe(false)
    expect(rulesOf(r)).toContain('manifest.integer')
  })

  it('never serializes a member version its own parser would refuse', () => {
    // TOTALITY: whatever A writes, A must read back canonically.
    const r = canonicalSetReleaseManifest({
      family: 'demo-default',
      version: '1.0.0',
      runnerClass: 'coding-runner',
      allowTaskAdditions: false,
      allowTaskNarrowing: true,
      maxBytes: 1,
      maxFreshnessDays: 1,
      requiredFailure: 'reject-run',
      optionalFailure: 'warn',
      overrideAuthority: 'profile-change-review',
      deny: [],
      required: [{ id: 'platform/one', version: '1.0 .0', digest: DIGEST_A }],
      optional: [],
    })
    expect(r.ok).toBe(false)
  })
})
