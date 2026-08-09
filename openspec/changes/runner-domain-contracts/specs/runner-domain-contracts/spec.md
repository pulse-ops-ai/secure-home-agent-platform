# Runner Domain Contracts

## Purpose

The shape contracts of the runner domain: what the execution profile, launch
assertion, policies, gates, runs, events, and evidence records ARE. Shapes
only — refusal, authorization, capture, and classification *behavior* is
normative in the `runner-adoption` capability and proven by the L3/L4
landings, never by this one.

Authored as a single capability pending the decomposition decision (proposal
Q1 / design D1); the accepted grouping is enacted on this change before
implementation.

This document is normative. Implementation architecture belongs in
`design.md`. Proof strategy belongs in `assurance.md`.

---

## ADDED Requirements

### Requirement: The execution profile has a complete, versioned shape

The execution-profile contract SHALL express, as typed field groups:
identity (name, version), runtime (digest-pinned image reference, adapter),
capability (tool surface, filesystem mounts with posture, network policy),
execution (routing class R0–R3, model route, declared fallback), limits
(wall clock, CPU, memory, output size), principal (`sub`, actor
requirement), knowledge (a named selection reference that grants nothing),
and the evidence contract reference. A profile without a version or with an
undeclared field SHALL NOT validate.

#### Scenario: Complete profile validates

- **GIVEN** a profile document carrying every field group with declared
  fields only
- **WHEN** the contract validates it
- **THEN** validation succeeds and the parsed type exposes each group

#### Scenario: Undeclared field refuses

- **GIVEN** a profile document with an extra, undeclared key
- **WHEN** the contract validates it
- **THEN** validation fails naming the unknown key (strict posture)

#### Scenario: Knowledge reference grants nothing

- **GIVEN** the profile's knowledge field group
- **WHEN** its type is examined
- **THEN** it is a named selection reference only — no tool, mount, egress,
  or credential field exists within it

### Requirement: Adapter identity is opaque and open

The profile's `adapter` field SHALL be an opaque identifier — never an enum,
union discriminator, or structural branch. Adding a new adapter SHALL
require zero schema modifications anywhere in the contract corpus.

#### Scenario: Adding an adapter changes no schema

- **GIVEN** the published contract corpus
- **WHEN** a previously unknown adapter identifier is used in a profile
- **THEN** every contract validates unchanged — only a new opaque value
  exists

#### Scenario: A provider enum is refused at review

- **GIVEN** a proposed contract change introducing provider names as enum
  members or discriminators
- **WHEN** the structural-neutrality scan runs
- **THEN** it fails naming the violating position

### Requirement: Run identity and terminal outcomes are closed vocabularies

The run-record contract SHALL carry a stable run identity, the profile
identity (name, version, digest) it was launched from, and a terminal state
drawn from a closed vocabulary in which `INDETERMINATE` is a failure class.
Outcome classification SHALL distinguish contract refusal from operational
failure as data.

#### Scenario: Terminal vocabulary is closed

- **GIVEN** a run record with a terminal state outside the declared set
- **WHEN** the contract validates it
- **THEN** validation fails

#### Scenario: Indeterminate is typed as failure

- **GIVEN** the terminal-state type
- **WHEN** its success/failure classification mapping is examined
- **THEN** `INDETERMINATE` maps to failure and no mapping to success exists

### Requirement: Gate identity and dispositions are closed and unique

The gate-registry contract SHALL declare each gate as a unique identity with
an exact executable and argv array — never a shell string — and a network
field that admits only "none". The gate-result contract SHALL use the closed
disposition vocabulary `PASS | FAIL | SKIP_OK | SKIP_ENV`, SHALL represent
truncation as `FAIL` with a reason, and SHALL make a duplicate gate identity
or a second disposition for one gate invalid at validation.

#### Scenario: Networked gate is inexpressible

- **GIVEN** a gate-registry entry declaring any network access
- **WHEN** the contract validates it
- **THEN** validation fails — the field admits only "none"

#### Scenario: Duplicate gate identity refuses

- **GIVEN** a registry or result set carrying the same gate identity twice
- **WHEN** the contract validates it
- **THEN** validation fails naming the duplicate

#### Scenario: Truncation is FAIL with a reason

- **GIVEN** a gate result representing truncated output
- **WHEN** the contract validates it
- **THEN** the only expressible disposition is `FAIL` with a non-empty
  reason field

### Requirement: The launch assertion is data with unrepresentable secrets

The launch-assertion contract SHALL express the composed launch as an
ordered argv array with its digest, the environment-variable **names**
granted to the launch, and a secret-presence field that admits only `false`.
A credential value SHALL be unrepresentable in any contract field.

#### Scenario: Secret-bearing assertion cannot exist

- **GIVEN** a launch-assertion document claiming a secret value is present
- **WHEN** the contract validates it
- **THEN** validation fails — the field's only legal value is `false`

#### Scenario: Credentials are names, never values

- **GIVEN** the credential-reference type used across the corpus
- **WHEN** its shape is examined
- **THEN** it holds environment-variable names only, with no field capable
  of carrying a value

### Requirement: Policies and packs are declarative references

The path-policy contract SHALL express allowed write roots, prohibited
rules, and size bounds as data. The verification-pack contract SHALL
reference gates only by registry identity — a pack SHALL NOT declare an
executable, argv, environment, or network.

#### Scenario: Pack cannot smuggle a command

- **GIVEN** the verification-pack type
- **WHEN** its shape is examined
- **THEN** it contains gate-identity references only; no executable or argv
  field exists

### Requirement: Run events are uniform, dotted, and provider-blind

The run-event contract SHALL define stable, machine-readable dotted event
names covering the lifecycle (start, capability grant, attempted call and
disposition, adapter lifecycle transitions, termination reason), with
provider identity carried only as data values, identical in shape across
every adapter.

#### Scenario: Event shape is adapter-independent

- **GIVEN** two events for the same logical lifecycle moment from different
  adapters
- **WHEN** both validate against the contract
- **THEN** they validate against the same schema with only data values
  differing

### Requirement: Evidence is never optional and carries verifiable identity

The evidence-bundle and catalog contracts SHALL make evidence structurally
mandatory for a run record, SHALL carry content hashes and the outcome
classification, and SHALL express the identities (profile digest, image
digest, argv digest) an independent verifier re-derives.

#### Scenario: A run without evidence does not validate

- **GIVEN** a run record with no evidence reference
- **WHEN** the contract validates it
- **THEN** validation fails — evidence is not an optional field

### Requirement: Generated JSON Schema is deterministic, published output

Every authored contract SHALL generate JSON Schema into `schemas/`,
deterministically — identical source produces byte-identical output — with
strict object posture (`additionalProperties: false`) preserved. Generated
output SHALL be verifiable by regeneration-and-comparison, and hand edits to
generated files SHALL be detectable as failures.

#### Scenario: Regeneration is byte-stable

- **GIVEN** an unchanged authored source
- **WHEN** generation runs twice
- **THEN** the outputs are byte-identical

#### Scenario: Drift between source and output fails

- **GIVEN** a generated schema edited by hand, or an authored source changed
  without regeneration
- **WHEN** the regenerate-and-compare check runs
- **THEN** it fails naming the divergent file

### Requirement: Contracts are versioned with stated compatibility

Every contract SHALL carry a `contract_version` constant, and the contract
packages SHALL state their compatibility rules: additive optional fields are
minor; any breaking shape change increments the contract version and the
package major.

#### Scenario: Versionless contract refuses

- **GIVEN** a contract document without its version constant
- **WHEN** validation runs
- **THEN** it fails

---

## Failure Semantics

Shape-level only: an invalid document fails validation with the violating
position named (contract refusal at the shape layer). Runtime failure
classification — change-attributable versus operational — is *represented*
by these contracts and *performed* by L3/L4.

## Compatibility

Greenfield; nothing consumes these contracts yet and the landing is inert.
The inherited `runner-adoption` requirements bind unchanged; this capability
adds shapes and may not weaken any inherited invariant.

## Deferred Behavior

- All behavioral proof (refusal, capture, classification, sealing) — L3/L4.
- Provider-specific configurable structure — only after the U6 ADR, and
  then behind the adapter boundary, never in these contracts.
- Persistence representations — U11.
- The canonical capability decomposition — enacted on this change after the
  review decides Q1/D1.
