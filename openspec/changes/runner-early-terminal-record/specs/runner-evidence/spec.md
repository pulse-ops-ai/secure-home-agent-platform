# runner-evidence

## Purpose

Amendment (directed by the L4 planning review, blocker 2 / D11): a
governed record for runs that terminate before their production authority
acquisition completes — durable refusal evidence where the full bundle
cannot exist, with fabricated authority identities structurally
inexpressible.

This document is normative. It defines WHAT must hold, authored as a
**delta** against the canonical `runner-evidence` spec. Implementation
architecture belongs in `design.md`; proof strategy belongs in
`assurance.md`.

---

## ADDED Requirements

### Requirement: A run that terminates before authority completes leaves a governed early-termination record

The platform SHALL provide an `early-termination-record` contract for runs
that terminate while their production authority acquisition is incomplete.
The record SHALL carry: the run identity; the requested profile reference
as data, or an explicit null where the request named none; the terminal
outcome with its structured refusal or operational detail; and timing. The
record SHALL NOT be capable of carrying authority identities, capability
grants, gate results, change sets, or artifacts — the fields SHALL NOT
exist, so a fabricated-authority record is unrepresentable rather than
forbidden. Exactly one of a full run record (with its evidence bundle) or
an early-termination record SHALL exist per run, distinguished by contract
identity.

#### Scenario: A request naming no profile leaves a complete record

- **GIVEN** a run request that names no execution profile
- **WHEN** the run terminates `REFUSED` before any acquisition
- **THEN** an early-termination record validates carrying the run
  identity, a null requested reference, the structured refusal, and
  timing

#### Scenario: A resolution failure records the requested reference as data

- **GIVEN** a run request naming a profile that fails to resolve
- **WHEN** the run terminates
- **THEN** the record carries the requested name and version as data
- **AND** no digest, grant, or authority identity appears anywhere in it

#### Scenario: Fabricated authority is unrepresentable

- **GIVEN** the early-termination-record contract
- **WHEN** its shape is examined
- **THEN** no field exists for profile digests, policy or registry
  identities, capability grants, gate results, change sets, or artifacts
- **AND** a document smuggling any such field fails strict validation

#### Scenario: The record reuses the shared terminal vocabulary

- **GIVEN** early-termination records for a refusal and an operational
  fault
- **WHEN** they validate
- **THEN** their outcomes are the shared closed `RunOutcome` vocabulary,
  with `REFUSED` carrying `contract_refusal` detail and
  `OPERATIONAL_FAILURE` carrying `operational` detail
- **AND** no outcome classifies as success
