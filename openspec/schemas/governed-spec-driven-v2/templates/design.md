# Design: <change-name>

> **Authority boundary:** this artifact owns architecture, design decisions,
> trust boundaries, rationale, repository feasibility, and landing seams. It
> does not own observable product requirements, proof completion, task state,
> or hand-maintained copies of executable contract data.

## Context

Summarize the architectural problem.

Reference `proposal.md` and `specs/**` rather than restating their content.

## Goals

Describe the technical properties this design must achieve.

## Non-Goals

Describe technical work deliberately excluded from this design.

## Current Architecture

Describe the relevant architecture before this change:

- component ownership;
- data flow;
- control flow;
- trust boundaries;
- authoritative contracts;
- persistence, concurrency, and recovery boundaries;
- relevant existing behavior.

Use diagrams where they improve understanding.

## Proposed Architecture

```text
<architecture diagram>
```

Explain:

- component responsibilities and ownership;
- trust and authority boundaries, and where authority changes;
- data and control flow;
- externally observable effects;
- architectural state transitions;
- failure and recovery boundaries.

## Trust and Authority Boundaries

| Boundary | Trusted side | Untrusted / less-trusted side | Authority crossing | Required guard |
|---|---|---|---|---|
| <boundary> | <component> | <component/input> | <data/effect> | <guard or refusal> |

State where credentials, external effects, identity, provenance, and
reconciliation authority live.

## Decisions

Use stable IDs so requirements, assurance, tasks, and review findings can
reference decisions.

### D1: <decision title>

- **Decision:** <what was chosen>
- **Requirement(s):** `<REQ IDs>`
- **Rationale:** <why this choice>
- **Alternatives considered:** <rejected options and why>
- **Trust consequence:** <authority or failure consequence>
- **Canonical authority consequence:** <fact families and intended authority
  types/locations>
- **Revisit trigger:** <condition that would require reopening this decision>

### D2: <decision title>

- **Decision:** ...
- **Requirement(s):** ...
- **Rationale:** ...
- **Alternatives considered:** ...
- **Trust consequence:** ...
- **Canonical authority consequence:** ...
- **Revisit trigger:** ...

## Repository Feasibility

Verify architecture assumptions against the current repository. Do not rely on
memory or review summaries.

| Assumption | Repository evidence | Status | Design consequence |
|---|---|---|---|
| <claimed capability or contract> | <path, symbol, schema, test, command output> | verified / mismatch / absent | <consequence> |

For a mismatch or absent prerequisite, either revise the design, create a named
contract-first task, or mark the affected scope blocked.

## Canonical Authority Strategy

`assurance.md#authority-allocation` owns the complete `AUTH-*` allocation.

This design explains why each authority type is appropriate:

- JSON Schema for data shape and closed enums;
- machine-readable policy for governed configuration;
- typed state/classifier table for closed transitions and partitions;
- trusted derivation function plus golden vector for canonical algorithms;
- executable fixture for cross-artifact and producer/consumer binding;
- prose invariant only where the property cannot be reduced to data or an
  algorithm.

Do not copy exact values into several planning artifacts. Any human-readable
table rendered from an executable authority must be labeled:

```text
NON-AUTHORITATIVE GENERATED MIRROR
Source: <AUTH-ID and path/symbol>
Drift check: <test or command>
```

## Architectural Decision Tables

Use a decision table here only when it closes an architectural choice that
cannot yet be allocated to an executable authority.

| Architectural state | Condition | Required architectural outcome | Decision / invariant |
|---|---|---|---|
| <state> | <condition> | <outcome> | <D-ID / INV-ID> |

Do not maintain implementation-grade state edges or response partitions here
after their canonical authority is allocated.

## Interfaces and Contracts

Define interfaces introduced or modified:

| Contract | Producer | Consumer | Trust boundary | Compatibility | Canonical authority |
|---|---|---|---|---|---|
| <contract> | <producer> | <consumer> | <boundary> | <obligation> | <planned AUTH-ID> |

State which contracts are public/frozen and which remain internal and
refactorable.

## Failure Classification Boundaries

Define where failure is classified and by what authority.

| Boundary | Classifier owner | Change-attributable cases | Operational cases | Ambiguous-state rule |
|---|---|---|---|---|
| <boundary> | <AUTH-ID or component> | <class> | <class> | fail closed as <result> |

An undecidable state must never silently become success.

## Shared vs Independent Logic

Identify:

- logic that may be shared;
- logic that must remain independently implemented;
- why independence is required;
- the guard or test preventing accidental collapse.

## Compatibility and Migration

State backward-compatibility obligations and migration strategy.

If existing behavior must remain unchanged, identify the proof that demonstrates
it. Do not infer compatibility from compilation alone.

## Security Implications

State:

- authority added, moved, or removed;
- new or changed attack surface;
- secrets or credentials involved;
- outward effects;
- fail-closed behavior;
- identity and provenance binding;
- rollback consequences.

No credential, deployment, device access, or external write is authorized by
this document.

## Landing Seams

| Landing | Atomic seam | Remains inert until | Proof landing with seam | Authority change |
|---|---|---|---|---|
| PR-1 | <components> | <activation> | <proof> | none / <authority> |

Identify behavior deliberately deferred to a named later landing.

## Gating Decisions

List unresolved questions that would change an invariant, authority allocation,
trust boundary, prerequisite, or external identity model.

| ID | Question | Owner | Required before | Status / resolution |
|---|---|---|---|---|
| GQ-001 | <question> | <owner> | <review or landing> | open / resolved |

A current-scope open gating decision makes the package ineligible for
`ARCHITECTURE_ACCEPTED`.

## Non-Gating Implementation Questions

Record questions that can safely be answered by TDD and implementation review
without changing the accepted architecture.

| ID | Question | Owning task | Why architecture remains unchanged |
|---|---|---|---|
| NQ-001 | <question> | <task> | <reason> |

Do not mark implementation tasks complete in this document.
