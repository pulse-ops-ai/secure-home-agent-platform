# ADR-0015: Adopt OKF v0.2 as the source representation only, and keep packaging, query, and admission ours

- **Status:** Proposed
- **Date:** 2026-08-15
- **Deciders:** @mikegtech (repository owner)
- **Supersedes:** none
- **Related:** [ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md), [ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md), [ADR-0006](ADR-0006-separate-agent-implementation-profile-run-and-automation.md), [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) (`Proposed`)
- **Answers:** [U7](../architecture/unresolved-decisions.md#u7) — **on acceptance**, and subject to the implementation gate in §12. U7 remains open until then.

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
| as-of date | `generated.at`, present and ISO-8601 |
| stated limitations | a `limitations` field — **no OKF equivalent exists**; this is ours |
| lifecycle | `status` stated explicitly, never defaulted |
| staleness | `stale_after`, present and absolute |
| canonical source | `governs` — the canonical artifact this module projects, per ADR-0014 §2 (`Proposed`) |

`owner`, `limitations`, and `governs` are **additional frontmatter keys**, which
OKF explicitly permits ("Unknown additional frontmatter keys" must not cause a
consumer to reject). We add obligations without leaving the format.

ADR-0010 already required owner, freshness, and limitations. This states where
each lives.

### 6. Digest identity and canonicalization: RAW BYTES, never re-serialized YAML

The packaged artifact is identified by a digest over **the exact bytes of the
source files**, plus a manifest of `(path, sha256)` pairs in a fixed path order,
itself digested. Nothing is parsed and re-emitted on the way to a hash.

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
is a projection of nothing (ADR-0014 §2, `Proposed`).

So: **admission rejects** an unresolvable bundle-internal link or an
unresolvable `governs` reference. **Query tolerates** one, because a bundle may
have been packaged before a later deletion elsewhere. Both behaviours are
correct at their own layer.

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

### 12. THE IMPLEMENTATION GATE — what must exist before the first module

Accepting this ADR answers *which format*. It does **not** open authoring.

Before the first real knowledge module may be authored, all of the following
must exist and pass:

1. `compile`, `validate`, `package`, `query` implemented behind the ADR-0010
   interfaces;
2. a **conformance suite** covering, at minimum: the §5 profile required fields;
   the pinned `okf_version`; each prohibited-content class, with a negative case
   per class proven to fail without the check; reference integrity; and digest
   reproducibility — the same source tree packaged twice producing the same
   digest, and a single byte change producing a different one;
3. every check **failing closed**, demonstrated by a negative test per class,
   not asserted;
4. `scripts/check-knowledge.mjs` either subsumed by or reconciled with the new
   validator, so there is one admission authority rather than two.

There is no upstream shortcut. The evidence above establishes that the OKF
project publishes no validator, no conformance suite, and no machine-readable
schema; `okf/tests` exercises the reference *agent*, not the format. We build
this, or it does not exist.

**U7 closes when this ADR is accepted AND the above exists.** Acceptance alone
must not be read as permission to author.

## Consequences

**Positive.** A real, current, vendor-neutral format instead of an invented one,
with provenance and trust vocabulary already thought through. Review-as-code by
construction. The pin makes upstream drift visible instead of silent. Digest
identity depends on bytes, so it is stable against tooling changes.

**Negative.** We build the entire toolchain; there is nothing upstream to adopt.
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
5. This ADR changes **no** existing ADR's status and does **not** close U7.
   U7 remains open pending human acceptance **and** the §12 implementation gate.

## Links

- [ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) — portable
  knowledge only; the four interfaces; knowledge is never an authority
- [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
  (`Proposed`) — a module projects a canonical source and names it (§5 `governs`)
- [U7](../architecture/unresolved-decisions.md#u7) — the question this answers
- [`knowledge-selection-model.md`](../architecture/knowledge-selection-model.md)
  — how a profile selects a set and what a run records
- Upstream: `GoogleCloudPlatform/knowledge-catalog`, `okf/SPEC.md` (OKF v0.2)
