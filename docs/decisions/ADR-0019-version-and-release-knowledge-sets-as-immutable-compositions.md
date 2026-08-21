# ADR-0019: Version and release knowledge sets as immutable compositions

- **Status:** Proposed
- **Date:** 2026-08-21
- **Deciders:** @mikegtech (repository owner)
- **Depends on:** [ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) for byte identity, [ADR-0016](ADR-0016-hybrid-admission-assurance-for-prohibited-content.md) for the two gates and module admission
- **Refines in part:** [ADR-0016](ADR-0016-hybrid-admission-assurance-for-prohibited-content.md) §7a — *only* the sentence "All sets start blocked. Releasing one later is an explicit reviewed rollout transition". That ADR left the transition undefined; this one defines it. **Every module and runbook rollout decision in ADR-0016 is preserved unchanged**, including that a set never resolves a blocked module
- **Preserves:** [ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) — knowledge is context and never authority; [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) §1 canonical homes
- **Closes:** nothing yet. It proposes the contract; acceptance is a separate human act

---

## Context

### The question this answers

Six set families are registered. Three of them now select only members that carry
a concrete version and a reviewed digest, which makes them *structurally* capable
of naming exact identities for the first time. Nothing in accepted architecture
says what naming them would mean.

Unanswered today: what a set version identifies, whether it pins member versions,
where a historical release lives once the catalog moves on, what constitutes a
release, what `blockedByRollout` means afterwards, whether optional members
participate in identity, which fields are identity-bearing, what forces a new
version, how task additions and narrowing interact with identity, and whether
"released" implies runtime-usable when no runtime resolver and no `Published`
module exist.

[`knowledge-selection-model.md`](../architecture/knowledge-selection-model.md)
explicitly left composition lifecycle unsettled. This is now the blocking
question, and it is blocking because the *absence* of an answer is what would get
filled in by accident on the first release.

### What already constrains the answer

Not open questions — shipped mechanisms:

- `check-knowledge.mjs` refuses a set carrying a version while selecting an
  unversioned module. A **necessary condition**, never a release procedure.
- `resolveSet` in the knowledge toolchain refuses to resolve a blocked module
  through an unblocked set, so set release is already not a rollout back door.
- ADR-0015 §6 gives a deterministic bundle identity over raw bytes; a composition
  identity should be built the same way rather than over a JSON serializer's
  whims.

### The defect this proposal has to fix on the way past

`knowledge-selection-model.md` §4 records `resolvedSetVersion`, and says the
requested and resolved versions "differ when a task narrowed the selection".
**A narrowed composition is not a registered release, so there is no version to
name.** Recording one would mint an identity that no reviewed artifact backs —
exactly the failure the set version exists to prevent. §11 below replaces it.

---

## Decision

### 1. A set family and a set release are different things

A **set family** is the named, profile-oriented policy entry in
`knowledge/catalog.json`. It is mutable and describes intent.

A **set release** is an immutable, versioned revision of that family, recorded as
its own artifact.

They must be distinct, because a mutable catalog row cannot represent history. A
profile pinned to `prepr-review-default@1.0.0` has to stay explainable after
`@1.1.0` exists, and a row that has moved on cannot answer what `@1.0.0` meant.

**Invariant: a newer release must never make an older pinned release
unrepresentable.** Git archaeology is not an acceptable lookup contract — a
run-evidence question must be answerable from a governed addressable artifact,
not from a repository checkout at an inferred commit.

### 2. A release pins exact member identity — required and optional alike

For every member, required **and optional**, a release pins:

| | |
|---|---|
| module id | which module |
| module version | which revision of it |
| module digest | which exact bytes, per ADR-0015 §6 |

**Optional is about omission, not about looseness.** It means a run may omit
*that exact member* under the set's optional-failure semantics. It must never
mean "whatever version of this module exists at resolution time".

A module reaching `1.1.0` therefore cannot silently change a set released at
`1.0.0`. Adopting it requires a **new set release**.

### 3. Identity-bearing fields versus family metadata

| Field | Classification | Why |
|---|---|---|
| `runnerClass` | **identity** | changes which class of runner may consume the composition |
| `required` | **identity** | changes what resolves and what rejects |
| `optional` | **identity** | changes what may appear |
| `deny` | **identity** | changes what may never appear — a weakened deny is a security change |
| `allowTaskAdditions` | **identity** | changes whether context may be widened at run time |
| `allowTaskNarrowing` | **identity** | changes whether context may be reduced at run time |
| `maxBytes` | **identity** | changes what rejects a run |
| `maxFreshnessDays` | **identity** | changes when a member becomes invalid |
| `requiredFailure` | **identity** | changes whether absence rejects |
| `optionalFailure` | **identity** | changes whether absence warns or omits |
| `overrideAuthority` | **identity** | changes who may change the above |
| `purpose`, `owner`, `limitations`, `governingSources`, `sensitivity`, `freshnessPolicy`, `rationale` | family metadata | descriptive; carries no resolution consequence |

The test is mechanical: **if changing the value can change what context resolves,
what may be added or dropped, what rejects a run, or who may alter those, it is
identity.** Any identity-bearing change requires a new release.

### 4. A release carries a deterministic release digest

A semantic version is a human label. Exact identity is a digest.

Each release carries a **release digest** binding: the family id, the release
version, the ordered required member `(id, version, digest)` tuples, the ordered
optional member tuples, the deny rules, and every identity-bearing policy field
in §3.

**Canonicalization is normative and must be independently reproducible.** Two
acceptable mechanisms, and the accepting review picks one:

- **(a)** a normative canonical manifest byte format — field order, encoding,
  separators, and newline fixed by this ADR, digested exactly as ADR-0015 §6
  digests a bundle; or
- **(b)** an immutable committed release-manifest file whose **exact bytes** are
  normative, with its path, encoding, and trailing-newline requirements fixed
  here.

**Arbitrary JSON object serialization is not acceptable.** Key order and escaping
are library behaviour, and an identity that depends on them is not an identity.

### 5. Version semantics

An explicit immutable version string, e.g. `1.0.0`. **Any identity-bearing change
requires a new version.** An already-released version is never mutated.

No SemVer major/minor/patch meaning is inferred. This repository has no governed
compatibility taxonomy for compositions, and asserting one would be a claim
nothing enforces. The version is a stable label; the **release digest is the
identity**.

Explicitly forbidden: version `1.0.0`, composition changes, same version
survives.

### 6. Release preconditions

Before a set release may exist, **every selected member — required and optional
alike** — must have:

- a concrete `version`;
- an exact reviewed digest;
- catalog status `Validated` (admitted under ADR-0016);
- `blockedByToolchain: false`;
- `blockedByRollout: false`.

**Module `Published` is deliberately NOT required.** Three different facts:

| | Approves |
|---|---|
| **set release** | an immutable composition, for profile selection |
| **module publication** | that module content is deliverable (ADR-0016 Proof B) |
| **runtime resolution** | that a release can be materialized for an actual run |

Requiring publication would put set release behind a Proof B producer that does
not exist, making composition review unreachable for reasons unrelated to
composition. The critical path would then be: no Proof B producer → no published
module → no set release → no profile pinning → no runtime work, with a governance
question blocked on an unbuilt mechanism.

### 7. Released does not mean runtime-usable

Three separate facts, and the vocabulary must keep them apart:

| Term | Means |
|---|---|
| **versionable** | selected members have concrete identities |
| **released** | an immutable revision passed governed release review |
| **runtime-resolvable** | a resolver exists, member artifacts are available, and runtime policy admits them |

A coding set may therefore become **released** while remaining unusable by any
deployed profile. **Prose asserting "released, therefore agents can use it" is
prohibited** until runtime delivery exists.

### 8. Sets get their own lifecycle vocabulary

The module vocabulary describes bytes moving toward delivery and does not
describe a composition. Sets use:

```
Planned  →  Released  →  Deprecated  →  Retired
```

- **Planned** — a family exists; no release.
- **Released** — at least one immutable release exists.
- **Deprecated** — still identifiable and still explains old runs; should not be
  newly requested.
- **Retired** — must not be newly requested. **Identity and evidence survive.**

A set is never `Packaged` — no package exists whose identity that would name —
and never `Published`, which is a module-content fact under ADR-0016.

Relation to the gate: **a released set must never be simultaneously represented
as rollout-blocked.** See §10.

### 9. Release review is its own evidence, not `contentReview`

`contentReview` attests a prohibited-content review of module **bytes**
(ADR-0016 §5). A composition review answers a different question: *should this
exact bundle of context be selectable by this runner class, with these denials
and these limits?*

Reusing `contentReview` would make one attestation appear to prove two unrelated
things. A release therefore carries its own binding:

```
releaseReview
  policy          the review class applied
  by              the human actor
  at              the review instant
  releaseDigest   the exact immutable release revision reviewed
```

It binds to the **release digest**, so a release cannot be edited after review
without invalidating it — the same property the module attestation has.

**No claim is made that ADR-0016's absent Proof B producer also produces this.**
They are different reviews of different objects, and no mechanism links them.

### 10. Rollout eligibility belongs to a release, not to a family

Refining ADR-0016 §7a's undefined transition:

- `blockedByRollout: true → false` requires a **valid `releaseReview` bound to a
  specific release digest** whose preconditions in §6 hold.
- The transition attaches to **that release**, never to the mutable family.
- A family with one released revision does **not** make a later unreviewed
  revision eligible. Each release earns its own transition.
- A candidate composition that is not yet released is not eligible for anything.

ADR-0016's module and runbook rollout rules are untouched, and `resolveSet`'s
refusal to resolve a blocked member through an unblocked set continues to apply.

### 11. Task additions and narrowing produce a manifest, not a version

A task-modified composition is **not** a registered release and must never be
recorded as one.

```
requestedSetId + requestedSetVersion + requestedSetReleaseDigest
        +  task delta (additions / narrowing, within what the release allows)
        ↓
   exact resolved knowledge manifest  →  resolvedManifestDigest
```

The base release stays immutable and is recorded as requested. The delta and the
resolved manifest are **evidence**, each with its own digest.

**This replaces `resolvedSetVersion`.** Recording a resolved *version* that
differs from the requested one asserts a release that was never reviewed and does
not exist. `knowledge-selection-model.md` §4 must be corrected on acceptance —
its current text describes an unrepresentable field.

Denial still beats every addition, exactly as today.

---

## Consequences

**Positive.**

- A pinned profile stays explainable for the life of the run evidence.
- A module revision cannot silently change what an old release meant.
- Weakening a deny rule, widening task additions, or relaxing freshness becomes a
  visible new release rather than an edit.
- Composition review is separable from module publication, so neither blocks the
  other.
- Set release stops being confused with runtime availability.

**Negative.**

- Two artifacts to maintain: the mutable family and the immutable releases.
- Every identity-bearing change costs a release and a review, including small
  ones.
- A canonicalization must be specified precisely and tested, or the digest is
  theatre.
- Release manifests accumulate and are never deleted, since deletion would break
  the historical-representability invariant.

---

## Alternatives considered

**Version the mutable catalog entry in place.** Simplest, and fatally so: after
`@1.1.0` the row no longer describes `@1.0.0`, and every old run becomes
inexplicable. Rejected by the historical-representability invariant.

**Git history as the historical record.** Attractive because the data is already
there. Rejected as a *lookup contract*: resolving `set@1.0.0` would require
knowing which commit to read, which is not addressable from run evidence, and a
rewritten or shallow history silently changes the answer. Nothing prevents an ADR
from making a committed artifact normative — §4(b) does exactly that — but the
artifact must be addressable by identity, not by archaeology.

**Pin only required members; let optional float.** Rejected: two runs of the same
release could then legitimately see different context, and evidence could not
distinguish an omitted optional member from a substituted newer one.

**Reuse the module lifecycle vocabulary.** Rejected: `Packaged` and `Published`
name facts about bytes that a composition does not have, and reusing them invites
"the set is published" to mean something no mechanism supports.

**Require members to be `Published` before release.** Rejected in §6 — it couples
a governance review to an unbuilt producer.

**Mint a resolved set version on task narrowing.** Rejected in §11 — it fabricates
a release identity nothing reviewed.

---

## Security implications

**Least context is a security property, not ergonomics.** A set decides what an
agent may know. Every rule above exists so that boundary cannot move quietly.

- **Deny weakening** is identity-bearing, so it cannot ship as an edit to a
  released composition.
- **Task additions** are bounded by the release's own `allowTaskAdditions` and by
  deny, which beats additions; the widened result is recorded as a resolved
  manifest with its own digest, so a widened run is distinguishable from a base
  one.
- **Optional substitution** is impossible: exact identity is pinned, so a later
  module version cannot appear inside an old release.
- **A mutable release masquerading behind an old version** is prevented by the
  release digest plus the review binding to it.
- **Module rollout bypass** remains impossible — §10 preserves ADR-0016, and
  `resolveSet` already refuses a blocked member through an unblocked set.
- **Stale releases** remain identifiable; `maxFreshnessDays` is identity-bearing,
  so a release cannot silently become more permissive about staleness.
- **Provider neutrality** is unaffected: nothing here names a provider, and the
  release manifest carries no provider-specific field.

**What this decision does NOT prove.**

It grants no tool, no sandbox capability, no API access, no authorization, and no
deterministic-safety approval. It does not make knowledge authoritative over live
state. It does not establish that any released composition is *correct* — only
that it is exactly identified and was reviewed as a composition. It proves
nothing about module content beyond what ADR-0016's admission already
established, and it creates no runtime delivery path.

---

## Availability implications

Release artifacts are local files and carry no runtime dependency, so
representability does not degrade during an outage.

Release is **not** a runtime path today: no resolver exists, so nothing in a
household or coding run depends on this decision being implemented. Accepting it
adds no availability risk and removes none.

Accumulating immutable manifests is a bounded storage cost that grows only with
reviewed releases.

---

## Validation and follow-up obligations

Before any implementation of this ADR is considered complete, each of these must
hold **mechanically**, not by prose:

1. a required member without a version → release refused;
2. an optional member without a version → release refused, and the same release
   cannot later acquire one;
3. a selected member with `blockedByRollout: true` → release refused;
4. a required member's version changing after release → the old release still
   names the old version and digest;
5. the same for an optional member;
6. a `deny` change without a new version → refused;
7. a `maxFreshnessDays` change without a new version → refused;
8. an `allowTaskAdditions` change without a new version → refused;
9. task narrowing → base release identity unchanged, resolved manifest digested
   separately;
10. task addition of an allowed catalog module → same;
11. a newly added catalog module → no old release acquires it;
12. `@1.1.0` existing → `@1.0.0` still representable and identifiable;
13. release while nothing is `Published` and no resolver exists → representable
    if this ADR is accepted, with runtime usability explicitly false;
14. release changes nothing about tools, sandbox, API capability, authorization,
    deterministic safety, or live state;
15. a set whose household members are rollout-blocked cannot be opened because
    its platform and runbook members are valid.

The canonicalization in §4 additionally requires an independent second
implementation of the digest, as ADR-0015 §6 identity has.

---

## The runtime seam — documented, not built

A released set would eventually be resolved in `runner-control`, **after profile
and eligibility resolution and before sandbox/session preparation and provider
invocation**. That is the only seam this decision touches, and it touches it
descriptively.

**Not built here and not authorized by this ADR:** a resolver service, a profile
knowledge schema field, a session knowledge argument, package delivery, query
wiring, or any provider adapter change.

---

## References

- [ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) — knowledge is context, never authority
- [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) — canonical homes
- [ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) §6 — deterministic bundle identity
- [ADR-0016](ADR-0016-hybrid-admission-assurance-for-prohibited-content.md) §5, §7, §7a — attestation, the two gates, initial rollout
- [`knowledge-selection-model.md`](../architecture/knowledge-selection-model.md) — profile selection, resolution, failure semantics, run evidence
- [`knowledge-promotion-model.md`](../architecture/knowledge-promotion-model.md) — where a durable truth lives
