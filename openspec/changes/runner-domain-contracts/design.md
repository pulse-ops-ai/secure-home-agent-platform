# Design: runner-domain-contracts

## Context

L2 of the ratified runner program (#19, constitution PR #48). The canonical
`runner-adoption` spec fixes sixteen invariants; the package charters fix
ownership (`packages/contracts` shared authored source, `packages/events`
run-event/evidence vocabulary); ADR-0012 fixes Zod as the single authored
source with `schemas/` as generated output. This design decides how the
contract layer is shaped within those constraints. External authority: #51.

## Goals

- One authored shape for every runner-domain concept later landings consume.
- Structural neutrality strong enough that ADR-0003's falsification test
  (adding an adapter changes no schema) is a passing property test, not a
  review hope.
- A generation pipeline whose output cannot silently drift from its source
  (INV-015 applied to the schema supply chain).
- Shape/behavior discipline: nothing in this landing claims runtime
  behavior.

## Non-Goals

- Selecting validation engines for consumers (NestJS/Next wiring is decided
  by ADR-0012 and implemented by consumers).
- Any provider-specific structure (waits for the U6 ADR, behind the adapter
  boundary).
- Household contract slices (#28), persistence (U11), knowledge
  serialization (U7).

## Current Architecture

`packages/contracts` and `packages/events` are chartered, empty boundaries
wired into the workspace tooling (shared tsconfig/eslint/vitest by export
path). Zod is not in the catalog. `schemas/` contains READMEs only. The
canonical `runner-adoption` spec and the archived constitution's matrix
define what the shapes must encode; `runner-model.md` defines the profile
field groups and event/evidence properties.

## Proposed Architecture

```text
packages/contracts  (authored, Zod)
  execution-profile/   identity · runtime(image digest, opaque adapter) ·
                       capability · execution(R0–R3) · limits · principal ·
                       knowledge-ref · evidence-ref
  launch-assertion/    ordered argv + digest · env-var NAMES ·
                       secret-presence: literal false
  path-policy/         write roots · prohibited rules · bounds
  gate-registry/       unique gate id · exact executable+argv ·
                       network: literal "none"
  verification-packs/  pack id → gate-id references only

packages/events  (authored, Zod)
  run-record/          run id · profile identity · closed terminal states
  run-events/          dotted lifecycle vocabulary · provider as data
  evidence/            bundle + catalog · hashes · outcome classification ·
                       re-derivable identities

schemas/  (generated, published)
  <one JSON Schema tree per contract family, deterministic output,
   regenerate-and-compare checked>

per-package conformance suites
  neutrality scan · strictness properties · adapter-falsification test ·
  generation determinism/drift checks
```

## Decisions

### D1: Canonical capability decomposition (proposed — the review decides)

- **Decision (proposed):** archive these contracts as four canonical
  capabilities:

| Capability          | Covers                                              | Authored in          |
| ------------------- | --------------------------------------------------- | -------------------- |
| `execution-profile` | profile shape, adapter opacity, knowledge-ref       | `packages/contracts` |
| `runner-execution`  | launch assertion, run record, terminal vocabulary, run events | both (see D2) |
| `runner-verification` | gate registry, gate dispositions, path policy, packs | `packages/contracts` |
| `runner-evidence`   | evidence bundle/catalog, verifiable identities      | `packages/events`    |

  The spec delta is deliberately authored as a single
  `runner-domain-contracts` capability until this review decides; enacting
  the accepted grouping (splitting the delta files) is the first
  post-review task, before implementation.
- **Rationale:** the four groups have distinct consumers (profiles are
  reviewed by humans; execution shapes by runner-control; verification by
  gate tooling; evidence by verifiers) and distinct change cadences.
- **Alternatives:** one `runner-contracts` capability (simplest, but every
  later delta touches one giant spec); a two-way split mirroring the
  packages (aligns with code, but package layout is an implementation
  detail the capability map should not encode).

### D2: Package ownership follows the charters

- **Decision:** profile, launch-assertion, path-policy, gate-registry, and
  verification-pack shapes are authored in `packages/contracts`; run-record,
  run-event, and evidence shapes in `packages/events`. Where a capability
  spans both (runner-execution), the capability is the *normative* grouping
  and the packages are the *authoring location* — the capability map never
  encodes package paths.
- **Rationale:** parent D9 and the package charters already fixed this;
  events/evidence vocabulary belongs to the package chartered for exactly
  that.
- **Alternatives:** everything in `contracts` (rejected by charter);
  a new package (rejected: boundaries exist).

### D3: Generation uses Zod's native JSON Schema export, guarded by drift checks

- **Decision:** JSON Schema is produced by Zod v4's native
  `z.toJSONSchema` — no additional generation dependency — through one
  generation entry point per package that writes `schemas/` with sorted,
  stable serialization. CI runs regenerate-and-compare: a diff between
  regenerated output and the committed `schemas/` tree fails the gate. Hand
  edits to `schemas/` are thereby structurally detectable (INV-015: the
  consumer of a generated schema trusts it only because the chain from
  authored source is re-derived, not because the file says so).
- **Rationale:** one authored source, zero extra dependencies, and the
  fail-closed posture the constitution requires for anything
  security-relevant crossing a transformation.
- **Alternatives:** `zod-to-json-schema` package (an extra dependency for
  capability Zod v4 has natively); hand-authoring JSON Schema (prohibited —
  #59 alignment); not committing generated output (rejected: `schemas/` is
  chartered as the published, language-neutral artifact).

### D4: Strictness posture

- **Decision:** every object schema is strict (`additionalProperties:
  false`; unknown keys refuse). Closed enums exist only for
  platform-owned vocabularies (terminal states, gate dispositions, routing
  classes, mount postures). Open identities (adapter, provider, model
  route, gate id, event name beyond the dotted grammar) are constrained
  strings, never enums. Optionality is explicit; absent and null are not
  conflated.
- **Rationale:** the ratified neutrality requirement makes an adapter enum
  a contract violation; strictness is the shape-level form of
  refuse-don't-default.
- **Alternatives:** passthrough objects (fail-open; rejected); provider
  unions (rejected by ADR-0003 and the constitution's B3 history).

### D5: Versioning

- **Decision:** every contract carries `contract_version: 1` as a literal
  constant; the packages version by semver with stated rules — additive
  optional fields are minor, any breaking shape change increments the
  contract's version constant and the package major. Generated schema files
  embed the contract version in their `$id`.
- **Rationale:** enough for a landing with zero consumers; the constitution
  requires version fields and compatibility rules without over-designing a
  registry no one reads yet.
- **Alternatives:** full schema-registry semantics now (rejected:
  speculative); no version constants (rejected by the canonical spec).

### D6: Credential references

- **Decision:** one shared `CredentialRef` type: an environment-variable
  **name** with a naming-pattern constraint. No contract field anywhere can
  carry a credential value; the launch assertion's `contains_secret_values`
  is the literal `false`.
- **Rationale:** ratified launch-assertion semantics; the upstream lesson
  that a secret-bearing record must be unrecordable, not redacted.

### D7: Identity and uniqueness are validated, not conventions

- **Decision:** gate identity uniqueness (registry and result sets), run
  identity shape, and profile identity (name + version + digest) are
  enforced by contract-level refinements — a duplicate is a validation
  failure, not a downstream runtime guard.
- **Rationale:** the donor's duplicate-gate lesson, ratified as
  Requirement 16: make the illegal state unrepresentable at the earliest
  layer that can express it.

### D8: Zod enters through the catalog; events stays engine-free

- **Decision:** Zod is added once to the pnpm catalog
  (`pnpm-workspace.yaml`) per ADR-0012 §19, referenced as `catalog:` by
  both packages — the only runtime dependency either package has. No other
  dependency enters with this landing.
- **Rationale:** #51 names this work; the catalog is the governed path; the
  packages stay importable by anything without dragging a framework.

## Decision Tables

Shape-vs-behavior boundary (the discipline this landing is reviewed
against):

| Concern                          | L2 proves (shape)                                | Proven later (behavior)             |
| -------------------------------- | ------------------------------------------------ | ----------------------------------- |
| Authority from profile (INV-005) | the profile is the complete, versioned grant shape | refusal of profile-less runs — L4  |
| Gate vocabulary (INV-016)        | closed dispositions; duplicates invalid          | scheduling/classification — L4      |
| Outcome classification (INV-003) | refusal/operational as data; terminal vocabulary | actual classification — L3/L4       |
| Judge protection (INV-008)       | —                                                | L3 (data), L4 (orchestration)       |
| Secrets (launch)                 | value unrepresentable                            | leak scanning, injection — L4/L9    |
| Evidence (INV-011/015)           | mandatory shape; re-derivable identities         | sealing, independent verify — L3    |

Inherited-invariant → proof mapping at this landing:

| Inherited | Applied here as                          | Proof (assurance)     |
| --------- | ---------------------------------------- | --------------------- |
| INV-002   | opaque adapter; neutrality scan          | C-PROP-001, C-PROP-002 |
| INV-003   | vocabulary shapes                        | C-EX-001              |
| INV-005   | complete profile shape                   | C-EX-001              |
| INV-012   | no runtime field anywhere                | C-EX-002              |
| INV-015   | generation drift detection               | C-PROP-004, C-ADV-003 |
| INV-016   | closed dispositions, uniqueness          | C-PROP-003, C-ADV-004 |

## Interfaces and Contracts

The contract families listed under Proposed Architecture are the interface.
Consumers import types and validators from the two packages; language-neutral
consumers read `schemas/`. Nothing is frozen for external stability by this
landing — freezing happens when the first consumer lands (L3/L4) and, for
the SPI-facing parts, only after the U6 ADR.

## Failure Classification Boundaries

At this landing there is exactly one failure mode: an invalid document
fails validation with the violating position named. The contracts
*represent* the runtime classification vocabulary; they never perform
classification.

## Shared vs Independent Logic

- **Shared (this landing):** the domain vocabulary itself — the single
  place identities, closed states, and semantic definitions live, per the
  constitution's shared-semantics rule.
- **Independent (later):** every derivation and proof over these shapes
  (core, control, verifiers, adapters) — independent implementations of the
  same contract, never second contracts.

## Compatibility and Migration

Greenfield and inert: no consumer exists, nothing migrates. The landing may
not weaken any inherited invariant; the conformance suite is written to be
re-run unchanged at L7/L8.

## Security Implications

- No authority is created: shapes grant nothing, and the profile shape's
  knowledge group is structurally incapable of granting (no capability
  fields exist in it).
- Secret values are unrepresentable across the corpus (D6).
- The generation chain is drift-detectable (D3) — the published schemas
  cannot silently diverge from the authored source.
- Structural neutrality is machine-checked, making the U6 boundary
  (no provider structure before the ADR) enforceable at review time.

## Landing Seams

One landing, one PR, inert. Internal task seam (child `tasks.md`): enact
the accepted D1 decomposition → catalog + package wiring → contracts-package
families → events-package families → generation pipeline + committed
`schemas/` → conformance suite. The suite lands with the shapes it protects;
nothing activates.

## Open Questions

- Q1/D1 — the capability decomposition (this review's central decision).
- Q2/D5 — whether version constants + semver + stated rules suffice for v1
  (no consumer exists yet to demand more).
