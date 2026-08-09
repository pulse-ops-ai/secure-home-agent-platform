# Assurance Plan: <change-name>

## Purpose

This artifact defines how the accepted specification and design will be proven
before the change is considered complete.

It does not create new product requirements.

It answers:

> Have we modeled enough of the behavior, state space, and failure surface to
> implement and review this change safely?

---

## Risk Classification

**Risk:** `low | medium | high | trust-critical`

### Rationale

Explain the classification using concrete characteristics.

Consider:

- authorization/authentication;
- PII/encryption;
- persistence/migrations;
- transactions/concurrency;
- public contracts;
- review/runner machinery;
- materialization;
- proposed-change-set/evidence binding;
- reconciliation/readiness authority;
- infrastructure security boundaries.

## Critical Invariants

Each invariant must have a stable ID.

| ID | Invariant | Class |
|---|---|---|
| INV-001 | <must always hold> | behavior / trust / data / compatibility |
| INV-002 | <must always hold> | ... |

Examples of appropriate invariants:

```text
Operational failure can never become a change-attributable finding.

Every required obligation must receive one terminal disposition.

An undecidable state never classifies as success.
```

## State-Space Model

Enumerate the independent dimensions that materially affect behavior.

| Dimension | Values |
|---|---|
| <dimension> | <value> / <value> |
| <dimension> | <value> / <value> / <value> |

Do not blindly generate the Cartesian product. Identify the meaningful
interactions that require proof.

## Decision Tables

For behavior with multiple interacting dimensions, define explicit
state × condition × outcome tables.

| Observable state | Proof available | Required outcome | Classification |
|---|---|---|---|
| <state> | <proof> | <outcome> | change-attributable / operational |

An undecidable state must not be silently mapped to success.

## Cross-Requirement Interactions

Identify combinations of individually valid requirements that could interact
incorrectly.

This section is mandatory for high-risk and trust-critical changes.

| Interaction | Risk | Required proof |
|---|---|---|
| <requirement A> × <requirement B> | <what could go wrong> | <evidence> |

## Proof Obligations

Map every current-scope invariant and important scenario to the form of
evidence that will prove it.

Allowed proof classes: deterministic example test; property test; mutation
test; hostile/adversarial fixture; integration test; schema/contract
validation; independent re-derivation; manual evidence when automation is
impossible.

| ID | Proves | Proof class | Evidence |
|---|---|---|---|
| EX-001 | INV-001 / <scenario> | deterministic example | <test path> |
| PROP-001 | <invariant or scenario> | property | <test path> |

Do not claim that a test proves behavior outside what it actually exercises.

## Property Tests

Define general properties that should hold across generated combinations.

| ID | Property |
|---|---|
| PROP-001 | <property that holds across generated inputs> |

Mark this section `not_applicable` only with a reason.

## Hostile Corpus

List concrete adversarial cases required before implementation can be
considered complete.

Include cases arising from: malformed inputs; missing data; duplicated data;
stale state; corruption; boundary values; partial failure; environmental
failure; previously observed defects.

| ID | Case | Expected behavior |
|---|---|---|
| ADV-001 | <adversarial case> | <required outcome> |

## Mutation Targets

Identify critical guards whose removal or weakening must cause tests to fail.

| ID | Guard | Killing test |
|---|---|---|
| MUT-001 | <critical guard> | <test that must fail if the guard weakens> |

For low-risk changes this may be `not_applicable` with justification.

## Traceability Plan

Map accepted requirements and scenarios to their landing, owning task, and
expected proof.

| Requirement / Scenario | Landing | Task | Proof | Deferred to |
|---|---|---|---|---|
| <requirement or scenario> | PR-1 | 1.1 | EX-001 | — |

A deferred scenario must have a named due landing or task. Do not use a
generic "later" bucket.

## Landing Plan

Define the implementation landing seam.

State:

- whether the change is one PR or a serial sequence;
- which components must land atomically;
- which verification net must land with each component;
- what remains inert until activation;
- which PR, if any, changes authority.

For serial trust-sensitive changes, explain why each landing is safe for the
next landing to build and be reviewed against.

## Review Plan

Define which review surfaces are required at the complete seam.

Distinguish:

- evidence review;
- repository-aware semantic review;
- contract-conformance obligations;
- engineering/architecture review when required;
- deterministic reconciliation.

Do not require repeated full reviews at known-incomplete construction
checkpoints unless explicitly justified.

## Rollout and Rollback

For changes that alter authority, runtime behavior, security posture, or
shared infrastructure, define:

- shadow/advisory phase when applicable;
- measurements required before activation;
- activation condition;
- rollback condition.

Use `not_applicable` with justification for low-risk changes.

## Assurance Completeness

Conclude with:

- unresolved state-model questions;
- requirements lacking proof;
- scenarios intentionally deferred;
- design assumptions requiring human confirmation.

tasks.md must not begin implementation of unresolved trust-critical behavior
merely because this artifact exists.