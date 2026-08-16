# Spec Delta: knowledge-admission

> **PROPOSED and NON-OPERATIVE.** ADR-0016 is `Proposed`; nothing below is an
> obligation today, and no lower-precedence artifact may make it one.

## ADDED Requirements

### Requirement: Coverage is stated by class, and a subset is never called complete

Prohibited-content evidence SHALL be classified as **A** (deterministic,
structurally complete), **B** (deterministic indicator, bounded coverage), or
**C** (semantically undecidable from arbitrary prose). A **B** detector SHALL NOT
be described, named, or registered as covering its class.

#### Scenario: A detector that is useful but not complete

- **WHEN** a bundle member is a media file, a media-typed `data:` URI, or a
  media-extension reference
- **THEN** admission refuses it deterministically
- **AND** the class is recorded as **B**, not **A**, because media bytes may be
  base64- or hex-encoded inside Markdown or hidden behind an opaque URL

#### Scenario: An A claim without a completeness proof (negative)

- **WHEN** a detector would be registered as class **A**
- **THEN** it SHALL carry an argument that every representation is structurally
  visible under a closed authoring grammar
- **AND** absent that, it is **B** — **A** is a capability of a mechanism, not a
  quota to fill

#### Scenario: An indicator with a named blind spot

- **WHEN** a detector recognizes PEM blocks, JWT triples, and known key prefixes
- **THEN** it refuses those shapes
- **AND** it is recorded as **B**, naming what it cannot see — a credential
  described in prose

#### Scenario: A test named for a class it does not establish (negative)

- **WHEN** a test proving one lexical indicator is registered as proof of the
  secrets class
- **THEN** the registration is a false proof
- **AND** the test SHALL be named for the indicator it detects

### Requirement: The gate is fail-closed by two mechanisms

Admission SHALL refuse on any deterministic prohibited-content finding, and SHALL
refuse any module lacking a valid human content-review attestation.

#### Scenario: No attestation

- **WHEN** a module carries no content-review attestation
- **THEN** admission refuses
- **AND** the absence of a deterministic finding does not substitute for it

#### Scenario: Both mechanisms satisfied

- **WHEN** no deterministic finding exists and a valid bound attestation is
  present
- **THEN** the module is eligible to continue
- **AND** the remaining admission rules still apply

### Requirement: A deterministic finding dominates an attestation

An attestation SHALL NOT waive a deterministic prohibited-content finding.

#### Scenario: A signed secret (negative)

- **WHEN** a deterministic finding is present and a valid attestation is also
  present
- **THEN** admission **REFUSES**
- **AND** no reviewer may sign past a detected secret

#### Scenario: The dominance table

- **WHEN** admission evaluates finding × attestation
- **THEN** only *(no finding, valid bound attestation)* is eligible to continue
- **AND** every other combination refuses

### Requirement: The attestation binds to exact content identity

An attestation SHALL name a policy version, an actor, a timestamp, and a
`sourceDigest` computed by ADR-0015 §6's manifest identity mechanism. It SHALL
live outside the bytes it attests.

#### Scenario: Content changed after review

- **WHEN** one byte of a reviewed module changes
- **THEN** the recomputed digest no longer matches
- **AND** admission refuses on a stale attestation

#### Scenario: Review criteria tightened

- **WHEN** the policy version changes
- **THEN** attestations naming the old version no longer satisfy admission

#### Scenario: An attestation stored inside the attested bytes (negative)

- **WHEN** the attestation would live in the module it attests
- **THEN** its digest becomes self-referential — writing it changes what it
  certifies
- **AND** it SHALL live in the catalog, which is already the metadata authority

#### Scenario: A second identity algorithm (negative)

- **WHEN** an implementation would compute `sourceDigest` by a mechanism other
  than ADR-0015 §6's
- **THEN** two identity algorithms exist that can diverge
- **AND** the change is incorrect

### Requirement: Toolchain proof and reviewer-authenticity proof are independent

The toolchain SHALL validate the attestation artifact and its binding. It SHALL
NOT treat `by: human:<id>` as evidence that the named human acted. Publication
eligibility SHALL additionally require the repository's governed human-review
evidence.

#### Scenario: A well-formed, correctly bound, self-asserted attestation

- **WHEN** a producer writes a valid attestation naming another person's
  identifier, with a correct `sourceDigest`
- **THEN** the toolchain confirms the artifact and its binding
- **AND** it SHALL NOT report the module publishable, because no evidence of
  human action exists

#### Scenario: No mechanically checkable reviewer signal exists

- **WHEN** the repository provides no machine-checkable reviewer-authenticity
  signal
- **THEN** publication remains blocked
- **AND** the toolchain says so rather than implying the review occurred

#### Scenario: A network or model consulted to establish reviewer identity (negative)

- **WHEN** admission would call a service or model to establish who reviewed
- **THEN** admission stops being offline and deterministic
- **AND** the change is refused

### Requirement: Reviewer evidence binds to the exact attestation

Governed human-review evidence SHALL establish that the eligible human identity
corresponds to `contentReview.by`, and that the review applies to the exact
current `policy`, `sourceDigest`, and attestation record or revision. Changing
any identity-bearing attestation field after review SHALL invalidate it.

#### Scenario: Review evidence naming a different actor (negative)

- **WHEN** the governed review evidence identifies a human other than the one in
  `contentReview.by`
- **THEN** it does not satisfy that attestation

#### Scenario: A valid old review replayed against a changed attestation (negative)

- **WHEN** review evidence approved an attestation, and `by`, `policy`,
  `sourceDigest`, or the attestation revision has since materially changed
- **THEN** the module is **NOT publishable**
- **AND** new review evidence is required, because Proof A binds the content
  while Proof B binds the review to the exact attestation

#### Scenario: A provider-specific representation mandated (negative)

- **WHEN** a specific forge's permanent representation would be required by this
  contract
- **THEN** the invariant has been confused with one implementation of it
- **AND** the requirement is that the evidence identify the exact attestation
  revision, however a given forge records that

### Requirement: The policy identifier names an immutable definition

`portable-knowledge-prohibited-content-v1` SHALL denote ADR-0016 §1 and §2 as
accepted. A change in review meaning SHALL require a new policy version.

#### Scenario: Review criteria change

- **WHEN** a class is reclassified or a prohibition added
- **THEN** a new policy version is required
- **AND** attestations naming the previous version do not satisfy admission
  under it

#### Scenario: The identifier silently redefined (negative)

- **WHEN** the meaning behind an existing identifier would change in place
- **THEN** prior attestations would survive a change to what they attested
- **AND** the change is refused

### Requirement: Toolchain readiness and rollout eligibility are separate gates

`blockedByToolchain` SHALL record whether the toolchain is accepted.
`blockedByRollout` SHALL record whether a module class may author under current
rollout policy. Both SHALL be machine-readable, per-entry, and asserted. A module
is eligible to author candidate source when both are `false`; attestation is an
admission requirement that applies after those bytes exist, and SHALL NOT be
treated as an authoring prerequisite.

#### Scenario: Toolchain ready, household still blocked

- **WHEN** `blockedByToolchain` is `false` repository-wide
- **THEN** a `household/**` module remains refused
- **AND** the reason is rollout policy, not toolchain readiness

#### Scenario: An eligible platform module, stage by stage

- **WHEN** both gates are `false`
- **THEN** the module may **enter authoring** — candidate source may be written
- **AND** no attestation is required to reach this point

- **WHEN** candidate bytes exist, the deterministic checks pass, a valid
  byte-bound attestation is present, and the remaining validation passes
- **THEN** the module is **admitted**

- **WHEN** Proof B, bound to that exact attestation, is established
- **THEN** the module is **publishable**
- **AND** no signal establishes Proof B in this repository today, so publication
  remains blocked

#### Scenario: One variable standing for both facts (negative)

- **WHEN** the household block would be represented by leaving
  `blockedByToolchain` `true`
- **THEN** one state variable means two things again
- **AND** the change is refused

### Requirement: The two gates are independent and all four states are reachable

Each combination SHALL produce a distinct, correctly-named outcome.

#### Scenario: Both gates shut

- **WHEN** `blockedByToolchain` and `blockedByRollout` are both `true`
- **THEN** the module is refused

#### Scenario: Rollout released, toolchain unproven

- **WHEN** `blockedByToolchain` is `true` and `blockedByRollout` is `false`
- **THEN** the module is refused **by the toolchain gate**
- **AND** the refusal names the toolchain, not rollout policy

#### Scenario: Toolchain proven, class not released

- **WHEN** `blockedByToolchain` is `false` and `blockedByRollout` is `true`
- **THEN** the module is refused **by the rollout gate**
- **AND** the refusal names rollout policy, not the toolchain

#### Scenario: Both gates open

- **WHEN** both are `false`
- **THEN** the module is eligible to **enter admission**
- **AND** it is neither admitted nor published by that fact alone

### Requirement: Authoring eligibility, admission, and publication are distinct

Authoring eligibility SHALL require only that both structural gates are `false`.
An attestation SHALL NOT be required before the candidate bytes it attests to
exist.

#### Scenario: Candidate bytes are authored before any attestation

- **WHEN** both gates are `false` and no attestation yet exists
- **THEN** authoring candidate source is permitted
- **AND** `sourceDigest` is computed over those bytes afterwards

#### Scenario: An attestation required before its own content (negative)

- **WHEN** a rule would require an attestation before candidate bytes exist
- **THEN** the requirement is circular, because the digest is computed over
  those bytes
- **AND** the rule is incorrect

#### Scenario: Admission passed is not publication

- **WHEN** deterministic checks pass and a valid byte-bound attestation exists
- **THEN** admission is satisfied
- **AND** publication additionally requires Proof B bound to that exact
  attestation, which no mechanically checkable signal establishes today

#### Scenario: Every set starts rollout-blocked

- **WHEN** the catalog is initialised under this policy
- **THEN** every set carries `blockedByRollout: true`
- **AND** releasing one is an explicit reviewed transition

#### Scenario: An unblocked set cannot bypass a blocked module (negative)

- **WHEN** a set carries `blockedByRollout: false` and selects a module carrying
  `blockedByRollout: true`
- **THEN** resolution refuses on the blocked module
- **AND** set release SHALL NOT be a back door around per-module rollout policy

#### Scenario: A runbook eligible by directory (negative)

- **WHEN** a household-oriented runbook would become eligible because it lives
  under `runbooks/`
- **THEN** eligibility has been decided by path rather than by review
- **AND** runbooks SHALL be allowlisted individually

### Requirement: The attestation is not an OKF trust tier and confers no authority

OKF's `verified` SHALL NOT be read as, or substituted for, a content-review
attestation. The attestation SHALL NOT reach execution authority, capability
resolution, authorization, safety policy, or live-state interpretation.

#### Scenario: A human-reviewed OKF concept without an attestation

- **WHEN** a module carries `verified` by a human actor but no content-review
  attestation
- **THEN** admission refuses
- **AND** the two answer different questions

#### Scenario: The attestation consulted for permission (negative)

- **WHEN** a component would read the attestation to decide what a run may do
- **THEN** admission evidence has been mistaken for authority
- **AND** the component is incorrect

### Requirement: No classifier participates in admission

Admission SHALL be deterministic. No model, classifier, or network call SHALL
participate in it.

#### Scenario: Admission is reproducible

- **WHEN** the same source is admitted twice
- **THEN** the outcome is identical
- **AND** it does not depend on a model's judgement

#### Scenario: A classifier added to admission (negative)

- **WHEN** an implementation would call a model to decide a semantic class
- **THEN** a model enters the trust path of the mechanism that exists to keep
  model-visible content safe
- **AND** the change is refused

### Requirement: Rollout eligibility is determined by scope

Rollout eligibility SHALL be determined by the entry's scope, per the table
below, and SHALL NOT be conferred by any path-based or prose criterion. These
are the values set **on acceptance of the governing decision**, independently of
toolchain readiness:

| Entry | `blockedByRollout` on acceptance |
|---|---|
| `platform/**` modules | `false` |
| `household/**` modules | `true` |
| `runbooks/**` modules | `true`; eligible only by explicit per-module allowlist |
| every set | `true` |

#### Scenario: Rollout state does not wait on the toolchain

- **WHEN** the governing decision is accepted
- **THEN** `platform/**` modules carry `blockedByRollout: false`
- **AND** `blockedByToolchain` remains `true` everywhere
- **AND** the acceptance itself is the reviewed decision releasing that scope

#### Scenario: Toolchain discharge does not mutate rollout

- **WHEN** the toolchain gate is later discharged
- **THEN** only `blockedByToolchain` changes, `true` → `false`
- **AND** every `blockedByRollout` value is left as it was

#### Scenario: A household module

- **WHEN** a household module would be authored in the first rollout
- **THEN** it remains blocked

#### Scenario: The limit misread as a decidability claim (negative)

- **WHEN** the scope limit would be read as meaning platform prose is
  semantically machine-decidable
- **THEN** the reading is wrong
- **AND** the attestation requirement applies to platform modules exactly as it
  would to household ones
