# runner-lifecycle

## Purpose

The typed run-lifecycle state machine (constitution D6; INV-004): what a
run's phases ARE, which transitions exist, how consent gates spend, and how
every ending maps into the closed terminal vocabulary. Orchestration only —
every decision inside a transition is asked of `runner-core`.

This document is normative. It defines WHAT must hold, authored as a
**delta** against the main spec. Implementation architecture belongs in
`design.md`; proof strategy belongs in `assurance.md`.

---

## ADDED Requirements

### Requirement: A run is a typed walk through the declared state machine

Every run SHALL be represented as a typed state from the closed vocabulary
`REQUESTED, PROFILE_RESOLVED, ELIGIBLE, SANDBOX_STARTED, RUNNING, VERIFYING,
EVIDENCE_SEALED, COMPLETED` plus the terminal branches `REFUSED,
OPERATIONAL_FAILURE, CANCELLED, TIMED_OUT, INDETERMINATE`. Transitions SHALL
exist only where the machine declares them; an undeclared (state,
transition) pair SHALL be rejected loudly and recorded, never applied,
never ignored, and never coerced into a nearest legal state. A run in a
terminal state SHALL accept no further transition.

#### Scenario: A declared walk reaches COMPLETED

- **GIVEN** a run whose every step follows a declared transition
- **WHEN** the machine advances through resolution, eligibility, execution,
  verification, and sealing
- **THEN** each state entered is from the closed vocabulary
- **AND** the run terminates in a declared terminal state

#### Scenario: An undeclared transition is rejected loudly

- **GIVEN** a run in any state
- **WHEN** a transition the machine does not declare for that state is
  attempted
- **THEN** the transition is rejected and the rejection is recorded with the
  state and the attempted transition named
- **AND** the run's state is unchanged

#### Scenario: A terminal state is final

- **GIVEN** a run in any terminal state
- **WHEN** any further transition is attempted
- **THEN** it is rejected and recorded
- **AND** the terminal state is unchanged

### Requirement: Consent gates spend and is never authority

The transition that commits spend (leaving `ELIGIBLE`) SHALL require both a
recorded consent input and an eligibility decision from the trusted core.
Consent SHALL NOT substitute for any authority: a run request naming no
execution profile SHALL refuse before any spend regardless of consent, and
consent SHALL NOT widen, override, or replace any capability the resolved
profile grants.

#### Scenario: Consent without a profile refuses

- **GIVEN** a run request that names no execution profile
- **AND** an affirmative consent input
- **WHEN** the lifecycle advances
- **THEN** the run refuses before any sandbox start or provider spend
- **AND** the refusal names the missing profile, not the consent

#### Scenario: Eligibility without consent does not spend

- **GIVEN** a run that the trusted core decided eligible
- **AND** no recorded consent
- **WHEN** the spend transition is attempted
- **THEN** the machine does not leave `ELIGIBLE`
- **AND** the pending state is recorded, not silently dropped

### Requirement: Cancellation and timeout are declared transitions with mandatory evidence

Cancellation and timeout SHALL be declared transitions into `CANCELLED` and
`TIMED_OUT` respectively, available from every non-terminal state after
`REQUESTED`. A cancelled or timed-out run SHALL still produce sealed
evidence recording the terminal cause; the lifecycle SHALL never abandon a
run in a non-terminal state.

#### Scenario: Cancellation from RUNNING terminates with evidence

- **GIVEN** a run in `RUNNING`
- **WHEN** cancellation is requested
- **THEN** the run transitions to `CANCELLED`
- **AND** evidence is finalized for the cancelled run with the cause
  recorded

#### Scenario: Timeout is a declared transition, not a hang

- **GIVEN** a run whose declared wall-clock budget elapses
- **WHEN** the timeout fires
- **THEN** the run transitions to `TIMED_OUT` and evidence records the
  budget and the state it interrupted

### Requirement: Terminal classification is total and INDETERMINATE is never success

Every terminal state SHALL map into the closed L2 outcome vocabulary
through the trusted core's classification; a run whose terminal state
cannot be established SHALL classify `INDETERMINATE`, and `INDETERMINATE`
SHALL never be presented, recorded, or reported as success.

#### Scenario: Indeterminate presented as success refuses

- **GIVEN** a run whose outcome cannot be established from its inputs
- **WHEN** the terminal classification runs
- **THEN** the outcome is `INDETERMINATE`
- **AND** every success-reporting surface treats it as failure

### Requirement: Lifecycle transitions emit the closed run-event vocabulary

Each declared transition SHALL emit its corresponding events from the
closed L2 `run-event` vocabulary through the event sink port — including
`run.started`, `capability.granted` carrying the profile's grant verbatim,
and `run.terminated` carrying the shared outcome. Provider-native event
names SHALL ride only as opaque data fields, never as event types.

#### Scenario: The grant event carries the profile's grant

- **GIVEN** a run whose profile was resolved and captured
- **WHEN** the spend transition commits
- **THEN** a `capability.granted` event is emitted whose grant is exactly
  the captured profile's capability group

---

## Failure Semantics

| Condition | Required outcome | Classification |
|---|---|---|
| Undeclared (state, transition) pair attempted | rejected, recorded; state unchanged | change-attributable |
| Run request without a profile, any consent | refusal before spend | change-attributable |
| Eligible but unconsented spend attempt | held at `ELIGIBLE`, recorded | change-attributable |
| Cancellation or timeout | declared terminal transition with sealed evidence | operational or change-attributable per cause |
| Terminal state unestablishable | `INDETERMINATE`, treated as failure | fail-closed |

## Compatibility

Additive. States and transitions are new orchestration vocabulary; terminal
classification reuses the L2 `RunOutcome` vocabulary and the L3
classification operations without modification.

## Deferred Behavior

- **Real sandbox start** — `SANDBOX_STARTED` is entered through the
  execution port; the concrete launcher is L9 (post-U4/#9).
- **Triggering** — what causes `REQUESTED` (human, schedule, automation) is
  the post-U4 activation landing plus ADR-0006's automation model.
- **Effective kill semantics** — that cancellation physically terminates a
  process tree is L9 (EX-008, ADV-013); this capability owns the lifecycle
  semantics and evidence.
