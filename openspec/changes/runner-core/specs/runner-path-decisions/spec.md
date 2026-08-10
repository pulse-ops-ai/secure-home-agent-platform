# runner-path-decisions

## Purpose

Trusted decisions about where a run may write, which material a run may never
touch, and what happens when a declared bound is exceeded.

This capability owns the **data and path** side of "a run cannot alter what
judges it". It does not own filesystem enforcement — no mount, no chroot, no
container — which is L9, nor orchestration provenance, which is L4.

This document is normative. It defines WHAT must hold, authored as a **delta**
against the main spec. Implementation architecture belongs in `design.md`;
proof strategy belongs in `assurance.md`.

---

## ADDED Requirements

### Requirement: Write eligibility derives from captured policy alone

The trusted core SHALL decide whether a proposed change set may be materialized
using only the captured path-policy snapshot and the host-observed change set.
A path SHALL be eligible only when it resolves under a declared allowed write
root after normalization, and SHALL be ineligible otherwise.

#### Scenario: A path under an allowed root is eligible

- **GIVEN** a captured path policy declaring an allowed write root
- **AND** an observed change whose normalized path resolves under that root
- **WHEN** write eligibility is decided
- **THEN** the path is eligible

#### Scenario: A path outside every allowed root refuses

- **GIVEN** an observed change whose normalized path resolves under no declared
  allowed write root
- **WHEN** write eligibility is decided
- **THEN** materialization is refused with the offending path named
- **AND** the change is not silently dropped from the change set

### Requirement: Paths are decided after normalization, and escapes refuse

Every path decision SHALL be taken on a normalized form. Normalization SHALL
resolve relative segments and reject a path that escapes its declared root.
Where the host observation reports that a path is reached through a link or an
alias whose target lies outside its declared root, the decision SHALL refuse.
A path whose normalized form cannot be established SHALL refuse.

#### Scenario: Traversal outside a root refuses

- **GIVEN** an observed path containing relative segments whose normalized form
  resolves outside every allowed write root
- **WHEN** the path decision is taken
- **THEN** materialization is refused with the pre-normalization and normalized
  forms both recorded

#### Scenario: An alias escaping its root refuses

- **GIVEN** a host observation reporting a path reached through a link whose
  target resolves outside its declared root
- **WHEN** the path decision is taken
- **THEN** materialization is refused with the path and its reported target
  named

#### Scenario: An undecidable path refuses

- **GIVEN** an observed path whose normalized form cannot be established
- **WHEN** the path decision is taken
- **THEN** materialization is refused recording that normalization was
  undecidable
- **AND** the path is never treated as eligible

### Requirement: Governing material is never writable by the run

The material that governs or judges a run SHALL be ineligible for
materialization regardless of the allowed write roots. A change set touching
any of it SHALL refuse materialization **entirely**, and the violation SHALL be
recorded rather than the offending change being dropped.

Protected material comprises, at minimum: the captured authority inputs and
their sources; the path policy; the gate registry; the governing instruction
files; and the run's own evidence.

#### Scenario: A protected-path write refuses the whole change set

- **GIVEN** an observed change set containing one change to protected material
  and several eligible changes
- **WHEN** materialization eligibility is decided
- **THEN** materialization is refused entirely
- **AND** the protected path is named in the refusal
- **AND** no subset of the change set is reported as materializable

#### Scenario: Protection outranks an allowed write root

- **GIVEN** a captured path policy whose allowed write root would otherwise
  admit a protected path
- **WHEN** materialization eligibility is decided
- **THEN** the protected-path refusal wins
- **AND** the conflict between the declared root and the protection is recorded

#### Scenario: Evidence derivation is unaffected by attempted writes

- **GIVEN** an observed change set that attempts to write where evidence is
  assembled
- **WHEN** evidence is derived
- **THEN** the derivation uses only captured snapshots and host observation
- **AND** the attempted write appears as a recorded violation, never as input
  to the derivation

### Requirement: Security-relevant bounds refuse, never truncate

Where a declared bound protects a security property — file count, total bytes,
per-file bytes, or any later-declared bound — an input exceeding it SHALL be
refused with the bound and the observed value recorded. No interface SHALL
expose a truncating, sampling, or best-effort mode for such a bound.

#### Scenario: An over-bound change set refuses

- **GIVEN** an observed change set exceeding a declared bound
- **WHEN** the bound is enforced
- **THEN** the decision is a refusal recording the bound and the observed value
- **AND** no truncated variant of the change set proceeds

#### Scenario: Truncation is unrepresentable

- **GIVEN** the public interface of the path decisions
- **WHEN** it is examined
- **THEN** no parameter, option, or return shape expresses a truncated,
  sampled, or partial result for a security-relevant bound

#### Scenario: Exactly at the bound proceeds

- **GIVEN** an observed change set whose measured value equals its declared
  bound
- **WHEN** the bound is enforced
- **THEN** the decision proceeds
- **AND** the boundary case is decided identically on repeated evaluation

---

## Failure Semantics

| Condition | Required outcome | Classification |
|---|---|---|
| Path resolves outside every allowed write root | refuse materialization, path named | change-attributable |
| Path touches protected governing material | refuse the whole change set, path named | change-attributable |
| Path normalization cannot be established | refuse, undecidability recorded | fail-closed |
| Declared bound exceeded | refuse, bound and observed value named | change-attributable |
| Host observer reports the workspace unreadable | operational failure | operational |

A refusal never silently drops the offending change, and an undecidable path is
never eligible.

## Compatibility

Additive. The capability consumes `PathPolicy` as amended by the **landed**
`runner-contract-corrections` change (directed by the delta review closing
Q1; implemented in PR #65, canonical since PR #66): prohibited rules are
**typed structured rules** with a closed kind vocabulary, so the rule
language is fixed by the L2 contract and this capability interprets no
opaque strings. Matching semantics for the `path_prefix` kind are stated in
`design.md` D8. A policy whose bytes fail contract validation refuses at
capture; a rule whose kind lies outside the core's implemented vocabulary —
possible only if a future contract version adds one — SHALL refuse the
policy rather than be skipped.

## Deferred Behavior

- **Filesystem enforcement** — mounts, postures, and container isolation are
  L9. This capability decides; it never enforces.
- **Orchestration provenance** — that modified orchestration bytes never
  execute as decision-bearing logic is the code side of the same invariant and
  is owned by L4.
- **Materialization itself** — applying an eligible change set is L4.
