# <Capability Name>

## Purpose

Describe the behavior governed by this capability.

New capabilities only: keep this section. Delete it when modifying an existing
capability.

This document is normative for **observable behavior**. It defines WHAT must
hold as a delta against the main spec. Implementation architecture belongs in
`design.md`; proof strategy and authority allocation belong in `assurance.md`.

Exact mutable facts have one canonical authority. Requirements reference that
authority by stable ID and state the outcome it must enforce; they do not copy
enum members, state edges, classifier partitions, JSON pointers, bounds, file
inventories, mappings, or digest preimages.

Remove any delta operation section not used.

---

## ADDED Requirements

### Requirement: <Requirement Name>

**Requirement ID:** `REQ-<CAPABILITY>-001`

**Canonical authority references:** `AUTH-001 | none`

The system SHALL <observable required behavior>.

Clarify externally visible, trust-relevant, compatibility, refusal, and failure
semantics directly in this requirement or its scenarios.

#### Scenario: <Positive behavior>

- **GIVEN** <starting state>
- **AND** <additional state if needed>
- **WHEN** <action or event>
- **THEN** <required observable result>
- **AND** <additional observable result if needed>

#### Scenario: <Negative or refusal behavior>

- **GIVEN** <starting state>
- **WHEN** <invalid, unsafe, ambiguous, or unsupported condition occurs>
- **THEN** <required refusal or failure>
- **AND** <required observable classification or evidence>

#### Scenario: <Operational failure behavior>

- **GIVEN** <valid request or state>
- **WHEN** <dependency or environment fails>
- **THEN** <required fail-closed or operational result>
- **AND** the result MUST NOT be misclassified as successful or
  change-attributable unless that distinction is itself the requirement

## MODIFIED Requirements

Include the FULL updated requirement, not only the edited portion.

### Requirement: <Existing Requirement Name>

**Requirement ID:** `<existing stable requirement ID>`

**Canonical authority references:** `<AUTH IDs | none>`

The system SHALL <full updated observable behavior>.

#### Scenario: <Scenario name>

- **GIVEN** ...
- **WHEN** ...
- **THEN** ...

## REMOVED Requirements

### Requirement: <Removed Requirement Name>

**Requirement ID:** `<existing stable requirement ID>`

- **Reason:** <why the requirement is removed>
- **Migration:** <how dependent behavior or consumers migrate>

## RENAMED Requirements

- FROM: `### Requirement: <old name>`
- TO: `### Requirement: <new name>`
- Requirement ID remains: `<stable ID>`

---

## Failure Semantics

Use this section only to summarize behavior already made normative in the
requirements and scenarios above.

| Condition class | Requirement / scenario | Required observable outcome |
|---|---|---|
| change-attributable | <reference> | <outcome> |
| environmental / operational | <reference> | <outcome> |
| ambiguous / undecidable | <reference> | fail closed as <outcome> |

This table is a navigation aid, not a second classifier authority. Exact
classifier rows belong to the canonical authority named in `assurance.md`.

## Compatibility

State required backward-compatibility behavior.

If existing behavior must remain byte-identical or behaviorally unchanged,
state that explicitly and identify the scenario that proves it.

## Deferred Behavior

List behavior intentionally outside the current accepted landing but assigned
to a named future landing or task.

| Behavior | Due landing / task | Reason deferred | Current-scope boundary |
|---|---|---|---|
| <behavior> | <landing or task> | <reason> | <what current implementation must do> |

Do not use an unnamed “later” bucket and do not mark deferred behavior as
implemented or proven.

## Authority Reference Rules

- A requirement may reference one or more `AUTH-*` entries from
  `assurance.md`.
- The requirement owns the required observable result.
- The executable authority owns its exact representation or algorithm.
- A prose example is explicitly non-authoritative.
- A disagreement is a defect to stop and resolve; do not silently choose a
  convenient copy.
