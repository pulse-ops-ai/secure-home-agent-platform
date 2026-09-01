# TypeScript 7 Cutover

## Purpose

Define the compatibility audit and observable transition from TypeScript 6.0.3
to the authoritative TypeScript 7.0.2 compiler after lint parity exists.

---

## ADDED Requirements

### Requirement: Cutover audits the complete compiler surface

**Requirement ID:** `REQ-TC-001`

**Canonical authority references:** `AUTH-TS-CONFIGS`, `AUTH-TS-ENTRYPOINTS`,
`AUTH-TS-PINS`

Before cutover, the implementation SHALL mechanically inspect every tracked
TypeScript configuration, configuration inheritance edge, package typecheck and
build script, generator compilation command, direct compiler API import, and
tool that interprets TypeScript options.

Only actual repository incompatibilities SHALL produce migration changes.
Hypothetical removed options not used by the repository SHALL NOT be added as
work.

#### Scenario: A member tsconfig is missed

- **GIVEN** a tracked member or fixture tsconfig exists
- **WHEN** the compatibility audit inventory is generated
- **THEN** omission SHALL fail the audit
- **AND** Scope 2 SHALL remain blocked

#### Scenario: Removed option is not used

- **GIVEN** TypeScript 7 removed or changed an option absent from all repository
  configs
- **WHEN** the migration is planned
- **THEN** no repository change SHALL be manufactured for that option
- **AND** the audit SHALL record it as not applicable if relevant to review

#### Scenario: CLI-output-dependent tooling exists

- **GIVEN** a test or tool parses compiler output or exit behavior
- **WHEN** TypeScript 7 changes that observable output
- **THEN** the compatibility audit SHALL assign it an explicit task and proof
- **AND** compilation success alone SHALL NOT close the finding

### Requirement: TypeScript 7 cutover preserves all compiler behavior

**Requirement ID:** `REQ-TC-002`

**Canonical authority references:** `AUTH-TS-PINS`, `AUTH-TS-CONFIGS`,
`AUTH-TS-ENTRYPOINTS`

Scope 2 SHALL update the normal compiler to TypeScript 7.0.2 and SHALL preserve
successful typecheck, build, declaration output, source/declaration maps,
generator compilation, decorators where currently configured, tsconfig
inheritance, rootDir/outDir resolution, and test-config no-emit behavior.

#### Scenario: Full workspace typecheck and build

- **GIVEN** Scope 1 has completed
- **WHEN** the catalog compiler pin is changed to 7.0.2
- **THEN** every member `typecheck` and `build` command SHALL pass under the
  normal TypeScript package
- **AND** the command evidence SHALL report 7.0.2

#### Scenario: Shared config fixture

- **GIVEN** the shared strictness and output-isolation fixtures
- **WHEN** they compile under TypeScript 7
- **THEN** every existing positive fixture SHALL pass
- **AND** every existing negative strictness fixture SHALL remain rejected for
  the intended compiler behavior

#### Scenario: A build silently switches compiler

- **GIVEN** a package-local or transitive TypeScript copy differs from the
  catalog authority
- **WHEN** a member builds
- **THEN** version-identity validation SHALL fail
- **AND** the build MUST NOT be accepted based only on emitted output

### Requirement: The source-import architecture gate survives cutover

**Requirement ID:** `REQ-TC-003`

**Canonical authority references:** `AUTH-ARCH-IMPORT-GATE`,
`AUTH-TS6-CONSUMERS`

The TypeScript 7 cutover SHALL NOT weaken, suspend, regex-rewrite, replace, or
make informational `scripts/check-source-imports.mjs`. Its source-edge,
non-literal-import, syntax-failure, member-boundary, knowledge-import, package-
layer, and tooling-import behavior SHALL remain operational through the bounded
compatibility API.

#### Scenario: Traditional API is unavailable from TypeScript 7

- **GIVEN** the normal TypeScript 7 export lacks `ScriptKind`,
  `createSourceFile`, `forEachChild`, and related traditional APIs
- **WHEN** the architecture gate loads
- **THEN** it SHALL load the admitted compatibility API
- **AND** the normal compiler authority SHALL remain TypeScript 7

#### Scenario: Parser reports invalid syntax

- **GIVEN** a source file the compatibility parser cannot parse
- **WHEN** the architecture gate scans it
- **THEN** the gate SHALL fail closed with the file and diagnostic
- **AND** it SHALL NOT skip the file or report a partial success

#### Scenario: Architecture-gate behavior drifts during API switch

- **GIVEN** the compatibility seam changes only the imported API package
- **WHEN** the existing positive, negative, hostile, and mutation corpus runs
- **THEN** behavior SHALL remain equivalent
- **AND** a semantic difference SHALL block Scope 1 or Scope 2 as appropriate

#### Scenario: TypeScript 7 accepts syntax parsed by the TS6 seam

- **GIVEN** source syntax accepted by the authoritative TypeScript 7 compiler
- **WHEN** the TS6 compatibility parser evaluates a fixture containing governed
  import edges
- **THEN** it SHALL either extract and classify every edge equivalently or fail
  closed with a syntax diagnostic
- **AND** a forbidden edge MUST NOT disappear through parser recovery or an
  unmodeled TS7 syntax form

### Requirement: Compiler and lint cutover remain distinct

**Requirement ID:** `REQ-TC-004`

**Canonical authority references:** `AUTH-TS-ENTRYPOINTS`, `AUTH-LINT-CONFIG`

`pnpm typecheck` SHALL remain a TypeScript compiler gate. Oxlint's experimental
`--type-check` mode SHALL remain disabled as an authority and SHALL NOT replace,
wrap, or satisfy compiler typechecking.

#### Scenario: Oxlint type-check mode is enabled

- **GIVEN** the selected lint engine supports a type-check option
- **WHEN** repository configuration attempts to enable it as the typecheck gate
- **THEN** authority-boundary validation SHALL fail
- **AND** the independent `tsc --noEmit` gate SHALL remain required

#### Scenario: Typed lint requires type information

- **GIVEN** typed lint uses tsgolint and TypeScript-Go analysis
- **WHEN** `pnpm lint` runs
- **THEN** typed defect policy SHALL execute
- **AND** its success SHALL not claim compiler diagnostic completeness

### Requirement: Rollback does not weaken policy

**Requirement ID:** `REQ-TC-005`

**Canonical authority references:** `AUTH-TS-PINS`, `AUTH-LINT-POLICY`,
`AUTH-LINT-CONFORMANCE`

If TypeScript 7 cutover must be rolled back before merge, the repository SHALL
return atomically to the last green Scope 1 state: TypeScript 6.0.3 authoritative,
both lint engines operational, compatibility seam bounded, and all policy
proofs intact.

#### Scenario: Cutover fails on a supported platform

- **GIVEN** AMD64 passes and ARM64 fails typecheck, build, lint, import checking,
  or tests
- **WHEN** Scope 2 completion is evaluated
- **THEN** cutover SHALL not merge
- **AND** the Scope 1 state SHALL remain the rollback target

## Failure Semantics

| Condition class | Requirement / scenario | Required observable outcome |
|---|---|---|
| change-attributable | used config/entry point incompatible with TS7 | assigned fix plus regression evidence before cutover |
| environmental / operational | compiler/native runner unavailable | platform proof incomplete; do not claim compatibility |
| ambiguous / undecidable | successful emit from an unverified compiler identity | fail identity validation |

## Compatibility

The disposable base audit is feasibility evidence only. Scope 2 SHALL repeat the
mechanical audit against its then-current base because repository configs and
scripts may have changed after PR-A.
