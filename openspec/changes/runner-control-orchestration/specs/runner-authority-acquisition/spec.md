# runner-authority-acquisition

## Purpose

The acquire-once half of INV-007, owned here as promised by the canonical
`runner-authority` spec: physically reading each authority source exactly
once per run, retaining the snapshot, independently re-acquiring for
verification, and asserting the pinned base identity at workspace creation.
Acquisition only — validation, digest binding, and every decision over the
acquired bytes are the trusted core's.

This document is normative. It defines WHAT must hold, authored as a
**delta** against the main spec. Implementation architecture belongs in
`design.md`; proof strategy belongs in `assurance.md`.

---

## ADDED Requirements

### Requirement: Each authority source is acquired exactly once per run

For each run, the orchestrator SHALL read each authority-bearing source
(the execution profile, the path policy, the gate registry) exactly once,
pass the acquired bytes to the trusted core's snapshot construction, and
retain the resulting snapshot for every downstream decision of that run. No
downstream step SHALL re-read a source: after the single acquisition, a
further read of the same source within the run SHALL be structurally
unavailable, not merely avoided.

#### Scenario: One read per source per run

- **GIVEN** a run acquiring its profile, policy, and registry
- **WHEN** the run proceeds through eligibility, execution, and evidence
  construction
- **THEN** each source was physically read exactly once
- **AND** every decision derived from the retained snapshots

#### Scenario: A second acquisition attempt is unexpressible

- **GIVEN** a run that has acquired a source
- **WHEN** any component attempts to acquire the same source again within
  the run
- **THEN** the attempt fails structurally with the source named
- **AND** no second read reaches the host

#### Scenario: Mid-run source mutation changes nothing

- **GIVEN** a run whose sources were acquired and snapshotted
- **WHEN** the underlying files change mid-run
- **THEN** every subsequent decision still derives from the retained
  snapshots, and the recorded digests identify the acquired bytes

### Requirement: Profile resolution yields a versioned profile or refuses

Run authority SHALL come only from a resolved, versioned execution profile:
resolution SHALL locate the profile by name and version, acquire its bytes
through the single-acquisition mechanism, and refuse — through the trusted
core's capture and eligibility decisions — when the profile is missing,
invalid, or mismatched. No run SHALL proceed on ad-hoc parameters, defaults,
or a profile substituted after resolution.

#### Scenario: A missing profile refuses before spend

- **GIVEN** a run request naming a profile that does not resolve
- **WHEN** resolution runs
- **THEN** the run refuses with the profile named, before any sandbox start
  or provider spend

### Requirement: Verification inputs are acquired independently and afresh

For independent verification, the orchestrator SHALL re-acquire the
authority sources and re-observe the artifact surface as NEW values,
distinct from those given to the producer, and SHALL pass them to the
trusted core's verifier. Producer inputs, producer snapshots, or the
producer's constructed bundle SHALL NOT be supplied as the verifier's
inputs.

#### Scenario: The verifier receives its own acquisition

- **GIVEN** a run whose evidence was constructed
- **WHEN** independent verification runs
- **THEN** the authority bytes and artifact observations supplied to the
  verifier come from a fresh acquisition, distinct from the producer's
  values
- **AND** the two acquisitions are separately recorded

### Requirement: The pinned base identity is asserted at workspace creation

Before any model or provider invocation, the orchestrator SHALL observe the
workspace base identity at creation and assert it against the pinned
identity using the trusted core's comparison; a mismatch SHALL refuse the
run. The assertion SHALL be sequenced at creation — not deferred to
verification time.

#### Scenario: A dirty base refuses before any model invocation

- **GIVEN** a workspace whose observed base identity differs from the
  pinned identity
- **WHEN** the workspace is created for a run
- **THEN** the run refuses with both identities named
- **AND** no model or provider invocation follows

---

## Failure Semantics

| Condition | Required outcome | Classification |
|---|---|---|
| Source unreadable at the single acquisition | operational failure carried into the core as a reported value | operational |
| Second acquisition attempted within a run | structural failure naming the source; no host read | change-attributable |
| Profile does not resolve | refusal before spend | change-attributable |
| Base identity mismatch at creation | refusal naming both identities; no model invocation | change-attributable |
| Verifier supplied producer values | unexpressible by construction; any bypass is a defect | change-attributable |

## Compatibility

Additive. The acquisition ports produce exactly the L3 value types
(`AuthorityBytes`, `WorkspaceObservation`, `ArtifactObservation`); the
trusted core is consumed as authored — no capture, validation, or decision
logic is duplicated here.

## Deferred Behavior

- **Credential acquisition or custody** — U2; profiles carry references
  only and this capability never resolves one.
- **In-container acquisition mechanics** — L9; here acquisition reads the
  host-side repository/profile store through the read-only source port.
