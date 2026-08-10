# runner-verification

## Purpose

Amendment (directed by the delta review on PR #62, closing L3's Q1): the
path-policy contract's prohibited rules become typed structured rules with a
closed rule-kind vocabulary, so no consumer ever invents matching semantics
over opaque strings.

This document is normative. It defines WHAT must hold, authored as a
**delta** against the canonical `runner-verification` spec. Implementation
architecture belongs in `design.md`; proof strategy belongs in
`assurance.md`.

---

## MODIFIED Requirements

### Requirement: Policies and packs are declarative references

The path-policy contract SHALL express allowed write roots, prohibited
rules, and size bounds as data. The verification-pack contract SHALL
reference gates only by registry identity — a pack SHALL NOT declare an
executable, argv, environment, or network.

Prohibited rules SHALL be **typed structured rules** drawn from a closed,
platform-owned rule-kind vocabulary — never opaque strings whose meaning a
consumer must invent. The initial vocabulary is exactly one kind:
`path_prefix`, a normalized repository-relative path prefix. The rule shape
SHALL make non-normalized forms structurally unrepresentable: a wildcard, a
traversal segment, an absolute prefix, or a scheme cannot exist as rule
data. Extending the rule language is a new kind in a new contract version,
never a reinterpretation of existing rule data.

#### Scenario: Pack cannot smuggle a command

- **GIVEN** the verification-pack type
- **WHEN** its shape is examined
- **THEN** it contains gate-identity references only; no executable or argv
  field exists

#### Scenario: An untyped or unknown rule form is unrepresentable

- **GIVEN** a path policy whose prohibited rules include a bare string, an
  unknown rule kind, or a `path_prefix` carrying a wildcard, traversal
  segment, absolute prefix, or scheme
- **WHEN** the contract validates it
- **THEN** validation fails naming the offending rule
- **AND** no consumer ever receives a rule it must interpret heuristically

#### Scenario: A typed prefix rule validates and survives generation

- **GIVEN** a path policy whose prohibited rules are typed `path_prefix`
  rules with normalized repository-relative prefixes
- **WHEN** the contract validates it and JSON Schema is generated
- **THEN** validation succeeds
- **AND** the generated schema constrains the rule kind to the closed
  vocabulary and the prefix to the normalized form
