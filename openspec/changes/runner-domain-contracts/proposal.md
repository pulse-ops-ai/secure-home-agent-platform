# Change Proposal: runner-domain-contracts

## Why

L2 is the first implementation landing of the runner program ratified by the
`runner-baseline-adoption` constitution (PR #48, archived; canonical spec:
`openspec/specs/runner-adoption/spec.md`). Every later landing — the trusted
core (L3), the orchestration state machine (L4), images (L5), adapters (L7),
conformance (L8/L10), and enforcement (L9) — consumes the vocabulary this
landing authors. Until the contracts exist, the program has ratified
invariants but no types to hold them.

## Problem

What happens today:

- `packages/contracts` and `packages/events` are deliberate empty boundaries
  with charters but no content; Zod is intentionally not yet in the pnpm
  catalog; `schemas/` holds no generated output.
- The sixteen ratified adoption invariants constrain contracts that do not
  exist: nothing yet *is* the execution-profile shape, the closed gate
  vocabulary, the launch assertion, or the run-event vocabulary.
- Every downstream landing would otherwise invent its own shapes — the exact
  divergence (two implementations, two vocabularies) the constitution's
  shared-semantics rule prohibits.

## Proposed Capability

The platform's **runner domain contracts**: Zod-authored, provider-neutral,
runtime-neutral contract definitions for the execution profile, launch
assertion, path policy, gate registry, verification packs, run record, run
events, and evidence bundle — with deterministic generated JSON Schema
published under `schemas/` and a conformance suite that later landings re-run.

Contracts define **shapes**. No behavior ships: no validation *engine*
decisions, no refusal logic, no orchestration, no consumer.

## Scope

### In scope

- Zod contract definitions in `packages/contracts` (execution-profile,
  launch-assertion, path-policy, gate-registry, verification-packs) and
  `packages/events` (run-record, run-event vocabulary, evidence bundle and
  catalog, closed gate-outcome and terminal-state vocabularies).
- The Zod catalog entry (`pnpm-workspace.yaml`) and package wiring.
- Deterministic JSON Schema generation into `schemas/`, with a
  regenerate-and-compare check so generated output cannot drift from the
  authored source.
- The contract conformance suite: structural-neutrality scan, strictness
  properties, adding-an-adapter-changes-no-schema falsification test —
  re-runnable at L7/L8.
- Surfacing the canonical capability decomposition as the central design
  decision for this change's review (see Open Questions).

### Out of scope

- Any consumer of the contracts: no `runner-core`, no `runner-control`, no
  adapter, no image references. The landing is **inert** by contract.
- Any behavioral claim: refusal, authorization, capture, materialization,
  and classification *behavior* belong to L3/L4 (shape-vs-behavior boundary,
  per the program review).
- Provider-specific configurable structure of any kind — waits for the U6
  ADR (#11); the profile carries the adapter only as an opaque value.
- Persistence shapes (U11), household/API contracts (#28's slice), and the
  knowledge seam's serialization (U7).

## Affected Areas

- `packages/contracts/**`, `packages/events/**` — authored source (each
  package's charter respected).
- `schemas/**` — generated, published JSON Schema output.
- `pnpm-workspace.yaml` (Zod catalog entry), `pnpm-lock.yaml`.
- `tests` co-located per package (workspace testing conventions).

## Governance

Name the governing ADRs, from the
[docs/decisions/INDEX.md](../../../docs/decisions/INDEX.md) "which ADRs
apply" table:

- ADR-0001 — governs everything.
- ADR-0003, ADR-0006 — the profile as the reviewed grant of authority and
  the implementation/profile/run/automation separation these contracts
  encode as shapes.
- ADR-0012 — Zod as the single authored source; the `packages/` taxonomy;
  the catalog-managed dependency rule this change exercises for Zod.

Canonical inherited contract: `openspec/specs/runner-adoption/spec.md` —
this change inherits, at shape level, INV-002 (provider neutrality, opaque
`adapter`), INV-003 (outcome classification vocabulary), INV-005
(authority-from-profile shape), INV-012 (runtime neutrality), INV-015
(digest-bound generation chain), and INV-016 (closed gate-outcome
vocabulary).

Declare unresolved-decision dependencies:

- **Depends on U1–U11:** none. Load-bearing constraints: no
  provider-specific structure before the U6 ADR; no persistence shapes
  (U11); no knowledge-seam serialization (U7). This landing is ungated.

This change proposes **no ADR status change**.

## Trust / Security / Data Considerations

- Public cross-package contracts: **yes** — this change defines them. Shapes
  only; nothing executes, grants, or validates at runtime here.
- Credential handling appears only as a *reference shape*: credentials are
  named by environment-variable name; a credential value is unrepresentable
  in any contract (the launch assertion's secret-presence field admits only
  `false`).
- No secrets, no live services, no deployment, no runtime dependency beyond
  Zod (catalog-managed, authorized by #51 naming this work).

## Existing Evidence

- The archived constitution
  (`openspec/changes/archive/2026-08-09-runner-baseline-adoption/`): L2
  decomposition contract, D3 (Zod-authored contracts), D9 (package
  ownership split), and the classification matrix rows these contracts
  reimplement as shapes.
- Package charters: `packages/contracts/README.md` (shared authored source,
  L2/#51 slice), `packages/events/README.md` (run-event and evidence
  vocabulary; provider names banned structurally; evidence never optional).
- `docs/architecture/runner-model.md` — the execution-profile field groups
  and event/evidence properties these contracts express.

## Dependencies

- **External authority: issue #51** (“Runner L2: Author the provider-neutral
  runner domain contracts”), recorded in this change's `tasks.md`.
- **Review gate (standing model):** implementation on this change begins
  only after this planning seam passes the architecture/assurance review
  and the design is frozen.
- Prerequisite landing L1 is complete (constitution archived, program index
  live, ownership guidance aligned in #59).

## Success

A reviewed contract layer that every later landing imports instead of
inventing: profiles, launches, gates, packs, runs, events, and evidence all
have exactly one authored shape; generated schemas are deterministic and
published; the conformance suite proves neutrality and strictness and is
re-runnable when adapters exist; and the landing is verifiably inert.

## Non-Goals

- No runtime behavior, no consumer, no engine selection beyond what
  ADR-0012 already decides.
- No canonical-capability archive decision made unilaterally (see Q1).
- No provider-specific structure, no persistence, no household contracts.

## Open Questions

- **Q1 (the review's central decision):** the canonical capability
  decomposition for these contracts — the proposed grouping is
  `execution-profile / runner-execution / runner-verification /
  runner-evidence` (design D1, with alternatives). The spec delta is
  authored as a single `runner-domain-contracts` capability pending that
  decision; enacting the accepted grouping is the first post-review task.
- **Q2:** versioning depth for v1 — per-contract `contract_version`
  constants plus package semver and stated compatibility rules (design D5);
  the review confirms whether that is sufficient before any consumer
  exists.
