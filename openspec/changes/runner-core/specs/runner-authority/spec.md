# runner-authority

## Purpose

Trusted capture of authority-bearing inputs and the eligibility decisions taken
from them, before any model or provider spend.

This capability owns *what a run is allowed to be evaluated from*. It does not
own orchestration, ordering, or execution.

This document is normative. It defines WHAT must hold, authored as a **delta**
against the main spec. Implementation architecture belongs in `design.md`;
proof strategy belongs in `assurance.md`.

---

## ADDED Requirements

### Requirement: Captured authority is an immutable, digest-bound snapshot

The trusted core SHALL construct, from authority bytes supplied to it as an
immutable value, a captured snapshot that records the source identity, the
digest of the supplied bytes, and the contract-validation result of those
bytes. Every subsequent decision SHALL derive from the captured snapshot. No
decision interface SHALL accept a mutable source reference — a path, handle,
reader, port, or callback — in place of a snapshot.

The core SHALL NOT acquire authority bytes on its own initiative: reading
each authority source **exactly once**, retaining the resulting snapshot for
the run, and never re-reading a source for a downstream decision are
orchestration obligations owned by L4, which passes the acquired bytes into
this capability as values.

Authority-bearing inputs are the execution profile, the path policy, the gate
registry, and any further authority data a later landing declares.

#### Scenario: Downstream decisions use the snapshot

- **GIVEN** an authority input captured and digest-recorded at run start
- **WHEN** the underlying source changes afterwards
- **THEN** every subsequent decision still derives from the captured bytes
- **AND** the recorded digest identifies exactly the bytes that governed the run

#### Scenario: A decision cannot re-read a source

- **GIVEN** any trusted decision exposed by the core
- **WHEN** its interface is examined
- **THEN** it accepts captured snapshots and observation values only
- **AND** no parameter names a path, handle, reader, port, or callback from
  which the decision could obtain authority bytes itself

#### Scenario: Capture failure is a refusal, not an empty snapshot

- **GIVEN** supplied authority bytes that fail contract validation, or an
  acquisition failure reported by the orchestrator in place of bytes
- **WHEN** snapshot construction is attempted
- **THEN** the result is a refusal naming the source and the validation
  failure, or an operational failure for the reported acquisition fault
- **AND** no snapshot is produced that a later decision could treat as
  authority

### Requirement: Captured authority carries a validated contract identity

A capture SHALL succeed only when the captured bytes validate against the
declared contract for that source, and the capture result SHALL record which
contract identity and version validated. Bytes that validate against no
declared contract, or against a different contract than the source declares,
SHALL produce a refusal.

#### Scenario: Contract mismatch refuses

- **GIVEN** captured bytes whose `contract_id` does not match the source's
  declared contract
- **WHEN** capture validates them
- **THEN** the capture refuses, naming the declared and observed identities
- **AND** no decision proceeds from those bytes

#### Scenario: Valid capture records its identity

- **GIVEN** captured bytes that validate against their declared contract
- **WHEN** capture completes
- **THEN** the snapshot records the contract identity, the contract version,
  and the digest of the captured bytes

### Requirement: Eligibility refuses rather than defaults

Before any model or provider invocation, the trusted core SHALL decide
eligibility from the captured snapshots alone, and SHALL refuse when any
required authority is missing, invalid, inconsistent, or undeclared. No absent
authority SHALL be treated as permissive, and no eligibility result SHALL be
derivable from an incomplete snapshot set.

At minimum the core SHALL refuse for: a missing execution profile; an invalid
execution profile; a missing required policy; malformed authority input; a
gate identity absent from the captured registry; captured authority that is
internally inconsistent; and a security-relevant input exceeding its declared
bound.

#### Scenario: Missing profile refuses before spend

- **GIVEN** an eligibility request whose snapshot set contains no execution
  profile
- **WHEN** eligibility is decided
- **THEN** the decision is a refusal naming the missing profile
- **AND** the refusal is reached before any model or provider invocation is
  proposed

#### Scenario: Undeclared gate refuses before spend

- **GIVEN** a requested gate identity absent from the captured gate registry
- **WHEN** eligibility is decided
- **THEN** the decision is a refusal naming the undeclared identity
- **AND** no partial eligibility is reported for the remaining gates

#### Scenario: Missing authority never becomes permission

- **GIVEN** any required authority input absent from the snapshot set
- **WHEN** eligibility is decided
- **THEN** the decision is a refusal
- **AND** no code path yields an eligible decision from an incomplete snapshot
  set

#### Scenario: An undecidable eligibility state refuses

- **GIVEN** an eligibility input set whose validity cannot be established
- **WHEN** eligibility is decided
- **THEN** the decision is a refusal recording that the state was undecidable
- **AND** the outcome is never eligible

### Requirement: Refusal is a recordable value, not an exception

Every trusted decision SHALL return a typed result that is either a proceed
outcome or a refusal, and every refusal SHALL carry a stable machine-readable
cause together with the specific violated element — the missing input, the
undeclared identity, the offending path, or the violated bound with its
observed value. A refusal SHALL be classified as contract refusal, distinct
from operational failure.

#### Scenario: Refusal carries its cause

- **GIVEN** any refusal produced by a trusted decision
- **WHEN** the refusal is examined
- **THEN** it carries a stable cause identifier and the specific violated
  element
- **AND** the information is sufficient to write refusal evidence without
  re-deriving the decision

#### Scenario: Operational failure is not a contract refusal

- **GIVEN** an environmental fault reported by the orchestrator's acquisition
  or observation — an unreadable source or an unavailable workspace —
  supplied to the core as a reported-failure value
- **WHEN** the core classifies the outcome
- **THEN** the classification is operational failure
- **AND** no result claims a contract decision that was never made

---

## Failure Semantics

| Condition | Required outcome | Classification |
|---|---|---|
| Required authority absent from the snapshot set | refusal naming the input | change-attributable |
| Captured bytes fail contract validation | refusal naming contract and position | change-attributable |
| Requested gate identity absent from the captured registry | refusal naming the identity | change-attributable |
| Security-relevant input over its declared bound | refusal naming bound and observed value | change-attributable |
| Orchestrator reports an authority source unreadable | operational failure naming the source | operational |
| Eligibility cannot be established from the inputs | refusal recording undecidability | fail-closed |

An undecidable state is never mapped to eligible.

## Compatibility

This capability is additive. It consumes `packages/contracts` and
`packages/events` as authored and requires no change to either. The package is
inert until L4 consumes it: no existing behavior changes.

## Deferred Behavior

- **Source acquisition** — reading each authority source **exactly once**,
  retaining the resulting snapshot for the run, never re-reading a source for
  a downstream decision, and independently re-acquiring inputs for
  verification are L4 orchestration obligations. L3 proves snapshot
  construction, digest binding, and snapshot-only decisions; it cannot prove
  an acquisition count and does not claim to.
- **Consent to spend** — distinct from eligibility, and owned by L4.
- **Gate scheduling and execution** — L4; L3 decides only that a requested gate
  identity is declared.
- **Credential acquisition or custody** — U2; the core reads credential
  *references* as data and never resolves one.
