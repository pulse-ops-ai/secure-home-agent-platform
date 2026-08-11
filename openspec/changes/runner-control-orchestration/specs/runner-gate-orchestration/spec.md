# runner-gate-orchestration

## Purpose

Gate scheduling and result handling at the orchestration layer (INV-009
scheduling side, INV-016): only declared gates, exactly the registry's
argv, one terminal disposition per identity, environment-skips never
normalized away. Execution itself happens behind the execution port; the
concrete runner of that port is L9.

This document is normative. It defines WHAT must hold, authored as a
**delta** against the main spec. Implementation architecture belongs in
`design.md`; proof strategy belongs in `assurance.md`.

---

## ADDED Requirements

### Requirement: Only declared gates are scheduled, with exactly the registry's argv

The orchestrator SHALL schedule a gate only when its identity is declared
in the captured gate registry, and SHALL submit to the execution port
exactly the registry's executable and argv for that identity. A caller
SHALL NOT be able to widen, substitute, append to, or reorder the executed
argv, and a requested identity absent from the captured registry SHALL
refuse at eligibility, before any spend.

#### Scenario: Executed argv equals the registry's exactly

- **GIVEN** a scheduled gate declared in the captured registry
- **WHEN** the execution plan is submitted to the execution port
- **THEN** the plan's executable and argv are exactly the registry entry's
- **AND** no caller-supplied argument appears in the plan

#### Scenario: Caller-widened argv is unexpressible

- **GIVEN** a caller attempting to add arguments to a gate invocation
- **WHEN** the scheduling interface is examined
- **THEN** no parameter accepts additional argv for a declared gate
- **AND** an attempted widening leaves the submitted plan unchanged or
  refuses

#### Scenario: An undeclared gate refuses before spend

- **GIVEN** a requested gate identity absent from the captured registry
- **WHEN** eligibility is decided
- **THEN** the run refuses naming the identity, before any sandbox start

### Requirement: Each gate identity receives exactly one terminal disposition

The orchestrator SHALL record, for each scheduled gate identity, exactly
one terminal disposition from the closed vocabulary
`PASS | FAIL | SKIP_OK | SKIP_ENV`. A duplicate disposition for one
identity SHALL fail closed with the duplication named; a gate whose result
never arrives SHALL be driven to a terminal disposition by the lifecycle
(timeout), never left undetermined.

#### Scenario: A second disposition for one gate fails closed

- **GIVEN** a gate identity with a recorded terminal disposition
- **WHEN** a further disposition arrives for the same identity
- **THEN** the run fails closed naming the duplication
- **AND** the first recorded disposition is not silently replaced

### Requirement: Environment skips and truncation keep their meaning

A gate whose required toolchain is unavailable SHALL be recorded
`SKIP_ENV`, and `SKIP_ENV` SHALL never be normalized to `SKIP_OK` or
`PASS` at any layer — scheduling, aggregation, or evidence. Truncated gate
output SHALL be recorded as `FAIL` with the explicit reason; no truncated
output SHALL yield a passing or ok-skipped disposition.

#### Scenario: Missing toolchain is SKIP_ENV, never SKIP_OK

- **GIVEN** a gate whose executable is unavailable in the execution
  environment
- **WHEN** its result is recorded
- **THEN** the disposition is `SKIP_ENV`
- **AND** no aggregation step reports it as `SKIP_OK` or `PASS`

#### Scenario: Truncated output is FAIL with the reason

- **GIVEN** a gate whose output exceeded the registry's declared maximum
- **WHEN** its result is recorded
- **THEN** the disposition is `FAIL` with truncation and the byte bound
  named in the reason

---

## Failure Semantics

| Condition | Required outcome | Classification |
|---|---|---|
| Requested gate identity undeclared | refusal at eligibility, before spend | change-attributable |
| Caller attempts argv widening | unexpressible or refused; plan never widened | change-attributable |
| Duplicate terminal disposition for one identity | fail closed, duplication named | change-attributable |
| Toolchain unavailable | `SKIP_ENV`, never normalized | change-attributable |
| Output truncated | `FAIL` with explicit reason | change-attributable |
| Execution port reports environmental fault | operational failure for that gate's run context | operational |

## Compatibility

Additive. Gate identities, registry shapes, and the disposition vocabulary
are the L2 contracts as authored; the declared-identity decision is the L3
eligibility decision, invoked — never reproduced.

## Deferred Behavior

- **Real gate execution** — the execution port's concrete process/container
  runner is L9 (EX-005B, MUT-007 there); this landing proves the plan
  boundary against deterministic port implementations.
- **Gate result capture inside the sandbox** — L9.
