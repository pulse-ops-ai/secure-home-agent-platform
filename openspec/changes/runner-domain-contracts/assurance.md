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
  consumer) is a security-relevant transformation under INV-015, now with
  exact schema identity (D5).
- Not `trust-critical`: nothing executes, grants, or enforces; the landing
  is inert (per D8's definition) with no production consumer. The
  Authority Chain and before × after analyses are included anyway because
  the schema supply chain is exactly the shape INV-015 governs.

## Critical Invariants

Child-local invariants (C-INV), each traceable to an inherited canonical
requirement or a design decision:

| ID       | Invariant                                                                | Inherits      |
| -------- | ------------------------------------------------------------------------ | ------------- |
| C-INV-01 | Every object schema is strict; unknown keys refuse                       | INV-002 posture (D4) |
| C-INV-02 | Adapter identity is opaque; adding an adapter changes no schema          | INV-002       |
| C-INV-03 | Platform vocabularies are closed and enumerated — terminal states, gate dispositions, event types; only COMPLETED maps to success; duplicates invalid | INV-003, INV-016 |
| C-INV-04 | The profile is the complete authority shape: credentials as refs, default-deny-only network, pids in limits; knowledge group grants nothing | INV-005 |
| C-INV-05 | No container-runtime identity appears as structural authority (no runtime enum, branch, or variant); the runtime actually used is recorded as opaque evidence data — changing runtime changes values, never schemas | INV-012 |
| C-INV-06 | Credential-transport-purposed fields admit CredentialRef only; launch assertion and evidence/identity structures have no credential-value slot; secret-presence admits only false | launch-assertion semantics (D6) |
| C-INV-07 | Generated schemas are deterministic, drift-detectable, and produced under the explicit conversion contract (draft-2020-12, unrepresentable: throw, no transforms/defaults) | INV-015 (D3) |
| C-INV-08 | Evidence is structurally mandatory and representationally complete (identities incl. opaque runtime, principal, grants, dispositions, observed-vs-claimed change sets with reconciliation, outcome detail, timing) | INV-011 shape |
| C-INV-09 | One schema identity means one schema: contract_id + exact contract_version; $id embeds the exact version; a mechanical identity guard (authored append-only ledger of identity → generated-bytes digest) makes changed-bytes-under-unchanged-identity a deterministic failure; compatibility policy stated, cross-version proof deferred to the change introducing a second version | D5 |
| C-INV-10 | Inert: no production consumer outside the L2 contract layer imports the new contracts; the events → contracts edge is intentional and inward | L2 posture (D8) |

## State-Space Model

Dimensions that materially affect this landing:

| Dimension             | Values                                                    |
| --------------------- | --------------------------------------------------------- |
| Document validity     | valid / unknown-key / missing-identity / vocabulary-violation / duplicate-identity |
| Vocabulary class      | closed enum (platform-owned incl. event_type) / constrained open string (identity) |
| Generation state      | source==output / source-changed / output-hand-edited      |
| Schema identity       | exact version matches byte set / additive change (new minor, new $id) / breaking change (new major) |
| Secret representation | CredentialRef (name) / (value slot: nonexistent in credential-purposed and identity positions) |
| Dependency direction  | events → contracts (allowed, inward) / anything-else → L2 contracts (forbidden while inert) |

Meaningful interactions requiring proof:

- **strictness × identity** — an additive change makes the old strict
  reader reject new documents *by design*; the safety property is that
  the identity differs (new exact version, `$id`, and ledger entry) and
  that changed bytes under an unchanged identity fail deterministically
  (C-PROP-005, C-ADV-007). No cross-version reader claim exists at this
  landing.
- **opaque adapter × closed enums** — the adapter must never migrate into
  the enum class; the falsification test pins it (C-PROP-002); the closed
  `event_type` must never migrate into the open class (C-ADV-006).
- **generation determinism × formatting** — generation writes
  Prettier-stable output; C-PROP-004 runs after the repository gate.
- **duplicate identity × collection shape** — uniqueness holds in both
  registry and result collections (C-ADV-004).
- **runtime-as-data × neutrality scan** — the scan must reject structural
  runtime authority while *requiring* the opaque runtime-identity evidence
  field (C-EX-002 checks both directions).

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
| Arbitrary strings contain no secret material  | **no**            | not provable by types — L4/L9 scanning |
| Undecidable admissibility                     | —                 | fail closed: not admissible here  |

## Cross-Requirement Interactions

| Interaction                          | Risk                                            | Required proof                    |
| ------------------------------------ | ----------------------------------------------- | --------------------------------- |
| C-INV-02 × C-INV-03                  | adapter accidentally typed as a closed enum; event_type accidentally opened | C-PROP-002 + C-ADV-005; C-ADV-006 |
| C-INV-07 × C-INV-01                  | generation loosening strictness in output       | C-EX-003 asserts strict posture survives generation |
| C-INV-09 × C-INV-01                  | two byte sets sharing one identity              | C-PROP-005 + C-ADV-007 (the ledger guard, not convention) |
| D2 duplication rule × events package | a semantically equivalent second primitive definition in events | C-EX-005 (primitives are the contracts exports, by identity) |
| C-INV-06 × C-INV-08                  | a designated credential-value slot appearing in evidence/identity structures | C-ADV-002 |
| C-INV-10 × workspace checks          | a production consumer slipping in during the landing | C-EX-004 dependency scan (events edge excepted) |
| C-INV-05 × C-INV-08                  | runtime identity leaking into schema structure instead of evidence data | C-EX-002 |

## Proof Obligations

| ID        | Proves             | Proof class                | Evidence                                                       |
| --------- | ------------------ | -------------------------- | -------------------------------------------------------------- |
| C-EX-001  | C-INV-03, C-INV-04 | deterministic examples     | valid/invalid fixture pairs per contract family, incl. open-network refusal and credentials-as-refs |
| C-EX-002  | C-INV-05           | schema/contract validation | corpus scan: no structural runtime authority anywhere; evidence carries the opaque runtime-identity data field |
| C-EX-003  | C-INV-01, C-INV-07 | deterministic example      | generated output preserves strict posture under the explicit conversion contract |
| C-EX-004  | C-INV-10           | architecture guard         | workspace dependency scan: zero importers outside the L2 contract layer; the events → contracts edge passes |
| C-EX-005  | D2 duplication rule | architecture guard        | events' schemas reference the contracts exports by identity — no semantically equivalent second primitive definition exists in events |
| C-PROP-001 | C-INV-01          | property test              | generated unknown-key documents always refuse (Zod parse authority, not the generated schema), position named |
| C-PROP-002 | C-INV-02          | property test              | generated adapter identifiers: corpus validates unchanged, zero schema diff |
| C-PROP-003 | C-INV-03          | property test              | out-of-vocabulary terminal states, dispositions, and event types always refuse; duplicate gate identities always refuse |
| C-PROP-004 | C-INV-07          | property test              | double generation byte-identical; any single source mutation ⇒ compare fails |
| C-PROP-005 | C-INV-09          | property test              | for any additive optional field: exact version increments, generated $id differs, a new ledger entry appears; no two distinct byte sets share an $id — no cross-version reader claim |
| C-ADV-001 | C-INV-06           | hostile fixture            | secret-value payloads against every credential-transport-purposed position ⇒ refuse; no designated value slot found |
| C-ADV-002 | C-INV-06 × C-INV-08 | hostile fixture           | evidence/identity structures probed for designated credential-value slots ⇒ none exists |
| C-ADV-003 | C-INV-07           | hostile fixture            | hand-edited `schemas/` file ⇒ regenerate-and-compare fails, file named |
| C-ADV-004 | C-INV-03           | hostile fixture            | duplicate gate identity in registry AND in result set ⇒ both refuse |
| C-ADV-005 | C-INV-02           | hostile fixture            | provider name as enum/discriminator in a proposed schema ⇒ scan fails naming position |
| C-ADV-006 | C-INV-03           | hostile fixture            | provider-native event name in the event_type position ⇒ refuses; it validates only as provider_event_name data |
| C-ADV-007 | C-INV-09           | hostile fixture            | shape mutated and regenerated with contract_version left unchanged ⇒ ledger guard fails deterministically naming the identity |
| C-MUT-001 | C-INV-01           | mutation target            | removing strict posture anywhere ⇒ C-PROP-001 kills             |
| C-MUT-002 | C-INV-02           | mutation target            | typing adapter as enum ⇒ C-PROP-002 kills                       |
| C-MUT-003 | C-INV-07           | mutation target            | disabling the drift check ⇒ C-ADV-003 kills                     |
| C-MUT-004 | C-INV-06           | mutation target            | introducing a credential-value slot or widening secret-presence ⇒ C-ADV-001/002 kill |
| C-MUT-005 | C-INV-03           | mutation target            | widening event_type to an open string ⇒ C-ADV-006 / C-PROP-003 kill |
| C-MUT-006 | C-INV-09           | mutation target            | disabling or bypassing the identity ledger guard ⇒ C-ADV-007 kills |

Do not claim a proof beyond what it exercises: all of the above operate on
documents, types, and the generation pipeline. None asserts runtime
behavior, and none claims arbitrary strings are secret-free.

## Property Tests

| ID         | Property                                                                   |
| ---------- | -------------------------------------------------------------------------- |
| C-PROP-001 | For any generated document with an unknown key, Zod validation refuses naming the position |
| C-PROP-002 | For any generated adapter identifier, every schema in the corpus validates unchanged |
| C-PROP-003 | For any out-of-vocabulary terminal state, disposition, or event type, and any duplicated gate identity, validation refuses |
| C-PROP-004 | For unchanged source, generation is byte-identical; for any single source mutation, comparison fails |
| C-PROP-005 | For any additive optional field: the exact contract version, $id, and ledger entry change; distinct byte sets never share an identity; no cross-version reader compatibility is claimed |

## Hostile Corpus

C-ADV-001 … C-ADV-007 above; the corpus grows during implementation but
never below these seven classes. Each case asserts the refusal *and* the
named position/file — a silent refusal is a finding.

## Mutation Targets

C-MUT-001 … C-MUT-006 above. Each must be demonstrably killed before the
completion gate; an unkilled mutant blocks the seam.

## Authority Chain

| Object                | Authority source            | Captured when       | Sandbox writable? | Transformation                       | Final verifier/consumer                  |
| --------------------- | --------------------------- | ------------------- | ----------------- | ------------------------------------ | ---------------------------------------- |
| Authored Zod source   | reviewed repo (this change) | merge               | n/a (no sandbox)  | —                                    | package consumers (L3+), generation step |
| Shared identity types | `packages/contracts`        | authoring           | no                | imported inward by `packages/events` | both packages' validators — one definition, never duplicated |
| Generated JSON Schema | authored source             | generation at build | no                | `z.toJSONSchema` under the D3 explicit contract, stable serialization | regenerate-and-compare in the merge gate; language-neutral consumers |
| Contract identity     | `contract_id` + exact version constants | authoring | no                | embedded in generated `$id`          | D5 direction rules; consumers            |

Trust terminates in a mechanical boundary at each row: the gate re-derives
generated output rather than trusting the committed file, and an identity
names exactly one byte set (INV-015 — the committed schema never vouches
for itself).

## Before × After Transitions

| Before → After                                | Required outcome                                  |
| --------------------------------------------- | ------------------------------------------------- |
| source unchanged → output regenerated         | byte-identical (C-PROP-004)                       |
| source changed → output not regenerated       | drift check fails (C-ADV-003 class)               |
| output hand-edited → gate runs                | drift check fails naming the file (C-ADV-003)     |
| shape unchanged → additive field added        | new exact version, new $id (C-PROP-005); old identity still names the old byte set |
| valid document → unknown key added            | refuses naming position (C-PROP-001)              |
| unique gate ids → one duplicated              | refuses naming duplicate (C-ADV-004)              |
| identity constants present → removed          | refuses (versionless contract)                    |
| open adapter string → enum-typed              | falsification test fails (C-MUT-002 killed)       |
| closed event_type → opened to any string      | C-ADV-006 / C-MUT-005 kill                        |
| runtime as evidence value → runtime as schema branch | C-EX-002 fails naming the structural position |

## Traceability Plan

| Requirement (capability)                                        | Proof                                    |
| --------------------------------------------------------------- | ---------------------------------------- |
| Complete authority shape (`execution-profile`)                  | C-EX-001, C-PROP-001                     |
| Adapter opaque and open (`execution-profile`)                   | C-PROP-002, C-ADV-005, C-MUT-002         |
| Launch assertion, no credential-value slot (`runner-execution`) | C-ADV-001, C-MUT-004                     |
| Terminal vocabulary enumerated (`runner-execution`)             | C-EX-001, C-PROP-003                     |
| Closed event vocabulary (`runner-execution`)                    | C-PROP-003, C-ADV-006, C-MUT-005         |
| Gate identity/dispositions (`runner-verification`)              | C-PROP-003, C-ADV-004                    |
| Policies/packs declarative (`runner-verification`)              | C-EX-001 (pack fixtures), C-EX-002       |
| Generation deterministic (`runner-verification`)                | C-EX-003, C-PROP-004, C-ADV-003, C-MUT-003 |
| One identity, one schema (`runner-verification`)                | C-PROP-005, C-ADV-007, C-MUT-006         |
| Shared primitives, single definition (D2)                       | C-EX-005                                 |
| Evidence complete and mandatory (`runner-evidence`)             | C-EX-001, C-EX-002, C-ADV-002            |

Deferred re-proofs (named landings): C-PROP-002, C-ADV-005/006, and the
neutrality scan re-run at L7/L8 when adapters exist; behavioral
counterparts of every shape proven here are L3/L4 obligations already
recorded in the constitution.

## Landing Plan

One landing, one PR, inert (per D8's definition). The internal seam and
task DAG are in `tasks.md`; the conformance suite lands with the shapes it
protects. Authority posture: none — nothing activates.

## Review Plan

Per the standing model:

- **This seam:** the full planning review ran 2026-08-09 (D1 accepted, the
  contract-model corrections required); this revision enacts them. Next: a
  **delta-only planning review** of this final artifact set — on approval,
  task 0.1 flips authorization and the design freezes.
- **Implementation on this same change** after the freeze: deterministic
  tests and targeted review during construction; at the complete seam,
  repository-aware semantic review of the diff, then one fresh
  falsification-oriented independent review against the frozen final head.
- **Deterministic gates continuous:** scaffold validation, secret scan,
  Prettier, workspace checks, and (new here) the regenerate-and-compare
  drift and identity-ledger checks — implemented as package-level
  conformance tests reached by the existing aggregate gate, per #51's
  path scope.
- The shape/behavior admissibility table above is part of the review
  contract: any proof claiming runtime behavior at this landing is a
  review-refusal finding.

## Rollout and Rollback

`not_applicable` — inert shapes with no production consumer; rollback is
non-consumption. The first activation of any of these contracts is
L3's/L4's concern under their own landings.

## Assurance Completeness

- **Unresolved state-model questions:** none — D1 enacted; D5 revised per
  review.
- **Requirements lacking proof:** none — every delta requirement maps in
  the traceability table.
- **Scenarios intentionally deferred:** neutrality and event-vocabulary
  re-proofs at L7/L8; all behavioral scenarios to L3/L4 (named in the
  constitution's traceability).
- **Design assumptions requiring human confirmation (delta review):** the
  identity-ledger mechanism as the D5 mechanical guard (location/encoding
  left as implementation latitude within the authorized scope); the
  shared-primitives set exported by `packages/contracts` (D2).

`tasks.md` must not begin implementation of unresolved trust-critical
behavior merely because this artifact exists.
