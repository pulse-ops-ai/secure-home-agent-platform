# runner-adoption Specification

## Purpose
The adoption invariants for reimplementing the runner substrate: what every
adoption landing must hold, independent of which landing it is. These
requirements bind the reimplementation work minted from this change; the
substrate's own behavioral contracts (profiles, runs, events) get their own
capabilities in the landings that author them.

This document is normative. It defines WHAT must hold, as a delta against the
main spec. Implementation architecture belongs in `design.md`. Proof strategy
belongs in `assurance.md`.

---
## Requirements
### Requirement: Trusted core is extraction-ready

The reimplemented trusted core SHALL live in its own workspace package with
no imports from platform services or applications, and the dependency
direction SHALL be mechanically enforced.

#### Scenario: Dependency direction holds

- **GIVEN** the trusted-core package and the workspace dependency checks
- **WHEN** the checks run in the merge gate
- **THEN** no import from `services/*` or `apps/*` is found in the trusted
  core

#### Scenario: A platform import is refused

- **GIVEN** a change that adds a `services/*` import to the trusted core
- **WHEN** the merge gate runs
- **THEN** the dependency check fails and the change cannot merge

### Requirement: Contracts are provider-neutral in structural positions

No provider or framework name SHALL appear in a structural position — field
name, enum member, or constant — of any platform runner contract. A provider
or framework name SHALL appear only as an opaque data value (the profile's
`adapter` field and provider-identity evidence fields). No provider-specific
configurable structure SHALL be introduced into any platform contract before
the U6 adapter-SPI ADR; provider-specific flag mapping and transcript
parsing live behind the adapter boundary, never in the contract.

#### Scenario: Provider recorded as data

- **GIVEN** a run produced through any adapter
- **WHEN** its evidence is examined
- **THEN** the provider appears only as a recorded value in
  provider-identity fields, never as a field name, enum member, or constant

#### Scenario: Adding an adapter changes no schema

- **GIVEN** the execution-profile and run contracts as accepted
- **WHEN** a new provider or framework adapter is introduced
- **THEN** no platform contract schema requires a change — only a new
  opaque `adapter` value exists

#### Scenario: A provider-named structural field is refused

- **GIVEN** a proposed contract with a provider name in a structural
  position, or a provider-specific configuration block inlined ahead of the
  U6 ADR
- **WHEN** contract conformance checks run
- **THEN** the contract is rejected with the violating position named

### Requirement: Outcome classification is preserved

Every runner tool SHALL distinguish contract refusal from operational
failure as distinct terminal outcomes, and a contract refusal SHALL still
produce its refusal evidence.

#### Scenario: Contract refusal writes evidence

- **GIVEN** a launch request that violates a declared bound
- **WHEN** the tool refuses it
- **THEN** the refusal artifact is written with the violated bound named
- **AND** the outcome is classified as contract refusal, not operational
  failure

#### Scenario: Operational failure is not disguised

- **GIVEN** an environmental fault (missing runtime, unreadable input)
- **WHEN** the tool fails
- **THEN** the outcome is classified as operational failure
- **AND** no artifact claims a contract decision that was never made

### Requirement: The run lifecycle is an explicit state machine

Every run SHALL traverse a declared lifecycle of typed states with declared
terminal outcomes. A transition not declared from the current state SHALL be
rejected loudly and recorded, and an ambiguous or indeterminate terminal
state SHALL never classify as success.

#### Scenario: An illegal transition is rejected

- **GIVEN** a run in a declared lifecycle state
- **WHEN** a transition not declared from that state is attempted
- **THEN** the transition is rejected and recorded
- **AND** the run does not proceed silently

#### Scenario: Indeterminate is never success

- **GIVEN** a run whose terminal state cannot be established
- **WHEN** the outcome is classified
- **THEN** the run classifies as a failure outcome, never success

### Requirement: Authority comes only from an execution profile

The reimplemented substrate SHALL grant capability only from a versioned
execution profile. Nothing adopted from upstream may create authority, and a
run SHALL be launchable only from a profile.

#### Scenario: A run without a profile is refused

- **GIVEN** a run request that names no execution profile
- **WHEN** the substrate receives it
- **THEN** the request is refused before any container starts

#### Scenario: Adopted mechanisms grant nothing

- **GIVEN** any reimplemented upstream mechanism (policy file, gate
  registry, evidence pipeline)
- **WHEN** it is present in the repository
- **THEN** its presence grants no tool, mount, egress, or credential —
  only a reviewed profile does

### Requirement: Evidence outranks claims

Every run SHALL produce an evidence record whose authoritative change set
derives from trusted host observation. Model output SHALL be recorded as
claims and cross-checked, never substituted for observation.

#### Scenario: Claims disagree with observation

- **GIVEN** a run whose model output claims a set of touched files
- **WHEN** the trusted host derives the change set from the workspace
- **THEN** the observed change set is authoritative
- **AND** the disagreement is recorded in the run evidence

### Requirement: Authority inputs are captured once and digest-bound

Every authority input to a run — the execution profile, policies, and gate
registry — SHALL be read once into a captured snapshot whose digest is
recorded, and every downstream decision (validation, selection, launch
composition, enforcement) SHALL derive from the captured bytes. The source
identity a run operates on SHALL be pinned (base identity recorded), and the
writable workspace SHALL be an ephemeral derivation of that immutable base,
discarded after the run.

#### Scenario: Downstream decisions use the snapshot

- **GIVEN** a run whose profile was captured and digest-recorded at start
- **WHEN** the source profile file changes mid-run
- **THEN** every decision in that run still derives from the captured
  bytes, and the recorded digest identifies exactly what governed it

#### Scenario: Pristine base is asserted

- **GIVEN** a run whose workspace must derive from the pinned base identity
- **WHEN** the workspace does not match the pinned base at creation
- **THEN** the run is refused before any model invocation

### Requirement: A run cannot alter what judges it

The material that governs or judges a run — the pinned base source, the
captured profile and policies, the gate registry, the governing
instructions, the decision-bearing orchestration and interpreter code, and
the run's own evidence — SHALL be outside the sandbox's write reach. A write that touches any of it SHALL refuse materialization
with the violation recorded; the offending change is never silently
dropped.

#### Scenario: Governing context write refuses materialization

- **GIVEN** a run whose sandbox writes to a protected governing path
- **WHEN** the trusted host examines the workspace change set
- **THEN** materialization is refused entirely
- **AND** the violation is recorded in the run evidence

#### Scenario: Evidence is not sandbox-writable

- **GIVEN** a running sandbox and the run's evidence record
- **WHEN** the sandbox attempts to write where evidence is assembled
- **THEN** the evidence derivation is unaffected, because it reads only
  trusted host observation and captured inputs

#### Scenario: Modified orchestration never judges its own run

- **GIVEN** a writable workspace containing modified orchestration,
  policy-interpreter, gate-scheduler, or classification code
- **WHEN** that same run is evaluated
- **THEN** none of those modified bytes execute as decision-bearing logic
  for that run
- **AND** security-relevant orchestration executes only from trusted
  platform-controlled code outside the proposed change's write authority

### Requirement: Gates execute only from the exact-argv registry

Verification gates SHALL execute only as an exact executable plus argv array
declared in the repository-owned registry — never a shell string, never
arguments composed by the model or the caller — and gate execution SHALL
have no network access. A networked verifier is a separately reviewed
capability, never a registry exception; only the execution profile grants
egress, and gates hold no profile.

#### Scenario: Undeclared gate is refused before spend

- **GIVEN** a task naming a gate id absent from the registry
- **WHEN** eligibility is evaluated
- **THEN** the run is refused before any model invocation, with the
  undeclared id named

#### Scenario: Gate argv cannot be widened

- **GIVEN** a gate execution request carrying extra caller-supplied
  arguments
- **WHEN** the gate plan is built
- **THEN** the executed argv is exactly the registry's declaration, and the
  mismatch is refused, not merged

### Requirement: Gate outcomes come from a closed vocabulary

Every requested gate SHALL report exactly one terminal disposition per run,
drawn from a closed vocabulary: `PASS`, `FAIL`, `SKIP_OK` (nothing to run),
`SKIP_ENV` (environment unable to run). Truncated or incomplete gate output
SHALL classify as `FAIL` with the reason recorded. Environment inability
SHALL never classify as non-applicability or success, and a missing,
ambiguous, malformed, or duplicated disposition SHALL fail closed.

#### Scenario: Toolchain missing is never nothing-to-run

- **GIVEN** a requested gate whose toolchain is unavailable
- **WHEN** the gate is scheduled
- **THEN** its disposition is `SKIP_ENV`
- **AND** it never classifies as `SKIP_OK` or `PASS`

#### Scenario: Truncated output fails with the reason

- **GIVEN** a gate whose output was truncated or whose terminal evidence
  is incomplete
- **WHEN** its disposition is derived
- **THEN** the disposition is `FAIL` with the truncation or incompleteness
  recorded as the reason

#### Scenario: Duplicate gate identity fails closed

- **GIVEN** a run whose gate plan or results carry a duplicate gate
  identity or a second terminal disposition for the same gate
- **WHEN** dispositions are reconciled
- **THEN** the run fails closed with the duplication named

### Requirement: Security-relevant bounds refuse, never truncate

Where a declared bound protects a security property — input size, path
count, context bytes — an over-bound input SHALL be refused with the bound
named. Truncating to fit SHALL not occur.

#### Scenario: Over-bound input is refused

- **GIVEN** an input exceeding its declared byte bound
- **WHEN** the bound is enforced
- **THEN** the operation is refused with the bound and observed size
  recorded
- **AND** no truncated variant proceeds

### Requirement: Evidence is sealed, independently re-derivable, and fail-closed

Every run SHALL end with a sealed evidence record written after all other
artifacts, verifiable by an independent checker that re-derives expected
state from the same policy authority and the artifacts on disk. A failure to
finalize evidence SHALL never register as run success.

#### Scenario: Independent verification re-derives state

- **GIVEN** a completed run directory and the evidence policy authority
- **WHEN** the independent verifier runs
- **THEN** it re-derives the expected artifact set, re-computes hashes, and
  revalidates contracts from disk — agreeing with the sealed record or
  failing with the divergence named

#### Scenario: Evidence failure cannot become success

- **GIVEN** a run whose evidence finalization fails
- **WHEN** the run outcome is classified
- **THEN** the outcome is a failure classification, never success

### Requirement: Trust is preserved through the final consumer

Every security-relevant transformation between an authoritative source and
its final consumer SHALL either preserve a digest-bound identity through the
transformation or be independently re-verified against authoritative
evidence at the consumption boundary. Verification of an intermediate
representation SHALL NOT establish trust in a later mutable artifact.

#### Scenario: Final artifact changes after intermediate verification

- **GIVEN** an authoritative source whose intermediate representation has
  been verified
- **AND** a later artifact derived from that representation remains mutable
- **WHEN** that final artifact changes before consumption
- **THEN** the final consumer refuses it unless the consumed artifact is
  independently verified against the applicable authority
- **AND** the earlier successful verification does not authorize
  consumption

#### Scenario: Final consumer independently verifies

- **GIVEN** a security-relevant artifact derived from authoritative input
- **WHEN** the final consumer verifies the artifact's digest-bound identity
  or independently re-derives its required trust properties
- **THEN** consumption may proceed
- **AND** the verification evidence identifies the actual artifact consumed

### Requirement: Contracts are container-runtime neutral

No platform runner contract SHALL encode a container runtime. Runtime
identity SHALL be recorded as run evidence data.

#### Scenario: Runtime substitution needs no contract change

- **GIVEN** the substrate running under one container runtime
- **WHEN** the runtime is replaced (for example, a hardened isolation
  runtime)
- **THEN** no profile, run, event, or evidence contract requires a change
- **AND** the new runtime identity appears in run evidence as data

### Requirement: Adoption does not drift with the donor repository

Once ratified, the adoption requirements SHALL be governed exclusively by
this repository's accepted contracts. Changes in a donor repository SHALL
NOT silently alter, invalidate, expand, or narrow platform behavior, and
nothing in the platform SHALL execute, resolve, fetch, compare, or gate
against an external repository revision. No vendored upstream code or
schema exists to synchronize, and no periodic re-inventory occurs.

#### Scenario: The donor repository changes

- **GIVEN** the donor repository changes after this adoption is ratified
- **WHEN** platform work proceeds
- **THEN** the accepted runner-adoption contract remains unchanged
- **AND** no implementation changes merely because the donor changed

#### Scenario: A later donor lesson is incorporated

- **GIVEN** a later donor finding is considered useful
- **WHEN** the platform chooses to incorporate it
- **THEN** it enters through a new governed platform change
- **AND** the existing parent contract is not silently rewritten

### Requirement: Landings stay on the near side of U2, U4, and U6

No adoption landing SHALL select a workload-identity mechanism (U2), place
runner-control (U4), or freeze the adapter SPI (U6). Landings whose work
requires a resolved decision SHALL be explicitly gated on its accepted ADR:
the provider-adapter landing on the U6 ADR (#11), and the
launcher/enforcement landing on the U4 ADR (#9). A landing that cannot
proceed without one of them SHALL stop and report the dependency.

#### Scenario: A gated landing waits for its ADR

- **GIVEN** the Copilot adapter landing and no accepted U6 ADR
- **WHEN** authorization for that landing is evaluated
- **THEN** the landing is not authorized, and the gate is reported rather
  than worked around

#### Scenario: A landing hits an unresolved boundary

- **GIVEN** a landing whose work would require choosing a run-credential
  mechanism
- **WHEN** the boundary is reached
- **THEN** the landing stops, reports the U2 dependency, and the work is
  not partially started

---

