# Runner Adoption

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

## ADDED Requirements

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
instructions, and the run's own evidence — SHALL be outside the sandbox's
write reach. A write that touches any of it SHALL refuse materialization
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

### Requirement: Gates execute only from the exact-argv registry

Verification gates SHALL execute only as an exact executable plus argv array
declared in the repository-owned registry — never a shell string, never
arguments composed by the model or the caller — and gate execution SHALL
have no network access unless the registry entry explicitly declares it.

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

### Requirement: Contracts are container-runtime neutral

No platform runner contract SHALL encode a container runtime. Runtime
identity SHALL be recorded as run evidence data.

#### Scenario: Runtime substitution needs no contract change

- **GIVEN** the substrate running under one container runtime
- **WHEN** the runtime is replaced (for example, a hardened isolation
  runtime)
- **THEN** no profile, run, event, or evidence contract requires a change
- **AND** the new runtime identity appears in run evidence as data

### Requirement: Upstream evidence is cited at the one-shot pin

Adoption artifacts SHALL cite upstream evidence only at the pinned baseline
(`origin/dev` @ `941160c0`). No vendored upstream code or schema exists to
synchronize, and no periodic re-inventory occurs.

#### Scenario: Upstream moves

- **GIVEN** new commits on the upstream integration branch after the pin
- **WHEN** adoption landings proceed
- **THEN** no adoption artifact changes, and re-evaluation happens only
  through a new change gated on the named trigger (upstream PR-5
  activation)

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

## Failure Semantics

| Condition                                    | Required outcome                        | Classification    |
| -------------------------------------------- | --------------------------------------- | ----------------- |
| Declared bound violated (size, path, policy) | refuse; write refusal evidence          | contract refusal  |
| Environment fault (runtime, I/O, network)    | fail; no fabricated contract decision   | operational       |
| State cannot be safely determined            | refuse; never map silence to success    | fail-closed       |

Do not collapse an undecidable state into success.

## Compatibility

Greenfield: no existing platform runner behavior exists to preserve. No
compatibility with upstream artifact formats is maintained — upstream run
evidence stays upstream; platform evidence is produced only under the new
domain contracts.

## Deferred Behavior

- Citation-evidence adoption — re-evaluated only after upstream PR-5
  (activation), via a new change.
- Knowledge-selection wiring into profiles — gated by U7 and
  `knowledge-selection-model.md`; never adopted from upstream.
- Hardened container runtime (Kata-class isolation) — permitted by the
  runtime-neutrality requirement, decided by a future platform change.
- The household runner class — designed after the profile model lands
  (#37/#20/#36 remain consumers, not adoption work).
