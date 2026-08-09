# Assurance Plan: runner-domain-contracts

## Purpose

This artifact defines how the accepted specification and design will be
proven before the change is considered complete.

It does not create new product requirements.

It answers:

> Have we modeled enough of the behavior, state space, and failure surface to
> implement and review this change safely?

Scope discipline, stated up front: **this landing proves shapes, never
behavior.** Every proof below is executable against documents, types,
schemas, and the generation pipeline — no proof requires a runtime that does
not exist yet. Claims about refusal, capture, classification, or sealing
behavior are out of scope and belong to L3/L4 (the shape-vs-behavior table
in `design.md` is the boundary this assurance is audited against).

---

## Risk Classification

**Risk:** `high`

### Rationale

- Public cross-package contracts: every later landing consumes these
  shapes; a wrong shape propagates into L3–L10.
- The generation chain (authored source → published schema → external
  consumer) is a security-relevant transformation under INV-015.
- Not `trust-critical`: nothing executes, grants, or enforces; the landing
  is inert with zero consumers. The Authority Chain and before × after
  analyses are included anyway because the schema supply chain is exactly
  the shape INV-015 governs.

## Critical Invariants

Child-local invariants (C-INV), each traceable to an inherited canonical
requirement or a design decision:

| ID       | Invariant                                                                | Inherits      |
| -------- | ------------------------------------------------------------------------ | ------------- |
| C-INV-01 | Every object schema is strict; unknown keys refuse                       | INV-002 posture (D4) |
| C-INV-02 | Adapter identity is opaque; adding an adapter changes no schema          | INV-002       |
| C-INV-03 | Terminal-state and gate-disposition vocabularies are closed; INDETERMINATE maps to failure; duplicates invalid | INV-003, INV-016 |
| C-INV-04 | The profile shape is complete and versioned; knowledge group grants nothing | INV-005    |
| C-INV-05 | No runtime-identifying field exists in any contract                      | INV-012       |
| C-INV-06 | Credential values are unrepresentable; secret-presence admits only false | launch-assertion semantics |
| C-INV-07 | Generated schemas are deterministic and drift-detectable against source  | INV-015       |
| C-INV-08 | Evidence is structurally mandatory and carries re-derivable identities   | INV-011 shape |
| C-INV-09 | Every contract carries its version constant with stated compatibility    | D5            |
| C-INV-10 | The landing is inert: no package or app imports these contracts          | L2 completion posture |

## State-Space Model

Dimensions that materially affect this landing:

| Dimension            | Values                                                    |
| -------------------- | --------------------------------------------------------- |
| Document validity    | valid / unknown-key / missing-version / vocabulary-violation / duplicate-identity |
| Vocabulary class     | closed enum (platform-owned) / constrained open string (identity) |
| Generation state     | source==output / source-changed / output-hand-edited      |
| Secret representation | env-var name / (value: unrepresentable)                  |
| Consumer existence   | none (this landing) / first consumer (L3+)                |
| Capability grouping  | single (as authored) / accepted D1 decomposition          |

Meaningful interactions requiring proof:

- **strictness × versioning** — an additive optional field must not break a
  strict validator of the same major (C-PROP-005 guards the rule as
  stated).
- **opaque adapter × closed enums** — the adapter must never migrate into
  the enum class; the falsification test pins it (C-PROP-002).
- **generation determinism × formatting** — repository Prettier must not
  touch `schemas/` output or determinism breaks (generation writes
  Prettier-stable output; C-PROP-004 runs after the repo gate).
- **duplicate identity × collection shape** — uniqueness must hold in both
  registry and result collections (C-ADV-004 covers both).

## Decision Tables

Proof admissibility (the shape/behavior gate this assurance enforces on
itself):

| Proposed proof claims…                        | Admissible at L2? | Disposition                       |
| --------------------------------------------- | ----------------- | --------------------------------- |
| A document shape validates or refuses         | yes               | prove here                        |
| Generated output equals regenerated output    | yes               | prove here                        |
| A type makes a state unrepresentable          | yes               | prove here                        |
| A runtime refuses/captures/classifies/seals   | **no**            | out of scope — L3/L4 obligation   |
| A container/gate behaves                      | **no**            | out of scope — L4/L9 obligation   |
| Undecidable admissibility                     | —                 | fail closed: not admissible here  |

## Cross-Requirement Interactions

| Interaction                          | Risk                                            | Required proof                    |
| ------------------------------------ | ----------------------------------------------- | --------------------------------- |
| C-INV-02 × C-INV-03                  | adapter accidentally typed as a closed enum     | C-PROP-002 + neutrality scan      |
| C-INV-07 × C-INV-01                  | generation loosening strictness in output       | C-EX-003 asserts `additionalProperties:false` survives generation |
| C-INV-09 × C-INV-01                  | version bump semantics vs strict consumers      | C-PROP-005                        |
| C-INV-06 × C-INV-08                  | evidence identities accidentally carrying secret material | C-ADV-002 corpus includes evidence shapes |
| C-INV-10 × workspace checks          | a consumer import slipping in during the landing | C-EX-004 dependency scan          |

## Proof Obligations

| ID        | Proves            | Proof class                | Evidence                                                       |
| --------- | ----------------- | -------------------------- | -------------------------------------------------------------- |
| C-EX-001  | C-INV-03, C-INV-04 | deterministic examples     | valid/invalid fixture pairs per contract family                |
| C-EX-002  | C-INV-05          | schema/contract validation | corpus scan: no runtime-identifying field                      |
| C-EX-003  | C-INV-01, C-INV-07 | deterministic example      | generated output preserves strict posture                      |
| C-EX-004  | C-INV-10          | architecture guard         | workspace dependency scan: zero importers of both packages     |
| C-PROP-001 | C-INV-01          | property test              | generated unknown-key documents always refuse, position named  |
| C-PROP-002 | C-INV-02          | property test              | generated adapter identifiers: corpus validates unchanged, zero schema diff |
| C-PROP-003 | C-INV-03          | property test              | out-of-vocabulary states always refuse; duplicate identities always refuse |
| C-PROP-004 | C-INV-07          | property test              | double generation byte-identical; mutated source ⇒ compare fails |
| C-PROP-005 | C-INV-09          | property test              | additive-optional field: same-major documents still validate   |
| C-ADV-001 | C-INV-06          | hostile fixture            | secret value smuggled into every candidate field ⇒ refuses     |
| C-ADV-002 | C-INV-06 × C-INV-08 | hostile fixture          | evidence/identity fields carrying value-shaped secrets ⇒ refuse |
| C-ADV-003 | C-INV-07          | hostile fixture            | hand-edited `schemas/` file ⇒ regenerate-and-compare fails, file named |
| C-ADV-004 | C-INV-03          | hostile fixture            | duplicate gate identity in registry AND in result set ⇒ both refuse |
| C-ADV-005 | C-INV-02          | hostile fixture            | provider name as enum/discriminator in a proposed schema ⇒ scan fails naming position |
| C-MUT-001 | C-INV-01          | mutation target            | removing `.strict()` anywhere ⇒ C-PROP-001 kills               |
| C-MUT-002 | C-INV-02          | mutation target            | typing adapter as enum ⇒ C-PROP-002 kills                      |
| C-MUT-003 | C-INV-07          | mutation target            | disabling the drift check ⇒ C-ADV-003 kills                    |
| C-MUT-004 | C-INV-06          | mutation target            | widening secret-presence beyond literal false ⇒ C-ADV-001 kills |

Do not claim a proof beyond what it exercises: all of the above operate on
documents, types, and the generation pipeline. None asserts runtime
behavior.

## Property Tests

| ID         | Property                                                                   |
| ---------- | -------------------------------------------------------------------------- |
| C-PROP-001 | For any generated document with an unknown key, validation refuses naming the position |
| C-PROP-002 | For any generated adapter identifier, every schema in the corpus validates unchanged |
| C-PROP-003 | For any out-of-vocabulary terminal state or disposition, and any duplicated gate identity, validation refuses |
| C-PROP-004 | For unchanged source, generation is byte-identical; for any single source mutation, comparison fails |
| C-PROP-005 | For any additive optional field, previously valid same-major documents remain valid |

## Hostile Corpus

C-ADV-001 … C-ADV-005 above; corpus grows during implementation but never
below these five classes. Each case asserts the refusal *and* the named
position/file — a silent refusal is a finding.

## Mutation Targets

C-MUT-001 … C-MUT-004 above. Each must be demonstrably killed before the
completion gate; an unkilled mutant blocks the seam.

## Authority Chain

| Object                | Authority source            | Captured when     | Sandbox writable? | Transformation                | Final verifier/consumer                  |
| --------------------- | --------------------------- | ----------------- | ----------------- | ----------------------------- | ---------------------------------------- |
| Authored Zod source   | reviewed repo (this change) | merge             | n/a (no sandbox)  | —                             | package consumers (L3+), generation step |
| Generated JSON Schema | authored source             | generation at build | no              | `z.toJSONSchema`, stable serialization | regenerate-and-compare in the merge gate; language-neutral consumers |
| Contract versions     | authored constants          | authoring         | no                | embedded in schema `$id`      | compatibility rules (D5), consumers      |

Trust terminates in a mechanical boundary at each row: the gate re-derives
generated output rather than trusting the committed file (INV-015 — the
committed schema never vouches for itself).

## Before × After Transitions

| Before → After                                | Required outcome                                  |
| --------------------------------------------- | ------------------------------------------------- |
| source unchanged → output regenerated         | byte-identical (C-PROP-004)                       |
| source changed → output not regenerated       | drift check fails (C-ADV-003 class)               |
| output hand-edited → gate runs                | drift check fails naming the file (C-ADV-003)     |
| valid document → unknown key added            | refuses naming position (C-PROP-001)              |
| unique gate ids → one duplicated              | refuses naming duplicate (C-ADV-004)              |
| version constant present → removed            | refuses (versionless contract)                    |
| open adapter string → enum-typed              | falsification test fails (C-MUT-002 killed)       |

## Traceability Plan

| Requirement (spec delta)                       | Proof                                    |
| ---------------------------------------------- | ---------------------------------------- |
| Execution profile complete/versioned           | C-EX-001, C-PROP-001                     |
| Adapter opaque and open                        | C-PROP-002, C-ADV-005, C-MUT-002         |
| Run identity/terminal vocabulary closed        | C-EX-001, C-PROP-003                     |
| Gate identity/dispositions closed and unique   | C-PROP-003, C-ADV-004                    |
| Launch assertion, unrepresentable secrets      | C-ADV-001, C-ADV-002, C-MUT-004          |
| Policies/packs declarative                     | C-EX-001 (pack fixtures), C-EX-002       |
| Run events uniform/dotted/provider-blind       | C-EX-001, C-PROP-002 corpus              |
| Evidence mandatory, verifiable identity        | C-EX-001, C-ADV-002                      |
| Generated schema deterministic/drift-checked   | C-EX-003, C-PROP-004, C-ADV-003, C-MUT-003 |
| Versioned with compatibility                   | C-PROP-005                               |

Deferred re-proofs (named landings): C-PROP-002 and the neutrality scan
re-run at L7/L8 when adapters exist; behavioral counterparts of every shape
proven here are L3/L4 obligations already recorded in the constitution.

## Landing Plan

One landing, one PR, inert. The internal seam and task DAG are in
`tasks.md`; the conformance suite lands with the shapes it protects.
Authority posture: none — nothing activates.

## Review Plan

Per the standing model:

- **This seam:** one full architecture/assurance review of the five
  artifacts (the review that decides D1/Q1), then the design freezes.
- **Implementation on this same change** after the freeze: deterministic
  tests and targeted review during construction; at the complete seam,
  repository-aware semantic review of the diff, then one fresh
  falsification-oriented independent review against the frozen final head.
- **Deterministic gates continuous:** scaffold validation, secret scan,
  Prettier, workspace checks, and (new here) the regenerate-and-compare
  drift gate.
- The shape/behavior admissibility table above is part of the review
  contract: any proof claiming runtime behavior at this landing is a
  review-refusal finding.

## Rollout and Rollback

`not_applicable` — inert shapes with zero consumers; rollback is
non-consumption. The first activation of any of these contracts is L3's/
L4's concern under their own landings.

## Assurance Completeness

- **Unresolved state-model questions:** D1 grouping (this review decides);
  D5 depth (review confirms).
- **Requirements lacking proof:** none — every delta requirement maps
  above.
- **Scenarios intentionally deferred:** neutrality re-proof at L7/L8; all
  behavioral scenarios to L3/L4 (named in the constitution's traceability).
- **Design assumptions requiring human confirmation:** the D1
  decomposition; acceptance that Zod v4 native generation is the pipeline
  (D3) — flagged for the review since it pins the generation mechanism.

`tasks.md` must not begin implementation of unresolved trust-critical
behavior merely because this artifact exists.
