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

// ══ ROUND 3 · P1 — a public tolerant read path over unadmitted bytes ════

describe('R3 P1: the package root exposes no unadmitted read seam', () => {
  it('control: the admitted path still works', () => {
    const { packaged } = admittedPackage()
    expect(query(packaged).list()).toContain('model.md')
  })

  it('bytes admission REFUSES still compile — so the bypass is reachable', () => {
    // The premise, proven rather than assumed: `compile` accepts what `admit`
    // rejects, so a `CompiledBundle` is not evidence of anything.
    const junk = members(concept({ type: 'Attested Computation' }))
    const compiled = compile(junk)
    expect(compiled.ok, 'compile accepts it').toBe(true)
    expect(run(junk).admitted, 'admission refuses it').toBe(false)
  })

  it('the public root exports no reader that takes an unadmitted bundle', async () => {
    // THE DEFECT. `readForeign` was exported from the root and accepted an
    // ordinary `CompiledBundle`, which carries no provenance saying it is
    // foreign. Consumer code could compile repository-candidate bytes that
    // admission would refuse and read them through it.
    const root = (await import('./index.js')) as Record<string, unknown>
    expect(Object.keys(root)).not.toContain('readForeign')
    const readers = Object.keys(root).filter((name) => /^(?:read|open|load)/.test(name))
    expect(readers, 'query is the only repository-consumer read seam').toEqual([])
  })
})

// ══ ROUND 3 · P1 — reference integrity was regex-over-Markdown ═══════════

describe('R3 P1: internal references use a closed link grammar', () => {
  it('control: a root-absolute link resolves', () => {
    expect(run(members(`${concept()}\nSee [i](/index.md).\n`)).refusals).toEqual([])
  })

  it('control: a relative link resolves', () => {
    expect(run(members(`${concept()}\nSee [i](index.md).\n`)).refusals).toEqual([])
  })

  it('control: an external URL is tolerated', () => {
    expect(run(members(`${concept()}\nSee [x](https://example.test/a).\n`)).refusals).toEqual([])
  })

  it('A: a reference-STYLE broken link is caught', () => {
    const text = `${concept()}\nSee [model][m]\n\n[m]: missing.md\n`
    expect(rules(run(members(text)).refusals)).toContain('reference.internal')
  })

  it('B: an inline broken link WITH A TITLE is caught', () => {
    const text = `${concept()}\nSee [model](missing.md "Model")\n`
    expect(rules(run(members(text)).refusals)).toContain('reference.internal')
  })

  it('C: a link inside a fenced code block is NOT a reference', () => {
    const text = `${concept()}\nExample:\n\n\u0060\u0060\u0060md\n[model](missing.md)\n\u0060\u0060\u0060\n`
    expect(run(members(text)).refusals, 'a code sample is not a document reference').toEqual([])
  })

  it('and a link inside an inline code span is NOT a reference', () => {
    const text = `${concept()}\nWrite \u0060[model](missing.md)\u0060 to link.\n`
    expect(run(members(text)).refusals).toEqual([])
  })

  it('nested relative resolution still works', () => {
    const set: SourceFile[] = [
      { path: 'index.md', bytes: bytes(INDEX) },
      { path: 'group/a.md', bytes: bytes(`${concept()}\nSee [b](b.md).\n`) },
      { path: 'group/b.md', bytes: bytes(concept()) },
    ]
    expect(run(set).refusals).toEqual([])
  })

  // THE CLOSEDNESS CLAIM. A grammar that silently ignored what it could not
  // read would have the original defect in a larger form: unmatched input would
  // pass as "no reference found". These prove the unread case is a REFUSAL, so
  // the completeness argument is enforceable rather than asserted in a comment.
  const unreadable: [string, string][] = [
    ['an empty destination', 'See [model]().'],
    ['an unclosed destination', 'See [model](missing.md'],
    ['an unterminated title', 'See [model](a.md "Model).'],
  ]
  for (const [name, body] of unreadable) {
    it(`refuses ${name} rather than ignoring it`, () => {
      expect(rules(run(members(`${concept()}\n${body}\n`)).refusals)).toContain(
        'reference.unreadable',
      )
    })
  }

  it('reads the OUTER destination of a link wrapping an image', () => {
    // A `[`-anchored walk consumed the image's `]` and never saw the outer
    // link. Anchoring on `](` reads both.
    const text = `${concept()}\nSee [![alt](index.md)](missing.md)\n`
    expect(rules(run(members(text)).refusals)).toContain('reference.internal')
  })

  it('reports a broken reference definition ONCE, not once per use', () => {
    const text = `${concept()}\n[a][m] and [b][m] and [m]\n\n[m]: missing.md\n`
    const broken = run(members(text)).refusals.filter((r) => r.rule === 'reference.internal')
    expect(broken, 'a use names a definition; it is not a second target').toHaveLength(1)
  })

  it('an UNDEFINED reference label is literal text, not an unreadable link', () => {
    // CommonMark: `[not a link]` with no matching definition is just text. If
    // this refused, ordinary prose using brackets could never be admitted.
    expect(run(members(`${concept()}\nA [bracketed] word, and [x][y] too.\n`)).refusals).toEqual([])
  })
})

// ══ 4C — OKF `generated.by` is REQUIRED, and is not the owner ════════════

describe('4C: generated.by records who produced the CURRENT bytes', () => {
  // `generated` is written whole by the fixture helper, so these build it by
  // hand to vary exactly one thing.
  const withGenerated = (block: string): string => {
    const fm = [
      'type: model',
      `owner: ${OWNER}`,
      `as_of: ${AS_OF}`,
      'limitations: Describes the model only.',
      'status: draft',
      'stale_after: 2027-01-01',
      `governs: ${GOVERNS}`,
    ].join('\n')
    return `---\n${fm}\n${block}\n---\n\n# A concept\n\nProse.\n`
  }
  const at = '  at: 2026-08-01T00:00:00Z'

  it('control: a human producer is accepted', () => {
    const text = withGenerated(`generated:\n  by: human:alice\n${at}`)
    expect(run(members(text)).refusals).toEqual([])
  })

  it('A: generated present with NO by is refused', () => {
    // THE DEFECT. OKF v0.2 makes `by` required within `generated`, and
    // admission never looked at it — so the first real module could carry
    // production provenance nobody had checked.
    const text = withGenerated(`generated:\n${at}`)
    expect(rules(run(members(text)).refusals)).toContain('profile.generated.by')
  })

  it('B: a malformed generated.by is refused by an actor-shape rule', () => {
    const text = withGenerated(`generated:\n  by: "@mikegtech"\n${at}`)
    expect(rules(run(members(text)).refusals)).toContain('profile.generated.by.actor')
  })

  // OKF's actor convention is wider than this repository's OWNER rule, and the
  // two must not be collapsed: a tool may produce content without becoming
  // accountable for it.
  const producers = [
    ['a process actor', 'process:knowledge-build'],
    ['a producer/version actor', 'claude-code/2.1.0'],
    ['a human actor', 'human:alice'],
  ] as const
  for (const [name, by] of producers) {
    it(`accepts ${name} as generated.by`, () => {
      const text = withGenerated(`generated:\n  by: ${by}\n${at}`)
      expect(run(members(text)).refusals).toEqual([])
    })
  }

  it('F: owner is NOT loosened — a process may generate but may not own', () => {
    const text = withGenerated(`generated:\n  by: process:knowledge-build\n${at}`).replace(
      `owner: ${OWNER}`,
      'owner: process:knowledge-build',
    )
    expect(rules(run(members(text), { owner: 'process:knowledge-build' }).refusals)).toContain(
      'profile.owner.actor',
    )
  })

  it('generated.at is still required and still ISO-8601', () => {
    const text = withGenerated('generated:\n  by: human:alice\n  at: 2026-08-01')
    expect(rules(run(members(text)).refusals)).toContain('profile.generated.at')
  })
})

// ══ INTEGRATION — a module owner is a HUMAN actor (ADR-0015 §5) ═════════

describe('INT: the owner rule matches the accepted requirement', () => {
  // Both sides, so the MIRROR rule agrees and the actor rule is what decides.
  // The YAML value is quoted because `@` opens a reserved indicator: unquoted,
  // `owner: @mikegtech` fails to PARSE, and the test would then be reporting a
  // lexical accident rather than reaching the rule it is about.
  const owned = (owner: string) =>
    run(members(concept({ owner: JSON.stringify(owner) })), { owner })

  it('control: the migrated live form is accepted', () => {
    expect(owned('human:mikegtech').refusals).toEqual([])
  })

  // ADR-0015 §5 lists three actor forms for the OKF convention generally, and
  // then requires `human:<id>` for OWNER specifically. Admission had been
  // enforcing the general list, so a module could name a process or a
  // resource-style producer as its owner — an accountable human is the point.
  const rejected: [string, string][] = [
    ['the GitHub display form', '@mikegtech'],
    ['a process actor', 'process:builder'],
    ['a resource-style actor', 'vendor/model-name'],
  ]
  for (const [name, owner] of rejected) {
    it(`refuses ${name} as a module owner`, () => {
      expect(rules(owned(owner).refusals)).toContain('profile.owner.actor')
    })
  }
})

// ══ INTEGRATION P0 — the final artifact was structurally forgeable ═══════

describe('INT P0: query() accepts only a bundle packageBundle() minted', () => {
  it('control: admit -> packageBundle -> query still works end to end', () => {
    const { packaged } = admittedPackage()
    expect(query(packaged).list()).toContain('model.md')
    expect(packaged.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(packaged.manifest()).toBeInstanceOf(Uint8Array)
  })

  it('an ordinary object literal cannot satisfy PackagedBundle', () => {
    // THE DEFECT. `admit()` mints an opaque `AdmittedBundle`, but the artifact
    // it produces was an exported STRUCTURAL interface — so a consumer could
    // write the shape by hand and hand it to the public `query()`. The chain
    // was guarded up to the last link and open at it.
    //
    // Bytes that admission REFUSES, read through the public seam.
    const junk = members(concept({ type: 'Attested Computation' }))
    expect(run(junk).admitted, 'premise: admission refuses this content').toBe(false)
    const compiled = compile(junk)
    if (!compiled.ok) throw new Error('premise: it still compiles')

    const forged = {
      digest: 'f'.repeat(64),
      manifest: () => new Uint8Array(),
      documents: compiled.bundle.documents.map((d) => ({
        path: d.path,
        frontmatter: d.frontmatter,
        body: d.body,
        bytes: () => d.bytes,
      })),
      members: junk.map((m) => ({ path: m.path, bytes: () => m.bytes })),
    }

    // @ts-expect-error a PackagedBundle is minted by packageBundle(), never
    // written by hand — the brand is an unexported unique symbol.
    const leaked = query(forged)
    expect(leaked).toBeDefined()
  })
})

// ══ ROUND 5 · P1 — a truncated destination became a DIFFERENT target ════

describe('R5 P1: a destination is never silently re-pointed', () => {
  // The adversarial set. `foo(bar.md` is a real member; `foo(bar.md)` is not.
  const paren = (body: string): SourceFile[] => [
    { path: 'index.md', bytes: bytes(INDEX) },
    { path: 'model.md', bytes: bytes(`${concept()}\n${body}\n`) },
    { path: 'foo(bar.md', bytes: bytes(concept()) },
  ]

  it('control: the decoy member really is admissible on its own', () => {
    // Without this, the test below could pass because the bundle was refused
    // for some unrelated reason rather than because the reference was caught.
    expect(run(paren('No links here.')).refusals).toEqual([])
  })

  it('does not truncate a balanced destination into a file that exists', () => {
    // THE DEFECT. The destination is `foo(bar.md)`, which is NOT a member, so
    // the reference is broken. Stopping at the FIRST `)` yields `foo(bar.md`,
    // which IS a member — so a broken reference was admitted as a sound one,
    // pointing somewhere the author never wrote. Reinterpretation, not a miss.
    expect(rules(run(paren('See [x](foo(bar.md))')).refusals)).toContain('reference.unreadable')
  })

  it('and it is not quietly re-pointed at the decoy either', () => {
    const refusals = run(paren('See [x](foo(bar.md))')).refusals
    expect(refusals.length, 'exactly one finding, about the unreadable syntax').toBe(1)
  })

  it('a bare destination with parentheses is unreadable, not guessed', () => {
    expect(rules(run(paren('See [x](foo(bar).md)')).refusals)).toContain('reference.unreadable')
  })

  it('the ANGLE-BRACKET form is the supported way to write one', () => {
    const set: SourceFile[] = [
      { path: 'index.md', bytes: bytes(INDEX) },
      { path: 'model.md', bytes: bytes(`${concept()}\nSee [x](<foo(bar).md>)\n`) },
      { path: 'foo(bar).md', bytes: bytes(concept()) },
    ]
    expect(run(set).refusals, 'unambiguous, so it resolves').toEqual([])
  })

  it('the angle form is delimited, so an unbalanced parenthesis inside it is literal', () => {
    const set: SourceFile[] = [
      { path: 'index.md', bytes: bytes(INDEX) },
      { path: 'model.md', bytes: bytes(`${concept()}\nSee [x](<a(b.md>)\n`) },
      { path: 'a(b.md', bytes: bytes(concept()) },
    ]
    expect(run(set).refusals, 'depth counting must start after the angle span').toEqual([])
  })

  it('a reference DEFINITION carries the same rule, not a second grammar', () => {
    expect(rules(run(paren('See [x][m]\n\n[m]: foo(bar.md)')).refusals)).toContain(
      'reference.unreadable',
    )
  })

  it('controls: the ordinary destination forms are untouched', () => {
    expect(run(members(`${concept()}\nSee [i](index.md).\n`)).refusals).toEqual([])
    expect(run(members(`${concept()}\nSee [i](index.md "Title").\n`)).refusals).toEqual([])
    expect(run(members(`${concept()}\nSee [i](<index.md>).\n`)).refusals).toEqual([])
    expect(run(members(`${concept()}\nSee [i](index.md (Title)).\n`)).refusals).toEqual([])
    expect(run(members(`${concept()}\nSee [x](https://example.test/a).\n`)).refusals).toEqual([])
  })

  it('an EXTERNAL URL must use the angle form to carry parentheses too', () => {
    // The guard cannot ask whether a target is external, because deciding that
    // requires the parse being guarded. So the subset is uniform: bare
    // parentheses are unreadable wherever they appear, and `<…>` is delimited.
    const bare = `${concept()}\nSee [x](https://example.test/a(b)).\n`
    expect(rules(run(members(bare)).refusals)).toContain('reference.unreadable')
    const angled = `${concept()}\nSee [x](<https://example.test/a(b)>).\n`
    expect(run(members(angled)).refusals).toEqual([])
  })
})

// ══ ROUND 4 · the admitted subset is Markdown WITHOUT raw HTML ══════════

const TICK = '`'

describe('R4: raw HTML cannot smuggle a reference past the grammar', () => {
  it('control: an autolink is external and tolerated', () => {
    expect(run(members(`${concept()}\nSee <https://example.test/a> for more.\n`)).refusals).toEqual(
      [],
    )
  })

  it('control: a less-than in prose is not markup', () => {
    expect(run(members(`${concept()}\nWhen a < b and c > d, prefer a.\n`)).refusals).toEqual([])
  })

  it('a raw HTML anchor does not slip past reference integrity', () => {
    // THE DEFECT. The grammar reads `](` and `[label]:` and nothing else, so an
    // HTML anchor named a target it never looked at — silently, which is the
    // failure mode the closed grammar exists to prevent.
    const text = `${concept()}\nSee <a href="missing.md">model</a>\n`
    expect(rules(run(members(text)).refusals)).toContain('reference.unreadable')
  })

  it('and neither does any other URL-bearing element', () => {
    // Enumerating href/src/poster/cite/formaction/ping/… is the incompleteness
    // trap in a new costume. Raw HTML is simply outside the admitted subset.
    for (const tag of ['<img src="missing.md">', '<iframe src="missing.md"></iframe>']) {
      expect(rules(run(members(`${concept()}\n${tag}\n`)).refusals)).toContain(
        'reference.unreadable',
      )
    }
  })

  it('HTML inside a code fence is still a code sample', () => {
    const text = `${concept()}\n${TICK.repeat(3)}html\n<a href="missing.md">x</a>\n${TICK.repeat(3)}\n`
    expect(run(members(text)).refusals).toEqual([])
  })
})

// ══ ROUND 4 · P2 — two places the grammar contradicted its own claims ════

describe('R4 P2: escapes and fence lengths mean what the comments say', () => {
  it('control: an unescaped link is still read', () => {
    expect(rules(run(members(`${concept()}\n[model](missing.md)\n`)).refusals)).toContain(
      'reference.internal',
    )
  })

  it('an ESCAPED opening bracket is literal, not a link', () => {
    // `\[` is literal Markdown. Blanking the escape removed the bracket but the
    // `](` anchor still fired, so documenting the syntax created a phantom
    // broken reference.
    const text = `${concept()}\nWrite \\[model](missing.md) to show the syntax.\n`
    expect(run(members(text)).refusals).toEqual([])
  })

  it('a THREE-backtick line does not close a FOUR-backtick fence', () => {
    // The comment already claimed "at least as long"; only the character was
    // compared. A fence containing a shorter fence is exactly how you quote
    // Markdown inside Markdown.
    const text =
      `${concept()}\n${TICK.repeat(4)}md\n${TICK.repeat(3)}\n` +
      `[model](missing.md)\n${TICK.repeat(4)}\n`
    expect(run(members(text)).refusals).toEqual([])
  })

  it('a line carrying an info string opens, and never closes', () => {
    // CommonMark: a closing fence takes no info string. Without that clause the
    // second ```js would close the block and expose the sample after it.
    const text =
      `${concept()}\n${TICK.repeat(3)}md\n[a](missing.md)\n${TICK.repeat(3)}js\n` +
      `[b](missing.md)\n${TICK.repeat(3)}\n`
    expect(run(members(text)).refusals).toEqual([])
  })

  it('and a fence of equal length still closes', () => {
    const text = `${concept()}\n${TICK.repeat(3)}\n[model](missing.md)\n${TICK.repeat(3)}\nAfter.\n`
    expect(run(members(text)).refusals).toEqual([])
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
