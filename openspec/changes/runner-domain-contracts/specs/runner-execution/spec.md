# Runner Execution

## Purpose

The shapes of a run in motion: the launch assertion, the run record with its
closed terminal vocabulary, and the platform-owned run-event vocabulary.
Shapes only — launching, classifying, and event emission are L4 behavior.

---

## ADDED Requirements

### Requirement: The launch assertion is data with no credential-value slot

The launch-assertion contract SHALL express the composed launch as an
ordered argv array with its digest, the environment-variable **names**
granted to the launch, and a secret-presence field that admits only `false`.
No field SHALL be designated for credential-value transport: every field
whose semantic purpose is credential transport SHALL admit `CredentialRef`
(a named environment-variable reference) only, and no credential-value slot
SHALL exist in the launch assertion or the identity structures. Whether
arbitrary unrelated text accidentally contains secret material is a
scanning and runtime concern (L4/L9), not a shape claim.

#### Scenario: Secret-bearing assertion cannot exist

- **GIVEN** a launch-assertion document claiming a secret value is present
- **WHEN** the contract validates it
- **THEN** validation fails — the field's only legal value is `false`

#### Scenario: Credential-transport fields are references only

- **GIVEN** every field in the corpus whose semantic purpose is credential
  transport
- **WHEN** its shape is examined
- **THEN** it admits `CredentialRef` entries only, with no designated
  value slot present

### Requirement: Run identity and terminal outcomes are a closed, enumerated vocabulary

The run-record contract SHALL carry a stable run identity and the profile
identity it was launched from (name, version, digest), and a terminal state
drawn from exactly this closed vocabulary: `COMPLETED`, `REFUSED`,
`OPERATIONAL_FAILURE`, `CANCELLED`, `TIMED_OUT`, `INDETERMINATE`. Only
`COMPLETED` SHALL map to success; `INDETERMINATE` is a failure class.
Outcome classification SHALL distinguish contract refusal from operational
failure as data.

#### Scenario: Terminal vocabulary is closed

- **GIVEN** a run record with a terminal state outside the enumerated set
- **WHEN** the contract validates it
- **THEN** validation fails

#### Scenario: Only COMPLETED maps to success

- **GIVEN** the terminal-state type's success/failure mapping
- **WHEN** it is examined
- **THEN** `COMPLETED` is the only success mapping, and `INDETERMINATE`
  maps to failure

### Requirement: Run events use a closed platform vocabulary with provider data

The run-event contract SHALL define `event_type` as a **closed, versioned
platform vocabulary**: `run.started`, `capability.granted`,
`call.attempted`, `call.disposition`, `adapter.started`,
`adapter.completed`, `run.terminated`. Provider-specific naming and
metadata SHALL be carried only in optional opaque data fields
(`provider_event_name`, provider metadata) — never as the event type. Event
shapes SHALL be identical across adapters, extending the vocabulary only
through a contract-version increment.

#### Scenario: Unknown event type refuses

- **GIVEN** an event whose `event_type` is outside the platform vocabulary
- **WHEN** the contract validates it
- **THEN** validation fails

#### Scenario: Provider naming rides as data

- **GIVEN** an adapter with its own native event naming
- **WHEN** its events are expressed in the contract
- **THEN** the platform `event_type` carries the semantic kind and the
  provider's name appears only in opaque data fields

#### Scenario: Event shape is adapter-independent

- **GIVEN** two events for the same lifecycle moment from different
  adapters
- **WHEN** both validate against the contract
- **THEN** they validate against the same schema with only data values
  differing

---

## Failure Semantics

Shape-level only: invalid documents fail validation with the violating
position named. Runtime classification is represented here and performed by
L3/L4.

## Compatibility

Greenfield and inert; may not weaken any inherited `runner-adoption`
invariant.

## Deferred Behavior

- Launch composition, argv assertion behavior, event emission — L4.
- Secret scanning of arbitrary content — L4/L9 runtime concern.
