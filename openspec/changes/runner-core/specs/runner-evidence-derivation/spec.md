# runner-evidence-derivation

## Purpose

Trusted construction of a run's evidence from authoritative inputs, and its
**independent** re-derivation by a verifier that does not trust the producer's
output.

This capability owns evidence construction and verification decisions, and the
deterministic prerequisites of the sealed-last rule. It does not own the
ordering that actually seals a run.

This document is normative. It defines WHAT must hold, authored as a **delta**
against the main spec. Implementation architecture belongs in `design.md`;
proof strategy belongs in `assurance.md`.

---

## ADDED Requirements

### Requirement: Evidence is constructed only from authoritative inputs

An evidence bundle SHALL be constructed from captured authority snapshots,
host-observed changes, gate results, artifact observations, and run outcome
inputs. No field SHALL be populated from model or provider claims except the
fields whose contract designates them as claims.

#### Scenario: Claimed data reaches only the claim fields

- **GIVEN** a run whose model output claims changes and outcomes
- **WHEN** evidence is constructed
- **THEN** the claimed change set appears only in the claims field
- **AND** every other field derives from captured snapshots or host observation

#### Scenario: Construction refuses on a missing authoritative input

- **GIVEN** a construction request lacking a required authoritative input
- **WHEN** evidence is constructed
- **THEN** the result is a refusal naming the missing input
- **AND** no partially populated bundle is returned

### Requirement: Independent verification re-derives rather than re-reads the producer

An independent verifier SHALL re-derive the expected evidence state from the
authoritative inputs and the artifacts as observed, and compare that derivation
against the claimed or sealed evidence. The verifier SHALL NOT obtain its
expected state by calling the producer's derivation, and SHALL NOT accept the
producer's serialized output as the source of the expectation it checks.

The verifier SHALL, at minimum: derive its expectation from authority bytes
and artifact observations supplied to it as immutable values **distinct from
those given to the producer**; recompute artifact digests; derive the
expected artifact and change membership; revalidate the evidence against its
declared contract; and compare the claimed evidence to the re-derived state.
That the verifier's inputs were in fact acquired independently and afresh
from the authoritative sources is an L4 orchestration obligation; L3 proves
that its verification derives only from the inputs it was given, never from
the producer's results.

#### Scenario: Verifier agrees with an untampered bundle

- **GIVEN** an evidence bundle constructed from a set of authoritative inputs
- **WHEN** the verifier re-derives expected state from the same inputs and
  artifacts
- **THEN** the verification succeeds
- **AND** the verification result identifies the exact artifacts it consumed

#### Scenario: A single mutated artifact is flagged

- **GIVEN** a verified evidence bundle
- **AND** one artifact whose bytes change after construction
- **WHEN** the verifier runs
- **THEN** verification fails naming the artifact and the digest divergence

#### Scenario: The verifier does not depend on the producer

- **GIVEN** the verification module of the trusted core
- **WHEN** its import graph is examined
- **THEN** it does not import the evidence-construction module
- **AND** any logic shared between them is a deterministic primitive that
  derives no decision

#### Scenario: Extra unaccounted artifact fails closed

- **GIVEN** an artifact present on the observed artifact surface but absent
  from the evidence bundle
- **WHEN** the verifier runs
- **THEN** verification fails naming the unaccounted artifact
- **AND** the extra artifact is never ignored as immaterial

#### Scenario: Missing, malformed, or ambiguous evidence fails closed

- **GIVEN** an evidence bundle that is absent, fails contract validation, or
  carries two irreconcilable statements about the same fact
- **WHEN** the verifier runs
- **THEN** verification fails naming the condition
- **AND** no such condition is reported as verified

### Requirement: Verifying an intermediate never authorizes a later artifact

A successful verification of one representation SHALL NOT establish trust in a
different, later artifact derived from it. A consumer SHALL verify the digest-
bound identity of the artifact it actually consumes, or independently re-derive
that artifact's required properties, at the point of consumption.

#### Scenario: Mutation after verification and before consumption refuses

- **GIVEN** an artifact verified at one point
- **AND** the same artifact mutated before it is consumed
- **WHEN** consumption is attempted
- **THEN** consumption refuses unless the consumed artifact is independently
  reverified
- **AND** the earlier successful verification does not authorize consumption

#### Scenario: Verification evidence names the artifact consumed

- **GIVEN** a completed verification
- **WHEN** its result is examined
- **THEN** the result identifies the actual artifact bytes verified by digest
- **AND** the identity is sufficient to detect substitution afterwards

### Requirement: Seal eligibility is a deterministic decision with named prerequisites

The trusted core SHALL expose a decision that reports whether a run's evidence
is eligible to be sealed, given the completeness and consistency of its
inputs. Eligibility SHALL require that every declared prerequisite is present
and decided, and SHALL refuse when any prerequisite is missing, undecided, or
inconsistent. The decision SHALL be a pure function of its inputs and SHALL NOT
sequence, order, or perform the seal.

#### Scenario: Complete inputs are eligible

- **GIVEN** an evidence input set in which every declared prerequisite is
  present and decided
- **WHEN** seal eligibility is decided
- **THEN** the decision is eligible
- **AND** the decision names the prerequisites it checked

#### Scenario: An undecided prerequisite refuses

- **GIVEN** an evidence input set with one prerequisite still undecided
- **WHEN** seal eligibility is decided
- **THEN** the decision is a refusal naming the undecided prerequisite
- **AND** the run cannot be classified as successful on that basis

#### Scenario: Eligibility performs no ordering

- **GIVEN** the seal-eligibility interface
- **WHEN** it is examined
- **THEN** it returns a decision only
- **AND** it neither writes an artifact nor sequences any other step

### Requirement: A failure to establish evidence is never success

Where evidence cannot be constructed, verified, or found eligible to seal, the
resulting run outcome SHALL be a failure classification. No terminal outcome
derived by the core SHALL classify as success while its evidence is missing,
unverified, or ineligible.

#### Scenario: Interrupted evidence classifies as failure

- **GIVEN** an evidence input set that construction refused
- **WHEN** the run outcome is classified
- **THEN** the outcome is a failure classification
- **AND** no code path maps the condition to the success terminal state

#### Scenario: Indeterminate is a failure class

- **GIVEN** a run whose terminal state cannot be established from its inputs
- **WHEN** the outcome is classified
- **THEN** the classification is the indeterminate terminal state
- **AND** the indeterminate state is treated as failure, never success

---

## Failure Semantics

| Condition | Required outcome | Classification |
|---|---|---|
| Required authoritative input absent at construction | refusal naming the input | change-attributable |
| Artifact digest diverges from the bundle | verification failure naming the artifact | change-attributable |
| Artifact present on disk but absent from the bundle | verification failure naming the extra artifact | change-attributable |
| Bundle absent, malformed, or self-contradictory | verification failure naming the condition | fail-closed |
| Seal prerequisite missing or undecided | refusal naming the prerequisite | change-attributable |
| Orchestrator reports the artifact surface unreadable | operational failure | operational |
| Terminal state cannot be established | indeterminate terminal state | fail-closed |

No condition in this table maps to success.

## Compatibility

Additive. Evidence is constructed against `EvidenceBundle` as authored in
`packages/events` and validated with that contract; the outcome vocabulary is
`RunOutcome`, whose `TERMINAL_SUCCESS` map already fixes `COMPLETED` as the
only success.

**Sequenced behind the L2 correction.** The gap this change originally
reported as Q2 — no field for the path-policy or gate-registry identity in
`EvidenceIdentities` — was directed to option B by the delta review
(2026-08-10) and is being closed in L2 by the `runner-contract-corrections`
change: `identities.path_policy` and `identities.gate_registry` become
required digest-bound `AuthorityIdentity` values. This capability populates
both from the captured snapshots and the verifier compares them against its
independently supplied captures. L3 implementation begins only after that
correction lands; this seam consumes the amended contract.

## Deferred Behavior

- **Finalization ordering** — actually writing evidence last is L4. This
  capability supplies the eligibility predicate only.
- **Persistence** — where evidence is stored is U11 and the run schema.
- **Observation acquisition** — the artifact surface arrives as immutable
  observation values supplied by the orchestrator (L4); container-level
  observation mechanics are L9.
