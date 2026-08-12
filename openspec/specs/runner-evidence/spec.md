# runner-evidence Specification

## Purpose
The shape of what a run leaves behind: the evidence bundle and catalog,
complete enough that L3/L4 never have to change the contract on first
consumption. Shapes only — populating, sealing, and independently verifying
evidence is L3 behavior.

---
## Requirements
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

### Requirement: A run that terminates before authority completes leaves a governed early-termination record

The platform SHALL provide an `early-termination-record` contract for runs
that terminate while their production authority acquisition is incomplete.
The record SHALL carry: the run identity; **the requesting principal —
the identity that asked for the run, with its actor or explicit
autonomous marker** — so a refusal independently states who was refused;
the requested profile reference as data, or an explicit null where the
request named none; the terminal outcome with its structured refusal or
operational detail; and timing.

The record SHALL NOT be capable of carrying authority identities,
capability grants, gate results, change sets, or artifacts — the fields
SHALL NOT exist, so a fabricated-authority record is unrepresentable
rather than forbidden. This constraint is **structural**: it binds the
record's fields, not the content of the free-text failure detail
inherited from the terminal vocabulary. Arbitrary string-content
scanning remains an L4/L9 concern, exactly as the parent requirement
already states for credential values — a shape contract cannot enforce
what a human-readable string does not contain, and this specification
does not claim otherwise. The record's outcome vocabulary SHALL admit only
the non-success terminal states: a run that never obtained authority
SHALL NOT be able to claim success, and the success state SHALL be
absent from the record's outcome union rather than merely forbidden by
convention.

Exactly one of a full run record (with its evidence bundle) or an
early-termination record SHALL exist per run, distinguished by contract
identity.

#### Scenario: A request naming no profile leaves a complete record

- **GIVEN** a run request that names no execution profile
- **WHEN** the run terminates `REFUSED` before any acquisition
- **THEN** an early-termination record validates carrying the run
  identity, the requesting principal, a null requested reference, the
  structured refusal, and timing

#### Scenario: A refusal independently states who was refused

- **GIVEN** any early-termination record
- **WHEN** its shape is examined
- **THEN** the requesting principal is mandatory, carrying the requesting
  identity and either its actor or an explicit autonomous marker
- **AND** a record omitting the requester does not validate

#### Scenario: Success is unrepresentable in the record

- **GIVEN** an early-termination record whose outcome claims the success
  terminal state
- **WHEN** the contract validates it
- **THEN** validation fails — the success state is absent from this
  contract's outcome union
- **AND** no run lacking authority and evidence can present itself as
  successful

#### Scenario: A resolution failure records the requested reference as data

- **GIVEN** a run request naming a profile that fails to resolve
- **WHEN** the run terminates
- **THEN** the record carries the requested name and version as data
- **AND** no **structural field** for a digest, grant, or authority
  identity exists in the record — the constraint is on the shape, not on
  the free-text failure detail, whose content is not scanned here

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
- **THEN** their outcomes are the platform's terminal vocabulary narrowed
  to its non-success members, with `REFUSED` carrying `contract_refusal`
  detail and `OPERATIONAL_FAILURE` carrying `operational` detail
- **AND** every option of that union is a failure classification under
  the shared success mapping

