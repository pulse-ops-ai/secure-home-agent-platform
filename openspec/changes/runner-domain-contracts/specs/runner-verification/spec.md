# Runner Verification

## Purpose

The shapes of how the platform verifies: gate identities and dispositions,
declarative policies and packs, and the verification obligations of the
contract corpus itself — deterministic generated schemas and exact contract
identity. Shapes and corpus properties only — gate execution and
scheduling are L4 behavior.

---

## ADDED Requirements

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

### Requirement: Generated JSON Schema is deterministic, published output

Every authored contract SHALL generate JSON Schema into `schemas/`,
deterministically — identical source produces byte-identical output — with
strict object posture preserved in the output. Generated output SHALL be
verifiable by regeneration-and-comparison, and hand edits to generated
files SHALL be detectable as failures. The authored strict Zod schemas
remain the parse authority; generated output is published projection, never
proof of runtime strictness.

#### Scenario: Regeneration is byte-stable

- **GIVEN** an unchanged authored source
- **WHEN** generation runs twice
- **THEN** the outputs are byte-identical

#### Scenario: Drift between source and output fails

- **GIVEN** a generated schema edited by hand, or an authored source
  changed without regeneration
- **WHEN** the regenerate-and-compare check runs
- **THEN** it fails naming the divergent file

### Requirement: One schema identity means one schema

Every contract SHALL carry a stable `contract_id` and an **exact**
`contract_version` (semantic revision, e.g. `1.0.0`): an additive
compatible shape change increments the minor version; a breaking shape
change increments the major version. The generated schema `$id` SHALL embed
the exact contract version, so no two distinct schema byte sets can share
an identity. Compatibility direction SHALL be stated as: a newer compatible
reader may accept supported older documents; an older strict reader is
NEVER assumed to accept documents emitted under a newer schema.

#### Scenario: Versionless contract refuses

- **GIVEN** a contract document without its `contract_id` and exact
  `contract_version`
- **WHEN** validation runs
- **THEN** it fails

#### Scenario: An additive change changes the identity

- **GIVEN** a contract gaining an optional field
- **WHEN** its schema is regenerated
- **THEN** the exact contract version increments (minor) and the generated
  `$id` differs — the previous identity still names exactly the previous
  byte set

#### Scenario: Compatibility direction holds

- **GIVEN** a newer compatible reader and an older strict reader
- **WHEN** documents cross versions
- **THEN** the newer reader accepts supported older documents, and no
  contract or test asserts that the older strict reader accepts newer
  documents

---

## Failure Semantics

Shape-level only: invalid documents and drifted generated output fail with
the violating position or file named.

## Compatibility

Greenfield and inert; may not weaken any inherited `runner-adoption`
invariant. The corpus-wide requirements in this capability (generation
determinism, contract identity) bind every runner-domain contract.

## Deferred Behavior

- Gate execution, scheduling, and disposition derivation — L4.
- The conformance suite's re-runs against real adapters — L7/L8.
