# ADR-0015: Adopt OKF v0.2 as the source representation only, and keep packaging, query, and admission ours

- **Status:** Proposed
- **Date:** 2026-08-15
- **Deciders:** @mikegtech (repository owner)
- **Supersedes:** none
- **Related:** [ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md), [ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md), [ADR-0006](ADR-0006-separate-agent-implementation-profile-run-and-automation.md), [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
- **Acceptance depends on:** [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) — **`Accepted` 2026-08-15, so this precondition is now satisfied.** The ordering constraint stands on the record: ADR-0014 had to be accepted first, because `governs` has no meaning without its canonical-source model. See §3a.
- **Answers:** [U7](../architecture/unresolved-decisions.md#u7) — **closed on acceptance of this ADR**, which is when the architectural question has an answer. Authoring stays blocked afterwards by the separate implementation obligation in §12; that obligation is not U7's state.

---

## Context

[ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) decided *portable
knowledge only* and named OKF a **candidate**, explicitly not chosen. It
required four interfaces — compile, validate, package, query — and a
machine-checked prohibited-content rule. [U7](../architecture/unresolved-decisions.md#u7)
gates the first real bundle on the validator existing, so that authoring cannot
make an unvalidated format load-bearing by accident.

This ADR answers whether OKF is that format. It was written against the current
upstream specification, read directly rather than from recollection.

### Evidence examined

Authoritative source: **`GoogleCloudPlatform/knowledge-catalog`**, directory
`okf/`. Retrieved 2026-08-15.

| What | Finding |
|---|---|
| `okf/SPEC.md` | **OKF v0.2**, 37 KB. Markdown files with YAML frontmatter; `type` the only required field; reserved `index.md` and `log.md`; `okf_version` declared in the bundle-root `index.md` |
| trust family | `generated: {by, at}`; `verified: [{by, at}]`; consumers derive a tier **unverified → machine-confirmed → human-reviewed** |
| provenance family | `sources: [{id, resource, title, author, usage_count, last_modified}]`, `usage_window: {from, to}` — described as "objective, per-source signals so a consumer can judge how much to trust a concept" |
| lifecycle family | `status: draft \| stable \| deprecated` (default `stable`); `stale_after: YYYY-MM-DD` |
| actor convention | `<producer>/<version>`, `human:<id>`, `process:<id>` |
| `okf/src/` | contains **only** `reference_agent` — a producer that generates bundles from BigQuery |
| `okf/tests/` | tests of that agent (bigquery source, bundle tools, document, index, viewer, web fetcher). **Not a format conformance suite** |
| `okf/samples/` | three directories; `crypto_bitcoin` holds `README.md` and `seeds.txt` — generator seeds, **not an authored reference bundle** |
| schema | **no JSON Schema, no formal grammar, no validator** published |
| maturity | v0.1 described as "a starting point, not a finished standard"; tooling labelled proof of concept |

Two properties of the specification decide most of what follows.

**OKF is deliberately permissive at the consumer.** A conformant consumer
"MUST NOT reject a bundle because of: Missing optional frontmatter fields,
Unknown `type` values, Unknown additional frontmatter keys, Broken cross-links,
Missing `index.md` files," and "MUST tolerate unknown types gracefully."

**OKF's consumption model is the direct file read.** "If you can `cat` a file,
you can read OKF." ADR-0010 says the opposite for this repository: "No agent,
service, or profile reads a bundle file directly."

Neither is a defect in OKF. They are the consequences of a format designed for
broad interoperability, and they are exactly why OKF cannot be adopted whole.

## Decision

### 1. OKF v0.2 is adopted as the SOURCE REPRESENTATION, and only that

Authored knowledge is written as OKF v0.2: markdown with YAML frontmatter, one
concept per file, `index.md` and `log.md` reserved. This gets review-as-code,
provider neutrality, portability, and a vocabulary for provenance and trust that
we would otherwise have invented worse.

Nothing else about OKF is adopted. Packaging, digest identity, query, and
admission remain this repository's, per §4–§7.

### 2. Version and compatibility posture: PINNED, not floating

The supported version is **exactly `0.2`**. A bundle declares `okf_version` in
its root `index.md`; the validator refuses any other value.

Not "0.2 or later." The spec says a minor bump is backward-compatible, and the
v0.1 → v0.2 transition nonetheless **broke** two things: `timestamp` became
`generated: {by, at}`, and a `# Citations` list became the `sources` frontmatter
family. A compatibility promise the format's own history contradicts is not a
promise to build on. Upgrades are governed by §11.

### 3. The boundary: native OKF semantics vs repository policy

| Concern | Owner |
|---|---|
| file/bundle layout, frontmatter syntax, reserved files | **OKF** |
| `type`, `title`, `description`, `resource`, `tags` | **OKF** |
| `sources`, `usage_window` provenance vocabulary | **OKF** |
| `generated`, `verified` trust vocabulary and actor convention | **OKF** |
| `status`, `stale_after` lifecycle vocabulary | **OKF** |
| cross-link syntax | **OKF** |
| **which of those fields are REQUIRED** | **repository** (§5) |
| module identity, module versioning, sets | **repository** |
| packaged artifact, digest identity, reproducibility | **repository** (§6) |
| query interface and the no-direct-read rule | **repository** (§7) |
| prohibited content | **repository** (§8) |
| reference integrity | **repository** (§9) |
| owner, as-of, stated limitations as *mandatory* | **repository** (§5) |

OKF supplies vocabulary. This repository supplies obligation. That division is
the whole design: we never fork the format, and we never rely on it to enforce
anything.

### 3a. This decision depends on ADR-0014, and acceptance is ordered

§5 requires every module to carry `governs` — the canonical artifact it
projects. That field is not self-defining. What counts as a canonical source,
which kind of truth belongs in which home, and what a projection may and may not
claim are all decided by
[ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md).
Without it, `governs` names a concept the repository has not adopted, and the
validator would be enforcing a field whose meaning is undecided.

**ADR-0014 MUST be `Accepted` before this ADR may be `Accepted`** — and it was,
on 2026-08-15, so the precondition is satisfied.

The constraint is recorded rather than deleted because it explains the ordering
and would bind again if this ADR were ever superseded. Both sat `Proposed` at
the same time, which was fine: proposing in either order is allowed, this ADR
was in fact written first, and the constraint binds only at acceptance. It never
required combining the two decisions, which answer different questions and were
reviewed separately.

An earlier draft of this ADR claimed it "depends on nothing requiring ADR-0014's
acceptance," on the grounds that the citation was marked `Proposed`. That was
wrong. Marking a citation `Proposed` records the status of the source; it does
not remove the dependency on what the source decides.

### 4. Two different jobs, and they must not be confused

- **Consumer conformance** — OKF's rules: tolerate, do not reject. Anything of
  ours that *reads* an OKF bundle obeys them.
- **Admission** — this repository's rule: a module that does not meet our
  profile does not enter the repository or a bundle. Admission **rejects**.

These are not in conflict because they act at different moments. Admission runs
before a module exists as knowledge; consumer tolerance runs after. Conflating
them would either make us non-conformant readers or make our validator advisory,
and the second is how U7's hazard actually happens.

### 5. The repository profile: what admission additionally requires

Beyond OKF's single required `type`, admission requires, per module:

| Requirement | Carried by |
|---|---|
| owner | an `owner` field using the OKF actor convention (`human:<id>`) |
| **factual currency** | an `as_of` field — **ours**; see below |
| production provenance | `generated.at`, present and ISO-8601 |
| stated limitations | a `limitations` field — **no OKF equivalent exists**; this is ours |
| lifecycle | `status` stated explicitly, never defaulted |
| staleness | `stale_after`, present and absolute |
| canonical source | `governs` — the canonical artifact this module projects, per ADR-0014 §2 |

**`as_of` is NOT `generated.at`, and conflating them would corrupt freshness.**
The spec defines `generated.at` as "an ISO 8601 datetime marking the content's
last meaningful change" — when the concept was *written*. This repository's
`asOf` is the date through which the asserted facts are known current; it
already exists in `knowledge/catalog.json`, is recorded per resolved module in
run evidence, and is what `maxFreshnessDays` is measured against
([`knowledge-selection-model.md`](../architecture/knowledge-selection-model.md)).

Regenerating a module today from year-old source material moves `generated.at`
to today and must **not** move `as_of`. Mapping the repository's as-of onto
`generated.at` would make every regeneration silently assert that stale facts
are current — a freshness failure produced by an editing action. OKF defines no
factual-currency field, so this one is ours. `stale_after` remains the expiry
boundary, and the three are distinct: when it was written, what it is current
through, when to stop trusting it.

`owner`, `limitations`, and `governs` are **additional frontmatter keys**, which
OKF explicitly permits ("Unknown additional frontmatter keys" must not cause a
consumer to reject). We add obligations without leaving the format.

ADR-0010 already required owner, freshness, and limitations. This states where
each lives.

### 5a. The catalog stays the registry authority; module frontmatter mirrors it

The profile in §5 makes an authored module carry `owner`, `as_of`,
`limitations`, and `governs`. `knowledge/catalog.json` **already carries all
four** — as `owner`, `asOf`, `limitations`, and `governingSources` — and
declares itself "the single source for module and set metadata." The resolver
selects and evaluates freshness from the catalog, and run evidence records the
catalog digest alongside each resolved module's `asOf`.

Requiring the same facts in two places without saying which one wins would
create two authorities for one fact — the defect class this repository has spent
an entire landing eliminating elsewhere. So it is decided here rather than left
to whoever writes the toolchain:

**The catalog is authoritative. The module's frontmatter is a mirror, and a
disagreement is an admission failure — never a merge, never a precedence rule
resolved silently.**

| Catalog field | Module frontmatter |
|---|---|
| `owner` | `owner` |
| `asOf` | `as_of` |
| `limitations` | `limitations` |
| `governingSources` | `governs` |

Admission compares the mirrored pairs and **rejects on any material
disagreement**, naming the field and both values. It does not prefer one, and it
does not rewrite either: a module whose `as_of` disagrees with its registry
entry is not a module with a stale field, it is a module whose provenance is in
question.

Why mirror at all, rather than keep the facts only in the catalog? Because a
packaged bundle travels. A module read on another machine, by another provider,
must carry its own owner, currency, limitations, and governing source — the
catalog does not travel with it. The mirror exists for portability; the
comparison exists so portability does not become divergence.

If a later decision wants OKF frontmatter to become authoritative instead, that
is a deliberate change to the catalog's "single source" contract and needs its
own ADR. It must not arrive as a toolchain implementation choice.

### 5b. `Attested Computation` is REFUSED at admission

OKF v0.2 makes `Attested Computation` first-class: a concept that "carries not
just what a value *means* but a sanctioned way to *compute* it." It has
`runtime`, an optional `computation` path or inline body, an `executor` whose
`resource` "names run instructions or code", and an `attester` whose `resource`
"names code (no LLM) that takes a receipt and returns a verdict."

And the spec is explicit about what may sit behind that reference:

> "What sits behind a `resource` (a Skill, a script, a container) is a packaging
> choice; OKF fixes the interface, not the packaging."

That sentence is the reason this section exists. It would let a **Skill, a
script, or a container** enter this platform through the knowledge plane, as
ordinary project knowledge, selected by a profile — the precise inversion
[ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
(`Proposed`) was written to prevent, and a direct contradiction of
`knowledge/README.md`, which says code does not belong in a bundle: "the
toolchain will live in a package or service, not here."

**Admission therefore refuses** a concept whose `type` is `Attested
Computation`, and refuses the execution-bearing fields — `runtime`,
`computation`, `executor`, `attester` — wherever they appear, whatever the
declared `type`. The refusal is by field, not only by type, because `type` is an
open string that producers choose.

This is a **conservative initial position, not a permanent verdict.** Attested
computation is a reasonable thing to want. Admitting it needs its own decision
about how an OKF computation names a provider-neutral executable without the
reference becoming authority — which is the same layer boundary this ADR spends
§10 protecting, arriving from the opposite direction. That decision is not taken
here, and refusing by default means it cannot be taken by accident.

### 6. Digest identity and canonicalization: RAW BYTES, never re-serialized YAML

The packaged artifact is identified by a digest over **the exact bytes of the
source files**, through a manifest whose own byte serialization is fixed.
Nothing is parsed and re-emitted on the way to a hash.

**The manifest format is normative, because "a manifest of pairs in a fixed
order" is not an identity.** `path sha256\n`, `path\0sha256\n`, compact JSON,
and pretty JSON all satisfy that prose and produce different package digests —
the same defect the YAML spike exists to eliminate, moved one level out. So:

```text
line   := <normalized-path> NUL <lowercase-hex sha256 of raw file bytes> LF
order  := ascending by the UTF-8 bytes of the normalized path
prefix := "okf-package-v1" LF
manifest_bytes := prefix || line*
bundle_digest  := sha256(manifest_bytes)
```

`normalized-path` is bundle-relative, POSIX-separated, NFC-normalized, with no
`.` or `..` segment. The format carries its own version string so a future
change to the serialization is a visible, governed break rather than a silent
re-identification of unchanged knowledge.

The per-file digests bind the raw bytes; the manifest binds the set and the
paths; the prefix binds the format.

This is evidence-backed, not a preference. A disposable spike (§Validation)
parsed one frontmatter block and re-serialized it three defensible ways — sorted
block, unsorted block, sorted flow. It produced **three different digests, none
matching the original bytes**. Digesting a parsed structure makes bundle
identity a function of the YAML library's dump settings, so an upgrade of a
dependency would silently change the identity of unchanged knowledge.

What is canonicalized is therefore not the YAML but the **envelope**: path
normalization (POSIX separators, NFC, no `.`/`..`), a fixed sort over paths by
byte order, LF line endings enforced at admission, UTF-8 without BOM, and a
trailing newline. Files that do not already satisfy these are **rejected, not
rewritten** — see §10.

### 7. compile / validate / package / query stay ours

OKF defines none of these, and its stated consumption model is the direct file
read that ADR-0010 forbids. The four interfaces remain this repository's:

| Interface | Responsibility |
|---|---|
| **compile** | OKF source tree → internal representation |
| **validate** | OKF conformance **plus** the §5 profile, §8 prohibited content, §9 reference integrity |
| **package** | manifest + digest per §6; immutable, addressable |
| **query** | the only read path for an agent or service |

The no-direct-read rule is unchanged and is now load-bearing in a second way:
it is what lets us be a tolerant OKF consumer at the query layer while remaining
a strict admission gate at the packaging layer.

### 8. Prohibited content is enforced at admission and is not an OKF concern

OKF has no concept of prohibited content. ADR-0010's list — secrets, live state,
presence, authorization tuples, mutable automation state, camera media, raw
personal telemetry — is enforced by our validator, machine-checked, and
**fails closed**: unparseable, unclassifiable, or ambiguous content is a
failure, never a warning and never a skip.

### 9. Reference integrity: OKF tolerates broken links; admission does not

The spec: "Consumers MUST tolerate broken links: a link whose target does not
exist in the bundle is not malformed." That is correct for a consumer and wrong
for admission — a knowledge module citing a canonical source that does not exist
is a projection of nothing (ADR-0014 §2).

**Admission rejects** an unresolvable bundle-internal link or an unresolvable
`governs` reference. **Reading tolerates** a broken link.

The two reference kinds have different lifetimes, and the earlier wording got
this wrong by implying an internal link in one of our own packages could break
later:

| Reference | Lifetime |
|---|---|
| bundle-internal, admitted | **frozen with the package.** The target's bytes are inside the immutable, digest-addressed artifact. Deleting or moving the repository source afterwards cannot break it, and cannot change the digest |
| external, including `governs` | **may become unavailable at any time.** It points outside the package, and admission judged it only at admission |

So tolerant reading is required for two real cases — an external reference that
has since moved, and foreign OKF input this repository never admitted — and for
neither of them is the answer to reject the bundle. What tolerant reading is
*not* needed for is a broken internal link in one of our packages, because that
cannot occur: admission refused it, or it is still there.

### 10. Trust and provenance are DESCRIPTIVE, and map to nothing in the authority plane

This is the decision most likely to be misread later, so it is stated as a
prohibition rather than a mapping.

OKF's `verified` tier is **unverified → machine-confirmed → human-reviewed**.
"Human-reviewed" names *who looked at a document*. It does not name a permission.

| OKF signal | Means | Grants |
|---|---|---|
| `verified` tier | a review event happened, by an actor, at a time | **nothing** |
| `sources`, `usage_count` | how the content was derived | **nothing** |
| `status: stable` | an authoring lifecycle position | **nothing** |
| `stale_after` | when to distrust the content | **nothing** |

**No OKF trust state SHALL be an input to execution authority, capability
resolution, authorization, deterministic safety policy, or the interpretation of
live state.** A `human-reviewed` module and an `unverified` module confer
identical authority: none. If a future component would read a trust tier to
decide what a run may *do*, that component is wrong and the reading is a defect.

The one legitimate use is the one ADR-0010 already permits: an agent may weigh
how much to *believe* a fact, and must still report a disagreement with live
state and lose to it.

The structural protection is that these fields never leave the knowledge plane —
they are not copied into a profile, a capability grant, an authorization
envelope, or a launch assertion.

### 11. Version upgrades are governed, never automatic

A new OKF version is adopted by a **new ADR** that supersedes this one, and only
after: a diff of the specification against §3's boundary; a statement of which
of our required fields changed meaning; a re-run of the conformance suite in
§12; and a re-packaging that shows which module digests change and why. The
pinned `okf_version` moves in that change and nowhere else.

An upstream change never silently becomes ours, because the pin is checked at
admission.

### 12. THE IMPLEMENTATION OBLIGATION — what must exist before the first module

**This is an implementation obligation, not an unresolved architectural
decision, and it is deliberately not represented by U7's state.**

U7 asks whether the format question has an answer. Accepting this ADR gives it
one, and U7 closes then — matching how ADR-0013 closed U6 on acceptance, and
matching the governance rule that an item leaves `unresolved-decisions.md` only
via a new ADR. Using U7's open state to mean "the code has not landed yet" would
make the *implementation* the closing event, which that rule forbids, and would
also misreport an answered question as an open one.

Two facts, two places to record them:

```text
U7 open/closed          → is the architectural question answered?
implementation obligation → is authoring safe to begin?
```

Accepting this ADR therefore answers *which format*. It does **not** open
authoring.

Before the first real knowledge module may be authored, all of the following
must exist and pass:

1. `compile`, `validate`, `package`, `query` implemented behind the ADR-0010
   interfaces;
2. a **conformance suite** covering, at minimum: the §5 profile required fields;
   the §5a catalog/frontmatter mirror comparison, including a disagreement case
   per mirrored field; the pinned `okf_version`; each prohibited-content class,
   with a negative case per class proven to fail without the check; **the §5b
   execution-bearing refusal — a failing negative test for `type: Attested
   Computation` AND one for each of `runtime`, `computation`, `executor`, and
   `attester`, including at least one carried under a different `type`, since
   refusing by type alone is insufficient**; reference integrity; and digest
   reproducibility — the same source tree packaged twice producing the same
   digest, and a single byte change producing a different one;
3. every check **failing closed**, demonstrated by a negative test per class,
   not asserted. The §5b refusal is called out separately in (2) because it is
   the check that keeps executable capability out of the knowledge plane: a
   structural statement in an ADR does not stop a `resource` naming a skill,
   script, or container from being admitted by a validator that never tested
   for it;
4. `scripts/check-knowledge.mjs` either subsumed by or reconciled with the new
   validator, so there is one admission authority rather than two.

There is no upstream shortcut. The evidence above establishes that the OKF
project publishes no validator, no conformance suite, and no machine-readable
schema; `okf/tests` exercises the reference *agent*, not the format. We build
this, or it does not exist.

**U7 closes when this ADR is accepted.** Authoring opens when the obligation
above is satisfied. Those are different events and neither implies the other:
acceptance is not permission to author, and a closed U7 is not evidence that the
toolchain exists. This obligation is discharged in its own change, and the
conformance suite is what evidences it — not a checkbox here.

### 13. THE ACCEPTANCE MIGRATION — separating U7's state from the authoring gate

The repository encodes one fact where §12 needs two. `blockedByU7` is a
**required field on every module and every set** in `knowledge/catalog.json`,
and the registry, its validator, and several governed documents name U7 as the
reason authoring is blocked. On the day U7 closes, each of those becomes either
false or stale — and the dangerous reading is the first one: a closed U7 with
`blockedByU7` still in the schema invites the conclusion that authoring is now
open.

So the acceptance commit **must migrate these atomically**, in the same commit
that closes U7. Not before — that would make a `Proposed` decision operative —
and not after, which would leave a window in which nothing names the block.

**ADR-0014 is deliberately absent from this list.** It must already be
`Accepted` when this ADR is accepted (§3a), and an accepted ADR is immutable —
the contract says supersede, never edit. Its U7 wording was therefore corrected
while it was still `Proposed`, in the same change that proposed this ADR, and it
needs no migration.

| File | What must change |
|---|---|
| `knowledge/catalog.json` | rename `blockedByU7` → `blockedByToolchain` on **every module and set** (23 occurrences), and re-point the two prose notes citing U7 as the format/validator block |
| `scripts/check-knowledge.mjs` | the field name in `REQUIRED_MODULE_FIELDS` and `REQUIRED_SET_FIELDS`; and the three failure messages giving U7 as the reason — the publishable-status checks and the authored-content check — must name the toolchain gate |
| `knowledge/INDEX.md` | "blocked on U7" in the module/set/bundle table; publication "unreachable while U7 is open"; the metadata description citing U7 |
| `knowledge/README.md` | the status banner citing U7 |
| `knowledge/AGENTS.md` | three U7 citations, including the one requiring an ADR to change the posture |
| root `AGENTS.md` | the specification-only condition citing U7; **and the count** — "of the tracked set U1–U11, **exactly one** item has ever been closed" becomes two, with U7 named |
| `docs/decisions/INDEX.md` | U6 as the only item ever closed; "every other item remains open"; the row listing knowledge-bundle authoring as blocked on U7; **and an acceptance record for this ADR** |
| `docs/architecture/knowledge-selection-model.md` | four U7 citations treating it as the format/authoring block, including the statement that the format is undecided |
| `docs/architecture/unresolved-decisions.md` | U7 marked **RESOLVED in place** following the U6 precedent, and its row in the summary table updated |

The field is renamed rather than deleted because the *fact* it records stays
true after U7 closes — authoring is still blocked. Only the reason changes, and
the reason is what the name got wrong.

**Enumeration is necessary and not sufficient.** A hand-written list of files is
exactly the artifact that goes stale, and this one already did once. So the
acceptance commit is additionally **search-driven**: it must run a stale-semantics
sweep before and after, and the after-sweep must return nothing outside this
ADR's own history sections. The searches, at minimum:

```text
blockedByU7
while U7 is open
blocked on U7
only U6 | except U6 | exactly one item
U7 .* (author|validator|format|toolchain)
```

A hit that survives the migration is a governed document asserting something the
repository has stopped believing.

**What the check must enforce after migration.** `blockedByU7` is today
required-to-be-*present* with its value unasserted; the operative gate is the
publishable-status check. After the rename, the validator must additionally
assert `blockedByToolchain === true` until §12 is discharged — so opening
authoring becomes a deliberate edit to every entry, rather than a side effect of
closing an unresolved item.

None of this is done in the proposing change. It is an **acceptance
obligation**, listed here so the acceptance commit is mechanical rather than
improvised, and so a reviewer can check it was complete.

## Consequences

**Positive.** A real, current, vendor-neutral format instead of an invented one,
with provenance and trust vocabulary already thought through. Review-as-code by
construction. The pin makes upstream drift visible instead of silent. Digest
identity depends on bytes, so it is stable against tooling changes.

**Negative.** We build the entire toolchain; there is nothing upstream to adopt.
Refusing `Attested Computation` (§5b) declines a real OKF feature, and a future
change wanting it must do the layer-boundary work first.
The permissive/strict split must be explained to every future reader, because
"we are OKF-conformant" and "we reject non-conforming modules" sound
contradictory until the two layers are distinguished. Pinning to `0.2` means
deliberate work to move.

**Neutral.** No runtime behaviour changes. `knowledge/` stays
specification-only.

**Risks accepted.** OKF v0.2 is early — v0.1 was "a starting point, not a
finished standard," and v0.1 → v0.2 broke two fields. We are betting that a
pinned version plus a governed upgrade path is cheaper than a bespoke format.
If OKF is abandoned upstream, the pin means our bundles keep working and the
cost is a future migration ADR, not an outage.

## Alternatives considered

**Adopt OKF whole, including its consumption model.** Rejected: it would repeal
ADR-0010's no-direct-read rule, which exists so an unvalidated format cannot
become load-bearing. OKF's own model is `cat` a file.

**Adopt OKF and rely on its conformance rules as our validation.** Rejected on
evidence: those rules forbid rejecting for missing fields, unknown keys, and
broken links. Our required fields are all optional in OKF. A validator built
from OKF conformance alone would accept a module with no owner, no as-of, no
limitations, and dangling references.

**Track OKF latest rather than pinning.** Rejected. The format's own history
contradicts the backward-compatibility promise for minor bumps.

**Invent a bespoke format.** Rejected. It is the same work plus the vocabulary
design, and it discards portability — which is the property ADR-0010 chose.

**Wait for OKF to mature.** Rejected as indefinite. Pinning gives most of the
benefit now, and §11 makes moving a governed act rather than a surprise.

## Security implications

**The central one is §10.** OKF's `verified` tier reads like an authorization
concept and is not one. The failure this ADR forecloses is a future component
treating `human-reviewed` as permission — a shadow authorization source, which
is precisely the "shadow policy source" ADR-0010 was written to prevent, arriving
by a route ADR-0010 did not anticipate. §10 states the prohibition and confines
the fields to the knowledge plane.

**Prohibited content** is unchanged and now has a named enforcement point (§8),
failing closed, with per-class negative tests required by §12 — because a
content check that has never been shown to fail is not evidence.

**Byte-exact digests** (§6) make a packaged bundle tamper-evident and make
"the same knowledge" a decidable question.

**Admission-time rejection** of unresolvable references (§9) prevents a module
from claiming a canonical source it does not have.

This ADR grants no capability, no tool, and no authority. `knowledge/` remains
non-runtime-authoritative until §12 is satisfied.

## Availability implications

None. Nothing here is on a runtime path. `knowledge/` remains
specification-only, no profile resolves a set today, and the toolchain does not
yet exist.

## Validation and follow-up obligations

1. **Evidence** — upstream `okf/SPEC.md`, `okf/README.md`, and the directory
   listings of `okf/src`, `okf/tests`, `okf/samples`, retrieved 2026-08-15 and
   recorded in the accompanying change.
2. **Spike, disposable and outside the repository** — parsed one OKF frontmatter
   block and re-serialized it three defensible ways; three different digests,
   none matching the original bytes. This is the evidence behind §6. It is not
   repository infrastructure, is not runtime-authoritative, and was not
   committed.
3. `bash scripts/validate-scaffold.sh`, `node scripts/check-knowledge.mjs`,
   `bash scripts/check.sh`.
4. **Nothing in this ADR is operative while it is `Proposed`**, and no
   lower-precedence artifact may make it operative.
5. This ADR changes **no** existing ADR's status. It does not close U7 *now* —
   it closes it **on acceptance**, which is a human act in its own change. The
   §12 obligation is separate and does not gate U7's state.
6. **The acceptance commit must carry the §13 migration atomically**, and must
   not be merged with U7 closed and `blockedByU7` still naming U7 as the reason
   authoring is blocked.
7. **ADR-0014 must be `Accepted` first** (§3a).

## Links

- [ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) — portable
  knowledge only; the four interfaces; knowledge is never an authority
- [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
  (`Proposed`) — a module projects a canonical source and names it (§5 `governs`)
- [U7](../architecture/unresolved-decisions.md#u7) — the question this answers
- [`knowledge-selection-model.md`](../architecture/knowledge-selection-model.md)
  — how a profile selects a set and what a run records
- Upstream: `GoogleCloudPlatform/knowledge-catalog`, `okf/SPEC.md` (OKF v0.2)
