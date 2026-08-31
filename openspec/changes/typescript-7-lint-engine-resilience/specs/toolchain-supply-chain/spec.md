# Toolchain Supply Chain

## Purpose

Define deterministic installation, native-platform execution, and vulnerability-
response behavior for the compiler and lint toolchain.

---

## ADDED Requirements

### Requirement: Toolchain versions and resolution are exact

**Requirement ID:** `REQ-SC-001`

**Canonical authority references:** `AUTH-ENGINE-PINS`, `AUTH-TS-PINS`,
`AUTH-INSTALL-POLICY`

Selected compiler, lint, typed-lint, and compatibility packages SHALL be pinned
exactly in the pnpm catalog and resolved by the frozen lockfile. `latest`, ranges,
ambient global binaries, and unreviewed transitive substitution SHALL NOT be
accepted as repository identity.

The initial audited implementation versions are TypeScript 7.0.2, Oxlint 1.80.0,
`oxlint-tsgolint` 7.0.2001, and `@typescript/typescript6` 6.0.2. The compatibility
wrapper's resolved TypeScript 6 API version SHALL also be recorded and checked by
executable evidence.

#### Scenario: Frozen install resolves the audited graph

- **GIVEN** an empty `node_modules` and the committed lockfile
- **WHEN** `pnpm install --frozen-lockfile` runs
- **THEN** the installed package and native-platform versions SHALL match the
  committed identities
- **AND** no lockfile mutation SHALL occur

#### Scenario: Catalog uses a range or latest

- **GIVEN** any selected tool declaration is changed to a range, tag, or
  non-catalog version
- **WHEN** dependency governance runs
- **THEN** validation SHALL fail

#### Scenario: Compatibility wrapper resolves a different TS6 API

- **GIVEN** `@typescript/typescript6` reexports a TS6 dependency selected through
  its package dependency
- **WHEN** the frozen graph is validated
- **THEN** the actual `ts.version` SHALL match the expected locked identity
- **AND** drift SHALL require a reviewed dependency update and conformance run

### Requirement: Install-script prohibition remains intact

**Requirement ID:** `REQ-SC-002`

**Canonical authority references:** `AUTH-INSTALL-POLICY`

`onlyBuiltDependencies: []` SHALL remain the repository install policy. The
migration SHALL NOT add a lifecycle-script exception merely because a selected
package fails to install.

Before any exception is considered, implementation SHALL identify the package,
script, reason, trust consequence, and whether published platform packages avoid
scripts. An exception requires its own explicit review and is not authorized by
this change.

#### Scenario: Exact audited packages install without scripts

- **GIVEN** the selected exact versions and an empty install tree
- **WHEN** frozen installation runs with `onlyBuiltDependencies: []`
- **THEN** installation SHALL succeed without executing or approving lifecycle
  scripts

#### Scenario: A future engine introduces an install script

- **GIVEN** an upgrade or replacement declares or requires a lifecycle script
- **WHEN** dependency validation runs
- **THEN** adoption SHALL stop
- **AND** no automatic approval, allowlist mutation, or bypass flag SHALL be
  introduced under this change

### Requirement: Required Linux architectures execute the toolchain

**Requirement ID:** `REQ-SC-003`

**Canonical authority references:** `AUTH-PLATFORM-MATRIX`, `AUTH-ENGINE-PINS`,
`AUTH-INSTALL-POLICY`

Before Scope 1 and Scope 2 are complete, native Linux AMD64 and native Linux
ARM64 environments SHALL each prove frozen install and the commands owned by
that scope. Package metadata, tarball architecture, or cross-compilation alone
SHALL NOT count as execution proof.

Scope 1 SHALL prove both lint engines, typed lint, typecheck under TypeScript 6,
the compatibility-backed architecture gate, and tests. Scope 2 SHALL prove
TypeScript 7 typecheck/build, replacement lint, the compatibility-backed
architecture gate, and tests.

#### Scenario: Only AMD64 executes

- **GIVEN** package manifests publish ARM64 artifacts but no ARM64 runner executes
  them
- **WHEN** scope completion is evaluated
- **THEN** platform proof SHALL remain incomplete
- **AND** the scope SHALL not merge as complete

#### Scenario: Native ARM64 hosted runner executes

- **GIVEN** the repository's existing GitHub-hosted trust model and the standard
  `ubuntu-24.04-arm` runner
- **WHEN** the required matrix job runs
- **THEN** the same frozen install and scope commands SHALL execute natively
- **AND** no self-hosted runner or new infrastructure authority SHALL be inferred

#### Scenario: One native optional package is absent

- **GIVEN** the lockfile lacks the selected engine's required platform artifact
  for AMD64 or ARM64
- **WHEN** the platform job installs or executes
- **THEN** it SHALL fail rather than fall back to a downloaded ambient binary or
  skip typed lint

### Requirement: Vulnerability response preserves policy authority

**Requirement ID:** `REQ-SC-004`

**Canonical authority references:** `AUTH-LINT-POLICY`,
`AUTH-LINT-ENGINE-MAPPINGS`, `AUTH-LINT-CONFORMANCE`,
`AUTH-INSTALL-POLICY`, `AUTH-PLATFORM-MATRIX`,
`AUTH-MAINTENANCE-CLASSES`

Dependency vulnerability response SHALL classify tooling by exposure:

- runtime production dependency;
- CI/build parser that consumes pull-request-controlled bytes; or
- local-only development utility with no untrusted-input path.

A development dependency in the second class SHALL be treated as security-
relevant. No response SLA is created by this requirement.

#### Scenario: Parser dependency has a security advisory

- **GIVEN** TypeScript, Oxlint, tsgolint, the compatibility parser, or another
  PR-byte parser receives an advisory
- **WHEN** remediation changes or replaces it
- **THEN** positive fixtures, negative fixtures, supported-platform execution,
  frozen install, install-script policy, and authority separation SHALL all pass
- **AND** no canonical policy entry may disappear
- **AND** maintenance classification SHALL prove the protected contract matches
  a trusted predecessor rather than only the candidate's own reduced corpus

#### Scenario: Local-only utility advisory

- **GIVEN** a tooling package has no path to production or untrusted repository
  bytes
- **WHEN** it is assessed
- **THEN** it MAY be classified separately from a CI parser
- **AND** the classification SHALL be evidence-based rather than inferred from
  `devDependency` placement alone

### Requirement: Implementation versions may change without changing policy

**Requirement ID:** `REQ-SC-005`

**Canonical authority references:** `AUTH-ENGINE-PINS`, `AUTH-LINT-POLICY`,
`AUTH-LINT-ENGINE-MAPPINGS`, `AUTH-LINT-CONFORMANCE`,
`AUTH-MAINTENANCE-CLASSES`

A reviewed package-version update or engine substitution MAY occur without a new
architecture decision when it preserves the accepted authority model, is
admitted by the predecessor-bound maintenance class, and passes the complete
executable contract.

The initial Scope 2 compiler identity is TypeScript 7.0.2. A later exact version
of the normal `typescript` package MAY replace it as compiler maintenance when
the compiler authority remains the normal package and protected compiler-policy
and conformance inputs match the trusted predecessor. Replacing the compiler
authority with `tsc6`, lint type-check mode, or another authority is not a
package-version update.

A change to semantic policy, authority allocation, trust boundary,
supported-platform set, install-script posture, or compiler authority SHALL
require the appropriate architecture or policy review.

#### Scenario: Patch upgrade preserves the contract

- **GIVEN** a new exact engine version
- **WHEN** the trusted-predecessor maintenance comparison admits only the
  class-specific pin/mapping/projection changes
- **AND** all policy, install, platform, and authority proofs pass unchanged
- **THEN** the update MAY proceed as an implementation/security-maintenance
  change

#### Scenario: Upgrade requires removing a policy

- **GIVEN** a new engine version cannot satisfy a canonical policy entry
- **WHEN** adoption is evaluated
- **THEN** it SHALL be rejected under this contract
- **AND** policy removal SHALL require a separate explicit policy decision

### Requirement: Maintenance substitutions are predecessor-bound

**Requirement ID:** `REQ-SC-006`

**Canonical authority references:** `AUTH-MAINTENANCE-CLASSES`,
`AUTH-LINT-POLICY`, `AUTH-LINT-ENGINE-MAPPINGS`,
`AUTH-LINT-CONFORMANCE`, `AUTH-TS-CONFIGS`, `AUTH-TS-CONFORMANCE`,
`AUTH-TS6-CONSUMERS`, `AUTH-FORMAT-POLICY`, `AUTH-ARCH-LAYERS`,
`AUTH-ARCH-IMPORT-GATE`, `AUTH-INSTALL-POLICY`, `AUTH-PLATFORM-MATRIX`

A tool-only security-maintenance claim SHALL compare the candidate with a
trusted predecessor selected by the repository workflow. The maintenance
authority SHALL define a closed set of maintenance classes, the exact
implementation authorities each class may change, and the semantic/config/
conformance authorities each class must preserve.

The predecessor's maintenance-class definition and verification contract SHALL
govern the comparison. The candidate SHALL NOT widen its own admitted delta,
change the class/checker under the same maintenance claim, or treat the whole
lockfile as freely mutable. Resolved-graph change SHALL be limited to the
selected exact package roots and their deterministically derived transitive
closure; unrelated importer or package movement SHALL fail.

Scope 1 SHALL establish the initial maintenance authority under the complete
dual-engine and platform proof. That genesis landing SHALL NOT classify itself
as a maintenance update. Maintenance classification is available only to a
later candidate whose trusted predecessor already contains the accepted class
and verification contract.

Candidate-local schema validity, fixture referential integrity, generated-config
drift, and a green candidate corpus SHALL be necessary but SHALL NOT be
sufficient evidence of continuity.

If predecessor identity cannot be resolved, repository diff cannot be read, the
maintenance policy is malformed, or a protected authority differs, maintenance
classification SHALL fail closed. The change MAY proceed only through the
separately reviewed policy or architecture path appropriate to the differing
authority.

#### Scenario: Lint engine pin and mapping change only

- **GIVEN** a trusted predecessor whose semantic policy and conformance corpus
  are complete
- **WHEN** a candidate changes only the admitted lint-engine pin, resolved graph,
  selected-engine mapping, and generated engine projection
- **AND** the complete policy/install/platform/separation proof passes
- **THEN** the change MAY be classified as lint-engine maintenance
- **AND** semantic policy and fixture bytes SHALL remain predecessor-identical
- **AND** lockfile differences SHALL be confined to the selected engine closure

#### Scenario: Policy row and its only fixture are deleted together

- **GIVEN** a candidate changes an engine pin
- **WHEN** it also deletes policy row R and the only negative fixture assigned to
  R
- **THEN** predecessor comparison SHALL fail before candidate-only conformance
  can authorize the update
- **AND** deleting both sides of the candidate's internal reference SHALL NOT
  make the maintenance claim valid

#### Scenario: Compiler update relaxes compiler policy

- **GIVEN** a candidate changes the exact normal TypeScript pin
- **WHEN** it also relaxes a shared tsconfig option or deletes/weakens its
  compiler conformance fixture
- **THEN** compiler-maintenance classification SHALL fail
- **AND** the change SHALL require the separately reviewed compiler-policy path

#### Scenario: Compatibility parser update preserves its boundary

- **GIVEN** a candidate changes only the exact compatibility package or its
  expected locked API identity
- **WHEN** the admitted consumer allowlist, source-import behavior/corpus, normal
  compiler authority, install posture, and platform set match the trusted
  predecessor
- **THEN** the change MAY be classified as compatibility-parser maintenance
- **AND** the full source-import and native-platform proof SHALL still run

#### Scenario: Trusted predecessor is unavailable or ambiguous

- **GIVEN** a candidate requests maintenance classification
- **WHEN** the comparison base cannot be resolved exactly, the diff cannot be
  read, or identities disagree unexpectedly
- **THEN** maintenance classification SHALL fail closed
- **AND** candidate-local success SHALL NOT be translated into policy continuity

#### Scenario: Candidate widens its own maintenance class

- **GIVEN** the predecessor admits only engine pin, derived lock closure,
  selected mapping, and generated adapter changes
- **WHEN** the candidate edits the maintenance class or checker to permit policy,
  fixture, platform, or unrelated lockfile changes
- **THEN** predecessor comparison SHALL fail
- **AND** the candidate's widened class SHALL have no authority over its own
  admission

## Failure Semantics

| Condition class | Requirement / scenario | Required observable outcome |
|---|---|---|
| change-attributable | range, missing platform package, install exception, or policy loss | deterministic refusal |
| environmental / operational | native runner unavailable | proof incomplete; retry later, do not claim support |
| ambiguous / undecidable | dependency exposure class, resolved identity, or trusted predecessor unknown | treat as security-relevant / fail closed pending evidence |

## Compatibility

The selected package versions are implementation pins, not architectural
identities. Their replacements must satisfy the same requirements.

## Deferred Behavior

| Behavior | Due landing / task | Reason deferred | Current-scope boundary |
|---|---|---|---|
| retirement of the TS6 compatibility package | future lifecycle change | stable TS7 API equivalence is not available/proven | bounded dependency remains |
