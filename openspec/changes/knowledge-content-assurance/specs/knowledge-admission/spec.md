# Spec Delta: knowledge-admission

> **PROPOSED and NON-OPERATIVE.** ADR-0016 is `Proposed`; nothing below is an
> obligation today, and no lower-precedence artifact may make it one.

## ADDED Requirements

### Requirement: Coverage is stated by class, and a subset is never called complete

Prohibited-content evidence SHALL be classified as **A** (deterministic,
structurally complete), **B** (deterministic indicator, bounded coverage), or
**C** (semantically undecidable from arbitrary prose). A **B** detector SHALL NOT
be described, named, or registered as covering its class.

#### Scenario: A structurally decidable class

- **WHEN** a bundle member is a media file, a media-typed `data:` URI, or a
  media-extension reference
- **THEN** admission refuses it deterministically
- **AND** the class is recorded as **A**

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

### Requirement: Initial rollout excludes household knowledge

The first authoring enabled after the toolchain passes review SHALL be limited to
portable platform and engineering knowledge and coding-oriented runbooks.

#### Scenario: A household module

- **WHEN** a household module would be authored in the first rollout
- **THEN** it remains blocked

#### Scenario: The limit misread as a decidability claim (negative)

- **WHEN** the scope limit would be read as meaning platform prose is
  semantically machine-decidable
- **THEN** the reading is wrong
- **AND** the attestation requirement applies to platform modules exactly as it
  would to household ones
