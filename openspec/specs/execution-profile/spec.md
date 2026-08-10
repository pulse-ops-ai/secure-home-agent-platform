# execution-profile Specification

## Purpose
The shape of the platform's authority artifact: what an execution profile IS,
complete enough to express every already-ratified grant. Shapes only —
enforcement behavior belongs to L3/L4, and nothing here selects credential
custody or workload identity (U2).

---
## Requirements
### Requirement: The execution profile is the complete authority shape

The execution-profile contract SHALL express, as typed field groups:
identity (name, version); runtime (digest-pinned image reference, adapter);
capability (permitted tool surface; filesystem mounts each with an explicit
read/write posture; network policy as **default deny with explicitly granted
destinations — an "open" posture SHALL be inexpressible**; and credential
grants as `CredentialRef` named references only); execution (routing class
R0–R3, model route, declared fallback); limits (wall clock, CPU, memory,
**pids**, output size); principal (`sub`, actor requirement); knowledge (a
named selection reference that grants nothing); and the evidence-contract
reference. A profile without a version or with an undeclared field SHALL NOT
validate.

#### Scenario: Complete profile validates

- **GIVEN** a profile document carrying every field group with declared
  fields only
- **WHEN** the contract validates it
- **THEN** validation succeeds and the parsed type exposes each group

#### Scenario: Undeclared field refuses

- **GIVEN** a profile document with an extra, undeclared key
- **WHEN** the contract validates it
- **THEN** validation fails naming the unknown key (strict posture)

#### Scenario: Open network posture is inexpressible

- **GIVEN** a profile attempting to declare unrestricted egress
- **WHEN** the contract validates it
- **THEN** validation fails — the network-policy shape admits only default
  deny plus explicitly granted destinations

#### Scenario: Credential grants are references only

- **GIVEN** the profile's credential-grant field group
- **WHEN** its type is examined
- **THEN** it admits `CredentialRef` entries only, and no designated
  credential-value slot exists

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

---

