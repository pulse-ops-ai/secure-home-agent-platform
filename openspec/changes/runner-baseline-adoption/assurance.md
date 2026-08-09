# Assurance Plan: runner-baseline-adoption

## Purpose

This artifact defines how the accepted specification and design will be
proven before the change is considered complete.

It does not create new product requirements.

It answers:

> Have we modeled enough of the behavior, state space, and failure surface to
> implement and review this change safely?

One scope note, honestly stated: this change ratifies a contract; it lands
no code. The proofs below are therefore of two kinds — proofs the
ratification itself must pass (artifact coherence, governance derivation),
and proof **obligations** each landing inherits and must discharge before
its completion gate. Each landing additionally carries its own per-landing
assurance at its own risk class when it is authorized.

---

## Risk Classification

**Risk:** `high`

### Rationale

- Runner/review machinery: the contract being ratified governs the trust
  substrate every future run depends on. A wrong invariant here propagates
  into every landing.
- Public cross-package contracts: L2 creates the platform's runner domain
  contracts (`packages/contracts`, `packages/events`).
- Proposed-change-set binding and evidence semantics are defined here.
- Not `trust-critical` *as a change*: nothing executable, no authority, no
  credential, and no deployment ships in this change. The trust-critical
  work arrives in landings (L3, L4, L9 expected trust-critical), each under
  its own external authority and per-landing assurance.

## Critical Invariants

Each maps one-to-one to a requirement in the `runner-adoption` spec delta.

| ID      | Invariant                                                             | Class             |
| ------- | --------------------------------------------------------------------- | ----------------- |
| INV-001 | Trusted core has no `services/*`/`apps/*` imports (extraction-ready)  | compatibility     |
| INV-002 | No provider/framework name in a structural position; opaque `adapter` value only; no provider structure pre-U6 | trust             |
| INV-003 | Contract refusal and operational failure are distinct; refusal still writes evidence | behavior          |
| INV-004 | Run lifecycle is a typed state machine; illegal transitions rejected; indeterminate never success | behavior / trust  |
| INV-005 | Capability comes only from a versioned execution profile              | trust             |
| INV-006 | Evidence derives from trusted host observation; claims cross-checked  | trust             |
| INV-007 | Authority inputs captured once, digest-bound; base pinned; workspace ephemeral | trust / data      |
| INV-008 | A run cannot alter the material that governs or judges it             | trust             |
| INV-009 | Gates execute only from the exact-argv registry, network-none         | trust             |
| INV-010 | Security-relevant bounds refuse, never truncate                       | trust             |
| INV-011 | Evidence sealed last, independently re-derivable, fail-closed         | data / trust      |
| INV-012 | No platform contract encodes a container runtime                      | compatibility     |
| INV-013 | Upstream evidence cited only at the one-shot pin                      | review/governance |
| INV-014 | Gated landings wait for their ADRs (U6 → adapters, U4 → launcher); no partial work past a gate | review/governance |

## State-Space Model

Independent dimensions that materially affect adoption behavior:

| Dimension                  | Values                                            |
| -------------------------- | ------------------------------------------------- |
| Landing position           | pre-gate / post-U6 / post-U4                      |
| Gate ADR state             | not proposed / proposed / accepted                |
| External authority         | recorded / absent / ambiguous / narrower than plan |
| Mechanism verdict          | adopt / adapt / replace / defer                   |
| Contract consumer          | inert (nothing consumes) / consumed               |
| Artifact chain             | complete / incomplete                             |
| Run terminal state (L3+)   | declared success / declared failure / indeterminate |

Not a Cartesian product. The interactions that require proof:

- **gated landing × ADR not accepted** — must derive `NOT_AUTHORIZED`
  regardless of any recorded external authority.
- **authority narrower than landing scope** — must derive `NOT_AUTHORIZED`
  for every uncovered landing, named.
- **defer verdict × trigger fired** (upstream PR-5) — reopens nothing;
  requires a new change.
- **inert contract × first consumer arrives** — consuming landing must
  re-run the neutrality and coherence proofs, not assume them.
- **indeterminate terminal state × outcome classification** — must classify
  as failure (INV-004 × INV-003).

## Decision Tables

Authorization derivation (consumed by `tasks.md` and every landing):

| Observable state                                        | Proof available                       | Required outcome                     | Classification            |
| ------------------------------------------------------- | ------------------------------------- | ------------------------------------ | ------------------------- |
| Ungated landing, authority recorded and covering        | issue/task id + scope in tasks.md     | AUTHORIZED                           | —                         |
| Ungated landing, authority absent or ambiguous          | none, or unverifiable reference       | NOT_AUTHORIZED                       | contract refusal          |
| Gated landing, gate ADR not accepted                    | ADR status in decisions INDEX         | NOT_AUTHORIZED (regardless of authority) | contract refusal      |
| Gated landing, ADR accepted, authority recorded         | ADR status + issue id + scope         | AUTHORIZED                           | —                         |
| Authority narrower than the landing plan                | scope comparison                      | NOT_AUTHORIZED for uncovered landings, named | contract refusal  |
| Authorization state cannot be safely determined         | —                                     | NOT_AUTHORIZED                       | fail-closed               |

An undecidable state must not be silently mapped to success.

## Cross-Requirement Interactions

Mandatory at this risk class:

| Interaction                        | Risk                                                        | Required proof                                                  |
| ---------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| INV-002 × L7 (adapters exist)      | provider code leaks into a contract structural position     | PROP-004 scan + EX-002 re-run at L7/L8, not only at L2           |
| INV-009 × D8/L9 (profile egress)   | gates inherit profile-granted egress after enforcement lands | EX-005B at L9: real gate containers have no egress path even after profile egress activates |
| INV-005 × consent-to-spend (D6)    | consent mistaken for authority, or authority for consent    | ADV-001 plus a consent-without-profile refusal example at L4     |
| INV-007 × INV-008                  | mid-run source mutation vs sandbox judge-write — different attacks, both must fail | ADV-003 and ADV-005 kept distinct, both required at L3/L4 |
| INV-013 × defer triggers           | upstream churn silently reopening the classification        | manual review check: citations name only the pin (L1, each landing PR) |
| INV-004 × INV-003                  | a terminal state escaping outcome classification            | PROP-002 includes terminal-state mapping; ADV-011                |

## Proof Obligations

Allowed proof classes: deterministic example test; property test; mutation
test; hostile/adversarial fixture; integration test; schema/contract
validation; independent re-derivation; manual evidence when automation is
impossible.

| ID       | Proves            | Proof class                | Evidence (landing)                                    |
| -------- | ----------------- | -------------------------- | ----------------------------------------------------- |
| EX-001   | INV-001           | architecture guard         | dependency-direction check in merge gate (L3)         |
| EX-002   | INV-002           | schema/contract validation | contract conformance suite (L2; re-run L7, L8)        |
| EX-003   | INV-003           | deterministic examples     | refusal-writes-evidence + operational-failure tests (L3, L4) |
| EX-004   | INV-004           | deterministic examples     | declared-transition walk of the state machine (L4)    |
| EX-005A  | INV-009           | deterministic + integration (execution port) | exact argv equals registry; caller cannot widen; undeclared gate refused (L4) |
| EX-005B  | INV-009           | integration test           | real gate container has no egress; network-none survives profile egress grants (L9) |
| EX-008   | effective cancellation/timeout (runner-model contract; #19 exit criteria) | integration + adversarial | cancel/timeout → process tree dead → container gone → mounts gone → credential inaccessible → terminal evidence recorded (L9) |
| EX-006   | INV-011           | independent re-derivation  | verifier re-derives catalog from disk and policy (L3) |
| EX-007   | INV-012           | schema/contract validation | no runtime-identifying field in any contract (L2)     |
| SPIKE-01 | Copilot structured output      | manual + captured evidence | spike artifact set (L6)                  |
| SPIKE-02 | Copilot fail-closed tool allowlist | manual + captured evidence | spike artifact set (L6)              |
| SPIKE-03 | Copilot machine-readable transcript | manual + captured evidence | spike artifact set (L6)             |
| SPIKE-04 | Copilot cost/usage reporting   | manual + captured evidence | spike artifact set (L6)                  |
| SPIKE-05 | Copilot credential injection/isolation (no persistence in `$HOME`, caches, workspace, image layers, post-teardown) | manual + captured evidence | spike artifact set (L6) |
| PROP-001 | INV-002           | property test              | adding generated adapter ids changes no schema (L2)   |
| PROP-002 | INV-004           | property test              | every undeclared state pair rejected; terminal states map to outcome classes (L4) |
| PROP-003 | INV-010           | property test              | generated over-bound inputs always refused, never truncated (L3) |
| PROP-004 | INV-002           | property test              | provider-name scan over the contract corpus: zero structural hits (L2; re-run L7/L8) |
| PROP-005 | INV-011           | property test              | verifier agrees with catalog on generated artifact sets; flags any single mutation (L3) |
| MAN-001  | INV-013           | manual evidence            | citation audit against the pin (L1; every landing PR review) |
| MAN-002  | INV-014           | manual evidence            | authorization derivation table applied at each landing's gate (all) |

Do not claim that a test proves behavior outside what it actually
exercises: pre-gate proofs (L2–L4) run against the execution port and test
doubles, never a live container launch; container-level re-proof happens at
L9 under its own authority.

## Property Tests

| ID       | Property                                                                       |
| -------- | ------------------------------------------------------------------------------ |
| PROP-001 | For any generated adapter id, every platform contract validates unchanged      |
| PROP-002 | For any (state, transition) pair not declared, the transition is rejected and recorded; all terminal states map into declared outcome classes |
| PROP-003 | For any input exceeding its declared bound, the result is refusal with the bound named — never a truncated variant |
| PROP-004 | For the whole contract corpus, no provider/framework name occupies a field name, enum member, or constant |
| PROP-005 | For any generated artifact set, independent verification agrees with the sealed catalog, and any single-artifact mutation is flagged |

## Hostile Corpus

| ID      | Case                                                                    | Expected behavior                                        |
| ------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| ADV-001 | Run request naming no execution profile                                 | refused before any container starts                      |
| ADV-002 | Model claims a touched file absent from the workspace diff              | observation wins; disagreement recorded                  |
| ADV-003 | Source profile file mutated mid-run                                     | captured snapshot governs; digest identifies it          |
| ADV-004 | Workspace does not match the pinned base at creation                    | refused before model invocation                          |
| ADV-005 | Sandbox writes to a protected governing path                            | materialization refused entirely; violation recorded     |
| ADV-006 | Gate invocation with caller-widened argv                                | refused; executed argv is exactly the registry's         |
| ADV-007 | Task names a gate id absent from the registry                           | refused at eligibility, before spend                     |
| ADV-008 | Credential value present in composed argv                               | launch refused; a secret-bearing argv is unrecordable    |
| ADV-009 | Seed/packet exceeding its byte bound                                    | refused with bound and observed size; never truncated    |
| ADV-010 | Contract PR introducing a provider-named structural field               | conformance check rejects with the position named        |
| ADV-011 | Evidence finalization interrupted                                       | outcome classifies as failure, never success             |
| ADV-012 | Indeterminate terminal state presented as success                       | classification refuses; INDETERMINATE is a failure class |
| ADV-013 | Run killed or timed out mid-flight                                      | no privileged container, mount, or accessible credential survives; terminal evidence recorded (L9) |

## Mutation Targets

Critical guards whose removal or weakening must cause tests to fail once
their landing implements them:

| ID      | Guard                                             | Killing test        |
| ------- | ------------------------------------------------- | ------------------- |
| MUT-001 | Protected-context refusal on judge-material writes | ADV-005 fixture     |
| MUT-002 | Snapshot digest verification of authority inputs   | ADV-003 fixture     |
| MUT-003 | Independent verifier hash comparison               | PROP-005 / EX-006   |
| MUT-004 | Exact-argv registry enforcement (no widening, no substitution) | EX-005A / ADV-006 (L4) |
| MUT-007 | Gate network-none enforcement                      | EX-005B egress probe (L9) |
| MUT-005 | Indeterminate-is-failure classification            | ADV-012 / PROP-002  |
| MUT-006 | Refuse-not-truncate at declared bounds             | PROP-003 / ADV-009  |

## Traceability Plan

Landing-level here; per-task traceability lives in `tasks.md`.

| Requirement / invariant             | Landing | Proof                          | Deferred to        |
| ----------------------------------- | ------- | ------------------------------ | ------------------ |
| Extraction-ready core (INV-001)     | L3      | EX-001                         | —                  |
| Provider neutrality (INV-002)       | L2      | EX-002, PROP-001, PROP-004     | re-proof at L7/L8  |
| Outcome classification (INV-003)    | L3, L4  | EX-003                         | —                  |
| Lifecycle state machine (INV-004)   | L4      | EX-004, PROP-002, ADV-012      | —                  |
| Authority from profile (INV-005)    | L4      | ADV-001                        | container-level re-proof at L9 |
| Evidence outranks claims (INV-006)  | L3      | ADV-002                        | —                  |
| Captured-once inputs (INV-007)      | L3, L4  | ADV-003, ADV-004               | —                  |
| Judge protection (INV-008)          | L3      | ADV-005, MUT-001               | —                  |
| Exact-argv, network-none gates (INV-009) | L4 | EX-005A, ADV-006, ADV-007, MUT-004 | EX-005B, MUT-007 at L9 |
| Bounds refuse (INV-010)             | L3      | PROP-003, ADV-009              | —                  |
| Sealed evidence (INV-011)           | L3      | EX-006, PROP-005, ADV-011      | —                  |
| Runtime neutrality (INV-012)        | L2      | EX-007                         | —                  |
| One-shot pin (INV-013)              | L1      | MAN-001                        | every landing PR   |
| Gate honoring (INV-014)             | all     | MAN-002 + authorization table  | —                  |
| Copilot verifications               | L6      | SPIKE-01…05                    | shape L7           |

Every deferred re-proof names its landing. No generic "later" bucket.

## Landing Plan

The seam is `design.md` § Landing Seams: L1–L10 with two human ADR gates
(#11/U6 before L7; #9/U4 before L9). Summary of the assurance-relevant
properties:

- One PR per landing unless a landing's own issue splits it; no partial
  atomic seam merges.
- Verification nets land **with** the component they protect: L2 carries the
  contract conformance + neutrality properties; L3 carries the trusted-core
  proof net (EX-001/003/006, ADV-002…005, PROP-003/005); L4 carries the
  state-machine and gate-execution net (EX-004, EX-005A, PROP-002,
  ADV-006/007, MUT-004); L9 carries the runtime net (EX-005B, EX-008,
  ADV-013, MUT-007).
- Inert until activation: L2 contracts unconsumed until L3/L4; L5 images
  unreferenced until a profile pins them; L7 adapters unlaunchable until L9
  provides the launcher.
- Authority posture: every landing is inert or additive except **L9**, the
  single enforce flip.
- Serial trust argument: each landing is reviewable against only
  already-ratified material — contracts against this change; core against
  contracts; orchestration against core through typed interfaces with the
  boundary proven both directions; adapters against the accepted U6 SPI;
  enforcement against the accepted U4 placement.

## Review Plan

- **This seam:** one full review of the complete artifact set
  (proposal, spec delta, design, assurance, tasks) — the ratification
  review. Per the workflow rule, no repeated full reviews at
  known-incomplete construction checkpoints preceded it.
- **Per landing:** evidence review plus repository-aware semantic review of
  the landing PR, inheriting the ratified invariants rather than
  re-litigating architecture; contract-conformance obligations at L2, L7,
  L8, L10.
- **Deterministic gates, continuous:** scaffold validation (including the
  OpenSpec governance section), secret scan, Prettier, and workspace
  dependency-direction checks on every PR.
- **Reconciliation:** each landing's completion gate applies the
  authorization derivation table deterministically; a NOT_READY landing
  review is a truthful outcome, never a crash.

## Rollout and Rollback

- **This change:** `not_applicable` — documentation ratification; no
  runtime behavior, authority, or infrastructure changes.
- **Forward obligation:** L9 is the only enforcement flip. Its landing
  issue must define, before authorization: the advisory/shadow observation
  period for deny-by-default egress and ceilings, the measurements required
  before activation, the activation condition, and the rollback condition.
  L5/L7 ship inert artifacts whose "rollback" is non-reference; they carry
  no activation semantics.

## Assurance Completeness

- **Unresolved state-model questions:** none for the ratification itself.
  The run-lifecycle state list is D6's; its exact transition table is fixed
  (and property-tested) at L4.
- **Requirements lacking proof:** none — every invariant has a named proof
  obligation and landing above.
- **Scenarios intentionally deferred:** container-level proof at L9
  (EX-005B, EX-008, ADV-013 — a test double can prove argv selection,
  never that a real container has no network); neutrality re-proof at
  L7/L8; framework-neutral conformance at L10; citation-evidence adoption
  (upstream PR-5 trigger).
- **Design assumptions requiring human confirmation:** child-issue minting
  and #19/#27 revision (human-only, L1); the U6 and U4 ADRs themselves;
  gates-toolchain naming at L5; L10 authoring location once the U6 ADR
  fixes the SPI shape.

`tasks.md` must not begin implementation of unresolved trust-critical
behavior merely because this artifact exists.
