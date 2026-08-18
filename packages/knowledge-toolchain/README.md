# @secure-home/knowledge-toolchain

The four ADR-0010 interfaces over portable OKF v0.2 knowledge — **compile**,
**validate/admit**, **package**, **query** — plus the gate and attestation
machinery ADR-0015 and ADR-0016 require.

> **Real modules are authored and admitted through this package.** Six
> `platform/**` modules are `Validated` at `1.0.0`: each one's exact repository
> bytes carry its own human content review bound to its own digest, and each
> passes canonical admission independently. Nothing is packaged and nothing is
> published. The
> toolchain, its conformance suite, and repository content admission are
> implemented, and the ADR-0015 §12 readiness obligation was **discharged on
> 2026-08-16** after independent review. `blockedByToolchain` is `false` on all
> 23 registered entries, so the ten `platform/**` modules are
> **authoring-eligible**.
>
> `household/**`, `runbooks/**`, and every set remain **rollout-blocked**:
> eligibility requires *both* gates false. Publication is blocked separately and
> still is — no governed Proof B producer exists — so a module may be authored,
> admitted, and packaged, and still not be published.

## The three stages, which are never one boolean

```text
AUTHORING ELIGIBILITY   blockedByToolchain === false && blockedByRollout === false
                        no attestation involved — sourceDigest is computed OVER
                        the candidate bytes, so it cannot precede them

ADMISSION               candidate bytes + deterministic checks + Proof A
                        + the remaining ADR-0015 rules

PUBLICATION             admission + Proof B, bound to the exact attestation
```

`admit()` returns `admitted` and `publishable` as **separate** facts, with a typed
`publicationBlockReason`. Today every module would be `admitted: true,
publishable: false, publicationBlockReason: 'proof_b_unavailable'`, and that is a
normal outcome rather than a failure.

## Admission rejects; consumption tolerates

Two postures, two moments. OKF requires a *consumer* not to reject for an unknown
`type`, an unknown key, a missing optional field, or a broken link — and every
field this repository requires is optional in OKF. Admission runs **before** a
module is knowledge and rejects; `query()` runs **after** and tolerates.
Collapsing them would make us either a non-conformant reader or an advisory
validator.

`query()` is the **only** read seam exported. The tolerant foreign reader takes a
`CompiledBundle`, which carries no provenance saying its bytes are foreign — so
exporting it would let consumer code compile repository-candidate bytes that
admission refuses and read them anyway. It stays package-internal, exercised by
the conformance suite; a real foreign ingress needs a governed provenance
boundary this package does not invent.

## References are read by a closed grammar

A destination can appear in exactly two places: after the two characters `](`
(every inline link and image, including nested ones), or on a `[label]: dest`
definition line. Reference *uses* — `[text][label]`, `[label][]`, `[label]` —
introduce no destination; they name a definition already collected. Fenced
blocks and inline code spans are removed first, so a code sample is not a
reference.

The point is that the grammar is **closed**: a destination it cannot read is
refused as `reference.unreadable` rather than passed over. That is what makes
completeness checkable instead of asserted — the earlier single regex missed
reference links and inline titles, and a wider *set* of regexes would have had
the same defect in a larger form.

**Raw HTML is outside the admitted subset.** `<a href="missing.md">` named a
target the grammar never looked at. The rule refuses *any* raw HTML tag rather
than the URL-bearing ones, because "the URL-bearing ones" is not a closed set —
href, src, srcset, poster, cite, formaction, ping, and whatever comes next — and
enumerating them would rebuild the original defect in a new costume. An autolink
is not a tag: it requires a scheme, so it is always external.

**A bare destination may not contain parentheses.** CommonMark allows balanced
ones; this subset is narrower on purpose, because reading them wrongly does not
merely fail — it can re-point a reference. In a bundle containing `foo(bar.md`,
the document `[x](foo(bar.md))` names `foo(bar.md)`, which does not exist;
stopping at the first `)` yields `foo(bar.md`, which does, so a broken reference
was admitted as a sound one pointing somewhere the author never wrote. A misread
that *resolves* is worse than one that fails. `<...>` is delimited and is the
supported way to write such a destination — including for external URLs, since
the guard cannot ask whether a target is external without first doing the parse
it is guarding.

Two smaller places where the code now matches what its comments claimed: `\[` is
literal, so `\[model](missing.md)` is documentation rather than a broken link
(destinations are read at *matched, unescaped* brackets, tracked with a stack);
and a fence closes only on a run of the same character **at least as long** with
no info string, so a three-backtick line no longer closes a four-backtick fence
that is quoting Markdown.

## Prohibited content, honestly

**There are no class-A detectors.** ADR-0016 §2 defines **A** as requiring a
closed authoring grammar in which every representation is structurally visible;
this repository has none, because arbitrary bytes fit inside Markdown as base64
or hex. Every implemented indicator is **B** — deterministic, useful, and
incomplete — and each names its blind spot in `COVERAGE` and `BLIND_SPOTS`,
which are exported as data so the honesty statement travels with the code.

The undecidable classes — live state, presence, automation state, personal
telemetry — have **no detector and must never be given one**. The obvious proxy
fails in both directions: `knowledge/README.md`'s own *permitted* example, *"peak
pricing currently runs 16:00–21:00"*, trips a "currently" rule, and its
*prohibited* example evades one by deleting a word. A test asserts that sentence
is admitted, so the absence is proven rather than promised.

No model, no classifier, no network. Admission is offline and deterministic, and
a structural test enforces it.

## Identity is over raw bytes

```text
manifest_bytes := "okf-package-v1" LF ( <nfc-path> NUL <sha256-hex> LF )*
                  sorted by the UTF-8 bytes of the path
bundle_digest  := sha256(manifest_bytes)
```

No JSON, no locale collation, and nothing re-serialized. A spike re-emitted one
frontmatter block three defensible ways and produced three different digests,
none matching the original — which is why the parse and the bytes never cross.
An **independent oracle** in the conformance suite rebuilds these bytes from the
ADR text rather than calling the serializer twice.

Envelope violations are **refused, not normalized**: a helpful rewrite would
change the bytes the digest identifies.

## Proof A is not Proof B

`checkProofA` establishes that an attestation exists, is shaped correctly, names
a recognized immutable policy, and binds to the exact current bytes.

`checkProofB` establishes nothing on its own — it *validates supplied* governed
review evidence against the exact attestation revision. **This package cannot
produce that evidence and has no factory for it**, which is ADR-0016 §5a's
position expressed as code. `by: human:<id>` is a string a producer writes.

## Governed by

[`AGENTS.md`](../../AGENTS.md) · [ADR-0010](../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)
· [ADR-0015](../../docs/decisions/ADR-0015-adopt-okf-v0-2-as-source-representation-only.md)
· [ADR-0016](../../docs/decisions/ADR-0016-hybrid-admission-assurance-for-prohibited-content.md)
