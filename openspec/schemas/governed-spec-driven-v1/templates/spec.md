# <Capability Name>

## Purpose

Describe the behavior governed by this capability.

New capabilities only: keep this section. Delete it when modifying an existing
capability.

This document is normative. It defines WHAT must hold, authored as a **delta**
against the main spec: every requirement appears under the delta operation
that applies to it, so validation, sync, and archive can fold it into
`openspec/specs/`.

Implementation architecture belongs in `design.md`.
Proof strategy belongs in `assurance.md`.

Remove any delta operation section you do not use.

---

## ADDED Requirements

### Requirement: <Requirement Name>

The system SHALL <observable required behavior>.

Clarify important semantics directly in the requirement when necessary.
Where failure classification is part of the behavior, state it in the
scenarios: distinguish candidate-attributable failure from operational
failure, and never collapse an undecidable state into success.

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

## MODIFIED Requirements

Include the FULL updated requirement content, not only the edited part.

### Requirement: <Existing Requirement Name>

The system SHALL <full updated observable behavior>.

#### Scenario: <Scenario name>

- **GIVEN** ...
- **WHEN** ...
- **THEN** ...

## REMOVED Requirements

### Requirement: <Removed Requirement Name>

- **Reason:** <why the requirement is removed>
- **Migration:** <how dependent behavior or consumers migrate>

## RENAMED Requirements

- FROM: `### Requirement: <old name>`
- TO: `### Requirement: <new name>`

---

## Failure Semantics

Use this section when failure classification is part of the behavior. It is
supporting context for the delta above; normative failure behavior must also
appear in requirement scenarios.

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
