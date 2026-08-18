# Design: okf-format-decision

> **In force.** ADR-0015 was accepted 2026-08-15; U7 is RESOLVED. The toolchain
> does not exist, so authoring remains blocked by `blockedByToolchain`.

## Context

ADR-0010 fixed the requirements and named OKF a candidate. U7 gates authoring on
a validator existing. This change reads the current upstream specification and
decides. It implements nothing.

## Goals

- Decide the format against the already-fixed requirements, with cited evidence.
- Keep the trust vocabulary structurally unable to become authority.
- Leave authoring blocked, visibly.

## Non-Goals

- The toolchain. Any module. Closing U7. Runtime authority.

## Current Architecture

`knowledge/` is specification-only. `check-knowledge.mjs` validates the
*registry* — that modules exist, are registered, carry metadata, and that no
status claims a published artifact. No format, no packaging, no query.

## Proposed Architecture

```text
OKF v0.2 source (pinned)
     │  compile
     ▼
internal representation
     │  validate = OKF conformance + repository profile
     │             + prohibited content + reference integrity
     ▼                      (ADMISSION — rejects)
     │  package  = manifest + raw-byte digest
     ▼
immutable, digest-addressed bundle
     │  query    (the only read path — CONSUMPTION, tolerates)
     ▼
agent / service
```

## Decisions

### D1: Source representation only

OKF supplies layout and vocabulary. It defines no packaging, no digest, no
query, and its stated consumption model is the direct file read ADR-0010
forbids. Adopting it whole would repeal that rule; adopting it as source keeps
both.

### D2: Pin `0.2`, do not track latest

The spec says minor bumps are backward-compatible. The v0.1 → v0.2 transition
renamed `timestamp` to `generated` and replaced a `# Citations` list with the
`sources` family — both breaking. A promise the format's own history contradicts
is not one to build on.

### D3: Two layers, two postures — and this is the subtle one

OKF conformance is about *tolerant consumption*: a consumer MUST NOT reject for
missing optional fields, unknown keys, or broken links. Our admission gate must
reject for exactly those things, because every field we require is optional in
OKF.

These are not in conflict; they act at different moments. Admission runs before
a module is knowledge. Consumption runs after. Collapsing them yields either a
non-conformant reader or an advisory validator — and an advisory validator is
precisely U7's hazard.

### D4: Digest raw bytes, evidenced

A spike parsed one frontmatter block and re-serialized it three defensible ways.
Three digests, none matching the original bytes. Digesting parsed structure makes
identity a function of dump settings, so a dependency upgrade would change the
identity of unchanged knowledge. Raw bytes plus a path-ordered manifest is stable
by construction.

Consequence: envelope violations are **rejected, not normalized**. Normalizing
would change the bytes the digest identifies, so a "helpful" rewrite would make
the artifact's identity depend on the tool version — the defect this decision
avoids, reintroduced at the other end.

### D4b: `Attested Computation` is refused, conservatively

OKF v0.2 makes it first-class, and says outright that what sits behind an
`executor` resource — "a Skill, a script, a container" — is a packaging choice.
That would let executable capability enter through the knowledge plane as
ordinary project knowledge, selected by a profile. It is also directly against
`knowledge/README.md`, which keeps code out of a bundle.

Refused by FIELD as well as by type, because `type` is an open string a producer
chooses. Conservative rather than permanent: admitting attested computation
needs its own decision about naming a provider-neutral executable without the
reference becoming authority, and refusing by default means that decision cannot
be taken by accident.

### D4c: The manifest byte format is normative

"Path/digest pairs in a fixed order" is not an identity — delimiter and encoding
choices still change the digest. That is the YAML defect one level out, so the
serialization is pinned and carries its own version string.

### D4d: Acceptance is ordered; U7's state and the authoring gate are migrated together

`governs` has no meaning without ADR-0014's canonical-source model, so ADR-0014
must be accepted first. Both may sit `Proposed` together — the constraint binds
at acceptance only, and the decisions stay separately reviewable.

The repository encodes one fact where two are needed: `blockedByU7` is required
on every module and set, and the validator and docs name U7 as the reason
authoring is blocked. On the day U7 closes those become false or stale, and the
dangerous reading is that authoring is now open. So the rename to
`blockedByToolchain` is **atomic with the acceptance commit** — not before,
which would make a proposal operative, and not after, which would leave a window
where nothing names the block. Renamed rather than deleted, because the fact is
still true; only the reason was wrong.

### D4e: The catalog stays authoritative; frontmatter mirrors it

Both already carry owner, currency, limitations, and governing source, and the
catalog declares itself the single source. Requiring the facts in two places
without saying which wins would create two authorities for one fact. The mirror
exists because a packaged bundle travels and the catalog does not travel with
it; the reject-on-disagreement rule exists so portability does not become
divergence. Changing which side is authoritative is its own ADR, not a toolchain
choice.

### D5: Trust is descriptive, stated as a prohibition

A mapping table invites a future reader to find the row where a trust tier means
something. There is no such row. The rule is stated as a prohibition: no OKF
trust state is an input to authority, capability, authorization, safety policy,
or live-state interpretation. Structural protection: these fields never leave the
knowledge plane into a profile, grant, envelope, or launch assertion.

## Decision Tables

| Requirement (ADR-0010) | Native OKF | Ours |
|---|---|---|
| portable, review-as-code | ✅ markdown + YAML | — |
| compile/validate/package/query isolation | ❌ none defined | ✅ all four |
| versioned modules and sets | ⚠️ bundle-level `okf_version` only | ✅ module versions, sets |
| immutable, digest-addressed | ❌ none | ✅ §6 |
| provenance / trust metadata | ✅ `sources`, `generated`, `verified` | requiring them |
| freshness / owner / limitations | ⚠️ `stale_after`, `status`, per-source `author`; `generated.at` is production time, **not** factual currency | ✅ owner, limitations, and `as_of` mandatory |
| source/reference integrity | ❌ broken links MUST be tolerated | ✅ rejected at admission |
| prohibited content | ❌ no concept | ✅ machine-checked, fail-closed |
| deterministic resolution | ❌ none | ✅ §6 |
| provider-neutral consumption | ✅ by design | — |
| no direct source reads | ❌ contradicted by design | ✅ ADR-0010 rule retained |
| trust separate from authority | ⚠️ vocabulary invites confusion | ✅ prohibition, §10 |

## Interfaces and Contracts

The four ADR-0010 interfaces, unchanged in name and responsibility; ADR-0015 §7
assigns what each must now also do. No code lands here.

## Failure Classification Boundaries

Admission failure is a **change** failure — the module does not enter. Reader
tolerance is **not** a failure path. Digest mismatch is a **supply-chain**
failure. Conflating admission and consumption is a design defect, and the spec
delta carries a negative scenario for it.

## Shared vs Independent Logic

Nothing executable lands. The future validator shares the prohibited-content
rules with `check-knowledge.mjs`, which is why ADR-0015 §12 requires the two to
be reconciled into one admission authority rather than left as two.

## Compatibility and Migration

No migration; nothing exists to migrate. Future OKF upgrades are governed by
ADR-0015 §11 and require a superseding ADR.

## Security Implications

The `verified` tier is the hazard: it reads like authorization. §10 forecloses it
by prohibition and by confining the fields to the knowledge plane. Prohibited
content gains a named enforcement point that fails closed, with a negative test
per class required before authoring.

## Landing Seams

This landing: decision and evidence. The next: the toolchain and its conformance
suite — a separate change, separately authorized, and the thing that actually
opens authoring.

## Open Questions

Whether `0.2` can be relaxed later. Governed by §11; cannot happen by drift.
