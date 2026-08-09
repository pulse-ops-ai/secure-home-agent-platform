# <Capability Name>

## Purpose

Describe the behavior governed by this capability.

This document is normative.

It defines WHAT must hold.

Implementation architecture belongs in `design.md`.
Proof strategy belongs in `assurance.md`.

---

### Requirement: <Requirement Name>

The system SHALL <observable required behavior>.

Clarify important semantics directly in the requirement when necessary.

#### Scenario: <Positive behavior>

- **GIVEN** <starting state>
- **AND** <additional state if needed>
- **WHEN** <action or event>
- **THEN** <required observable result>
- **AND** <additional observable result if needed>

#### Scenario: <Negative or refusal behavior>

- **GIVEN** <starting state>
- **WHEN** <invalid, unsafe, or unsupported condition occurs>
- **THEN** <required refusal or failure>
- **AND** <required observable classification or evidence>

---

### Requirement: <Another Requirement>

The system SHALL <observable behavior>.

#### Scenario: <Scenario name>

- **GIVEN** ...
- **WHEN** ...
- **THEN** ...

---

## Failure Semantics

Use this section when failure classification is part of the behavior.

Distinguish where applicable:

| Condition | Required outcome | Classification |
|---|---|---|
| <candidate-controlled defect> | <result> | candidate |
| <environment unavailable> | <result> | operational |
| <state cannot be safely determined> | <result> | operational / fail-closed |

Do not collapse an undecidable state into success.

## Compatibility

State required backward-compatibility behavior.

If existing behavior must remain byte-identical or behaviorally unchanged,
state that explicitly.

## Deferred Behavior

List behavior that is intentionally outside the current accepted landing but
remains part of a later named landing.

Do not mark deferred behavior as implemented or proven.