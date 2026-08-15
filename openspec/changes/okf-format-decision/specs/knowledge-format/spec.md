# Spec Delta: knowledge-format

> **PROPOSED and NON-OPERATIVE.** ADR-0015 is `Proposed`; nothing below is an
> obligation today, and no lower-precedence artifact may make it one. These
> requirements take effect on acceptance, and even then authoring stays blocked
> until the implementation gate is satisfied.

## ADDED Requirements

### Requirement: The source representation is pinned OKF

Authored knowledge SHALL be OKF v0.2 source. The validator SHALL refuse a bundle
whose declared `okf_version` is any other value.

#### Scenario: A conforming bundle declares the pinned version

- **WHEN** a bundle's root `index.md` declares `okf_version: "0.2"`
- **THEN** admission proceeds to the remaining checks

#### Scenario: A later version is not accepted by drift (negative)

- **WHEN** a bundle declares a version other than `0.2`
- **THEN** admission refuses it
- **AND** adopting that version requires a superseding ADR, not a validator
  change

### Requirement: Admission rejects; consumption tolerates

Admission SHALL reject a module that does not meet the repository profile.
A component that READS a packaged bundle SHALL obey OKF consumer conformance and
tolerate unknown types, unknown keys, and missing optional fields.

#### Scenario: A module missing a required repository field

- **WHEN** a module omits owner, as-of, stated limitations, status, staleness,
  or its governing canonical source
- **THEN** admission refuses it
- **AND** the refusal is a failure, never a warning

#### Scenario: A packaged bundle carrying an unknown type

- **WHEN** a reader encounters a `type` value it does not recognise
- **THEN** it tolerates it gracefully
- **AND** does not reject the bundle

#### Scenario: Admission made advisory (negative)

- **WHEN** admission would downgrade a profile violation to a warning on the
  grounds that OKF consumers must not reject
- **THEN** the two layers have been conflated
- **AND** the change is incorrect

### Requirement: Digest identity is over raw bytes

A packaged bundle SHALL be identified by a digest over the exact bytes of its
source files and a manifest of path/digest pairs in a fixed order. Frontmatter
SHALL NOT be parsed and re-serialized on the path to a digest.

#### Scenario: The same source packaged twice

- **WHEN** an unchanged source tree is packaged twice
- **THEN** both packagings produce the same digest

#### Scenario: One byte changes

- **WHEN** a single byte of one source file changes
- **THEN** the bundle digest changes

#### Scenario: Identity depending on a YAML dumper (negative)

- **WHEN** an implementation would digest re-serialized frontmatter
- **THEN** bundle identity becomes a function of dump settings
- **AND** upgrading a YAML library would change the identity of unchanged
  knowledge, which is refused

### Requirement: Envelope violations are rejected, not normalized

Admission SHALL reject a source file that violates the packaging envelope —
non-UTF-8, a byte-order mark, CRLF endings, a non-normalized or traversing path
— rather than rewriting it.

#### Scenario: A file with CRLF endings

- **WHEN** a source file uses CRLF
- **THEN** admission refuses it and names the file
- **AND** does not silently rewrite it, because a rewrite changes the bytes that
  the digest identifies

### Requirement: OKF trust signals confer no authority

An OKF trust, provenance, or lifecycle signal SHALL NOT be an input to execution
authority, capability resolution, authorization, deterministic safety policy, or
the interpretation of live state.

#### Scenario: A human-reviewed module

- **WHEN** a module carries `verified` by a `human:<id>` actor
- **THEN** it confers exactly the authority an unverified module confers — none
- **AND** an agent may weigh how much to believe its content

#### Scenario: A trust tier consulted for permission (negative)

- **WHEN** a component would read a derived trust tier to decide what a run may
  do
- **THEN** knowledge has become a shadow authorization source
- **AND** the component is incorrect

#### Scenario: Live state disagrees with a verified module

- **WHEN** a `human-reviewed` module disagrees with live state
- **THEN** live state wins
- **AND** the discrepancy is reported

### Requirement: Reference integrity is checked at admission

Admission SHALL reject an unresolvable bundle-internal link or an unresolvable
governing-source reference. A reader of a packaged bundle SHALL tolerate a
broken link.

#### Scenario: A module naming a canonical source that does not exist

- **WHEN** a module's governing source cannot be resolved
- **THEN** admission refuses it
- **AND** the reason is that it projects nothing

#### Scenario: A link broken after packaging

- **WHEN** a reader follows a link whose target no longer exists
- **THEN** it tolerates the break rather than rejecting the bundle

### Requirement: Acceptance is not permission to author

Acceptance of the format decision SHALL NOT by itself permit authoring. The
implementation gate SHALL be satisfied first.

#### Scenario: The decision is accepted and the toolchain does not exist

- **WHEN** the format ADR is accepted but compile/validate/package/query and the
  conformance suite do not exist
- **THEN** authoring remains blocked
- **AND** U7 remains open

#### Scenario: A prohibited-content class with no failing negative test (negative)

- **WHEN** the conformance suite asserts a prohibited-content check without a
  case proven to fail when the check is removed
- **THEN** the class is unproven
- **AND** the gate is not satisfied
