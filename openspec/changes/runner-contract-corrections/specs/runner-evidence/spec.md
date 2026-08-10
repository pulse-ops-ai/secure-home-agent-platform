# runner-evidence

## Purpose

Amendment (directed by the delta review on PR #62, closing L3's Q2 via its
option B): the evidence identity group gains the digest-bound contract
identity of the path policy and of the gate registry that governed the run,
so a reader of the evidence bundle alone can identify **every** authority
input that governed it.

This document is normative. It defines WHAT must hold, authored as a
**delta** against the canonical `runner-evidence` spec. Implementation
architecture belongs in `design.md`; proof strategy belongs in
`assurance.md`.

---

## MODIFIED Requirements

### Requirement: Evidence is never optional and is representationally complete

The evidence-bundle and catalog contracts SHALL make evidence structurally
mandatory for a run record, and SHALL be capable of representing, directly
or through digest-bound catalog references:

- identities: run identity; profile identity with digest; image digest;
  argv digest; **the digest-bound contract identity of the path policy that
  governed the run; the digest-bound contract identity of the gate registry
  that governed the run**; **container-runtime identity as opaque data**;
  provider and adapter identity as opaque data;
- principal: `sub`, and `actor` or an explicit autonomous/no-actor marker;
- the capabilities actually granted to the run;
- attempted, permitted, and denied operations;
- gate results (the closed disposition vocabulary);
- outputs and artifacts with content hashes;
- the authoritative observed change set, the model-claimed change set, and
  the disagreement/reconciliation record between them;
- outcome with structured refusal/operational detail, and timing.

The path-policy and gate-registry identities SHALL be **mandatory**: an
evidence bundle that cannot name the digest-bound identity of the policy and
registry that governed its run SHALL NOT validate. Each such identity SHALL
record the contract identity, the exact contract version, and the digest of
the captured authority bytes.

No field in the evidence or identity authority structures SHALL be
designated for credential-value transport; credential-purpose positions
admit `CredentialRef` only, and no credential-value slot exists. Arbitrary
string-content scanning is an L4/L9 concern.

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
- **THEN** no designated credential-value slot exists

#### Scenario: Evidence names every governing authority input

- **GIVEN** an evidence bundle for a completed run
- **WHEN** its identity group is examined
- **THEN** it records the digest-bound contract identity of the path policy
  and of the gate registry that governed the run
- **AND** a bundle omitting either identity does not validate
