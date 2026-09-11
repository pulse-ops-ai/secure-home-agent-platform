# Change Proposal: <change-name>

> **Authority boundary:** this artifact owns motivation, scope, impact, and
> non-goals. It does not own exact behavior, architectural mechanics, proof
> strategy, task state, or implementation authorization.

## Why

Describe the observed problem, opportunity, or requirement that motivates this
change.

State facts rather than implementation conclusions. Include evidence where
available:

- issue, incident, or customer report;
- existing code behavior;
- production or test evidence;
- prior decision;
- measured failure, cost, or risk.

## Problem

Describe the current behavior and why it is insufficient.

Answer:

- What happens today?
- What should be possible instead?
- Who or what is affected?
- What is the consequence of leaving the current behavior unchanged?

## Proposed Capability

Describe the capability that will exist after this change.

Keep this implementation-neutral. Observable behavior belongs in `specs/**`;
implementation mechanics belong in `design.md`.

## Scope

### In scope

Describe the behavior or capability this change owns.

### Out of scope

Describe adjacent work this change deliberately does not own.

Do not hide required work in this section. Work required by a later landing must
name that landing or task.

## Affected Areas

Identify the expected systems, packages, modules, contracts, schemas, data
stores, integrations, or operational surfaces affected by the change.

This is impact discovery, not an implementation file inventory.

## Governance

Name governing ADRs from the
[`docs/decisions/INDEX.md`](../../docs/decisions/INDEX.md) “which ADRs apply”
table:

- ADR-XXXX — <why it governs this change>

Declare unresolved-decision dependencies:

- **Depends on unresolved decisions:** `none | <stable decision IDs>`
- **Effect:** `<not blocked | blocked scope and reason>`

Work depending on an unresolved governing decision is blocked, not partially
started.

This change proposes **no ADR status change**. Amending or reversing an accepted
ADR requires a superseding ADR through its own human review.

## Trust / Security / Data Considerations

State whether the change affects:

- authentication or authorization;
- PII, encryption, or secrets;
- persistence or migrations;
- transaction, concurrency, retry, or recovery behavior;
- public package, API, event, or file contracts;
- runner, review, dispatch, or materialization machinery;
- proposed-change-set, identity, provenance, or evidence binding;
- reconciliation or readiness authority;
- deployment, network, or production isolation;
- an outward effect on an external system of record.

If none apply, state `Not applicable` and explain why.

### Preliminary risk signal

`low | medium | high | trust-critical | requires assurance classification`

This is an initial signal only. `assurance.md` owns the final risk
classification.

## Existing Evidence

Record evidence supporting the proposal using stable repository references
where possible.

| Evidence | Location / identity | What it establishes | Confidence / limitation |
|---|---|---|---|
| <evidence> | <path, symbol, test, issue, or commit> | <fact established> | <limit> |

Do not treat an unverified issue, review summary, or agent statement as
implementation evidence.

## Dependencies

Distinguish:

- already implemented dependencies;
- accepted but not implemented dependencies;
- external or operational dependencies.

| Dependency | State | Why needed | Gating? | Evidence / owner |
|---|---|---|---|---|
| <dependency> | implemented / accepted / external | <reason> | yes / no | <reference> |

## Success

State the observable product or engineering outcome that makes this proposal
successful.

Do not use “tests pass” as the product-level success definition.

## Non-Goals

Explicitly state what this change must not build, change, authorize, or infer.

## Decision Questions

### Gating decisions

List questions whose answer could change an invariant, trust boundary,
authority allocation, prerequisite, or external identity model.

| ID | Question | Owner | Required by | Status |
|---|---|---|---|---|
| GQ-001 | <question> | <owner> | <artifact or landing> | open / closed |

Every current-scope gating decision must be closed before the independent
pre-implementation review can accept the architecture.

### Non-gating questions

List questions safe to answer during implementation without changing accepted
behavior or architecture.

| ID | Question | Owning task / landing | Why non-gating |
|---|---|---|---|
| NQ-001 | <question> | <task> | <reason> |

## Exactness Excluded from This Artifact

Do not place hand-maintained copies of these here:

- enum or state members;
- state-machine edges;
- response-classifier rows;
- JSON pointers;
- exact field projections or bounds;
- artifact or schema inventories;
- digest preimages;
- profile-to-schema mappings;
- retry or reconciliation eligibility tables.

The specification states observable outcomes. `assurance.md` allocates each
mutable fact family to one canonical authority. `design.md` explains the
architectural rationale.
