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

### Requirement: SANDBOX_STARTED is entered by starting an execution session

The transition into `SANDBOX_STARTED` SHALL be earned by an execution
session being prepared and started through the execution-session
boundary. A run whose session cannot be prepared or cannot be started
SHALL NOT enter `SANDBOX_STARTED`, and SHALL invoke no adapter. Entering
the state on consent alone — with no execution operation having occurred
— SHALL NOT satisfy this.

Every run that opens a session SHALL close it, on every exit including
refusal, cancellation, timeout and failure. A run that opened none closes
nothing.

This requirement is about the SEAM, not about containers: the concrete
sandbox implementation is a later landing's, and an implementation that
starts nothing satisfies this requirement while starting nothing.

#### Scenario: A session that will not open reaches no sandbox state

- **GIVEN** a consented, eligible run whose execution session cannot be
  started
- **WHEN** the lifecycle advances
- **THEN** the run does not enter `SANDBOX_STARTED`
- **AND** no adapter is invoked

#### Scenario: The session is closed on the way out

- **GIVEN** a run that opened an execution session
- **WHEN** it reaches any terminal state
- **THEN** the session is closed

### Requirement: Cancellation reaches work already in flight

Cancellation and timeout SHALL be effective against an operation that is
already running, not only between operations. Every run SHALL carry a
deadline derived from its profile's declared wall clock; there is no
unbounded run.

The orchestrator SHALL pass a cancellation signal into the adapter
invocation and gate execution, AND SHALL NOT depend on those operations
honouring it: an operation that does not return SHALL NOT hold the run
open. On cancellation or deadline the execution session SHALL be
INTERRUPTED — abandoning the operation without interrupting the session
would leave whatever it started still running.

The orchestrator SHALL NOT satisfy the bound by abandoning a still-live
walk. Once cancellation or timeout interrupts an awaited port, the phase
continuation SHALL unwind at that call; it SHALL NOT resume and start a
later effect if the port eventually answers. The deadline SHALL cover
lease acquisition, the declared walk, governed terminal settlement, and
resource cleanup. Replacing the pre-profile acquisition ceiling with the
captured profile's wall clock SHALL establish one expiry before session
preparation; later session narrowing SHALL preserve elapsed profile time
rather than restart the budget.

The absolute expiry SHALL be checked synchronously before every guarded
call and whenever an explicit interruption boundary is consulted; timer
callback latency SHALL NOT authorize an effect after the declared wall
clock elapsed. Lease acquisition SHALL be invoked through that guard and
SHALL carry a claim-attempt identity plus the governed signal so an
aborted attempt cannot later become current ownership.

#### Scenario: A provider that never returns does not hold the run open

- **GIVEN** a run whose adapter invocation never returns
- **WHEN** the run's deadline elapses
- **THEN** the run terminates `TIMED_OUT`
- **AND** the execution session is interrupted and then closed

#### Scenario: Cancellation during an operation reaches it

- **GIVEN** a run cancelled while an operation is in flight
- **WHEN** the cancellation is raised
- **THEN** the in-flight operation observes the cancellation signal
- **AND** the run terminates `CANCELLED` with the session interrupted

#### Scenario: A delayed port cannot resume a concluded walk

- **GIVEN** a port call that remains in flight when cancellation or timeout
  fires
- **WHEN** the port later answers
- **THEN** no subsequent phase effect is started
- **AND** the already-returned conclusion is unchanged

#### Scenario: Ownership and cleanup are bounded

- **GIVEN** a lease claim or cleanup port that never returns
- **WHEN** its applicable bound elapses
- **THEN** `run()` still resolves
- **AND** the run starts no effect after the bound

#### Scenario: An expired claim attempt never becomes ownership

- **GIVEN** a lease claim whose acquisition budget has already elapsed,
  or whose attempt is aborted while outstanding
- **WHEN** ownership acquisition is evaluated
- **THEN** an already-expired claim is not started
- **AND** an outstanding aborted claim cannot later become current
  ownership

#### Scenario: Timer callback latency grants no extra execution

- **GIVEN** wall time has passed the run's absolute expiry
- **AND** the event-loop timer callback has not yet executed
- **WHEN** the next guarded port is reached
- **THEN** the port method is not invoked
- **AND** the run observes `timeout`

### Requirement: Cancellation and timeout are declared transitions with mandatory evidence

Cancellation and timeout SHALL be declared transitions into `CANCELLED` and
`TIMED_OUT` respectively, available from `PROFILE_RESOLVED` and every later
non-terminal state. Because entering `PROFILE_RESOLVED` requires the
completed production acquisition (`runner-authority-acquisition`), every
cancellable or timeout-able state can construct the full evidence-bundle
identity set: a cancelled or timed-out run SHALL seal a full L2 evidence
bundle recording the terminal cause. Facts already established before the
current phase completed — adapter operations, completed gate
dispositions, workspace observation, artifact observation — SHALL be
preserved incrementally for terminal evidence. Sets remain empty only
where the run truly produced no fact. This terminal accumulator SHALL be
distinct from the total `Observations` typestate required to enter
verification. The lifecycle SHALL never abandon a run in a non-terminal
state.

#### Scenario: Cancellation from RUNNING terminates with evidence

- **GIVEN** a run in `RUNNING`
- **WHEN** cancellation is requested
- **THEN** the run transitions to `CANCELLED`
- **AND** a full evidence bundle is sealed for the cancelled run with the
  cause recorded

#### Scenario: Cancellation from an early cancellable state still seals full evidence

- **GIVEN** a run in `PROFILE_RESOLVED`
- **WHEN** cancellation is requested
- **THEN** the run transitions to `CANCELLED`
- **AND** the sealed bundle carries the complete authority identities from
  the production acquisition, with empty observed, claimed, artifact, and
  gate-result sets

#### Scenario: Timeout is a declared transition, not a hang

- **GIVEN** a run whose declared wall-clock budget elapses
- **WHEN** the timeout fires
- **THEN** the run transitions to `TIMED_OUT` and evidence records the
  budget and the state it interrupted

#### Scenario: Cancellation after call events preserves operations

- **GIVEN** the adapter reported calls and their attempted/disposition
  events were emitted
- **AND** RUNNING has not yet completed workspace or artifact observation
- **WHEN** cancellation, timeout, or an operational fault interrupts the
  phase
- **THEN** the terminal bundle carries every operation already recorded
- **AND** verification still requires a total `Observations` value

### Requirement: Terminal settlement failure is explicit

An intended lifecycle terminal SHALL NOT be reported as a completed
terminal when its mandatory governed record did not become durable.
Terminal settlement remains finite. If the early-terminal record or full
evidence bundle cannot be written within that boundary, `run()` SHALL
return the distinct conclusion `settlement_failed`, carrying the state
actually reached, the intended terminal, and `produced: none`.
`settlement_failed` is an attempt conclusion, not a lifecycle terminal and
not success.

Lifecycle control failures SHALL retain their identity through journal
operations: `RunInterrupted` and settlement expiry SHALL propagate to
their terminal/settlement owner; only genuine journal faults remain
pending for retry. Interrupted settlement SHALL attempt session
interruption exactly once before record settlement. Generic recovery
finalization SHALL retain public cancellation and profile-timeout
precedence until publication.

#### Scenario: Mandatory evidence cannot be written

- **GIVEN** a cancellation or timeout at or after `PROFILE_RESOLVED`
- **AND** the terminal evidence sink never settles
- **WHEN** the finite settlement boundary expires
- **THEN** `run()` returns `settlement_failed`
- **AND** it names the intended `CANCELLED` or `TIMED_OUT` terminal
- **AND** it does not report a lifecycle terminal with `produced: none`

#### Scenario: Journal interruption keeps its lifecycle identity

- **GIVEN** a journal append is outstanding when the run deadline or
  settlement boundary fires
- **WHEN** the guard rejects the call
- **THEN** ordinary interruption remains `CANCELLED` or `TIMED_OUT`
- **AND** settlement expiry is reported as `settlement_failed`
- **AND** neither is relabelled `OPERATIONAL_FAILURE`

#### Scenario: Session stop is attempted once

- **GIVEN** a session is interrupted before terminal evidence settlement
- **WHEN** the governed record is assembled and committed
- **THEN** no second session interruption is attempted

#### Scenario: Recovery finalization remains interruptible

- **GIVEN** generic recovery is attempting to commit an
  `INDETERMINATE` terminal while the machine remains non-terminal
- **WHEN** caller cancellation or the profile deadline arrives before
  publication
- **THEN** that interruption wins under the same precedence as ordinary
  finalization

### Requirement: A run that terminates before authority completes produces an early-terminal refusal record

A run terminating in `REQUESTED` — a request naming no profile, a profile
that fails to resolve, or an acquisition fault before the production epoch
completes — cannot construct the full evidence bundle, because the
authority identities the bundle requires do not exist. Such a termination
SHALL produce a governed **early-terminal refusal record**: a durable
record carrying the run identity, the requested profile reference as data,
the terminal outcome with its structured detail, and timing. The record's
shape SHALL be a governed platform contract — introduced by a small L2
amendment sequenced before this landing's implementation — and SHALL NOT
be an evidence bundle with fabricated authority identities, which is
prohibited.

The record SHALL carry the **requester** — the principal named by the
run request that was accepted at `REQUESTED`. Requester attribution is
not partial execution authority and SHALL NOT be omitted on the grounds
that authority never completed. It SHALL be taken from the run-request
input and SHALL NOT be fabricated, inferred, or sourced from a captured
profile's agent principal, including when a profile was successfully
captured before the fault that caused the termination.

#### Scenario: A resolution failure leaves a refusal record, not a fabricated bundle

- **GIVEN** a run request whose profile does not resolve
- **WHEN** the run terminates `REFUSED` from `REQUESTED`
- **THEN** an early-terminal refusal record is written with the requested
  reference, the refusal detail, and timing
- **AND** the record's requester is the principal named by the run request
- **AND** no evidence bundle with invented authority identities exists

#### Scenario: A captured profile never supplies the requester

- **GIVEN** a run whose production epoch captured a profile before a later
  acquisition fault terminated it in `REQUESTED`
- **WHEN** the early-terminal refusal record is examined
- **THEN** its requester is the run request's principal, byte-for-byte
- **AND** the captured profile's agent principal appears nowhere in the
  record

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

### Requirement: Lifecycle moments the closed vocabulary represents emit events; every transition is recorded

The lifecycle SHALL emit run events at exactly the moments the closed L2
`run-event` vocabulary represents — `run.started` and `capability.granted`
(carrying the captured profile's grant verbatim) when the spend transition
commits, `adapter.started`/`adapter.completed` and the `call.*` events from
the adapter port's reports, and `run.terminated` carrying the shared
outcome at every terminal transition. The lifecycle SHALL NOT invent event
types or overload existing ones for other transitions. Separately, EVERY
declared transition — including `PROFILE_RESOLVED`, `ELIGIBLE`,
`VERIFYING`, and `EVIDENCE_SEALED` — SHALL be recorded in the run's
**transition record**, an orchestration-owned durable record distinct from
the L2 event stream, so the full walk is reconstructable without widening
the closed vocabulary. Provider-native event names SHALL ride only as
opaque data fields, never as event types.

#### Scenario: A dispossessed attempt ends without claiming a run terminal

- **GIVEN** an orchestration attempt that has lost ownership of its run
- **WHEN** it concludes
- **THEN** it reports that THIS ATTEMPT ended, naming the last state it
  observed, and produces no governed record
- **AND** it does not advance its machine to a terminal, because the
  logical run's terminal belongs to whoever holds the run now
- **AND** the requirement that an OWNED run never rests in a
  non-terminal state is unaffected: it binds the holder, not a stale
  attempt

#### Scenario: The grant event carries the profile's grant

- **GIVEN** a run whose profile was resolved and captured
- **WHEN** the spend transition commits
- **THEN** a `capability.granted` event is emitted whose grant is exactly
  the captured profile's capability group

#### Scenario: Non-event transitions are recorded, not forced into the vocabulary

- **GIVEN** a run advancing through `PROFILE_RESOLVED`, `ELIGIBLE`, and
  `VERIFYING`
- **WHEN** its emissions and records are examined
- **THEN** no run event was emitted with an invented or overloaded type
  for those transitions
- **AND** each transition appears in the run's transition record with its
  states and timing

---

## Failure Semantics

| Condition | Required outcome | Classification |
|---|---|---|
| Undeclared (state, transition) pair attempted | rejected, recorded; state unchanged | change-attributable |
| Run request without a profile, any consent | refusal before spend; early-terminal refusal record | change-attributable |
| Termination in `REQUESTED` (resolution/acquisition failure) | early-terminal refusal record; never a fabricated bundle | change-attributable or operational per cause |
| Eligible but unconsented spend attempt | held at `ELIGIBLE`, recorded | change-attributable |
| Cancellation or timeout at/after `PROFILE_RESOLVED` | declared terminal transition with a full sealed bundle (empty sets where nothing ran) | operational or change-attributable per cause |
| Mandatory terminal record cannot become durable within settlement | `settlement_failed`, intended terminal named, `produced: none`; never a lifecycle terminal | operational settlement failure |
| Terminal state unestablishable | `INDETERMINATE`, treated as failure | fail-closed |

## Compatibility

Additive. States and transitions are new orchestration vocabulary; terminal
classification reuses the L2 `RunOutcome` vocabulary and the L3
classification operations without modification.

## Deferred Behavior

- **Real sandbox start** — `SANDBOX_STARTED` is entered through the
  execution port; the concrete launcher is L9 (post-U4/#9).
- **Triggering** — what causes `REQUESTED` (human, schedule, automation)
  is a post-U4 operational concern on the inert shell (design D2),
  together with ADR-0006's automation model. **No separate activation
  landing exists**: any code-changing trigger or launch surface belongs to
  L4's shell or to a named existing landing (the launcher is L9).
- **Effective kill semantics** — that cancellation physically terminates a
  process tree is L9 (EX-008, ADV-013); this capability owns the lifecycle
  semantics and evidence.
