# Runner Evidence

## Purpose

The shape of what a run leaves behind: the evidence bundle and catalog,
complete enough that L3/L4 never have to change the contract on first
consumption. Shapes only — populating, sealing, and independently verifying
evidence is L3 behavior.

---

## ADDED Requirements

### Requirement: Evidence is never optional and is representationally complete

The evidence-bundle and catalog contracts SHALL make evidence structurally
mandatory for a run record, and SHALL be capable of representing, directly
or through digest-bound catalog references:

- identities: run identity; profile identity with digest; image digest;
  argv digest; **container-runtime identity as opaque data**; provider and
  adapter identity as opaque data;
- principal: `sub`, and `actor` or an explicit autonomous/no-actor marker;
- the capabilities actually granted to the run;
- attempted, permitted, and denied operations;
- gate results (the closed disposition vocabulary);
- outputs and artifacts with content hashes;
- the authoritative observed change set, the model-claimed change set, and
  the disagreement/reconciliation record between them;
- outcome with structured refusal/operational detail, and timing.

No field in the evidence or identity structures SHALL be capable of
carrying a credential value.

#### Scenario: A run without evidence does not validate

- **GIVEN** a run record with no evidence reference
- **WHEN** the contract validates it
- **THEN** validation fails — evidence is not an optional field

#### Scenario: Runtime identity is data, never schema

- **GIVEN** runs executed under two different container runtimes
- **WHEN** their evidence validates
- **THEN** both validate against the same schema, differing only in the
  opaque runtime-identity value

#### Scenario: Claims and observation are both representable

- **GIVEN** a run whose model-claimed change set disagrees with the
  observed change set
- **WHEN** its evidence is expressed
- **THEN** both sets and the disagreement record are representable, with
  the observed set marked authoritative

#### Scenario: No credential-value slot exists

- **GIVEN** the evidence and identity structures
- **WHEN** their shapes are examined
- **THEN** no field capable of carrying a credential value exists

---

## Failure Semantics

Shape-level only: an invalid evidence document fails validation with the
violating position named. Sealing, catalog-written-last ordering, and
independent re-derivation are L3 behavior already normative in
`runner-adoption`.

## Compatibility

Greenfield and inert; may not weaken any inherited `runner-adoption`
invariant.

## Deferred Behavior

- Evidence population, sealing, and independent verification — L3.
- Provider transcript normalization into these shapes — L7.
