# Lint Policy Parity

## Purpose

Define the complete, executable proof required before replacing the current lint
engine. The repository owns policy; engine registration or a green happy-path
run is not parity evidence.

---

## ADDED Requirements

### Requirement: Every current lint policy has one disposition

**Requirement ID:** `REQ-LP-001`

**Canonical authority references:** `AUTH-LINT-POLICY`,
`AUTH-LINT-ENGINE-MAPPINGS`, `AUTH-LEGACY-EXTRACTOR`

Before replacement enforcement can be trusted, every effective rule and
role-specific difference from current `main` SHALL appear exactly once in the
canonical lint-policy inventory with exactly one disposition:

- `MIGRATED_TO_NEW_LINT_ENGINE`;
- `REPLACED_BY_TYPESCRIPT_COMPILER`; or
- `REPLACED_BY_DEDICATED_REPOSITORY_GATE`.

No entry may be `DROPPED`, omitted, inferred from an engine default, or owned by
review prose. The inventory SHALL be derived and drift-checked against the
resolved current ESLint configurations while ESLint exists.

Stable policy identity, role applicability, semantic options, blocking posture,
and proof references SHALL be engine-neutral. ESLint origin and Oxlint/tsgolint
rule or parser mappings SHALL live in separate per-engine mapping authority.
Historical ESLint origin MAY remain as migration provenance for current rows but
SHALL NOT be a mandatory permanent identity for a policy introduced after this
migration.

#### Scenario: Inherited preset rule is omitted

- **GIVEN** a rule enabled through `@eslint/js` or
  `typescript-eslint` recommended configuration
- **WHEN** the canonical inventory omits it
- **THEN** the legacy-extraction drift check SHALL fail
- **AND** Scope 1 SHALL remain incomplete

#### Scenario: A policy entry has no disposition

- **GIVEN** an inventory entry without exactly one governed disposition
- **WHEN** the policy validator runs
- **THEN** validation SHALL fail
- **AND** no replacement configuration may be generated

#### Scenario: The current engine changes before parity is complete

- **GIVEN** an ESLint rule, option, role override, or ignore pattern changes
- **WHEN** Scope 1 validation runs
- **THEN** the extracted current policy SHALL differ from the inventory
- **AND** the change SHALL require explicit policy reconciliation rather than
  silently using the stale inventory

#### Scenario: Engine mapping is mistaken for semantic policy

- **GIVEN** a stable policy row and its fixture corpus are unchanged
- **WHEN** the selected engine implementation or rule identifier changes
- **THEN** only the per-engine mapping and generated projection MAY change
- **AND** the stable policy identity, semantics, role applicability, blocking
  posture, and proof references SHALL remain unchanged

### Requirement: Scope 1 runs both legacy and replacement enforcement

**Requirement ID:** `REQ-LP-002`

**Canonical authority references:** `AUTH-LINT-POLICY`,
`AUTH-LINT-ENGINE-MAPPINGS`, `AUTH-LINT-CONFORMANCE`,
`AUTH-LEGACY-EXTRACTOR`, `AUTH-ENGINE-PINS`

Scope 1 SHALL keep TypeScript 6.0.3, ESLint, and typescript-eslint operational
while introducing Oxlint plus tsgolint. The legacy and replacement paths SHALL
both execute and both SHALL be blocking.

#### Scenario: Valid corpus is evaluated

- **GIVEN** the complete valid lint corpus for every governed role
- **WHEN** Scope 1 lint runs
- **THEN** both legacy and replacement engines SHALL accept it

#### Scenario: Governed defect is evaluated

- **GIVEN** a negative fixture assigned to a canonical policy entry
- **WHEN** Scope 1 lint runs
- **THEN** both legacy and replacement enforcement SHALL reject it for the
  intended policy
- **AND** an unrelated parse or configuration failure SHALL NOT count as parity

#### Scenario: One engine is skipped

- **GIVEN** Scope 1 is active
- **WHEN** either the legacy or replacement command does not execute
- **THEN** `pnpm lint` and the parity check SHALL fail
- **AND** the scope MUST NOT be reported complete

### Requirement: Parity is fixture-level and complete

**Requirement ID:** `REQ-LP-003`

**Canonical authority references:** `AUTH-LINT-POLICY`,
`AUTH-LINT-ENGINE-MAPPINGS`, `AUTH-LINT-CONFORMANCE`

Every policy entry SHALL reference executable positive and negative evidence.
Multiple entries MAY share a fixture only when the canonical mapping names each
expected disposition and the harness proves the intended policy rather than any
arbitrary failure.

Configuration-string assertions, rule registration, help output, and successful
lint of the repository SHALL be supporting evidence only, never sufficient
parity proof.

Every active policy SHALL remain blocking. A warning-only diagnostic SHALL NOT
count as rejection. Where an existing policy option controls observable fix
output rather than only accept/reject behavior, the conformance corpus SHALL
include the corresponding deterministic fixed-output evidence.

#### Scenario: A rule name registers but its semantics differ

- **GIVEN** both engines accept a rule identifier
- **WHEN** the negative fixture is accepted by one engine or rejected for an
  unrelated reason
- **THEN** parity SHALL fail
- **AND** the policy SHALL remain enforced by the legacy engine

#### Scenario: Fixture mapping is missing

- **GIVEN** a canonical policy entry without its required proof reference
- **WHEN** the conformance harness loads the inventory
- **THEN** the harness SHALL fail before invoking either engine

#### Scenario: Deliberate mutation removes enforcement

- **GIVEN** a mutation disables, renames, or drops a policy mapping
- **WHEN** the conformance suite runs
- **THEN** at least one assigned negative fixture or drift check SHALL fail
- **AND** the mutation MUST NOT survive because another unrelated rule rejects
  the file

#### Scenario: A policy is downgraded to warning-only

- **GIVEN** an active policy whose current severity is blocking
- **WHEN** an engine mapping emits only a warning and exits successfully
- **THEN** parity SHALL fail
- **AND** the presence of the warning text SHALL NOT count as enforcement

#### Scenario: A fix-bearing option changes output

- **GIVEN** an existing policy option that selects deterministic fix behavior
- **WHEN** the replacement emits a different fixed form
- **THEN** its fixed-output conformance case SHALL fail
- **AND** ordinary violation detection SHALL NOT be treated as proof of option
  parity

### Requirement: Role-specific behavior is preserved

**Requirement ID:** `REQ-LP-004`

**Canonical authority references:** `AUTH-LINT-POLICY`, `AUTH-MEMBER-ROLES`

The replacement SHALL preserve the current distinctions among library, service,
application, exported test role, JavaScript/config files, and the coding-adapter
process entry. It SHALL preserve current ignore behavior, Node globals, ESM
posture, framework neutrality, and the absence of formatting policy.

The exported test role and actual member-role assignment SHALL be modeled as
separate facts; the existence of `/test` SHALL NOT imply that every current test
file consumes that export.

#### Scenario: Library reads process state

- **GIVEN** production library source reads `process`, `process.env`, or calls
  `process.exit`
- **WHEN** lint runs
- **THEN** it SHALL fail under the library role

#### Scenario: Service composition root reads configuration

- **GIVEN** equivalent process access in a service composition root
- **WHEN** lint runs
- **THEN** it MAY pass the library-only process restriction
- **AND** all shared static and typed rules SHALL remain active

#### Scenario: Coding adapter process entry uses process IO

- **GIVEN** the one admitted `src/bin.ts` entry for a coding adapter
- **WHEN** it performs its declared process-boundary work
- **THEN** process and console exceptions MAY apply only to that path
- **AND** the package's translation core SHALL retain library restrictions

#### Scenario: Framework-specific rule is introduced by migration

- **GIVEN** no accepted policy change adding a NestJS, Next.js, React, Zod, or
  provider-specific lint rule
- **WHEN** the replacement config is generated
- **THEN** the framework-neutrality guard SHALL fail if such a rule appears

#### Scenario: Deliberately-invalid fixture or generated output is scanned

- **GIVEN** a path matching the canonical ignore policy
- **WHEN** lint discovers files
- **THEN** it SHALL be excluded consistently by both engines during Scope 1

### Requirement: Engine defaults cannot become policy

**Requirement ID:** `REQ-LP-005`

**Canonical authority references:** `AUTH-LINT-POLICY`,
`AUTH-LINT-ENGINE-MAPPINGS`, `AUTH-LINT-CONFIG`

All lint categories and rules SHALL be explicitly derived from the canonical
policy inventory. Engine default categories, newly added default rules, ambient
configuration, nested configuration, and global installations SHALL NOT add,
remove, or weaken repository policy.

#### Scenario: New engine version enables a default rule

- **GIVEN** an engine upgrade adds a default diagnostic not present in the
  canonical inventory
- **WHEN** the generated configuration and conformance suite run
- **THEN** that default SHALL remain non-authoritative and disabled
- **AND** adopting it as policy SHALL require a separate reviewed policy change

#### Scenario: Global binary differs from the catalog pin

- **GIVEN** an ambient Oxlint or TypeScript installation exists
- **WHEN** repository lint/typecheck commands execute
- **THEN** they SHALL resolve the workspace-pinned implementation
- **AND** version identity checks SHALL fail on mismatch

### Requirement: ESLint retirement is conditional and atomic

**Requirement ID:** `REQ-LP-006`

**Canonical authority references:** `AUTH-LINT-POLICY`, `AUTH-LINT-CONFORMANCE`,
`AUTH-MEMBER-ROLES`, `AUTH-ENGINE-PINS`

ESLint, `@eslint/js`, `typescript-eslint`, `globals`, and
`packages/eslint-config` SHALL remain until Scope 1 parity is complete and
reviewed. Scope 2 SHALL remove them atomically with replacement member lint
entry points, policy-package documentation, and regression guards.

#### Scenario: One policy lacks replacement parity

- **GIVEN** any canonical policy entry is unproven or nonconforming
- **WHEN** Scope 2 retirement is proposed
- **THEN** ESLint SHALL remain installed and blocking
- **AND** retirement SHALL fail its completion gate

#### Scenario: Retirement is complete

- **GIVEN** every policy entry and role has accepted parity evidence on required
  platforms
- **WHEN** Scope 2 lands
- **THEN** no manifest, lockfile entry, config import, member script, or test may
  depend on the retired ESLint implementation
- **AND** `pnpm lint` SHALL continue to enforce the canonical policy

## Failure Semantics

| Condition class | Requirement / scenario | Required observable outcome |
|---|---|---|
| change-attributable | missing policy, role, fixture, mapping, or dual-engine invocation | fail Scope 1/2 deterministically |
| environmental / operational | an engine or typed backend cannot run | lint failure; never policy success |
| ambiguous / undecidable | diagnostic cannot be attributed to intended policy | parity unproven; keep legacy enforcement |

## Compatibility

The existing accepted/rejected behavior is the compatibility target. Diagnostic
wording and rule identifiers MAY differ when the canonical mapping and fixtures
prove the same policy outcome.

## Deferred Behavior

| Behavior | Due landing / task | Reason deferred | Current-scope boundary |
|---|---|---|---|
| adding new Oxlint-only policy | separate future governed policy change | migration must not smuggle policy expansion | explicit current policy only |
