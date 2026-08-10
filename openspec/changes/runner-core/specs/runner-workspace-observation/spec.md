# runner-workspace-observation

## Purpose

Trusted derivation of the authoritative change set from host observation, and
its reconciliation against what a run's model output claims.

This capability owns the rule that **evidence outranks claims**. It does not
own how the workspace is created, mounted, or discarded.

This document is normative. It defines WHAT must hold, authored as a **delta**
against the main spec. Implementation architecture belongs in `design.md`;
proof strategy belongs in `assurance.md`.

---

## ADDED Requirements

### Requirement: The authoritative change set derives from host observation

The authoritative change set for a run SHALL be derived from trusted host
observation. Model or provider output SHALL be recorded as claims and SHALL
never be substituted for, merged into, or used to amend the observed set.

#### Scenario: Claims never enter the authoritative set

- **GIVEN** a claimed change set naming a path absent from the host observation
- **WHEN** the authoritative change set is derived
- **THEN** the authoritative set contains exactly the observed changes
- **AND** the claimed-only path does not appear in it

#### Scenario: Observation with no claims is still authoritative

- **GIVEN** a run producing no claimed change set
- **WHEN** the authoritative change set is derived
- **THEN** the observed changes are authoritative unchanged
- **AND** the absent claim set is recorded as empty, not as agreement

#### Scenario: Claims cannot reach the derivation interface

- **GIVEN** the interface that derives the authoritative change set
- **WHEN** it is examined
- **THEN** it accepts the host observation only
- **AND** claims enter solely through reconciliation, after derivation

### Requirement: Reconciliation records disagreement without resolving it in favor of claims

Reconciliation SHALL compare the observed and claimed change sets and record
agreement or the specific disagreements. A disagreement SHALL never alter the
authoritative set, and SHALL be recorded with the path and the nature of the
divergence.

#### Scenario: Claimed-but-unobserved is recorded

- **GIVEN** a claimed change absent from the observation
- **WHEN** reconciliation runs
- **THEN** agreement is false
- **AND** the disagreement names the path and records that it was claimed but
  not observed

#### Scenario: Observed-but-unclaimed is recorded

- **GIVEN** an observed change absent from the claims
- **WHEN** reconciliation runs
- **THEN** agreement is false
- **AND** the disagreement names the path and records that it was observed but
  not claimed

#### Scenario: Divergent change kind is a disagreement

- **GIVEN** a path present in both sets with a different change kind in each
- **WHEN** reconciliation runs
- **THEN** agreement is false
- **AND** the disagreement names the path and both kinds
- **AND** the observed kind remains authoritative

#### Scenario: Agreement is exact, not approximate

- **GIVEN** observed and claimed change sets that are equal as sets of
  path-and-kind pairs
- **WHEN** reconciliation runs
- **THEN** agreement is true
- **AND** the result is independent of the order in which either set was
  presented

### Requirement: Materialization eligibility is a distinct decision from agreement

Whether a change set may be materialized SHALL be decided from the path
decisions over the observed set, independently of whether observation and
claims agree. Disagreement SHALL NOT by itself make an otherwise eligible
change set ineligible, and agreement SHALL NOT by itself make an ineligible
change set eligible.

#### Scenario: Disagreement alone does not block materialization

- **GIVEN** an observed change set that satisfies every path decision
- **AND** a claimed set that disagrees with it
- **WHEN** materialization eligibility is decided
- **THEN** the change set is eligible
- **AND** the disagreement is recorded in the reconciliation result

#### Scenario: Agreement does not launder an ineligible path

- **GIVEN** an observed change set touching protected material
- **AND** a claimed set that agrees with it exactly
- **WHEN** materialization eligibility is decided
- **THEN** materialization is refused with the protected path named
- **AND** the agreement does not appear as justification

---

## Failure Semantics

| Condition | Required outcome | Classification |
|---|---|---|
| Claimed change absent from observation | recorded disagreement; observation authoritative | change-attributable |
| Observed change absent from claims | recorded disagreement; observation authoritative | change-attributable |
| Same path, divergent kind | recorded disagreement; observed kind authoritative | change-attributable |
| Claimed set malformed or unparseable | recorded as a claim-parse refusal; observation still authoritative | change-attributable |
| Host observer reports the workspace unreadable | operational failure; no authoritative set is produced | operational |

A missing observation never yields an empty authoritative set — it yields an
operational failure, because "nothing changed" and "we could not look" are
different facts.

## Compatibility

Additive. Reconciliation results populate `ChangeSets` as authored in
`packages/events`, whose `authoritative` field admits only `observed` — the
contract already makes the inverse unrepresentable, and this capability
supplies the behavior behind it.

## Deferred Behavior

- **Workspace lifecycle** — creation from a pinned base, ephemerality, and
  discard are L4; the pristine-base assertion at creation is L4's decision
  point using this capability's observation input.
- **Applying** an eligible change set — L4.
- **Provider transcript parsing** that produces the claimed set — L7; this
  capability accepts an already-parsed claim structure as untrusted data.
