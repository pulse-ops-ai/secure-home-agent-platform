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
name, enum member, or constant — of any platform runner contract. Provider
identity SHALL be recorded as data values only.

#### Scenario: Provider recorded as data

- **GIVEN** a run produced through any adapter
- **WHEN** its evidence is examined
- **THEN** the provider appears only as a recorded value in
  provider-identity fields, never as a field name, enum member, or constant

#### Scenario: A provider-named structural field is refused

- **GIVEN** a proposed contract with a provider name in a structural
  position
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
runner-control (U4), or freeze the adapter SPI (U6). A landing that cannot
proceed without one of them SHALL stop and report the dependency.

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
