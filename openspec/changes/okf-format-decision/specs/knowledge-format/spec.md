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

### Requirement: Factual currency is distinct from production time

A module SHALL carry an `as_of` date stating the currency of the facts it
asserts, separate from OKF's `generated.at`, which records when the content was
last meaningfully changed.

#### Scenario: A module is regenerated from old material

- **WHEN** a module is regenerated today from source material a year old
- **THEN** `generated.at` moves to today
- **AND** `as_of` does not move
- **AND** freshness continues to be evaluated against `as_of`

#### Scenario: as-of mapped onto production time (negative)

- **WHEN** an implementation would satisfy the as-of requirement with
  `generated.at`
- **THEN** every regeneration would silently assert that stale facts are current
- **AND** the mapping is refused

### Requirement: Execution-bearing content is refused

Admission SHALL refuse a concept of type `Attested Computation`, and SHALL refuse
the fields `runtime`, `computation`, `executor`, and `attester` wherever they
appear, whatever the declared `type`.

#### Scenario: A concept naming an executor

- **WHEN** a concept carries an `executor` whose resource names a skill, script,
  or container
- **THEN** admission refuses it
- **AND** the reason is that executable capability does not enter through the
  knowledge plane

#### Scenario: Execution fields under a different type (negative)

- **WHEN** execution-bearing fields appear under a `type` other than
  `Attested Computation`
- **THEN** admission still refuses them
- **AND** refusing by type alone would be insufficient, because `type` is an
  open string a producer chooses

### Requirement: Digest identity is over raw bytes

A packaged bundle SHALL be identified by a digest over a manifest whose byte
serialization is normative and versioned, binding the exact bytes of every
source file. Frontmatter SHALL NOT be parsed and re-serialized on the path to a
digest.

#### Scenario: The same source packaged twice

- **WHEN** an unchanged source tree is packaged twice
- **THEN** both packagings produce the same digest

#### Scenario: One byte changes

- **WHEN** a single byte of one source file changes
- **THEN** the bundle digest changes

#### Scenario: Two conforming implementations agree

- **WHEN** two independent implementations package the same source tree
- **THEN** they produce the same bundle digest
- **AND** this holds because the manifest's byte format is fixed, not merely its
  ordering

#### Scenario: Manifest serialization left to the implementation (negative)

- **WHEN** the format specifies only "path/digest pairs in a fixed order"
- **THEN** delimiter and encoding choices still change the bundle digest
- **AND** identity would again depend on an implementation choice rather than on
  the knowledge

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
governing-source reference. A reader SHALL tolerate a broken link, because OKF
consumer conformance requires it.

Bundle-internal references and external references have different lifetimes, and
the requirement distinguishes them: an internal target admitted into an
immutable, digest-addressed package is **frozen with that package** and cannot
later break, whereas an external or `governs` reference points outside the
package and can become unavailable at any time.

#### Scenario: A module naming a canonical source that does not exist

- **WHEN** a module's governing source cannot be resolved at admission
- **THEN** admission refuses it
- **AND** the reason is that it projects nothing

#### Scenario: An internal reference cannot break after packaging

- **WHEN** the repository copy of an internal target is deleted after packaging
- **THEN** the packaged bundle is unaffected, because the target's bytes are
  inside the immutable package
- **AND** its digest is unchanged

#### Scenario: An external reference becomes unavailable

- **WHEN** a `governs` target is later moved or removed
- **THEN** a reader tolerates the dangling reference
- **AND** the package remains valid, because admission judged it when it was
  admitted

#### Scenario: Foreign OKF input with a broken internal link

- **WHEN** a reader is given an OKF bundle this repository did not admit
- **THEN** it tolerates the broken link rather than rejecting the bundle
- **AND** this is why tolerant reading is required even though our own admitted
  packages cannot contain one

### Requirement: The answered question and the safe-to-author state are separate

Whether the architectural question is answered and whether authoring may begin
SHALL be recorded as two facts. Acceptance of the format decision SHALL NOT by
itself permit authoring.

#### Scenario: The decision is accepted and the toolchain does not exist

- **WHEN** the format ADR is accepted but compile/validate/package/query and the
  conformance suite do not exist
- **THEN** U7 closes, because its question has an answer
- **AND** authoring remains blocked by the implementation obligation

#### Scenario: One state variable for both facts (negative)

- **WHEN** U7's open state would be used to mean "the toolchain has not landed"
- **THEN** the implementation becomes the event that closes an unresolved item
- **AND** governance forbids it: an item leaves that file only via a new ADR

#### Scenario: A prohibited-content class with no failing negative test (negative)

- **WHEN** the conformance suite asserts a prohibited-content check without a
  case proven to fail when the check is removed
- **THEN** the class is unproven
- **AND** the gate is not satisfied
