# Design: TypeScript 7 and lint-engine resilience

> **Authority boundary:** this artifact owns architecture, design decisions,
> trust boundaries, rationale, repository feasibility, and landing seams. It
> does not own observable product requirements, proof completion, task state, or
> hand-maintained copies of future executable contract data.

## Context

The requirements in `specs/**` separate five responsibilities that currently
share one toolchain transition: compiler correctness, lint policy, formatting,
architecture validation, and compatibility access to the traditional TypeScript
API.

The current engine coupling is real and reproducible. TypeScript 7.0.2 compiles
and builds the current repository, but `typescript-eslint` 8.66.0 refuses to
load and `scripts/check-source-imports.mjs` crashes because the normal TypeScript
7 package exports version information rather than `ScriptKind`,
`createSourceFile`, `forEachChild`, and the other traditional APIs it uses.

The design must preserve all existing policy while making a future engine
security replacement a conformance exercise rather than an architecture rewrite.

## Goals

- Make repository-owned policy, not a lint binary, the authority.
- Keep semantic policy/conformance separate from per-engine mappings.
- Establish a complete executable parity boundary before retiring ESLint.
- Make TypeScript 7.0.2 the one authoritative normal compiler.
- Keep Prettier and dedicated architecture checks independent.
- Bound the TypeScript 6 API to known repository tooling.
- Preserve deterministic frozen installs with no install-script exception.
- Prove required execution natively on Linux AMD64 and ARM64.
- Bind tool-only security maintenance to a trusted predecessor and a closed
  allowed-delta class so deleting policy and evidence together cannot pass.
- Execute maintenance admission through workflow/verifier bytes from that exact
  predecessor, with the candidate treated as data and both identities rechecked.
- Land exactly PR-A (planning), PR-B (parity foundation), and PR-C (cutover),
  unless an explicit owner acceptance process requires a separate ADR transition
  or Scope 1 proves a policy cannot be preserved.

## Non-Goals

- No Scope 1 or Scope 2 implementation in PR-A.
- No changes to PR #113.
- No rewrite of the source-import architecture gate onto regular expressions,
  Oxc ASTs, or TypeScript 7 unstable APIs.
- No use of Oxlint `--type-check` as compiler authority.
- No new lint policy during migration.
- No self-hosted runner, deployment, credential, or production change.
- No requirement to retire `@typescript/typescript6` as program completion.

## Current Architecture

```text
pnpm-workspace.yaml catalog
  ├─ typescript 6.0.3
  │    ├─ member tsc --noEmit / tsc -p ...
  │    └─ traditional API -> scripts/check-source-imports.mjs
  ├─ eslint 10.8.0 + @eslint/js 10.0.1
  ├─ typescript-eslint 8.66.0
  └─ globals 17.9.0

packages/eslint-config
  ├─ base: recommended + recommendedTypeChecked + repository rules
  ├─ library/service/application/test role exports
  ├─ config-file and JavaScript overrides
  └─ adapter bin path exceptions in member configs

Prettier                             formatting authority
check-workspace.mjs                  manifest architecture
check-source-imports.mjs             source architecture

maintenance verification             not implemented
trusted maintenance invocation        not implemented
```

The repository has a proven candidate-independent execution pattern in
`.github/workflows/review-boundary.yml`, but no maintenance-specific boundary
exists. GitHub currently reports zero repository rulesets and an unprotected
`main`, so no external merge control can be treated as the missing verifier
authority.

### Current lint configuration topology

Current files inspected completely:

- `packages/eslint-config/{base,node,library,service,application,test,index}.js`;
- `packages/eslint-config/eslint.config.js`, package metadata, README, and all
  tests/fixtures;
- all 17 consuming `eslint.config.js` files under `agents/`, `apps/`,
  `packages/`, and `services/`; and
- every member `lint` command.

Actual role assignment:

| Surface | Effective policy |
|---|---|
| reusable packages and coding-adapter core | library |
| services | service |
| app | application |
| coding-adapter `src/bin.ts` | library, but process/console restrictions off only for that file |
| `packages/eslint-config` JavaScript config source | base untyped JavaScript plus package-root config override |
| ordinary test files in current members | their member role; no member currently composes the exported `/test` config |
| exported `/test` role | available and tested as a package contract; relaxes eight library policies when explicitly composed |
| `packages/tsconfig` | JSON-only; no ESLint execution, validated by tests |

The distinction between the exported test role and its actual consumers is
load-bearing. A replacement must not assume “the export exists” means “all test
files use it” and silently relax existing member tests.

### Complete current lint-policy inventory

> **CURRENT-BASE EVIDENCE SNAPSHOT — NOT FUTURE AUTHORITY**
>
> Source: ESLint 10.8.0 `calculateConfigForFile` over the resolved current-main
> configs at `70f23f43a6ca95f128de664c242187ad6026a67d`.
> Scope 1 creates `AUTH-LINT-POLICY`; its extractor/drift test, not this prose,
> owns exact future inventory.

Counts:

| Mode | Enabled rules |
|---|---:|
| library production TypeScript | 99 |
| service production TypeScript | 96 |
| application production TypeScript | 96 |
| coding-adapter core | 99 |
| coding-adapter `src/bin.ts` | 96 |
| config-package JavaScript | 88 |
| config-package TypeScript test under current library role | 99 |
| explicitly composed exported test role | 91 |
| union across all modes | **117** |

The 117-rule union is complete as follows.

#### TypeScript-eslint identities effective in production TypeScript (46)

```text
@typescript-eslint/await-thenable
@typescript-eslint/ban-ts-comment
@typescript-eslint/consistent-type-imports
@typescript-eslint/explicit-module-boundary-types
@typescript-eslint/no-array-constructor
@typescript-eslint/no-array-delete
@typescript-eslint/no-base-to-string
@typescript-eslint/no-duplicate-enum-values
@typescript-eslint/no-duplicate-type-constituents
@typescript-eslint/no-empty-object-type
@typescript-eslint/no-explicit-any
@typescript-eslint/no-extra-non-null-assertion
@typescript-eslint/no-floating-promises
@typescript-eslint/no-for-in-array
@typescript-eslint/no-implied-eval
@typescript-eslint/no-import-type-side-effects
@typescript-eslint/no-misused-new
@typescript-eslint/no-misused-promises
@typescript-eslint/no-namespace
@typescript-eslint/no-non-null-asserted-optional-chain
@typescript-eslint/no-redundant-type-constituents
@typescript-eslint/no-require-imports
@typescript-eslint/no-this-alias
@typescript-eslint/no-unnecessary-type-assertion
@typescript-eslint/no-unnecessary-type-constraint
@typescript-eslint/no-unsafe-argument
@typescript-eslint/no-unsafe-assignment
@typescript-eslint/no-unsafe-call
@typescript-eslint/no-unsafe-declaration-merging
@typescript-eslint/no-unsafe-enum-comparison
@typescript-eslint/no-unsafe-function-type
@typescript-eslint/no-unsafe-member-access
@typescript-eslint/no-unsafe-return
@typescript-eslint/no-unsafe-unary-minus
@typescript-eslint/no-unused-expressions
@typescript-eslint/no-unused-vars
@typescript-eslint/no-wrapper-object-types
@typescript-eslint/only-throw-error
@typescript-eslint/prefer-as-const
@typescript-eslint/prefer-namespace-keyword
@typescript-eslint/prefer-promise-reject-errors
@typescript-eslint/require-await
@typescript-eslint/restrict-plus-operands
@typescript-eslint/restrict-template-expressions
@typescript-eslint/triple-slash-reference
@typescript-eslint/unbound-method
```

Of these, the audited tsgolint backend lists 23 as implemented type-aware rules;
the remaining 23 are syntax/static TypeScript-plugin policies handled by
Oxlint. That split is implementation evidence, not authority allocation.

#### Core identities effective in production TypeScript (53)

```text
eqeqeq
for-direction
no-async-promise-executor
no-case-declarations
no-compare-neg-zero
no-cond-assign
no-console
no-constant-binary-expression
no-constant-condition
no-control-regex
no-debugger
no-delete-var
no-dupe-else-if
no-duplicate-case
no-empty
no-empty-character-class
no-empty-pattern
no-empty-static-block
no-ex-assign
no-extra-boolean-cast
no-fallthrough
no-global-assign
no-invalid-regexp
no-irregular-whitespace
no-loss-of-precision
no-misleading-character-class
no-nonoctal-decimal-escape
no-octal
no-prototype-builtins
no-regex-spaces
no-restricted-globals
no-restricted-properties
no-self-assign
no-shadow-restricted-names
no-sparse-arrays
no-unassigned-vars
no-unexpected-multiline
no-unsafe-finally
no-unsafe-optional-chaining
no-unused-labels
no-unused-private-class-members
no-useless-assignment
no-useless-backreference
no-useless-catch
no-useless-escape
no-var
prefer-const
prefer-rest-params
prefer-spread
preserve-caught-error
require-yield
use-isnan
valid-typeof
```

#### Additional identities effective for JavaScript configuration source (18)

```text
constructor-super
getter-return
no-class-assign
no-const-assign
no-dupe-args
no-dupe-class-members
no-dupe-keys
no-func-assign
no-import-assign
no-new-native-nonconstructor
no-obj-calls
no-redeclare
no-setter-return
no-this-before-super
no-undef
no-unreachable
no-unsafe-negation
no-with
```

#### Explicit repository options and role deltas

| Policy | Current exact intent |
|---|---|
| `no-unused-vars` | all arguments; `_` prefix exemptions for arguments, variables, and caught errors; ignore rest siblings |
| `consistent-type-imports` | type imports preferred; inline type-import fix style |
| `ban-ts-comment` | `ts-ignore` forbidden; `ts-expect-error` requires a description |
| `eqeqeq` | always, with the current null comparison exception |
| promise policies | floating/misused promises, await-thenable, and require-await are errors |
| unsafe policies | assignment, argument, call, member access, and return are errors |
| library boundary | explicit module boundary types required |
| library process boundary | global `process`, `process.exit`, and `process.env` forbidden with repository messages |
| service/application | explicit module boundary types off; library-only process restrictions absent |
| exported test role | boundary types, explicit-any, unsafe assignment/argument/member, process restrictions, and console off; other typed policies remain |
| adapter bin | process restrictions and console off only on `src/bin.ts`; boundary types remain |
| package-root config override | boundary types, process restrictions, and console off for config files |
| JavaScript | type-aware rules disabled, not silently attempted without a TS project |
| globals/language | Node globals, ECMAScript 2023, ESM |
| ignored paths | `dist`, `coverage`, `node_modules`, declaration files, and deliberately-invalid lint fixtures |
| framework policy | no NestJS, Next.js, React, Zod, or provider-specific rule |
| formatting policy | no ESLint stylistic rules; Prettier is sole authority |

The planning allocation classifies **all 117 current rule identities** as
`MIGRATED_TO_NEW_LINT_ENGINE`. None is allocated to the compiler or a dedicated
repository gate as a way to reduce the lint contract; those authorities remain
independent. The actual Oxlint 1.80.0 registration probe accepted 115 configured
replacement IDs. Three TypeScript-eslint identities map to Oxlint core
equivalents (`no-array-constructor`, `no-unused-expressions`, and
`no-unused-vars`); all other TypeScript-eslint identities map to
`typescript/<name>`. `no-dupe-args` and `no-octal` are emitted as Oxlint parser
diagnostics rather than configurable rules. Scope 1 must prove every allocation
by fixture before the canonical `AUTH-LINT-POLICY` may be accepted; a failed
fixture blocks the allocation and the migration rather than changing its
disposition to `DROPPED`.

One concrete option mismatch was found: ESLint materializes
`preserve-caught-error` with `errorClassNames: []`, while Oxlint 1.80.0 rejects
that field and accepts `requireCatchParameter` only. The empty list appears to be
default-equivalent, but that is deliberately not accepted from inspection;
Scope 1 must prove the behavior through fixtures or stop.

### Existing lint proof gap

`packages/eslint-config/tests/config.test.ts` executes a valid fixture and four
negative fixtures only:

- `no-floating-promises`;
- `no-unused-vars`;
- `no-explicit-any`; and
- `no-console`.

It also checks a subset of role differences, framework neutrality, and formatting
neutrality. It does not prove all inherited recommended rules, all typed rules,
all options, all role overrides, or all ignore behavior. A green current test is
therefore not retirement evidence.

### Complete compiler-API consumer inventory

Tracked-source import and API-symbol scans found exactly one repository-owned
direct traditional compiler-API consumer:

| Consumer | API surface used | Current dependency | Design consequence |
|---|---|---|---|
| `scripts/check-source-imports.mjs` | `ScriptKind`, `ScriptTarget`, `SyntaxKind`, `createSourceFile`, import-node type guards, `forEachChild`, `flattenDiagnosticMessageText`, `version` | `typescript` | switch only this import to the bounded compatibility package and preserve its corpus |

Not traditional API consumers:

- all member `typecheck`, `build`, and generator scripts invoke the `tsc` CLI;
- `packages/tsconfig/tests/configs.test.ts` spawns the package-local `tsc`
  binary; and
- `typescript-eslint` is an external engine dependency, not repository-owned
  compiler-API code.

`tests/test_source_imports.py` currently asserts that `typescript` is the gate's
only external import and that install precedes it. Scope 1 must update that tether
to the exact compatibility package and add the repository-wide allowlist guard.

### Complete TypeScript configuration and entry-point audit

Repository facts at the base:

- 35 tracked `tsconfig*.json` files;
- shared one-level roles: base, library, service, application, test;
- all members extend `@secure-home/tsconfig/<role>` rather than relative paths;
- base options include ES2023, NodeNext module/resolution, strictness flags,
  isolated modules, verbatim module syntax, declaration/maps, source maps, and
  no-emit-on-error;
- role output uses `${configDir}` rootDir/outDir;
- member-only options are `types`, `allowJs`, `experimentalDecorators`, and
  `emitDecoratorMetadata`;
- no project references;
- no incremental build;
- library explicitly uses `composite: false`; and
- all ordinary typechecks/builds invoke `tsc` directly.

Disposable TS7 audit against the exact base:

| Probe | Result |
|---|---|
| `tsc --showConfig` for all 35 configs | 35/35 pass |
| `pnpm typecheck` | all 18 TypeScript members pass under 7.0.2 |
| `pnpm build` | all 18 TypeScript members pass under 7.0.2 |
| shared tsconfig test suite | 20/20 pass under 7.0.2 |
| `scripts/check-source-imports.mjs` using normal TS7 | fails at `ts.ScriptKind.TS`, as expected |
| `packages/eslint-config` test using TS7 | fails before tests: `typescript-eslint does not support TS 7.0` |
| source-import gate using `@typescript/typescript6` | passes, 308 files / 18 members, API reports TS6 6.0.3 |
| source-import behavior tests with compatibility seam | 44 pass; the old dependency-name tether intentionally excluded |

No actual removed compiler option, module-resolution incompatibility,
rootDir/outDir issue, declaration issue, decorator issue, or CLI-output issue was
found at this base. Scope 2 repeats the audit because later repository changes
may invalidate this evidence.

## Proposed Architecture

```text
                                ┌───────────────────────────────┐
                                │ AUTH-LINT-POLICY              │
                                │ stable semantics + roles +    │
                                │ options + proof mapping       │
                                └──────────────┬────────────────┘
                                               │ checked/generated
                         ┌─────────────────────┴─────────────────────┐
                         ▼                                           ▼
             AUTH-LINT-ENGINE-MAPPINGS                    AUTH-LINT-CONFORMANCE
             legacy + replacement rule/parser             stable fixture bytes
             mechanisms keyed by policy ID                keyed by policy ID
                         │                                           │
                         └─────────────────────┬─────────────────────┘
                                               ▼
                                  generated/checkable adapters
                         ┌─────────────────────┴──────────────────────┐
                         ▼                                            ▼
             legacy ESLint adapter/config                 Oxlint config/runner
             (Scope 1 only, blocking)                      static + --type-aware
                         │                                            │
                         └─────────────────────┬──────────────────────┘
                                               ▼
                                AUTH-LINT-CONFORMANCE
                           valid + per-policy negative corpus

normal `typescript` package                 @typescript/typescript6
  Scope 1: 6.0.3                              traditional API only
  Scope 2: 7.0.2                              allowlisted consumer only
       │                                               │
       ▼                                               ▼
 pnpm typecheck/build                    scripts/check-source-imports.mjs
 compiler authority                      independent architecture gate

Prettier ------------------------------------------------ formatting authority
check-workspace.mjs + workspace model ------------------ manifest architecture

repository_dispatch definition from default branch
  -> exact LIVE_PREDECESSOR_SHA == workflow execution SHA
  -> predecessor checkout owns verifier + dependencies + command plan
  -> AUTH-MAINTENANCE-CLASSES says what may differ
  -> candidate Git tree is data / implementation is subject under test
  -> protected drift, candidate verifier, or identity movement = REFUSE
```

### Component responsibilities

| Component | Responsibility | Not an authority for |
|---|---|---|
| `packages/lint-config/policy.schema.json` (planned) | validates engine-neutral policy-entry, role, blocking, and proof-reference shape | policy values or engine mappings |
| `packages/lint-config/engine-mappings.schema.json` (planned) | validates per-engine rule/parser mappings and normalization keyed by stable policy ID | semantic policy |
| `packages/lint-config/policy.json` (planned) | exact stable lint policy identities, semantics/options, applicability, dispositions, blocking posture, and proof references | engine mappings, compiler options, dependency layers |
| `packages/lint-config/engine-mappings.json` (planned) | exact legacy/replacement rule or parser mechanisms keyed by stable policy ID | semantic policy or fixture bytes |
| legacy extractor/drift check (planned) | proves the initial manifest contains the complete effective ESLint policy and detects drift during Scope 1 | future policy decisions |
| generated Oxlint config (planned) | engine-specific mirror with all categories/defaults neutralized | policy |
| lint conformance harness and fixtures (planned) | executable accept/reject parity evidence | policy definition |
| `scripts/toolchain-boundaries.json` (planned) | exact TS6 consumer allowlist, required native platform set, and closed maintenance classes with allowed/protected authority projections | package versions or policy values |
| `scripts/check-toolchain-boundaries.mjs` (planned) | ordinary candidate feedback; when loaded from the exact live predecessor by the trusted boundary, performs authoritative compiler/import/separation/maintenance verification over candidate Git-object data | architecture layers, lint semantics, or its own invocation authority |
| `.github/workflows/toolchain-maintenance-boundary.yml` (planned) | default-branch-only `repository_dispatch` invocation, exact live-predecessor checkout, predecessor verifier execution, candidate-as-data handling, and final head/predecessor freshness check | maintenance classes or policy semantics |
| pnpm catalog/lock | exact selected implementation versions and resolved graph | lint policy |
| `packages/tsconfig/*.json` | compiler options and role inheritance | lint policy |
| `check-source-imports.mjs` | source dependency architecture | general lint or type correctness |
| Prettier config/ignore | formatting | defects, types, or architecture |

## Trust and Authority Boundaries

| Boundary | Trusted side | Untrusted / less-trusted side | Authority crossing | Required guard |
|---|---|---|---|---|
| TB-TS7-1 candidate source/config → compiler/linter | committed policy/config and pinned tool | PR-controlled bytes | admissibility decision | deterministic pinned parser, fail closed on parse/config/tool failure |
| TB-TS7-2 policy → engine config | canonical policy manifest | generated engine representation | rule/role/option mapping | schema, generator/drift test, no implicit defaults |
| TB-TS7-3 policy → conformance | manifest entry | fixture and engine diagnostic | claim of parity | intended-rule attribution and mutation proof |
| TB-TS7-4 repository → npm/native package | frozen catalog/lock | registry artifact / platform binary | executable CI dependency | exact pin, integrity lock, no install script, version check |
| TB-TS7-5 normal compiler → compatibility API | TypeScript 7 compiler lane | legacy TS6 API | parser capability only | exact allowlist; no `tsc6` entry point in build/typecheck |
| TB-TS7-6 lint → architecture gate | separate repository commands | shared parser technology | no authority crossing permitted | independent commands/tests; lint cannot satisfy import gate |
| TB-TS7-7 AMD64 evidence → ARM64 claim | native ARM64 runner | package metadata/cross artifact | support claim | native frozen install and command execution |
| TB-TS7-8 trusted maintenance boundary → candidate | default-branch `repository_dispatch` definition plus verifier/dependencies from exact live predecessor | candidate-authored workflow, checker, pins, mappings, policy, config, fixtures, and scripts | authoritative maintenance-admission decision | require workflow SHA = live predecessor; execute predecessor checker only; fetch candidate as Git objects/data; predecessor classes govern; re-resolve head and predecessor; no fallback to candidate code |

No credential, production data, runtime authorization, or external system effect
crosses these boundaries.

## Decisions

### D1: Policy authority is independent of lint implementation

- **Decision:** a machine-readable repository policy manifest owns lint policy;
  engines are adapters/verifiers.
- **Requirement(s):** `REQ-TA-002`, `REQ-TA-003`, `REQ-LP-001`.
- **Rationale:** a CVE-driven engine replacement must not imply a policy change.
- **Alternatives considered:** ESLint as authority; Oxlint config as authority;
  prose rule list. All couple policy to an implementation or are not executable.
- **Trust consequence:** an engine may not silently add/drop rules through
  defaults or unsupported options.
- **Canonical authority consequence:** creates `AUTH-LINT-POLICY-SCHEMA` and
  `AUTH-LINT-POLICY`; `AUTH-LINT-ENGINE-MAPPINGS` owns implementation mappings;
  configs are checked/generated mirrors.
- **Revisit trigger:** no executable representation can express the policy/role
  model without becoming engine-specific.

### D2: Scope 1 is blocking dual-engine parity

- **Decision:** TypeScript 6 and ESLint remain; Oxlint + tsgolint are added; both
  paths block.
- **Requirement(s):** `REQ-LP-002`, `REQ-LP-003`, `REQ-LP-006`.
- **Rationale:** replacement evidence must exist before retirement.
- **Alternatives considered:** advisory new lint, one-step replacement. Advisory
  mode permits ignored drift; one-step replacement has no independent oracle.
- **Trust consequence:** a mismatch stops Scope 1 and preserves old enforcement.
- **Canonical authority consequence:** legacy extractor and conformance corpus
  bind both engines to one semantic manifest through separate engine mappings.
- **Revisit trigger:** dual execution is operationally impossible even when
  scoped to the migration PR.

### D3: Selected replacement is Oxlint 1.80.0 plus oxlint-tsgolint 7.0.2001

- **Decision:** use exact audited versions initially; invoke typed lint through
  `oxlint --type-aware`, never the unsupported standalone tsgolint CLI.
- **Requirement(s):** `REQ-TA-003`, `REQ-LP-002`, `REQ-SC-001`.
- **Rationale:** current binaries register the complete rule-ID mapping, the
  typed backend implements the current typed families, and both publish x64 and
  ARM64 artifacts without lifecycle scripts.
- **Alternatives considered:** wait indefinitely for typescript-eslint TS7;
  custom linter; engine defaults. None establishes replaceable policy authority.
- **Trust consequence:** registration is only feasibility; fixtures decide
  semantic acceptance.
- **Canonical authority consequence:** versions live only in catalog/lock;
  engine mappings live in `AUTH-LINT-ENGINE-MAPPINGS`; the policy manifest owns
  semantics, not versions or vendor rule identities.
- **Revisit trigger:** Scope 1 parity or native platform execution fails.

### D4: Engine defaults are disabled

- **Decision:** all Oxlint categories are explicitly allowed/off and only
  generated policy entries are enabled; built-in plugin selection and type-aware
  mode are explicit.
- **Requirement(s):** `REQ-LP-005`.
- **Rationale:** default-category contents change across engine releases.
- **Alternatives considered:** accept defaults as “extra safety.” That is an
  unreviewed policy expansion and creates nondeterministic upgrade behavior.
- **Trust consequence:** a version update cannot silently make a new rule
  mandatory or remove one.
- **Canonical authority consequence:** `AUTH-LINT-CONFIG` is generated/checked
  from `AUTH-LINT-POLICY`.
- **Revisit trigger:** engine cannot disable defaults deterministically.

### D5: TypeScript 7 is compiler authority; TS6 is a bounded API seam

- **Decision:** normal `typescript` becomes 7.0.2 in Scope 2;
  `@typescript/typescript6` 6.0.2 reexports the locked TS6 API only to admitted
  repository tooling. A later exact normal TypeScript pin may advance through
  D13 without changing compiler authority.
- **Requirement(s):** `REQ-TA-001`, `REQ-TA-004`, `REQ-TC-002`, `REQ-TC-003`.
- **Rationale:** the normal TS7 package has no traditional stable API surface;
  Microsoft publishes the side-by-side compatibility package.
- **Alternatives considered:** unstable TS7 APIs, regex parser, Oxc rewrite,
  retaining normal TS6 compiler. All change semantics, stability, or objective.
- **Trust consequence:** compatibility cannot spread or become compiler authority.
- **Canonical authority consequence:** `AUTH-TS6-CONSUMERS` owns one allowlist;
  catalog/lock own package identity; `AUTH-MAINTENANCE-CLASSES` distinguishes
  initial cutover from later conforming compiler maintenance.
- **Revisit trigger:** a stable TS7 API can prove behavioral equivalence in a
  separate lifecycle change.

### D6: Compiler typecheck remains independent

- **Decision:** keep `pnpm typecheck` as `tsc --noEmit` per member; Oxlint
  `--type-check` remains disabled as an authority.
- **Requirement(s):** `REQ-TA-002`, `REQ-TC-004`.
- **Rationale:** lint and compiler diagnostics have different contracts.
- **Alternatives considered:** one Oxlint command for typecheck + lint. Rejected
  because it collapses authorities and uses an experimental mode.
- **Trust consequence:** one green process cannot mask failure in the other.
- **Canonical authority consequence:** member compiler entrypoints remain
  independently validated by `AUTH-TS-ENTRYPOINTS`.
- **Revisit trigger:** none within this change; changing authority requires ADR
  review.

### D7: Architecture gates remain repository-owned and independent

- **Decision:** preserve `check-workspace.mjs` and
  `check-source-imports.mjs` semantics and commands.
- **Requirement(s):** `REQ-TA-002`, `REQ-TC-003`.
- **Rationale:** lint policy does not own package/source dependency direction.
- **Alternatives considered:** rewrite source architecture onto Oxlint import
  rules. Rejected because it changes a mature fail-closed gate during an engine
  migration.
- **Trust consequence:** shared parser implementation never implies shared
  authority.
- **Canonical authority consequence:** existing workspace model/import gate stay
  canonical for architecture.
- **Revisit trigger:** separate architecture review proves a safer bounded
  replacement after this migration.

### D8: Prettier remains sole formatting authority

- **Decision:** no lint formatting rules; current `.prettierrc.json`, ignore
  policy, and `format:check` remain.
- **Requirement(s):** `REQ-TA-002`, `REQ-LP-004`.
- **Rationale:** two formatters create conflicting outputs.
- **Alternatives considered:** enable Oxlint stylistic defaults. Rejected as
  unreviewed policy and authority overlap.
- **Trust consequence:** engine migration cannot reformat unrelated code or
  redefine formatting acceptance.
- **Canonical authority consequence:** `AUTH-FORMAT-POLICY` unchanged.
- **Revisit trigger:** separate formatting decision.

### D9: Exact installation retains onlyBuiltDependencies: []

- **Decision:** exact catalog pins, frozen lock, native optional packages, no
  lifecycle exception.
- **Requirement(s):** `REQ-SC-001`, `REQ-SC-002`.
- **Rationale:** audited package graph installs without scripts.
- **Alternatives considered:** automatic build approval; global binaries;
  ranges. Rejected as supply-chain drift.
- **Trust consequence:** PR-controlled package installation cannot acquire an
  unreviewed script path.
- **Canonical authority consequence:** existing pnpm policy remains authority.
- **Revisit trigger:** a required package proves it cannot operate without a
  lifecycle script; that requires separate architecture/supply-chain review.

### D10: Native platform proof uses standard GitHub-hosted runners

- **Decision:** Scope 1 and Scope 2 add an AMD64/ARM64 matrix using
  `ubuntu-24.04` and `ubuntu-24.04-arm` in the existing GitHub-hosted trust model.
- **Requirement(s):** `REQ-SC-003`.
- **Rationale:** the repository is public and the standard ARM64 label is
  available; no self-hosted infrastructure is needed.
- **Alternatives considered:** npm metadata only; QEMU claim; new self-hosted
  runner. Metadata is not execution, QEMU is not native, self-hosted adds a trust
  model outside this change.
- **Trust consequence:** platform support is proved by execution.
- **Canonical authority consequence:** `AUTH-PLATFORM-MATRIX` owns exact platform
  and command coverage; workflow is a checked projection.
- **Revisit trigger:** GitHub removes or materially changes the standard ARM64
  runner; implementation stops for a focused platform-proof decision.

### D11: Three PRs, two independently reviewed implementation scopes

- **Decision:** PR-A planning/ADR; PR-B `replacement-authority-parity`; PR-C
  `typescript7-cutover`.
- **Requirement(s):** `REQ-TA-005`, `REQ-LP-006`, `REQ-TC-005`.
- **Rationale:** policy parity is independently safe while ESLint remains; TS7
  cutover is independently rollbackable to that state.
- **Alternatives considered:** one implementation PR; more implementation PRs.
  One is not reviewable; more are unnecessary unless evidence creates a new
  authority boundary.
- **Trust consequence:** Scope 2 cannot erase its oracle before Scope 1 proves
  it.
- **Canonical authority consequence:** tasks.md owns two review-scope IDs.
- **Revisit trigger:** owner requires separate ADR acceptance PR, or Scope 1
  exposes an unexpressible policy/platform prerequisite.

### D12: Capability-oriented replacement package

- **Decision:** use `packages/lint-config`, not an engine-branded package, as the
  long-lived policy home.
- **Requirement(s):** `REQ-TA-003`, `REQ-LP-001`, `REQ-LP-006`.
- **Rationale:** package identity should survive engine replacement.
- **Alternatives considered:** `packages/oxlint-config`; keeping
  `packages/eslint-config` after ESLint removal. Both make implementation names
  architectural.
- **Trust consequence:** package consumers depend on policy capability, not
  vendor identity.
- **Canonical authority consequence:** policy schema/manifest and conformance
  live there; engine adapters may change.
- **Revisit trigger:** repository taxonomy proves the authority belongs in a
  root governance/tooling domain instead.

### D13: Tool-only maintenance is predecessor-bound

- **Decision:** an engine/compiler/compatibility-parser maintenance claim compares
  the candidate with an exact trusted predecessor. A closed machine-readable
  maintenance class names the implementation authorities that may change and
  the semantic/config/conformance authorities that must remain equal. Unknown
  predecessor or protected drift fails closed. The predecessor class, not the
  candidate's edited copy, governs the allowed/protected data projection;
  lockfile movement is limited to the selected package roots and their derived
  transitive closure. D14 separately owns which executable verifier applies the
  class. PR-B creates the genesis class under full dual-engine review; it does
  not authorize itself as maintenance.
- **Requirement(s):** `REQ-TA-001`, `REQ-TA-003`, `REQ-SC-004`,
  `REQ-SC-005`, `REQ-SC-006`.
- **Rationale:** after ESLint retirement, candidate-local schema and fixtures can
  be made consistently smaller by deleting a policy row and its only evidence.
  Continuity is a two-revision property.
- **Alternatives considered:** trust candidate-only conformance; embed immutable
  policy IDs in prose; forbid all future tool updates. The first permits silent
  deletion, the second creates a competing authority, and the third defeats
  vulnerability response.
- **Trust consequence:** a tool-maintenance candidate does not select the policy
  or predecessor against which it is judged.
- **Canonical authority consequence:** adds `AUTH-MAINTENANCE-CLASSES` under the
  toolchain-boundary document and keeps `AUTH-LINT-ENGINE-MAPPINGS` separate from
  semantic policy. Every maintenance class protects
  `AUTH-MAINTENANCE-VERIFIER`; no class may admit changes to the authority that
  will judge it.
- **Revisit trigger:** repository CI cannot supply an exact trustworthy
  predecessor or an implementation requires changing a protected authority; the
  change is then routed to explicit policy/architecture review.

### D14: The candidate is data, not the maintenance verifier

- **Decision:** authoritative maintenance admission runs through a
  `repository_dispatch` workflow definition from the default branch. It resolves
  the exact live default-branch predecessor and exact candidate head, requires
  the workflow execution SHA to equal that predecessor, checks out only the
  predecessor as executable code, and runs the predecessor's verifier,
  dependencies, maintenance classes, and command plan. Candidate Git objects may
  be parsed as data; candidate implementation binaries may be launched only as
  subjects under the predecessor-owned test plan. Candidate workflows, checkers,
  helpers, and package scripts never decide admission. Both identities are
  re-resolved at the end and movement refuses the proof.
- **Requirement(s):** `REQ-SC-004`, `REQ-SC-005`, `REQ-SC-006`,
  `REQ-SC-007`.
- **Rationale:** trusted predecessor data evaluated by a candidate-controlled
  checker is still self-authorization. The candidate can replace its checker
  with unconditional success or skip it in its own workflow.
- **Alternatives considered:** protect the checker path but execute the candidate
  copy; rely on ordinary pull-request CI; require reviewer inspection of the
  checker diff. All leave the candidate or an informal process in control of the
  deciding executable bytes.
- **Trust consequence:** the candidate cannot influence whether the authoritative
  verifier ran, which code interpreted the comparison, or which head/predecessor
  identities the result describes.
- **Canonical authority consequence:** creates `AUTH-MAINTENANCE-VERIFIER`,
  separate from `AUTH-MAINTENANCE-CLASSES`. The former owns who/what decides; the
  latter owns what differences are admissible.
- **Revisit trigger:** GitHub no longer guarantees default-branch execution for
  `repository_dispatch`, or a future trusted platform replaces this boundary
  with equivalent candidate-independent execution and identity proof.

## Repository Feasibility

| Assumption | Repository evidence | Status | Design consequence |
|---|---|---|---|
| v2 can select per change while project default remains v1 | OpenSpec 1.11.0 created `.openspec.yaml`; status reports schema v2 and six-artifact DAG | verified | use v2 change-local schema selection |
| documented pnpm separator reaches the review gate | pinned pnpm forwards the literal separator in `pnpm run review:manifest -- --change ...`, producing `REVIEW_GATE_REFUSED [USAGE]`; the same script works as `pnpm run review:manifest --change ...` and via direct `node` | mismatch in shared v2 prose/template, not the gate | change-local instructions use the exercised syntax; shared-process correction is reported but remains outside this PR |
| lint policy is more than explicit custom rules | 117-rule effective union from ESLint API | verified | extractor must resolve presets and overrides, not grep source |
| replacement can register current rules | Oxlint 1.80.0 accepted 115 mapped IDs; parser rejects duplicate args/octal | verified for registration only | Scope 1 fixtures remain mandatory |
| all current typed rules have backend/static coverage | tsgolint README intersection: 23 typed; Oxlint static plugin: remaining 23 | verified for declared support only | no retirement until semantic fixtures pass |
| current options copy directly | `preserve-caught-error.errorClassNames` rejected by Oxlint | mismatch | engine adapter normalizes and fixtures prove equivalent behavior |
| TS7 compiler accepts current configs/code | 35/35 showConfig; all typecheck/build; 20 tsconfig tests | verified at base | no hypothetical config rewrites planned |
| current ESLint accepts TS7 | exact `typescript-eslint does not support TS 7.0` failure | mismatch | mandatory two-scope migration |
| normal TS7 provides current AST API | root export exposes version; traditional symbols undefined | absent | use compatibility seam |
| Microsoft compatibility package provides API | package README + executable `createSourceFile`/walk probe; gate passes | verified | allowlist only one current consumer |
| only one repository-owned compiler-API consumer exists | tracked import/API scan | verified | initial allowlist exact singleton |
| exact packages install with no scripts | temporary frozen pnpm install with `onlyBuiltDependencies: []`; eight installed packages, zero lifecycle scripts | verified on x64 | no exception planned |
| x64 binaries execute | `tsc 7.0.2`, `tsc6`/API 6.0.3, Oxlint 1.80, typed rule smoke | verified | Scope 1 still repeats in repository |
| ARM64 package artifacts exist | registry metadata + ELF AArch64 tarball inspection for TS7/Oxlint/tsgolint | verified distribution, not execution | native CI remains gating |
| native hosted ARM64 is available | public repository; GitHub standard `ubuntu-24.04-arm` | verified availability | use existing hosted trust model |
| current member lint role uses `/test` export | all member config imports inspected | mismatch: no consumer | manifest separates export contract from assignments |
| candidate-local maintenance conformance proves predecessor continuity | planned candidate-only policy/schema/corpus checks | absent | D13 and Scope 1 add trusted-predecessor comparison plus co-deletion/tsconfig-relaxation mutations |
| predecessor data plus candidate checker establishes maintenance trust | pre-correction plan anchored the predecessor data but did not separately anchor the executable checker/invocation bytes | absent | D14 adds default-branch invocation and exact-predecessor executable authority |
| repository already has a candidate-independent boundary pattern | `.github/workflows/review-boundary.yml` uses `repository_dispatch`, exact live-base checkout, candidate Git objects/inert data, and final head/base recheck | verified precedent | reuse the trust topology without changing the OpenSpec review boundary |
| branch/ruleset independently preserves maintenance freshness | GitHub API on 2026-09-01 reports zero repository rulesets and `main` is not branch-protected | absent | promise one exact run-boundary proof only; do not claim continuing merge-time freshness |

### Upstream sources verified 2026-08-31

- [TypeScript 7 announcement and side-by-side TS6 guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-60)
- [`typescript` 7.0.2 npm package](https://www.npmjs.com/package/typescript/v/7.0.2)
- [`@typescript/typescript6` 6.0.2 npm package](https://www.npmjs.com/package/@typescript/typescript6/v/6.0.2)
- [Oxlint type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
- [`oxlint` 1.80.0 npm package](https://www.npmjs.com/package/oxlint/v/1.80.0)
- [`oxlint-tsgolint` 7.0.2001 npm package](https://www.npmjs.com/package/oxlint-tsgolint/v/7.0.2001)
- [GitHub-hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [GitHub ARM64 public-runner availability](https://github.blog/changelog/2025-08-07-arm64-hosted-runners-for-public-repositories-are-now-generally-available/)

## Canonical Authority Strategy

`assurance.md#authority-allocation` owns the complete `AUTH-*` allocation.

The key choice is a schema-validated engine-neutral policy manifest, a separate
per-engine mapping authority, and executable fixture mapping. The policy can
represent stable IDs, role applicability, semantic options, blocking posture,
one disposition, and proof references without making a vendor rule name
canonical. Engine configs are generated or drift-checked mirrors.

`AUTH-MAINTENANCE-CLASSES` owns the exact two-revision projections used for a
tool-only maintenance claim: which implementation authorities may differ, which
policy/config/corpus/harness authorities must match the trusted predecessor,
and how selected package roots derive the only lock subgraph allowed to move.
The predecessor's class governs; the candidate does not define or widen that
comparison ad hoc. Scope 1 is the genesis authority landing and is reviewed by
the ordinary full scope proof rather than by the maintenance shortcut it creates.

`AUTH-MAINTENANCE-VERIFIER` separately owns the executable root of trust. Its
default-branch workflow resolves the exact live predecessor and candidate,
executes only verifier/dependency/invocation bytes from that predecessor, treats
the candidate Git tree as objects or inert data, and refuses if either identity
moves. A candidate copy of the workflow or checker may be tested as future code
but has no authority over its own admission.

PR-B can test and land this protocol but cannot truthfully produce its own
authoritative `repository_dispatch` result: until merge, the workflow/verifier
does not exist on the default branch. PR-B therefore records a genesis-only
state and proves the boundary through executable fixtures and ordinary hosted
checks. Each later maintenance candidate must supply the real default-branch
predecessor-hosted run identity and result.

The current inventory in this document is explicitly a pinned evidence snapshot,
not a second policy authority.

## Architectural Decision Tables

| Architectural state | Condition | Required architectural outcome | Decision / invariant |
|---|---|---|---|
| PR-A | Proposed ADR + complete planning package only | no tooling behavior change; implementation NOT_AUTHORIZED | D11 / INV-TS7-17 |
| Scope 1 ready | manifest complete, both engines and platform proofs green | merge dual-engine foundation; TypeScript 6 and ESLint remain | D1/D2/D10 |
| Scope 1 mismatch | any policy/role/option lacks parity | stop; retain old engine; Scope 2 blocked | D2 / INV-TS7-02 |
| Scope 2 ready | Scope 1 merged, ADR accepted, fresh review epoch, TS7 audit and both platforms green | cut over compiler and retire ESLint atomically | D5/D11 |
| security upgrade | predecessor-protected policy/config/corpus plus platform/install proofs pass | implementation update may proceed without new ADR | D1/D9/D13 |
| security upgrade requires policy deletion | no conforming mapping | reject or open explicit policy/architecture review | D1/D3 |
| security candidate deletes policy row + fixture | candidate remains internally consistent but predecessor semantic projection differs | refuse maintenance classification | D13 / INV-TS7-25 |
| security candidate also replaces checker with `exit 0` | candidate checker reports success | predecessor verifier still runs and refuses protected drift | D14 / INV-TS7-27 |
| candidate or live predecessor moves during trusted run | final identities differ from start | refuse stale proof; require a new run | D14 / INV-TS7-28 |
| compiler security update preserves normal authority and predecessor config/corpus | exact pin/graph/version expectation change only plus complete proof | maintenance update may proceed without replacing compiler authority | D5/D13 |

## Interfaces and Contracts

| Contract | Producer | Consumer | Trust boundary | Compatibility | Canonical authority |
|---|---|---|---|---|---|
| lint policy manifest | reviewed policy change | config generator, parity harness, member-role validator | policy → engine | stable IDs; schema versioned | `AUTH-LINT-POLICY` |
| per-engine mappings | reviewed implementation mapping | config generator and conformance runners | semantic policy → selected engine | keyed by stable policy ID; no policy semantics | `AUTH-LINT-ENGINE-MAPPINGS` |
| generated Oxlint config | deterministic generator | Oxlint runner | policy + mapping → engine | no defaults; exact mapping | mirror of policy + mapping via `AUTH-LINT-CONFIG` |
| legacy extraction snapshot | ESLint API resolver | drift checker | legacy engine → manifest bootstrap | Scope 1 only | `AUTH-LEGACY-EXTRACTOR` |
| policy fixture corpus | reviewed fixtures mapped by manifest | legacy/replacement runners | fixture → parity claim | accept/reject semantics, not message identity | `AUTH-LINT-CONFORMANCE` |
| TS6 consumer allowlist | toolchain boundary policy | import guard | normal compiler → legacy API | singleton initially | `AUTH-TS6-CONSUMERS` |
| platform matrix | toolchain boundary policy | hosted workflow/tests | package metadata → support claim | native execution required | `AUTH-PLATFORM-MATRIX` |
| compiler entry points | package scripts/shared config | CI/local aggregate | package resolution → compiler authority | normal package only | `AUTH-TS-ENTRYPOINTS` |
| maintenance class and predecessor comparison | toolchain boundary policy + repository-selected exact base | maintenance checker | predecessor → candidate continuity claim | closed allowed/protected projections; unknown fails | `AUTH-MAINTENANCE-CLASSES` |
| trusted maintenance invocation | default-branch workflow plus exact predecessor verifier/dependencies | repository owner/reviewer consuming the run evidence | trusted executable → candidate data | run-boundary only; start/end identities exact | `AUTH-MAINTENANCE-VERIFIER` |

## Failure Classification Boundaries

| Boundary | Classifier owner | Change-attributable cases | Operational cases | Ambiguous-state rule |
|---|---|---|---|---|
| policy extraction | policy validator | missing/drifted entry, invalid role/option | ESLint unavailable | fail Scope 1; no partial inventory |
| engine parity | conformance harness | accept/reject disagreement or wrong attribution | engine crash/unavailable | unproven parity; keep ESLint |
| compiler cutover | TypeScript audit/gates | config/source/CLI incompatibility | runner/compiler unavailable | Scope 2 incomplete |
| compatibility import | boundary checker | unapproved import or tsc6 entry point | package unavailable | architecture gate fails |
| package install | pnpm policy/lock | range, lock drift, install script, missing native package | registry/runner outage | no support claim; retry later |
| platform support | native matrix | architecture-specific functional failure | hosted runner unavailable | incomplete, never infer from metadata |
| maintenance continuity | predecessor toolchain-boundary checker | protected semantic/config/corpus drift | predecessor unavailable/unreadable | refuse maintenance classification; candidate-only success is insufficient |
| maintenance verifier execution | default-branch trusted boundary | candidate checker/workflow substitution | trusted workflow/verifier unavailable or head/predecessor moves | refuse; never fall back to candidate invocation or stale identity |

## Shared vs Independent Logic

May be shared:

- file discovery and role classification derived from the policy manifest;
- fixture metadata and expected policy IDs;
- command wrappers that resolve workspace-pinned binaries; and
- version-report evidence formatting.

Must remain independent:

- legacy ESLint and replacement Oxlint execution during Scope 1;
- compiler typecheck and typed lint;
- lint policy and source/manifest architecture gates;
- Prettier and lint configuration; and
- AMD64 and ARM64 executions.

For maintenance, the semantic policy/corpus projection and per-engine mapping
projection are intentionally distinct. A lint-engine update may alter the latter
while the former remains predecessor-identical.

The maintenance class and maintenance verifier are also intentionally distinct.
The class describes admissible data differences; the verifier provides the
candidate-independent execution authority that applies that class.

Tests must fail if a wrapper collapses these into one process result or lets one
success satisfy another required command.

## Compatibility and Migration

### PR-A — planning and architecture

- Proposed ADR-0022 remains non-operative.
- v2 package owns both implementation scopes. The first independent review
  required focused closure; the corrected planning bytes still need a fresh
  accepting review.
- no dependency, config, command, CI, or source behavior changes.

### PR-B — Scope 1: replacement authority / parity foundation

- TypeScript 6.0.3 stays authoritative.
- ESLint/typescript-eslint stay installed and blocking.
- policy schema/manifest is created from current effective config and becomes
  canonical with drift protection.
- engine-specific legacy/replacement mappings are separate from semantic policy.
- Oxlint 1.80.0 and oxlint-tsgolint 7.0.2001 are exact catalog pins.
- both engines run every mapped fixture and member policy.
- the source-import gate switches to the exact TS6 compatibility package and
  gains an import allowlist guard.
- native AMD64/ARM64 matrix proves frozen install, both lint paths, current
  compiler, source-import gate, and tests.
- predecessor-bound maintenance classification proves an admitted mapping/pin
  update passes and policy-row-plus-fixture deletion, compiler-policy relaxation,
  protected-corpus drift, and unknown predecessor fail.
- the default-branch maintenance boundary executes the exact live predecessor's
  checker and dependencies over candidate Git-object data, ignores candidate
  workflow/checker attempts, and fails if the head or predecessor moves.

### PR-C — Scope 2: TypeScript 7 cutover / ESLint retirement

- repeat the compatibility audit against then-current main;
- normal TypeScript becomes 7.0.2;
- all member lint entry points consume the capability-oriented policy package;
- ESLint packages/config are removed only in the same atomic landing;
- `pnpm lint` and `pnpm typecheck` remain separate;
- the TS6 API seam remains bounded; and
- native AMD64/ARM64 matrix proves the cutover.

After PR-C, the exact normal compiler pin may change through D13 without changing
compiler authority. The initial program landing remains exactly 7.0.2.

Rollback before merge is the last green predecessor scope. There is no partial
activation and no production data migration.

## Security Implications

Positive: security remediation can replace a parser without deleting policy;
PR-controlled bytes remain behind exact pinned tools and fail-closed checks;
legacy API spread is mechanically prevented; candidate code cannot provide the
maintenance-admission verifier; and native package/install properties are
explicit.

Risk: the compiler and linters are native executables parsing hostile source.
The package-manager and CI runner become the supply-chain execution boundary.
`devDependency` does not reduce that exposure.

No secrets, credentials, production data, network policy, device access, or
runtime authorization are introduced. Rollback has no external effect beyond CI
admission.

## Landing Seams

| Landing | Atomic seam | Remains inert until | Proof landing with seam | Authority change |
|---|---|---|---|---|
| PR-A | Proposed ADR + full v2 planning package | explicit human acceptance/review and implementation authorization | strict OpenSpec + repository planning gates | none; proposed only |
| PR-B | semantic policy/schema, separate engine mappings, legacy drift, generated replacement config, dual runners, complete corpus, predecessor-bound maintenance classes, trusted default-branch verifier boundary, TS6 allowlist seam, native matrix | Scope 1 review epoch accepted | parity/property/adversarial/mutation + candidate-checker bypass/freshness refusal + AMD64/ARM64 | lint policy moves from engine config to manifest; trusted maintenance verifier becomes future predecessor authority; compiler remains TS6 |
| PR-C | TS7 pin, member entrypoints, ESLint removal, retained seam, native matrix | Scope 2 review epoch accepted after PR-B | compiler/build/full tests + parity regression + both platforms | compiler becomes TS7; ESLint implementation retired |

No additional implementation PR is justified by current evidence. A separate ADR
acceptance PR becomes necessary only if the repository owner rejects acceptance
within the reviewed PR-A vehicle; that governance choice must stop the three-PR
sequence rather than be hidden.

## Gating Decisions

| ID | Question | Owner | Required before | Status / resolution |
|---|---|---|---|---|
| GQ-TS7-001 | policy vs engine authority | ADR reviewer/owner | PR-A acceptance | resolved by D1 |
| GQ-TS7-002 | traditional API seam | architecture review | PR-B | resolved by D5; exact package verified |
| GQ-TS7-003 | native ARM64 proof | architecture review | PR-B | resolved by D10; execution still due |
| GQ-TS7-004 | three-PR ADR acceptance path | repository owner | PR-A merge / PR-B authorization | resolved conditionally by D11; owner action required |
| GQ-TS7-005 | parity gap behavior | implementation reviewer | PR-B completion | resolved: stop and retain enforcement |
| GQ-TS7-006 | predecessor proof for tool-only security maintenance | architecture review | PR-B | resolved by D13; exact class rows are contract-first implementation data |
| GQ-TS7-007 | trusted executable authority for maintenance admission | architecture review | PR-B | resolved by D14; default-branch repository_dispatch executes exact live-predecessor verifier and treats candidate as data |

No open technical gating decision remains. Owner acceptance and implementation
authorization are external prerequisites, not facts this design may manufacture.

## Non-Gating Implementation Questions

| ID | Question | Owning task | Why architecture remains unchanged |
|---|---|---|---|
| NQ-TS7-001 | JSON field names and generator code | PR-B manifest task | authority facts and schema obligations are fixed |
| NQ-TS7-002 | root wrapper vs package-local wrapper shape | PR-B/PR-C entry-point tasks | required commands and independent outcomes are fixed |
| NQ-TS7-003 | fixture source sharing | PR-B conformance task | each manifest entry still has explicit intended proof |
| NQ-TS7-004 | exact normalization for default-equivalent engine options | PR-B engine adapter task | fixture parity decides equivalence; mismatch stops |
| NQ-TS7-005 | exact Git/API plumbing for trusted maintenance predecessor | PR-B boundary task | exact identity, fail-closed resolution, and allowed/protected projections are fixed by D13 |
| NQ-TS7-006 | direct Git-object reads versus inert 0644 candidate materialization | PR-B trusted-boundary task | either is acceptable only when candidate executables/invocation remain non-authoritative and predecessor code owns interpretation |

## Promotion Determination

The capability model is durable architecture and belongs in Proposed ADR-0022.
If accepted, the implementation/review conventions may warrant updates to
existing portable platform knowledge; PR-A does not change those modules because
a Proposed ADR is non-operative. No new knowledge module is warranted: the facts
fit existing implementation-rules/review-conventions projections after
acceptance, if the repository owner authorizes that separate update.
