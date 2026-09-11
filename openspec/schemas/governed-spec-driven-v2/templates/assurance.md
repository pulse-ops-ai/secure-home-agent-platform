# Assurance Plan: <change-name>

> **Authority boundary:** this artifact owns risk classification, stable
> invariants, proof obligations, mutable-authority allocation, review posture,
> and readiness criteria. It does not create product requirements and does not
> own exact executable values that have been allocated elsewhere.

## Purpose

This artifact answers:

> Have we modeled enough of the behavior, state space, authority structure, and
> failure surface to implement and review this change safely?

It is derived from `specs/**` and `design.md`. A historical review finding is
input evidence, not a current requirement.

## Risk Classification

**Risk:** `low | medium | high | trust-critical`

### Rationale

Explain the classification using concrete characteristics:

- authentication or authorization;
- PII, encryption, or secrets;
- persistence or migrations;
- transaction, concurrency, retry, or recovery behavior;
- public contracts;
- runner, review, dispatch, or materialization machinery;
- proposed-change-set, identity, provenance, or evidence binding;
- reconciliation or readiness authority;
- infrastructure security boundaries;
- outward effects on external systems of record.

## Critical Invariants

Each invariant has a stable ID and a concise property. Do not embed an
implementation algorithm in the invariant.

| ID | Invariant | Class | Normative source | Primary proof |
|---|---|---|---|---|
| INV-001 | <property that must always hold> | behavior / trust / data / compatibility / governance | <REQ/D-ID> | <proof ID> |
| INV-002 | <property that must always hold> | ... | ... | ... |

Examples:

```text
Operational failure can never become a change-attributable finding.

Every required obligation receives exactly one terminal disposition.

An undecidable external outcome never classifies as safe retry.
```

## Authority Allocation

### Single-authority rule

Every mutable fact family MUST have exactly one hand-authored canonical
authority.

Mutable facts include:

- enum and state members;
- state-machine edges and release states;
- response-classifier partitions;
- retry, replay, reconciliation, and adoption eligibility;
- exact JSON pointers;
- field projections and bounds;
- artifact and schema inventories;
- profile-to-contract mappings;
- canonical serialization and digest preimages;
- producer/consumer source mappings;
- exact filename and lifecycle catalogs.

Other artifacts reference the `AUTH-*` ID. They may explain rationale or
observable outcomes, but they do not restate exact contents.

A rendered prose table is permitted only when generated or mechanically
drift-checked and labeled with its source. `reviews/**` is never an authority.

If two artifacts appear to own the same mutable fact, the package is not ready:
stop and resolve ownership rather than choosing one silently.

### Allocation table

| Authority ID | Mutable fact family | Canonical path / symbol | Authority type | Producer / owner | Consumer / verifier | Mirror and drift rule | Status |
|---|---|---|---|---|---|---|---|
| AUTH-001 | <fact family> | `<path#symbol>` | JSON Schema / policy / typed table / derivation / fixture / prose invariant | <owner> | <consumer> | generated / no mirror / <guard> | existing / planned / blocked |

Rules for `Status`:

- `existing`: the named authority exists and was repository-verified;
- `planned`: a contract-first task creates it before any dependent task;
- `blocked`: an owner, identity model, or architectural decision is unresolved.

`blocked` is incompatible with architecture acceptance for current-scope work.

## Artifact Ownership Model

| Artifact | Owns | Must not own |
|---|---|---|
| `proposal.md` | motivation, scope, impact, non-goals | exact behavior or mechanics |
| `specs/**` | observable normative behavior and scenarios | copied executable contract data |
| `design.md` | architecture, decisions, trust boundaries, rationale | task state or competing exact tables |
| `assurance.md` | invariants, proof, authority allocation, review exit | new product requirements |
| canonical executable authorities | exact mutable facts within their allocated family | unallocated product behavior |
| `tasks.md` | sequencing, paths, prerequisites, checks, task state | requirements, decisions, or copied authority contents |
| `preimplementation-review.md` | current acceptance decision for pinned bytes | new requirements or architecture |
| `reviews/**` | historical findings, dispositions, commits, lessons | current contract |

A cross-artifact conflict is a defect. Ownership decides which artifact must be
corrected; it is not permission to ignore the conflict.

## State-Space Model

Enumerate independent dimensions that materially affect behavior.

| Dimension | Values | Requirement / invariant | Why interaction matters |
|---|---|---|---|
| <dimension> | <value / value> | <REQ / INV> | <risk> |

Do not blindly generate the Cartesian product. Identify meaningful interactions
that require proof.

## Decision Coverage

Map architecture decisions to the state space and canonical authorities without
copying implementation tables.

| Decision / interaction | Required outcome | Authority | Proof |
|---|---|---|---|
| <D-ID / interaction> | <architectural outcome> | <AUTH-ID> | <proof ID> |

An undecidable state must not be silently mapped to success.

## Cross-Requirement Interactions

This section is mandatory for high-risk and trust-critical changes.

| Interaction | Risk | Invariants | Canonical authorities | Required proof |
|---|---|---|---|---|
| <REQ A × REQ B> | <what could go wrong> | <INV IDs> | <AUTH IDs> | <proof IDs> |

## Proof Obligations

Map every current-scope invariant and important scenario to evidence.

Allowed proof classes include:

- deterministic example test;
- property test;
- mutation test;
- hostile/adversarial fixture;
- integration test;
- schema/contract validation;
- independent re-derivation;
- manual evidence only when automation is impossible.

| Proof ID | Proves | Proof class | Evidence path / command | Producer | Independent verifier | Due landing |
|---|---|---|---|---|---|---|
| EX-001 | INV-001 / <scenario> | deterministic example | <test path> | <producer> | <verifier> | PR-1 |
| PROP-001 | <invariant> | property | <test path> | ... | ... | ... |

Do not claim a test proves behavior it does not exercise.

## Executable Contract Plan

For each planned canonical authority, define the contract-first work that makes
it real before dependent behavior is implemented.

| Contract ID | Authority | Contract-first task | Positive fixture / golden vector | Refusal / hostile fixture | Dependent tasks |
|---|---|---|---|---|---|
| CONTRACT-001 | AUTH-001 | <task> | <fixture> | <fixture> | <tasks> |

For high-risk and trust-critical changes:

- closed schemas and tables must reject unknown values;
- positive fixtures must prove the intended path is expressible;
- refusal fixtures must prove unsafe or ambiguous paths fail closed;
- producer and verifier must not merely trust the same unverified assertion;
- canonical algorithms require a versioned formula and golden vector.

## Property Tests

| ID | Property | Generator / domain | Killing counterexample |
|---|---|---|---|
| PROP-001 | <general property> | <input domain> | <what would falsify it> |

Mark `not_applicable` only with a reason.

## Hostile Corpus

Include malformed input, missing data, duplication, stale state, corruption,
boundary values, partial failure, environmental failure, races, crashes,
replay, wrong-target identity, and previously observed defects as relevant.

| ID | Case | Expected behavior | Invariant / authority | Due landing |
|---|---|---|---|---|
| ADV-001 | <adversarial case> | <required refusal/outcome> | <INV/AUTH> | PR-1 |

## Mutation Targets

| ID | Guard | Mutation | Killing test | Invariant |
|---|---|---|---|---|
| MUT-001 | <critical guard> | <remove/weaken/swap> | <test> | <INV> |

For low-risk changes this may be `not_applicable` with justification.

## Review-Finding Regression Promotion

A resolved material finding must become durable protection, not merely corrected
prose.

| Finding ID | Disposition | Canonical authority changed | Regression evidence | Resolving commit |
|---|---|---|---|---|
| <review/finding> | fixed / rejected / deferred | <AUTH-ID or none> | <fixture/test/schema guard> | <commit> |

When the finding exposes an implementation-grade defect, add or strengthen the
schema, typed table, fixture, mutation target, or golden vector that would catch
its recurrence.

## Traceability Plan

| Requirement / scenario | Invariant | Decision | Authority | Landing | Task | Proof | Deferred to |
|---|---|---|---|---|---|---|---|
| <REQ/scenario> | <INV> | <D> | <AUTH> | PR-1 | 1.1 | EX-001 | — |

A deferred scenario must name its due landing or task.

## Landing Plan

| Landing | Ships | Canonical authorities established | Proof shipped with it | Authority posture | Safe handoff |
|---|---|---|---|---|---|
| PR-1 | <scope> | <AUTH IDs> | <proof IDs> | inert / advisory / shadow / enforce | <why next landing may build on it> |

State:

- whether the change is one PR or a serial sequence;
- atomic components;
- proof that lands with each component;
- what remains inert until activation;
- which landing changes authority;
- why every intermediate trust-sensitive landing is safe.

## Review Plan

### Architecture review

The independent pre-implementation review evaluates:

- current-scope invariants and trust boundaries;
- closed gating decisions;
- authority allocation;
- repository feasibility;
- landing seams;
- whether implementation-grade details have an executable destination;
- whether tasks are bounded and dependency-correct.

It does not require implementation algorithms to be debugged through repeated
prose rounds.

### Implementation review

Each landing is reviewed against the accepted invariant set and canonical
authorities. A defect in an already allocated implementation contract normally
becomes a failing executable test; it reopens architecture only when closure
requires changing an invariant, authority allocation, trust boundary,
prerequisite, or external identity model.

### Historical review trail

`reviews/**` may preserve prior reports, findings, dispositions, and resolving
commits. It is append-only historical evidence and never required to understand
the current contract.

## Pre-Implementation Exit Gate

The package is ready for an independent acceptance decision only when:

- [ ] Scope and non-goals are explicit.
- [ ] Every current-scope requirement has positive and refusal/failure
      scenarios where relevant.
- [ ] Every current-scope invariant has a stable ID and proof obligation.
- [ ] Every gating decision is closed or deferred outside current scope.
- [ ] Every mutable fact family has exactly one `AUTH-*` owner.
- [ ] Every planned authority has a contract-first task before its consumers.
- [ ] Tasks reference authorities rather than restating their exact contents.
- [ ] Repository assumptions are verified or represented as explicit
      prerequisites.
- [ ] Every proof obligation has a due landing and evidence class.
- [ ] Every material prior finding has a regression-evidence disposition.
- [ ] No unresolved issue requires changing an invariant, authority allocation,
      trust boundary, prerequisite, or external identity model.

Architecture acceptance additionally requires one complete independent review
of the pinned package with:

- [ ] no unresolved P1;
- [ ] no new invariant required by that review;
- [ ] authority allocation confirmed complete;
- [ ] every remaining P2/P3 assigned to a task, proof obligation, or explicit
      deferred landing.

This is a stopping rule, not a claim that no implementation defect remains.

## Rollout and Rollback

For changes affecting authority, runtime behavior, security posture, or shared
infrastructure, define:

- shadow/advisory phase where applicable;
- measurements required before activation;
- activation condition;
- rollback condition;
- treatment of already-performed external effects.

Use `not_applicable` with justification for low-risk changes.

## Assurance Completeness

**Readiness:** `NOT_READY | READY_FOR_INDEPENDENT_REVIEW`

### Unresolved items

- State-model questions:
- Requirements lacking proof:
- Planned authorities lacking contract-first tasks:
- Scenarios intentionally deferred:
- Repository assumptions requiring confirmation:
- Human or operational decisions requiring confirmation:

A complete assurance artifact is necessary but not sufficient for
implementation. The independent review gate and external authorization recorded
in `tasks.md` are separate requirements.
