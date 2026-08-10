# Change Proposal: runner-contract-corrections

## Why

L3 planning (`runner-core`, PR #62) surfaced two contract gaps in the landed
L2 runner domain contracts, and its delta review directed that both be closed
**in L2** rather than worked around in L3:

- **Gap 1 (L3's Q1).** `PathPolicy.prohibited_rules` is `array(string)` with
  no declared rule language. Whatever consumes it must invent matching
  semantics for opaque strings — and the highest-consequence failure of the
  path capability is a protection rule silently misinterpreted or ignored.
  The review's direction: *"L3 should not invent the semantics of
  `prohibited_rules: string[]`. The rule language belongs in the L2
  contract."*

- **Gap 2 (L3's Q2).** The canonical `runner-evidence` requirement enumerates
  what evidence must be capable of representing, and neither the path-policy
  digest nor the gate-registry digest appears in it. Gate *results* are
  representable; the registry that declared those gates is not, and neither is
  the policy that governed materialization. A reader of the evidence bundle
  alone cannot tell which policy or registry governed the run — while the
  ratified adoption contract requires every authority input to be captured
  and digest-recorded. The review's direction: option B — *"a small governed
  L2 follow-up that adds digest-bound identities for the path policy and gate
  registry to the evidence contract/spec."*

Evidence motivating this change:

- The delta review on PR #62 (2026-08-10), directing both corrections.
- `openspec/specs/runner-verification/spec.md` and
  `openspec/specs/runner-evidence/spec.md` — the canonical requirements being
  amended.
- `openspec/changes/runner-core/{proposal,design}.md` Q1/Q2 — the full
  option analysis (A/B/C/D for Q2), concluded in favor of typed rules and
  option B.

## Problem

**What happens today.** A prohibited-path rule is an opaque string; the
contract cannot say what it means, so the meaning would be born in consumer
code. Evidence structurally cannot record two of the four authority inputs
that govern a run.

**What should be possible instead.** The rule language is typed, closed, and
structural — an unrecognized rule form is unrepresentable, not "refused by
convention" in every consumer. Evidence records the digest-bound identity of
**every** authority input that governed the run: profile, image, argv, path
policy, gate registry.

**Who is affected.** L3 (`runner-core`, #52) consumes both corrected
contracts; its planning seam is blocked on this change. Every later landing
inherits the evidence completeness.

**Consequence of leaving it unchanged.** Either L3 invents trust semantics L2
never declared (the exact failure the constitution's neutrality and
authority rules exist to prevent), or evidence permanently under-identifies
the authority that governed each run.

## Proposed Capability

Two targeted amendments to canonical L2 capability specs, and the contract
implementation they demand:

1. **`runner-verification`** — the path-policy contract's prohibited rules
   become **typed structured rules with a closed rule-kind vocabulary**. The
   initial vocabulary is a single kind: a normalized repository-relative
   **path prefix**. Wildcards, traversal segments, absolute prefixes, and
   schemes are structurally unrepresentable. A future rule language is a new
   kind in a future contract version, never a reinterpretation of strings.

2. **`runner-evidence`** — the evidence identity group gains the
   **digest-bound contract identity of the path policy and of the gate
   registry** that governed the run. Both are mandatory: evidence that cannot
   name its governing policy is incomplete by construction.

## Scope

### In scope

- Delta amendments to the two canonical capability specs above.
- `packages/contracts`: `ProhibitedPathRule` (typed, closed), `PathPolicy`
  at contract version **2.0.0**; a shared `AuthorityIdentity` primitive.
- `packages/events`: `EvidenceIdentities` gains `path_policy` and
  `gate_registry` (both `AuthorityIdentity`); `evidence-bundle` at contract
  version **2.0.0**.
- Regenerated `schemas/` output for the two new versions, with **appended**
  identity-ledger rows; the superseded `1.0.0` artifacts and ledger rows are
  retained (design D3).
- Conformance updates proving the new shapes, within the existing L2 nets.

### Out of scope

- Any L3 behavior — matching semantics are *stated* by the rule shape but
  *decided* by `runner-core` under its own landing.
- Any other contract: run records, events, launch assertion, profile,
  verification packs are untouched.
- Deprecation or retirement policy for superseded schema versions — deferred
  again, explicitly (design D3).

## Affected Areas

| Area | Impact |
|---|---|
| `openspec/changes/runner-contract-corrections/**` | this change's artifacts |
| `packages/contracts/**` | `ProhibitedPathRule`, `AuthorityIdentity`, `PathPolicy` v2, retained v1 module, conformance |
| `packages/events/**` | `EvidenceIdentities` v2 fields, `evidence-bundle` v2, retained v1 module, conformance |
| `schemas/path-policy/**`, `schemas/evidence-bundle/**` | new `2.0.0.json` beside retained `1.0.0.json` |
| `schemas/identity-ledger.json` | two **appended** rows; no existing row changes |

## Governance

From the `docs/decisions/INDEX.md` "which ADRs apply" table:

- **ADR-0003** — the rule vocabulary and identity shapes stay provider- and
  framework-neutral; no structural provider name.
- **ADR-0006** — the path policy remains declarative authority data; typing
  its rules grants nothing and changes no authority flow.
- **ADR-0012** — Zod-authored source, generated JSON Schema, catalog-pinned
  dependency set; no new dependency.

The amendments modify two canonical capability specs via governed delta
(`## MODIFIED Requirements`), which is exactly what the OpenSpec archive
workflow exists to do. The ratified `runner-adoption` constitution is not
touched. **Depends on U1–U11:** none.

This change proposes **no ADR status change**.

## Trust / Security / Data Considerations

| Concern | Applies | Note |
|---|---|---|
| authentication or authorization | **yes** | prohibited rules are protection declarations; typing them removes an interpretation seam from the trust path |
| PII or encryption | no | digests and identifiers only |
| persistence or migrations | no | no storage; published schema artifacts only |
| public package contracts | **yes** | both packages' exported shapes change at new contract versions |
| runner / review / materialization machinery | **yes** | these contracts govern it |
| proposed-change-set binding and evidence | **yes** | evidence completeness is the point of gap 2 |

Classification follows in `assurance.md`: **trust-critical** (it amends the
shapes trust decisions consume).

## Existing Evidence

- `openspec/specs/runner-verification/spec.md`,
  `openspec/specs/runner-evidence/spec.md` — the canonical requirements.
- `packages/contracts/src/path-policy/path-policy.ts`,
  `packages/events/src/evidence.ts` — the shapes being corrected.
- `schemas/identity-ledger.json` — the append-only ledger this change appends
  to under its existing two-layer guard.
- The delta review on PR #62 (2026-08-10) — the directing review.
- GitHub issue #51 — the L2 external authority, recorded in `tasks.md`.

## Dependencies

**Already implemented:** L2 (#51, PR #60, archived by #63) — the contracts
and the identity-ledger guard this change exercises.

**Depends on this change:** L3 (`runner-core`, #52) — its planning seam
records both gaps as blocking open questions and sequences behind this
correction.

**External:** none. No new dependency.

## Success

A protection rule's meaning is fixed by the contract: an unrecognized or
non-normalized rule form cannot exist as data. An evidence bundle names the
digest-bound identity of every authority input that governed its run. The
identity ledger shows two appended rows and zero rewritten rows, proven by
the existing historical guard.

## Non-Goals

This change must not:

- implement any matching, decision, or verification behavior (L3);
- alter any contract other than `path-policy` and `evidence-bundle` (and the
  shared primitive both amendments need);
- rewrite or remove any published `1.0.0` artifact or ledger row;
- introduce a wildcard, glob, or regex rule language — the closed vocabulary
  starts with `path_prefix` only, and growing it is a future version;
- touch the constitution, any ADR, or any unresolved decision.

## Open Questions

- **CQ1 — required versus optional identity fields.** This proposal makes
  `path_policy` and `gate_registry` **required** in `EvidenceIdentities`
  (evidence that cannot name its governing authority is incomplete). The
  alternative — optional fields — would let a producer omit them silently.
  Requires confirmation at review.
- **CQ2 — superseded-version retention.** Design D3 retains the `1.0.0`
  artifacts and ledger rows and keeps generating them from frozen v1
  modules, so every existing conformance guard passes unchanged. The
  alternative — retiring old versions — requires amending the corpus
  set-equality semantics and is deliberately not taken here. Requires
  confirmation at review.
