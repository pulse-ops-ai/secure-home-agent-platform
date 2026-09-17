# runner-authority-acquisition

## Purpose

The acquire-once half of INV-007, owned here as promised by the canonical
`runner-authority` spec: physically reading each authority source at most
once per epoch — the production epoch for every run, the verification
epoch only for runs that reach independent verification — retaining the
snapshots, and asserting the pinned base identity at workspace creation.
Acquisition only — validation, digest binding, and every decision over the
acquired bytes are the trusted core's.

This document is normative. It defines WHAT must hold, authored as a
**delta** against the main spec. Implementation architecture belongs in
`design.md`; proof strategy belongs in `assurance.md`.

---

## ADDED Requirements

### Requirement: Authority acquisition happens in declared epochs, at most once per source in each

Acquisition SHALL be organized into two declared epoch roles, each with
its own single-use acquisition set:

- the **production epoch** exists for every run: each authority-bearing
  source (the execution profile, the path policy, the gate registry) is
  read at most once, before the run enters `PROFILE_RESOLVED`; the
  resulting snapshots are retained for every decision of the run's
  production path. A production epoch that cannot complete — a source
  missing, unresolvable, or faulting — terminates the run fail-closed
  from `REQUESTED` (`runner-lifecycle`'s early-terminal requirement); it
  is never silently retried or partially trusted;
- the **verification epoch** exists only for a run that reaches
  independent verification: each source is read at most once more, into a
  distinct verification acquisition set consumed only by the verifier.

Within an epoch, a further read of an already-acquired source SHALL be
structurally unavailable, not merely avoided. Across the whole run
lifecycle a source is therefore read **at most twice** — at most once per
epoch — and a run that reaches verification successfully has read each
required source exactly once in each epoch. Neither epoch's values are
expressible as the other's inputs: no production step may reach the
verification set, and no verification step may consume production values.

#### Scenario: A run reaching verification reads each source once per epoch

- **GIVEN** a run acquiring its profile, policy, and registry
- **WHEN** the run proceeds through eligibility, execution, evidence
  construction, and independent verification
- **THEN** each required source was physically read exactly once in the
  production epoch and exactly once in the verification epoch — at most
  twice over the run
- **AND** every production decision derived from the production snapshots
  and the verifier consumed only the verification acquisition

#### Scenario: A run terminating early reads less, never more

- **GIVEN** a run whose production acquisition fails, or that terminates
  before verification
- **WHEN** its acquisition record is examined
- **THEN** no source shows more than one read in any epoch
- **AND** an incomplete production epoch ended the run fail-closed from
  `REQUESTED`, with no partial trust and no silent retry

#### Scenario: A second acquisition attempt within an epoch is unexpressible

- **GIVEN** a run whose production epoch has acquired a source
- **WHEN** any production component attempts to acquire the same source
  again
- **THEN** the attempt fails structurally with the source and epoch named
- **AND** no second read reaches the host from that epoch

#### Scenario: Production completes before PROFILE_RESOLVED

- **GIVEN** a run in `REQUESTED`
- **WHEN** it advances to `PROFILE_RESOLVED`
- **THEN** the production epoch's acquisition of profile, policy, and
  registry has completed and captured
- **AND** every state from `PROFILE_RESOLVED` onward can therefore
  construct full evidence identities

#### Scenario: Mid-run source mutation changes nothing

- **GIVEN** a run whose production epoch acquired and snapshotted its
  sources
- **WHEN** the underlying files change mid-run
- **THEN** every subsequent production decision still derives from the
  retained snapshots, and the recorded digests identify the acquired
  bytes

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

### Requirement: Verification consumes only the verification epoch

Independent verification SHALL receive the verification epoch's authority
bytes and a fresh artifact observation as NEW values, distinct from every
production value, and SHALL pass them to the trusted core's verifier.
Producer inputs, producer snapshots, or the producer's constructed bundle
SHALL NOT be supplied as the verifier's inputs, and the two epochs'
acquisitions SHALL be separately recorded.

#### Scenario: The verifier receives its own epoch

- **GIVEN** a run whose evidence was constructed from the production
  epoch
- **WHEN** independent verification runs
- **THEN** the authority bytes and artifact observations supplied to the
  verifier come from the verification epoch, distinct from the
  production values
- **AND** both epochs' acquisitions appear separately in the run's
  acquisition record

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
| Source unreadable at an epoch's acquisition | operational failure carried into the core as a reported value | operational |
| Second acquisition attempted within an epoch | structural failure naming the source and epoch; no host read | change-attributable |
| Profile does not resolve | refusal before spend, recorded as an early-terminal refusal record (`runner-lifecycle`) | change-attributable |
| Base identity mismatch at creation | refusal naming both identities; no model invocation | change-attributable |
| Verifier supplied production values | unexpressible by construction; any bypass is a defect | change-attributable |

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
