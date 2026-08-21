# ADR-0019: Version and release knowledge sets as immutable compositions

- **Status:** Accepted
- **Date:** 2026-08-21
- **Accepted:** 2026-08-21
- **Accepted at:** `43170c76e64917dc91303e544297d177688cc811` — the exact reviewed commit
- **Deciders:** @mikegtech (repository owner)
- **Depends on:** [ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) for byte identity, [ADR-0016](ADR-0016-hybrid-admission-assurance-for-prohibited-content.md) for the two gates and module admission
- **Refines in part:** [ADR-0016](ADR-0016-hybrid-admission-assurance-for-prohibited-content.md) §7/§7a **on the SET side only** — both the undefined release transition *and* the representation in which set rollout eligibility lives. See §0 for the exact scope. **Every MODULE and RUNBOOK decision in ADR-0016 is preserved unchanged**, including the per-module gate representation, the runbook allowlist, and that a set never resolves a blocked module
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

### 0. Exactly what this refines in ADR-0016, and what it does not

An earlier revision of this ADR claimed it refined only one sentence of §7a. That
understated it. ADR-0016 §7 also fixes the *representation*: "`blockedByRollout`
is a required boolean on every module **and set** in `knowledge/catalog.json`",
and §7a gives it a set-side meaning — the composition has been released for
profile use. This ADR changes that representation for sets, and says so.

**Preserved unchanged — ADR-0016 remains the authority:**

- the two gates as independent facts (§7);
- `blockedByToolchain` and `blockedByRollout` on every **module**, and their
  meanings;
- the `platform/**` class release, `household/**` block, and the per-runbook
  allowlist (§7a);
- that a set never resolves a blocked module — already mechanised in
  `resolveSet`;
- module admission, attestation, and the publication gate in every other section.

**Refined on the set side only:**

| ADR-0016 as accepted | Under this ADR |
|---|---|
| a set carries a `blockedByRollout` boolean in the catalog | that family-level boolean is the **legacy pre-release representation**. Prompt 6B migrates it away from being an authority |
| a set's `blockedByRollout` means the composition is released for profile use | eligibility belongs to an **immutable release record**, never to a mutable family row (§8b, §10) |
| "All sets start blocked. Releasing one later is an explicit reviewed rollout transition" | the transition is now defined: a reviewed immutable release in state `Released` (§10) |

**No family-level boolean may compete with release eligibility.** Until 6B
migrates the schema the field remains present and `true`, and it authorizes
nothing.

**ADR-0016 is not edited.** A refinement is written here and recorded in the
decision index; the accepted text stays immutable, per the repository's own rule.

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

### 4. The canonical release manifest, and the digest over it

A version string is a human label. Exact identity is a digest over a **canonical
line-oriented UTF-8 manifest**, modelled on ADR-0015 §6 so that both identities in
this repository are computed the same way.

**This is the single normative representation.** The alternative considered — a
committed file whose incidental bytes are normative — is recorded under
*Alternatives considered* and is not adopted.

```text
release_manifest :=
  "okf-set-release-v1"                              LF
  "family"             SP <family-id>               LF
  "version"            SP <release-version>         LF
  "runnerClass"        SP <runner-class>            LF
  "allowTaskAdditions" SP <bool>                    LF
  "allowTaskNarrowing" SP <bool>                    LF
  "maxBytes"           SP <int>                     LF
  "maxFreshnessDays"   SP <int>                     LF
  "requiredFailure"    SP <token>                   LF
  "optionalFailure"    SP <token>                   LF
  "overrideAuthority"  SP <token>                   LF
  ( "deny"     SP <pattern>                            LF )*
  ( "required" SP <id> NUL <version> NUL <sha256-hex>  LF )*
  ( "optional" SP <id> NUL <version> NUL <sha256-hex>  LF )*

releaseDigest := "sha256:" <lowercase hex of sha256(release_manifest)>
```

Exactly specified, because an identity with a loose spelling is not an identity:

| Aspect | Rule |
|---|---|
| encoding | UTF-8, **NFC-normalized**, no byte-order mark |
| newline | `LF` (0x0A) only; **never** CR or CRLF |
| separators | `SP` is one 0x20; `NUL` is one 0x00 |
| terminator | **every** line ends `LF`, including the last |
| whitespace | no leading or trailing whitespace on any line; never two consecutive `SP` |
| scalar block | the eleven fixed lines above, **in exactly that order**, each present exactly once |
| booleans | the literal lowercase token `true` or `false` — never `1`, `yes`, or `True` |
| integers | shortest decimal, no sign, no leading zeros, `0` written as `0` |
| tokens | the exact catalog string; no case folding, no aliasing |
| member digest | the module's reviewed `sourceDigest` as **bare lowercase 64-hex**, the `sha256:` prefix stripped, matching ADR-0015 §6 |
| version | the module's exact catalog `version` string |

**Ordering is normative and non-semantic.** These three collections are sets, not
sequences, so an editor reordering a JSON array must not change identity:

- `deny` lines sorted ascending by the **UTF-8 bytes** of the pattern;
- `required` lines sorted ascending by the UTF-8 bytes of the module id;
- `optional` lines sorted ascending by the UTF-8 bytes of the module id.

A `deny` pattern, a required id, and an optional id are each unique within a
release; duplicates are a refusal, not a sort question.

#### Admissible bytes — refusal, not escaping

The format uses `SP`, `NUL`, and `LF` structurally, so no value may contain one.
**There is deliberately no escaping scheme**: an escape mechanism is a second
grammar, and two grammars over the same bytes is how one byte sequence acquires
two readings.

- Every string value is **NFC UTF-8**.
- **No logical string value may contain `NUL` (0x00), `LF` (0x0A), or `CR`
  (0x0D).** A value that does is **refused** — the release cannot be built.
- A scalar serialized after `SP` as a single token additionally contains **no
  ASCII whitespace at all**. No current field needs whitespace, and none may
  acquire it without defining its own encoding here first.
- `deny` patterns, module ids, versions, and every policy token are subject to
  both rules above.

**Release version grammar** — syntax only:

```text
release-version := DIGIT+ "." DIGIT+ "." DIGIT+
```

Three dot-separated decimal runs, no leading `v`, no pre-release or build
suffix, no whitespace. **This establishes no SemVer compatibility meaning** — §5
already declines to infer one. It exists so the token is unambiguous inside a
`SP`-delimited line.

**Module version strings** inside `NUL`-delimited member records preserve the
**exact catalog string**, so the manifest cannot silently disagree with the
catalog it pins. They are still refused if they contain `NUL`, `LF`, or `CR`.

**The manifest is derived from logical release content, not from any file.** Two
implementations reading the same logical release must produce byte-identical
manifests, which is what makes an independent second implementation meaningful.

**Arbitrary JSON serialization remains prohibited.** Key order, escaping, and
number formatting are library behaviour, and an identity that depends on them is
not an identity.

**`releaseReview` is deliberately absent from the manifest.** See §9 — including
it would make the digest depend on a review of the digest.

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
- `blockedByToolchain: false`;
- `blockedByRollout: false`;
- a lifecycle state that is **eligible for new composition** — stated
  semantically below rather than pinned to one status name.

**The precondition is semantic, not a single status.** Requiring exactly
`Validated` would make a module *ineligible by progressing*: moving to `Packaged`
or `Published` would remove it from new releases even though its identity and
review are unchanged and strictly stronger. That is a rule that punishes the
lifecycle for advancing.

What is actually required is: **the member has a concrete reviewed and admitted
identity, and is in a state a new composition may select.** Against today's
vocabulary:

| Module state | Eligible for a NEW release | Why |
|---|---|---|
| `Planned` | **no** | no identity to pin |
| `Source-ready` | **no** | authored but not admitted; nothing has validated the bytes |
| `Validated` | **yes** | admitted, with an exact reviewed digest |
| `Packaged` | **yes** | strictly further along; identity and review unchanged |
| `Published` | **yes** | same, plus deliverability — never a reason to exclude |
| `Deprecated` | **no** | it is identifiable, and an existing release that pins it stays exact; but a **new** composition must not adopt something the module program is retiring. Superseding it is a deliberate act |
| `Retired` | **no** | same, more strongly |

**Deprecated and Retired are decided here rather than left to fall through.** An
existing release pinning such a member remains exact and explicable — §8's
survival rule — but it may not be newly selected.

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

### 8. Lifecycle belongs to a RELEASE, not to the family

The module vocabulary describes bytes moving toward delivery and does not
describe a composition. Sets get their own — and it is **per release**:

```
Released  →  Deprecated  →  Retired
```

"Should not" is not an executable disposition, so each state is defined as a rule
a mechanism can apply:

| State | New profile revision may **adopt** it | Existing profile revision already pinning it | Historical identity |
|---|---|---|---|
| **Released** | **yes** | resolves; services new runs | resolvable |
| **Deprecated** | **no** | **still resolves**, and may service new runs | resolvable |
| **Retired** | **no** | **does not** resolve; may not service a new run | **still resolvable for explanation** |

- **Released** — may be pinned by new profile revisions and may service new runs.
- **Deprecated** — a **new profile revision may not newly adopt it**, while
  revisions that already pin it keep resolving and keep running. It is a stop on
  new adoption, not a runtime break. Runtime warning or evidence semantics may be
  added later; none is asserted here.
- **Retired** — **may not service a new run** at all, whoever pins it. Identity
  and historical evidence remain resolvable so an old run stays explicable.

The distinction that matters: **deprecation restricts adoption; retirement
restricts execution; neither restricts explanation.**

Deprecation and retirement govern **new-request eligibility only**. Neither ever
touches the immutable manifest or the digest, so an old run stays explicable
forever. This is what lets one family hold `1.0.0 Deprecated` alongside
`1.1.0 Released` with both manifests byte-identical to the day they were
reviewed.

**A family has no lifecycle status of its own.** It is authoring state, and a
status on it would be exactly the ambiguity this section exists to remove: one
field cannot describe both a mutable candidate and a set of immutable revisions.
Whether a family has any release is *derived* — it either has release records or
it does not.

A release is never `Packaged` — no package exists whose identity that would name
— and never `Published`, which is a module-content fact under ADR-0016.

### 8a. What happens to the current catalog fields

The family rows in `knowledge/catalog.json` carry `status`, `version`, and
`blockedByRollout` today. After acceptance, **these are reconciled in Prompt 6B**
as follows, and this ADR fixes the target so the implementation is not left to
invent one:

| Field today | After acceptance |
|---|---|
| `version` | **removed from the family row.** A mutable row must never carry "the current release version": the moment `1.1.0` exists the row stops representing `1.0.0`, which is precisely the historical-identity defect this ADR exists to prevent. Versions live only on release records |
| `status` | **removed from the family row.** Lifecycle is per release (§8). A family's having-any-release state is derived from the release records |
| `blockedByRollout` | **ceases to be the rollout authority.** Eligibility attaches to a release (§10). Until 6B migrates the representation the field remains present and must stay `true`; it is never the thing that authorizes a release |

**There must be exactly one rollout authority.** Leaving a family gate that can
say "open" beside a release record that can say "not reviewed" would create two
answers to one question, and the permissive one would eventually win by accident.

### 8b. The release record, and what a profile pins

Two artifacts, with different mutability:

```text
SET FAMILY                          (mutable, authoring)
  id, purpose, owner, limitations, governingSources,
  sensitivity, freshnessPolicy, rationale
  candidate composition + candidate identity-bearing policy
  NOT a release · NOT what a profile pins

SET RELEASE RECORD                  (immutable once reviewed)
  familyId
  version
  manifestPath          the canonical manifest of §4
  releaseDigest         sha256 over those exact bytes
  releaseReview         §9, bound to releaseDigest
  state                 Released | Deprecated | Retired   (the only mutable part)
```

A profile pins **`familyId@releaseVersion`**, and resolution looks up the release
record, never the family row.

**Invariant: `(familyId, version) → releaseDigest` is unique and immutable for
all time.** A version, once used, is never reused — not after deprecation, not
after retirement, not if the release is withdrawn. Reuse would make an old run's
evidence ambiguous, which is the one thing release identity exists to prevent.

Where release records live is a 6B representation choice, constrained by this
ADR to satisfy: addressable by `(familyId, version)`, immutable after review,
never deleted, and resolvable without consulting a mutable row or reconstructing
history from Git.

### 9. Release review is its own evidence, not `contentReview`

`contentReview` attests a prohibited-content review of module **bytes**
(ADR-0016 §5). A composition review answers a different question: *should this
exact bundle of context be selectable by this runner class, with these denials
and these limits?*

Reusing `contentReview` would make one attestation appear to prove two unrelated
things. A release therefore carries its own binding:

```
releaseReview
  policy          "knowledge-set-release-review-v1"
  by              the reviewing actor
  at              the review instant
  releaseDigest   the exact immutable release revision reviewed
```

**The order is strict, and it is what makes the binding non-circular:**

```text
logical release content  →  canonical manifest (§4)  →  releaseDigest
                                                             ↓
                                              releaseReview binds releaseDigest
```

**`releaseReview` is never an input to the manifest** and therefore never affects
the digest. Writing the review after the digest exists changes nothing about the
digest — a property §4 secures by excluding the field, and case 19 below tests.
A release cannot be edited after review without invalidating it, exactly as a
module attestation cannot.

#### What `knowledge-set-release-review-v1` reviews

The named policy is a composition review, and it examines:

- the exact member identities — id, version, digest — required and optional;
- the required/optional split, and what each disposition means for a run;
- the **least-context posture**: whether this is the smallest context that serves
  the runner class, rather than the most convenient;
- the `deny` rules, and whether any has been weakened relative to a prior release;
- the task-addition and task-narrowing posture;
- the failure semantics for required and optional members;
- `maxBytes` and `maxFreshnessDays`;
- `runnerClass`;
- `overrideAuthority`.

**Review authority is stated provider-neutrally**: an actor the repository's
governance recognises as competent to approve a context boundary for the named
runner class. Today that is an explicit human review event, recorded as such.

**No automated producer exists, and none is claimed.** In particular this is
*not* ADR-0016's absent Proof B producer wearing a second hat: different object,
different question, no mechanism linking them. Automating composition review is a
later decision that would need its own ADR.

### 10. There is exactly one set-release rollout authority

**Eligibility is not a boolean anywhere.** It is a release's `state`.

```text
candidate composition
      │   preconditions of §6 hold for every selected member
      │   canonical manifest (§4) → releaseDigest
      │   releaseReview binds that digest (§9)
      ▼
immutable release record, state = Released      ← eligible
```

- **`Released` is the eligibility.** A release in that state has earned it; there
  is nothing further to flip.
- **There is no release-level `blockedByRollout` boolean.** Adding one would
  recreate the two-authority problem in a new place: state and boolean could
  disagree, and the permissive reading would eventually win.
- A family holding one released revision confers **nothing** on a later
  unreviewed revision. Each release earns its own review.
- A candidate that is not a reviewed release is not eligible for anything, and no
  field on the family can make it so.

The legacy family-level `blockedByRollout` stays `true` until Prompt 6B migrates
the schema, and it is never what authorizes a release. After migration it must
not survive as a second authority (§0, §8a).

ADR-0016's module and runbook rollout rules are untouched, and `resolveSet`'s
refusal to resolve a blocked member through an unblocked set continues to apply —
a released set still cannot deliver a blocked module.

### 10a. `blockedByToolchain` on the set side

ADR-0016 also requires this field on every set. This ADR does not make it release
identity, and 6B must not invent an answer:

- **Module `blockedByToolchain` is unchanged**, exactly as ADR-0016 defines it.
- **Set-family `blockedByToolchain` is a repository-wide readiness mirror**, not a
  per-set fact. It is already `false` everywhere following the accepted toolchain
  discharge, and it is **neither release identity nor per-release eligibility** —
  it never appears in the canonical manifest (§4).

Prompt 6B may either **(A)** retain it on the family as a non-identity readiness
mirror, or **(B)** move the repository-wide readiness fact to one canonical global
location and drop the per-set copy. Either is acceptable; **what is not acceptable
is two readiness authorities that can disagree.** If (B) is chosen, no per-set
copy may remain.

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

Run evidence therefore carries:

| Field | Records |
|---|---|
| `requestedSetId` | the family a profile pinned |
| `requestedSetVersion` | the release version it pinned |
| `requestedSetReleaseDigest` | the exact release those two resolved to |
| `taskDelta` | the additions and narrowings actually applied |
| `taskDeltaDigest` | identity of that delta |
| `resolvedManifestDigest` | identity of the exact context delivered |

**No `resolvedSetVersion` is minted.** Recording a resolved *version* differing
from the requested one asserts a release that was never reviewed and does not
exist. `knowledge-selection-model.md` §4 must be corrected on acceptance — its
current text describes an unrepresentable field.

**Every module a task adds resolves to an exact `(id, version, digest)` inside
the resolved manifest**, exactly as a release member does. An addition is never a
floating reference: if it cannot be resolved to an exact identity it is not
addable.

It follows that a later catalog change can change a later resolution **only by
changing that resolution's own recorded identities**. Two runs of the same base
release that saw different context have different `resolvedManifestDigest`
values, so no ambiguity hides behind the shared base release.

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

**Make a committed release-manifest file's incidental bytes normative** rather
than specifying a canonical form. Considered and **not adopted** in §4. It is
tempting because it needs no format specification, but it makes identity depend
on whatever wrote the file — an editor's trailing newline, a formatter's key
order, a line-ending conversion on a different platform. A second implementation
could not reproduce the digest from logical content, which is the property that
makes an independent check meaningful. §4 specifies the manifest instead, and a
committed file may still *carry* those bytes without being the reason they are
what they are.

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

## Architecture falsification — performed against this proposal

Run **now**, against the rules above, not deferred to the implementer. Each case
names the rule that decides it. A case that cannot be answered from this ADR
alone would mean it is not ready.

| # | Scenario | Deciding rule | Expected | Result |
|---|---|---|---|---|
| 1 | required member has no version | §6 preconditions | release refused | **PASS** |
| 2 | optional member has no version | §6 — "required **and optional** alike" | refused; and §2 pins optional identity, so the same release cannot later acquire one | **PASS** |
| 3 | selected member `blockedByRollout: true` | §6; and `resolveSet` already refuses a blocked member through an unblocked set | refused — release is not a back door | **PASS** (already mechanised) |
| 4 | required member's version changes after release | §2 pins id+version+digest; §5 forbids mutating a released version | old release still names the old version and digest | **PASS** |
| 5 | optional member's version changes after release | §2 — optional pinned identically | same | **PASS** |
| 6 | `deny` changes, version does not | §3 identity-bearing; §5 any identity change needs a new version | impossible without a new release | **PASS** |
| 7 | `maxFreshnessDays` changes, version does not | §3, §5 | impossible | **PASS** |
| 8 | `allowTaskAdditions` changes, version does not | §3, §5 | impossible | **PASS** |
| 9 | a task narrows the set | §11 | base identity unchanged; `resolvedManifestDigest` separate; no version minted | **PASS** |
| 10 | a task adds an allowed catalog module | §11 | same, and the addition resolves to an exact `(id, version, digest)` | **PASS** |
| 11 | catalog gains a new module later | §2 pins exact members; §4 digests only what the release names | no old release acquires it | **PASS** |
| 12 | `@1.1.0` exists | §1 invariant; §8b `(familyId, version) → releaseDigest` unique and immutable | `@1.0.0` remains representable and resolvable | **PASS** |
| 13 | release while nothing is `Published` and no resolver exists | §6 (publication not a precondition); §7 | representable; runtime usability explicitly false | **PASS** |
| 14 | does release change tools, sandbox, API capability, authorization, safety, or live state? | §7; *What this decision does NOT prove*; ADR-0010 | no — context only | **PASS** |
| 15 | household set whose platform and runbook members are valid | §6 — **every** selected member must have both gates false | cannot be opened; household members are rollout-blocked | **PASS** |
| 16 | `1.0.0` released, then the family candidate is edited toward `1.1.0` | §8a family carries no version/status; §10 eligibility attaches to a release | `1.0.0` stays eligible and identifiable; the candidate inherits **no** rollout | **PASS** |
| 17 | family holds `1.0.0 Deprecated` and `1.1.0 Released` | §8 lifecycle is per release, **and its state table**: Deprecated blocks new adoption, keeps resolving for revisions already pinning it | both identities representable; request semantics have exactly one reading | **PASS** |
| 18 | member goes `Validated → Packaged → Published`, version and digest unchanged | §6 eligibility table | still selectable by a new release — progressing never disqualifies | **PASS** |
| 19 | `releaseReview` is written after `releaseDigest` exists | §4 excludes the field from the manifest; §9 fixes the order | digest unchanged; no circular identity | **PASS** |
| 20 | `required` / `optional` / `deny` array order changes only | §4 ordering is normative and non-semantic — sorted by UTF-8 bytes | canonical identity **does not** change | **PASS** |

**Ambiguities found and closed by this round:** §4 previously offered two
canonicalizations and deferred the choice; §8 did not say whether lifecycle
described a family or a release; §6 pinned `Validated` exactly, which would have
disqualified a module for progressing; §9 did not fix the ordering that keeps the
review non-circular. Each is now decided rather than left to the implementer.

**No case is unanswerable from this ADR alone.**

## Validation and follow-up obligations

The twenty cases above are answered by the architecture. **Prompt 6B must make
each of them hold mechanically, not by prose** — an architecture answer is not a
mechanism, and every case above is a test somebody has to write:

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
    its platform and runbook members are valid;
16. release `1.0.0` exists and the mutable family candidate is edited toward
    `1.1.0` → `1.0.0`'s manifest, digest, review, and state are unchanged, and
    the candidate inherits **no** eligibility from it;
17. `1.0.0` is `Deprecated` while `1.1.0` is `Released` → both manifests and
    digests survive byte-identical, and §8's request semantics apply exactly: a
    new profile revision may not adopt `1.0.0`, one already pinning it keeps
    resolving, and both stay explicable;
18. a member progresses `Validated → Packaged → Published` with version and
    digest unchanged → it remains eligible for a **new** release, and no existing
    release's identity moves;
19. a `releaseReview` is written after its `releaseDigest` exists → the digest is
    byte-identical before and after, proving the review is not an input to it;
20. the input order of `required`, `optional`, or `deny` changes with no other
    edit → the canonical manifest and `releaseDigest` are unchanged.

Two further obligations that are not scenarios:

- the canonicalization in §4 requires an **independent second implementation** of
  the digest, as ADR-0015 §6 identity has — a single implementation agreeing with
  itself proves nothing;
- the byte-admissibility rules in §4 must **refuse** a value containing `NUL`,
  `LF`, or `CR`, proven against a planted violation rather than by reading the
  code.

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
