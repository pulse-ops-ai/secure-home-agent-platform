# Toolchain Authority

## Purpose

Define the observable separation among compiler correctness, lint policy,
formatting, architecture governance, and the bounded legacy compiler API.

This document is normative for observable behavior. Exact policy entries,
package inventories, allowlists, and platform matrices belong to the canonical
authorities allocated in `assurance.md`.

---

## ADDED Requirements

### Requirement: One authoritative TypeScript compiler

**Requirement ID:** `REQ-TA-001`

**Canonical authority references:** `AUTH-TS-PINS`, `AUTH-TS-CONFIGS`,
`AUTH-MAINTENANCE-VERIFIER`

At the compiler cutover, the repository SHALL have exactly one authoritative
compiler version: TypeScript 7.0.2 from the normal `typescript` package. Every
ordinary typecheck, build, generator compilation, and shared-tsconfig fixture
SHALL use that compiler.

The compatibility package SHALL NOT become an alternate compiler authority and
its `tsc6` binary SHALL NOT be used by repository `typecheck`, `build`, or
generator entry points.

After that initial cutover, the repository SHALL continue to have exactly one
exact normal compiler pin. A later exact TypeScript version MAY replace 7.0.2
without changing compiler authority only through the predecessor-bound
maintenance behavior in `REQ-SC-006` and the trusted execution boundary in
`REQ-SC-007`. Changing the authority from the normal `typescript` package to
`tsc6`, a lint type-check mode, or another implementation outside that contract
SHALL require architecture review.

#### Scenario: Scope 1 keeps the current compiler authority

- **GIVEN** the parity foundation is being implemented before cutover
- **WHEN** `pnpm typecheck` and `pnpm build` run
- **THEN** the normal `typescript` package SHALL remain TypeScript 6.0.3
- **AND** the compatibility package MAY serve only its admitted API consumers

#### Scenario: Scope 2 establishes TypeScript 7 authority

- **GIVEN** Scope 1 parity and platform proof are complete
- **WHEN** the compiler cutover lands
- **THEN** the normal `typescript` package SHALL resolve exactly to 7.0.2
- **AND** every ordinary compiler entry point SHALL report and execute 7.0.2

#### Scenario: A second compiler authority is introduced

- **GIVEN** the cutover has landed
- **WHEN** any `typecheck`, `build`, or generator command invokes `tsc6`, an
  unstable TypeScript API compiler path, or another compiler version
- **THEN** repository validation SHALL fail
- **AND** the result MUST NOT be accepted merely because both compilers pass

#### Scenario: A later TypeScript security update preserves compiler authority

- **GIVEN** the Scope 2 cutover to 7.0.2 has completed
- **AND** a later exact TypeScript version is proposed as a security maintenance
  update
- **WHEN** the normal package remains the sole compiler and the trusted-
  predecessor compiler-policy, conformance, platform, installation, and
  architecture protections remain unchanged
- **THEN** the exact compiler pin MAY advance without a new authority decision
- **AND** the complete compiler maintenance proof SHALL still be required

### Requirement: Toolchain authorities remain separate

**Requirement ID:** `REQ-TA-002`

**Canonical authority references:** `AUTH-LINT-POLICY`, `AUTH-FORMAT-POLICY`,
`AUTH-ARCH-LAYERS`, `AUTH-ARCH-IMPORT-GATE`, `AUTH-TS-CONFIGS`

The repository SHALL maintain distinct authorities for:

- compiler diagnostics and emitted TypeScript output;
- typed and static lint policy;
- formatting;
- package/source architectural direction; and
- compatibility access to the traditional TypeScript API.

One authority's success SHALL NOT substitute for another authority's execution.
Sharing parser technology SHALL NOT merge the lint and architecture gates.

#### Scenario: Lint passes but typecheck fails

- **GIVEN** source that satisfies lint policy but violates a TypeScript compiler
  diagnostic
- **WHEN** repository validation runs
- **THEN** the typecheck gate SHALL fail independently
- **AND** a green `pnpm lint` SHALL NOT satisfy or suppress that failure

#### Scenario: Typecheck passes but lint policy fails

- **GIVEN** type-correct source containing a governed lint defect
- **WHEN** repository validation runs
- **THEN** the lint gate SHALL fail independently
- **AND** compiler success SHALL NOT classify the policy as satisfied

#### Scenario: Architecture and lint use related parser technology

- **GIVEN** the source-import gate uses the TypeScript 6 compatibility API and
  typed lint uses TypeScript-Go through tsgolint
- **WHEN** either implementation changes
- **THEN** `check-source-imports.mjs` SHALL still run as an independent
  repository-owned gate
- **AND** lint success SHALL NOT imply architectural dependency-direction success

### Requirement: Lint engines are replaceable implementations

**Requirement ID:** `REQ-TA-003`

**Canonical authority references:** `AUTH-LINT-POLICY`, `AUTH-LINT-CONFORMANCE`,
`AUTH-ENGINE-PINS`, `AUTH-MAINTENANCE-CLASSES`,
`AUTH-MAINTENANCE-VERIFIER`

The lint policy SHALL be owned by a repository-controlled machine-readable
contract. ESLint, Oxlint, tsgolint, and any future linter SHALL be replaceable
implementations of that contract rather than architectural authorities.

A tooling implementation MAY be upgraded or substituted for security
remediation without reopening the architectural decision only when the same
policy-conformance, installation, and platform proofs pass through the
candidate-independent trusted maintenance boundary.

#### Scenario: Oxlint receives a security advisory

- **GIVEN** the selected Oxlint version requires remediation
- **WHEN** a newer Oxlint version or replacement engine is proposed
- **THEN** it SHALL execute the same positive and negative policy corpus
- **AND** every canonical policy entry SHALL retain an enforcing disposition
- **AND** frozen-install and supported-platform proof SHALL pass before adoption
- **AND** the candidate's checker or workflow SHALL NOT decide that these
  conditions were satisfied

#### Scenario: A replacement cannot express a required policy

- **GIVEN** a canonical policy entry has no equivalent enforcement in the
  proposed replacement, compiler, or dedicated repository gate
- **WHEN** the replacement is evaluated
- **THEN** the migration SHALL stop
- **AND** the existing enforcing engine SHALL remain
- **AND** the policy entry MUST NOT be dropped, warned-only, or made informational

#### Scenario: A future policy requires ESLint

- **GIVEN** an accepted policy cannot be expressed by the selected engine
- **WHEN** executable evidence proves ESLint is the safest conforming engine
- **THEN** ESLint MAY be reintroduced as an implementation
- **AND** the repository-owned policy SHALL remain the authority

### Requirement: Traditional TypeScript API use is bounded

**Requirement ID:** `REQ-TA-004`

**Canonical authority references:** `AUTH-TS6-CONSUMERS`, `AUTH-ARCH-IMPORT-GATE`

`@typescript/typescript6` MAY be imported only from explicitly admitted
repository-tooling locations. The initial allowlist SHALL contain only
`scripts/check-source-imports.mjs` unless repository evidence identifies another
existing direct traditional-API consumer before Scope 1 begins.

The compatibility package SHALL NOT be imported by an application, service,
agent adapter, reusable library, test helper, or arbitrary new script.

#### Scenario: The admitted source-import gate uses the compatibility API

- **GIVEN** TypeScript 7 is the normal compiler
- **WHEN** `scripts/check-source-imports.mjs` parses repository source
- **THEN** it SHALL use the compatibility API
- **AND** it SHALL preserve its current fail-closed behavior and architecture
  semantics

#### Scenario: An application imports the compatibility package

- **GIVEN** a source file outside the admitted tooling set imports
  `@typescript/typescript6`
- **WHEN** repository validation runs
- **THEN** validation SHALL fail with the offending path
- **AND** no package-layer or devDependency classification SHALL exempt it

#### Scenario: The compatibility import cannot be resolved

- **GIVEN** the admitted gate cannot load or parse through the compatibility API
- **WHEN** the architecture check runs
- **THEN** the check SHALL fail
- **AND** it MUST NOT fall back to regex scanning, skip files, or report success

### Requirement: Implementation is scope-reviewed and externally authorized

**Requirement ID:** `REQ-TA-005`

**Canonical authority references:** `AUTH-REVIEW-SCOPES`

The parity foundation and compiler cutover SHALL be independently releasable
scopes. Each SHALL receive a fresh governed-spec-driven-v2 review epoch
immediately before its first implementation or authority mutation, and each
SHALL have explicit external implementation authorization.

ADR-0022 acceptance SHALL occur in a dedicated acceptance-only vehicle (PR-A2)
that lands between planning (PR-A) and the first implementation scope (PR-B).
PR-A2 SHALL contain no implementation, SHALL be separately owner-authorized and
independently reviewed, SHALL be bound to the exact accepted ADR byte digest,
SHALL transition ADR-0022 `Proposed -> Accepted` only, and SHALL update the ADR
status, `docs/decisions/INDEX.md`, and the current-state mirrors atomically.
PR-A2 SHALL NOT by itself authorize PR-B. Scope 1 (PR-B) SHALL begin only from
the exact post-PR-A2 `main` commit and only after a separate external
implementation authorization, and SHALL NOT begin while ADR-0022 is `Proposed`.

#### Scenario: Scope 1 has no accepted review or implementation authority

- **GIVEN** this planning package lacks a current `ARCHITECTURE_ACCEPTED` review
  or the Proposed ADR remains unaccepted
- **WHEN** Scope 1 implementation is considered
- **THEN** its status SHALL be `NOT_AUTHORIZED`
- **AND** no dependency, configuration, source, or CI implementation edit may begin

#### Scenario: Scope 1 is attempted while ADR-0022 is Proposed

- **GIVEN** ADR-0022 has not yet been accepted through PR-A2
- **WHEN** Scope 1 (PR-B) implementation is attempted
- **THEN** the work SHALL be refused
- **AND** the acceptance-only PR-A2 transition SHALL be required first

#### Scenario: PR-A2 performs the acceptance-only transition

- **GIVEN** the planning package and Proposed ADR-0022 are merged on `main`
- **WHEN** the owner-authorized, independently reviewed PR-A2 lands
- **THEN** it SHALL change only ADR-0022 `Proposed -> Accepted` and the required
  index/current-state mirrors atomically, bound to the exact accepted ADR byte
  digest
- **AND** it SHALL introduce no implementation and SHALL NOT by itself authorize
  PR-B

#### Scenario: Scope 2 is attempted before Scope 1 completes

- **GIVEN** the dual-engine parity scope is not merged and accepted
- **WHEN** TypeScript 7 cutover or ESLint retirement is attempted
- **THEN** the work SHALL be refused
- **AND** the Scope 2 review epoch SHALL NOT be treated as satisfied

## Failure Semantics

| Condition class | Requirement / scenario | Required observable outcome |
|---|---|---|
| change-attributable | a second compiler authority or unapproved TS6 import | deterministic repository failure |
| environmental / operational | compatibility package, engine, or review tooling unavailable | fail closed; no substitute success |
| ambiguous / undecidable | policy mapping or authorization cannot be established | retain existing enforcement and report `NOT_AUTHORIZED` / blocked |

## Compatibility

`pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm run check:imports` remain
stable conceptual entry points. Their implementation may change only within the
authority boundaries above.

## Deferred Behavior

| Behavior | Due landing / task | Reason deferred | Current-scope boundary |
|---|---|---|---|
| removal of `@typescript/typescript6` | future separately governed lifecycle change | TypeScript 7 stable API equivalence is not established | compatibility dependency remains bounded and non-authoritative |
