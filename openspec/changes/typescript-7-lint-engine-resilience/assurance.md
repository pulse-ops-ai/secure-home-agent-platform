# Assurance Plan: TypeScript 7 and lint-engine resilience

> **Authority boundary:** this artifact owns risk classification, stable
> invariants, proof obligations, mutable-authority allocation, review posture,
> and readiness criteria. It does not create product requirements and does not
> own exact executable values allocated elsewhere.

## Purpose

This plan answers whether policy, compiler, compatibility, install, and platform
boundaries are modeled well enough to implement a two-scope toolchain migration
without turning “new engine passed” into “old policy disappeared.”

## Risk Classification

**Risk:** `high`

### Rationale

No production runtime or credential changes, but the affected tools parse
pull-request-controlled source/configuration and make merge-admission decisions.
A false negative can admit policy violations across every TypeScript member. A
native toolchain or compatibility parser compromise also executes inside CI and
developer environments with repository access.

The risk is below `trust-critical` because the change grants no runtime
authority, performs no external system mutation, and handles no secret or
household state. It remains high because it changes the mechanisms that judge
untrusted code and preserve architectural dependency direction.

## Critical Invariants

| ID | Invariant | Class | Normative source | Primary proof |
|---|---|---|---|---|
| INV-TS7-01 | At Scope 2 cutover, exactly one authoritative normal repository compiler exists: TypeScript 7.0.2. Thereafter exactly one exact normal compiler pin remains authoritative and may advance only through predecessor-bound conforming maintenance. | governance / compatibility | REQ-TA-001, REQ-SC-006, REQ-SC-007, D5/D13/D14 | EX-TS-001, EX-MAINT-001/002, MUT-TS-001 |
| INV-TS7-02 | No load-bearing lint policy may disappear during engine replacement. | governance / trust | REQ-LP-001, D1 | PROP-LP-001, MUT-LP-001 |
| INV-TS7-03 | The TypeScript 6 compatibility API is not an authoritative compiler. | governance | REQ-TA-001, REQ-TA-004, D5 | PROP-TS6-001, MUT-TS6-001 |
| INV-TS7-04 | `@typescript/typescript6` may be imported only from explicitly admitted repository-tooling locations. | trust | REQ-TA-004, D5 | PROP-TS6-002, ADV-TS6-001 |
| INV-TS7-05 | `scripts/check-source-imports.mjs` remains fail-closed and behaviorally operational throughout migration. | architecture / compatibility | REQ-TC-003, D7 | EX-ARCH-001, MUT-ARCH-001 |
| INV-TS7-06 | Prettier remains the sole formatting authority. | governance | REQ-TA-002, REQ-LP-004, D8 | PROP-FMT-001, MUT-FMT-001 |
| INV-TS7-07 | Compiler typecheck remains an independent gate from lint. | governance / trust | REQ-TA-002, REQ-TC-004, D6 | PROP-SEP-001, MUT-SEP-001 |
| INV-TS7-08 | ESLint is not removed until fixture-level policy parity is proven. | compatibility | REQ-LP-002, REQ-LP-006, D2 | EX-LP-001, MUT-LP-002 |
| INV-TS7-09 | A lint/compiler/compatibility-tool implementation may be upgraded or substituted for security remediation only when the complete contract is green and protected authorities match a trusted predecessor under its trusted verifier. | security | REQ-TA-003, REQ-SC-004, REQ-SC-006, REQ-SC-007, D1/D13/D14 | EX-MAINT-001/002, ADV-CVE-001, MUT-CVE-001 |
| INV-TS7-10 | No vulnerability-response substitution may silently remove or weaken a policy, config, conformance fixture, platform requirement, install posture, formatter authority, architecture gate, or maintenance-verifier authority. | security / governance | REQ-SC-004, REQ-SC-005, REQ-SC-006, REQ-SC-007 | PROP-MAINT-001/002, MUT-CVE-001, MUT-MAINT-001/004 |
| INV-TS7-11 | Frozen installs remain deterministic and catalog/lock identities remain exact. | supply chain | REQ-SC-001, D9 | EX-INSTALL-001, MUT-INSTALL-001 |
| INV-TS7-12 | `onlyBuiltDependencies: []` remains enforced unless a separate explicit review authorizes an exception. | supply chain / trust | REQ-SC-002, D9 | PROP-INSTALL-001, MUT-INSTALL-002 |
| INV-TS7-13 | Required Linux AMD64 and ARM64 installation and execution are proven natively before either implementation scope is complete. | compatibility / availability | REQ-SC-003, D10 | EX-PLAT-001, MUT-PLAT-001 |
| INV-TS7-14 | Architecture and lint gates do not become one authority merely because implementations share parser technology. | architecture / governance | REQ-TA-002, D7 | PROP-SEP-002, MUT-ARCH-002 |
| INV-TS7-15 | A green `pnpm lint` alone is insufficient migration evidence; deliberate negative fixtures and mutations prove refusal. | proof / governance | REQ-LP-003 | EX-LP-002, MUT-LP-003 |
| INV-TS7-16 | No engine default, category, ambient config, or global binary silently becomes repository policy. | trust / supply chain | REQ-LP-005, D4 | PROP-LP-002, ADV-LP-001 |
| INV-TS7-17 | Scope 2 cannot begin until Scope 1 is merged, its parity evidence accepted, and a fresh v2 review epoch covers Scope 2. | governance | REQ-TA-005, D11 | PROP-REV-001, MUT-REV-001 |
| INV-TS7-18 | The compatibility wrapper and the TS6 API it resolves are exact, lock-bound identities whose version is checked at runtime. | supply chain / compatibility | REQ-SC-001, D5/D9 | EX-TS6-001, MUT-TS6-002 |
| INV-TS7-19 | Every stable engine-neutral policy entry has one canonical manifest row, one disposition, explicit role applicability, blocking posture, and executable proof references; vendor rule/parser mappings are separate. | data / governance | REQ-LP-001, REQ-LP-003 | PROP-LP-001, PROP-LP-003, PROP-MAP-001 |
| INV-TS7-20 | `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm run check:imports` remain stable conceptual entry points and stay blocking. | compatibility | REQ-TA-002, REQ-LP-006, REQ-TC-004 | EX-ENTRY-001, MUT-ENTRY-001 |
| INV-TS7-21 | Framework neutrality and all current role/path exceptions are preserved; migration does not broaden them. | governance / compatibility | REQ-LP-004, D12 | EX-ROLE-001, MUT-ROLE-001 |
| INV-TS7-22 | PR #113 remains untouched and outside every change, task, authority, and proof in this program. | governance | proposal scope, D11 | PROP-SCOPE-001 |
| INV-TS7-23 | A dev/build dependency that parses PR-controlled bytes is security-relevant regardless of `devDependency` placement. | security | REQ-SC-004, ADR-0022 | ADV-CVE-001 |
| INV-TS7-24 | Repository policy expansion is not smuggled through new-engine defaults during parity; new policy requires separate review. | governance | REQ-LP-005, D4 | PROP-LP-002, MUT-LP-004 |
| INV-TS7-25 | Semantic lint policy and conformance are separate authorities from per-engine mappings; replacing an engine may change the mapping without changing policy identity or fixture bytes. | governance / trust | REQ-LP-001, REQ-SC-006, D1/D13 | PROP-MAP-001, MUT-MAP-001 |
| INV-TS7-26 | Candidate-local consistency never proves tool-maintenance continuity: the predecessor's maintenance class binds a closed allowed-delta set, protected semantic/config/corpus/harness projection, and derived package-lock closure; the separate trusted predecessor verifier applies it, and unknown state or candidate self-widening fails closed. | security / identity | REQ-SC-006, REQ-SC-007, D13/D14 | PROP-MAINT-001, PROP-MAINT-002, ADV-MAINT-001, MUT-MAINT-001, MUT-MAINT-002, MUT-MAINT-003 |
| INV-TS7-27 | The candidate being judged never supplies the authoritative maintenance workflow, verifier executable, verifier dependencies, or invocation plan; those bytes come from the exact live predecessor, and the candidate is data or a subject under test only. | security / authority | REQ-SC-007, D14 | EX-MAINT-002, PROP-MAINT-002, MUT-MAINT-004, MUT-MAINT-005 |
| INV-TS7-28 | A maintenance proof is bound to one exact candidate head and one exact live predecessor at both start and finish; movement of either identity refuses the proof. | identity / freshness | REQ-SC-007, D14 | PROP-MAINT-002, ADV-MAINT-002, MUT-MAINT-006 |

## Authority Allocation

### Single-authority rule

Every mutable fact family has one hand-authored canonical owner. Engine configs,
workflow matrices, and documentation mirrors are generated or mechanically
checked. Historical reviews are never authority.

### Allocation table

| Authority ID | Mutable fact family | Canonical path / symbol | Authority type | Producer / owner | Consumer / verifier | Mirror and drift rule | Status |
|---|---|---|---|---|---|---|---|
| AUTH-ADR-TS7 | toolchain authority model | `docs/decisions/ADR-0022-decouple-typescript-policy-enforcement-from-lint-engine.md` | prose architecture decision | repository owner through explicit acceptance | all implementation scopes | OpenSpec references; ADR remains non-operative while Proposed | planned in PR-A |
| AUTH-LINT-POLICY-SCHEMA | allowed shape/closed vocabulary for stable engine-neutral lint policy entries, roles, dispositions, blocking posture, and proof refs | `packages/lint-config/policy.schema.json` | JSON Schema | PR-B contract-first task | policy validator/tests | no hand-written schema mirror; engine mappings have their own schema authority | planned |
| AUTH-LINT-ENGINE-MAPPINGS-SCHEMA | allowed shape/closed vocabulary for per-engine rule/parser mechanisms and option normalization keyed by stable policy ID | `packages/lint-config/engine-mappings.schema.json` | JSON Schema | PR-B contract-first task | mapping validator/generator/tests | no semantic policy fields; no hand-written schema mirror | planned |
| AUTH-LINT-POLICY | exact stable policy identities, applicability, semantic options, blocking posture, one disposition, and fixture/proof IDs | `packages/lint-config/policy.json` | machine-readable policy | reviewed policy changes | config generator, legacy drift, conformance harness, maintenance checker | docs render counts only; extractor/schema enforce bootstrap drift; maintenance checker enforces predecessor continuity | planned |
| AUTH-LINT-ENGINE-MAPPINGS | exact per-engine rule/parser mechanisms and engine-specific option normalization keyed by stable policy ID | `packages/lint-config/engine-mappings.json` | machine-readable implementation mapping | reviewed engine implementation changes | config generator, legacy/replacement runners, conformance harness | referential equality to AUTH-LINT-POLICY; generated config drift; no semantic policy fields | planned |
| AUTH-LEGACY-EXTRACTOR | derivation from effective ESLint config into normalized current policy | `packages/lint-config/src/extract-legacy-policy.mjs` | trusted derivation | PR-B | baseline/drift tests | golden snapshot digest derived from AUTH-LINT-POLICY | planned, Scope 1 only |
| AUTH-LINT-CONFIG | deterministic Oxlint representation | `packages/lint-config/generated/oxlint.json` + generator symbol | generated config | generator consuming AUTH-LINT-POLICY | Oxlint + drift test | generated file must be byte-identical; defaults/categories explicitly disabled | planned |
| AUTH-LINT-CONFORMANCE | positive/negative/fixed-output fixture bytes; policy-to-fixture IDs are referenced by AUTH-LINT-POLICY | `packages/lint-config/tests/fixtures/**` | executable fixtures | reviewed policy changes | independent legacy and replacement runners; maintenance checker | every manifest row references evidence; no orphan fixture; tool-only maintenance requires predecessor-identical fixture bytes | planned |
| AUTH-MEMBER-ROLES | exact role/path assignment, including adapter bin and exported-test distinction | `AUTH-LINT-POLICY#roles` | machine-readable policy | PR-B | member-entry validator/config generator | member configs/scripts are checked projections | planned |
| AUTH-TS-PINS | authoritative compiler declaration | `pnpm-workspace.yaml#catalog.typescript` | package policy | dependency change | version guards, pnpm | lockfile owns resolution, not declaration | existing (6.0.3), changes in Scope 2 |
| AUTH-ENGINE-PINS | selected lint and compatibility package declarations | `pnpm-workspace.yaml#catalog` entries | package policy | dependency change | pnpm, version guards | exact; no duplicate member versions | planned entries |
| AUTH-RESOLVED-GRAPH | exact transitive package and native artifact graph | `pnpm-lock.yaml` | lockfile | pnpm from catalog | frozen install / supply-chain checks | no hand-edited mirror | existing, updated each implementation scope |
| AUTH-INSTALL-POLICY | install-script and engine-strict posture | `pnpm-workspace.yaml#onlyBuiltDependencies`, `.npmrc` | package-manager policy | repository governance | pnpm install/checks | must remain `[]`; no bypass flags | existing |
| AUTH-TOOLCHAIN-BOUNDARIES-SCHEMA | shape of compatibility consumers, required platform set, and closed maintenance-class projections | `scripts/toolchain-boundaries.schema.json` | JSON Schema | PR-B contract-first task | boundary/maintenance validator | no prose mirror of exact lists | planned |
| AUTH-TS6-CONSUMERS | exact admitted TS6 API consumer paths and allowed use | `scripts/toolchain-boundaries.json#typescript6Consumers` | machine-readable allowlist | reviewed tooling changes | `scripts/check-toolchain-boundaries.mjs` | import scan must equal allowlist; initial singleton | planned |
| AUTH-PLATFORM-MATRIX | required native architectures and scope command packs | `scripts/toolchain-boundaries.json#platforms` | machine-readable policy | reviewed toolchain changes | CI matrix projection + validator | workflow rows drift-checked from policy | planned |
| AUTH-MAINTENANCE-CLASSES | exact maintenance classes, implementation authorities allowed to differ, semantic/config/corpus/harness authorities required equal, and selected package roots with derived lock-closure rule | `scripts/toolchain-boundaries.json#maintenanceClasses` | machine-readable transition policy | reviewed toolchain-governance changes | trusted predecessor verifier plus two-revision tests/CI | candidate cannot widen its own class; unrelated lock movement or protected drift refuses | planned |
| AUTH-MAINTENANCE-VERIFIER | trusted workflow trigger and execution identity, exact verifier/dependency source revision, candidate-as-data rule, predecessor-owned invocation plan, and start/end candidate/predecessor freshness | `.github/workflows/toolchain-maintenance-boundary.yml` plus `scripts/check-toolchain-boundaries.mjs#verifyMaintenance` as loaded from exact live predecessor | trusted execution protocol | repository owner through reviewed PR-B genesis; GitHub default-branch `repository_dispatch` executes it thereafter | future maintenance candidates and reviewers | workflow requires execution SHA = live predecessor, runs no candidate checker/workflow, and re-resolves both identities; candidate copy is protected data only | planned |
| AUTH-TS-CONFIGS | compiler options and role inheritance | `packages/tsconfig/{base,library,service,application,test}.json` | JSON compiler config | tsconfig package | every member tsc and config tests | member configs extend by package path; no duplicated option table | existing |
| AUTH-TS-CONFORMANCE | positive/negative compiler configuration and behavior fixtures | `packages/tsconfig/tests/**` | executable fixtures | reviewed compiler-policy changes | shared-config tests and maintenance checker | normal compiler updates require predecessor-identical policy fixtures unless separately reviewed | existing, strengthened in PR-B/C |
| AUTH-TS-ENTRYPOINTS | member typecheck/build/generator commands | each owning `package.json#scripts` | executable package contract | each member | toolchain-boundary validator / workspace tests | validator asserts normal compiler and separation | existing, checked more strongly in PR-B/C |
| AUTH-FORMAT-POLICY | exact formatting options and excluded file classes | `.prettierrc.json`, `.prettierignore`, root format scripts | formatter config | repository | Prettier and neutrality tests | lint manifest must carry no formatter rule | existing |
| AUTH-ARCH-LAYERS | package taxonomy/layer relationships | `scripts/workspace-model.mjs` | trusted typed table/derivation | repository governance | workspace and source-import checks | dedicated tests; not copied to lint manifest | existing |
| AUTH-ARCH-IMPORT-GATE | source import parsing/classification/refusal behavior | `scripts/check-source-imports.mjs` | trusted derivation | repository governance | CI/check.sh + `tests/test_source_imports.py` | behavior corpus; only API import changes | existing |
| AUTH-REVIEW-SCOPES | implementation/release scope IDs and sequencing | `tasks.md` review-scope markers and landing sections | governed task plan | PR-A | v2 review gate | review artifact refers by ID only | planned in PR-A |

No current-scope authority row is `blocked`. Human ADR acceptance, independent
review, and implementation authorization remain external gates rather than
mutable fact families this package can fill itself.

## Artifact Ownership Model

| Artifact | Owns | Must not own |
|---|---|---|
| `proposal.md` | motivation, three-PR scope, impact, non-goals | exact rules, mappings, tasks, approval |
| `specs/**` | observable required outcomes and refusals | algorithms or exact inventories |
| `design.md` | architecture, current evidence, decisions, seams | future policy values |
| `assurance.md` | invariants, authority allocation, proof matrix, readiness | implementation state |
| `tasks.md` | dependency order, paths, checks, review scopes, authorization record | requirements/policy values |
| Proposed ADR-0022 | why policy and engines are separate | implementation versions as permanent architecture |
| `preimplementation-review.md` | current independent verdict over pinned planning bytes | policy or implementation authority |

## State-Space and Interaction Analysis

| State / interaction | Required result | Invariants / proof |
|---|---|---|
| PR-A only | no dependency/config/source/CI behavior changes; ADR Proposed; implementation NOT_AUTHORIZED | INV-TS7-17, INV-TS7-22, PROP-SCOPE-001 |
| Scope 1 maintenance-authority genesis | full dual-engine/review/platform proof creates the first class and verifier; PR-B candidate bytes do not self-classify as maintenance | INV-TS7-09/26/27, EX-MAINT-001, EX-MAINT-002 |
| Scope 1 baseline extraction | every current effective ESLint rule/role/ignore appears once | INV-TS7-02/19, PROP-LP-001 |
| Scope 1 dual valid fixture | both engines accept | INV-TS7-08, EX-LP-001 |
| Scope 1 negative fixture | both engines reject for intended policy | INV-TS7-15/19, EX-LP-002 |
| Scope 1 mapping changes with semantic policy unchanged | generated config/conformance follows separate mapping; semantic manifest stays stable | INV-TS7-19/25, PROP-MAP-001 |
| engine config has extra default | generated-config/default guard fails | INV-TS7-16/24, ADV-LP-001 |
| option registers but differs | fixture parity fails; ESLint remains | INV-TS7-02/08, ADV-LP-002 |
| source-import API switches to TS6 package | all existing gate tests equivalent; only admitted import exists | INV-TS7-03/04/05, EX-ARCH-001 |
| unapproved TS6 import | boundary validator fails with path | INV-TS7-04, ADV-TS6-001 |
| Scope 1 x64 pass / ARM64 fail | Scope 1 incomplete; no cutover | INV-TS7-13, MUT-PLAT-001 |
| Scope 1 succeeds | TypeScript 6 remains authoritative; policy manifest becomes authority; two engines block | INV-TS7-01/08/19 |
| Scope 2 before fresh review | refused | INV-TS7-17, MUT-REV-001 |
| Scope 2 TS7 compile failure | cutover blocked; rollback Scope 1 | INV-TS7-01/13, EX-TS-001 |
| Scope 2 ESLint removal with orphan import/config | retirement guard fails | INV-TS7-08/20, MUT-LP-005 |
| TypeScript 7 normal API used by import gate | behavior/identity test fails | INV-TS7-03/05, MUT-ARCH-001 |
| Oxlint type-check substitutes for tsc | separation guard fails | INV-TS7-07, MUT-SEP-001 |
| vulnerability engine upgrade preserves corpus/platform/install | eligible implementation maintenance | INV-TS7-09/10, ADV-CVE-001 |
| vulnerability engine update deletes policy row + fixture | predecessor comparison refuses before candidate corpus can authorize | INV-TS7-10/25/26, MUT-MAINT-001 |
| compiler update relaxes shared tsconfig + negative fixture | predecessor comparison refuses maintenance classification | INV-TS7-01/10/26, MUT-MAINT-002 |
| maintenance predecessor unresolved | fail closed; no continuity claim | INV-TS7-26, ADV-MAINT-001 |
| candidate replaces checker with `process.exit(0)` while deleting policy/fixture | exact predecessor verifier still runs and refuses protected drift | INV-TS7-27, MUT-MAINT-004 |
| candidate deletes checker or edits workflow to skip it | default-branch workflow/predecessor checker remain authoritative; candidate copy has no effect | INV-TS7-27, MUT-MAINT-005 |
| candidate head or live predecessor moves during maintenance proof | final equality check refuses stale evidence | INV-TS7-28, MUT-MAINT-006 |
| vulnerability upgrade loses policy | rejected; current engine stays | INV-TS7-10, MUT-CVE-001 |
| `onlyBuiltDependencies` widened | supply-chain guard fails | INV-TS7-12, MUT-INSTALL-002 |
| PR #113 path appears in change | scope guard/review fails | INV-TS7-22, PROP-SCOPE-001 |

## Proof Obligations

### Positive and example proofs

| Proof ID | Property | Due landing | Evidence class |
|---|---|---|---|
| EX-LP-001 | valid fixture for every effective role passes both engines | PR-B | executable corpus |
| EX-LP-002 | every policy entry's negative fixture fails both engines for intended policy | PR-B | per-entry conformance |
| EX-ROLE-001 | library/service/application/exported-test/config-JS/adapter-bin roles preserve intended differences | PR-B | role matrix fixtures |
| EX-ARCH-001 | source-import gate passes current repository and complete behavioral corpus through TS6 seam | PR-B, repeated PR-C | command + tests |
| EX-TS6-001 | compatibility wrapper package and resolved API report exact expected identities and traditional API works | PR-B/C | version/API fixture |
| EX-INSTALL-001 | empty-tree frozen install succeeds with no lifecycle exception | PR-B/C | install log + lock check |
| EX-PLAT-001 | native AMD64 and ARM64 execute scope command pack | PR-B/C | GitHub-hosted matrix |
| EX-TS-001 | every current compiler entry point uses and reports TS7 7.0.2 | PR-C | typecheck/build/version evidence |
| EX-ENTRY-001 | stable root/member lint, typecheck, build, import entry points execute independently | PR-B/C | command orchestration tests |
| EX-MAINT-001 | Scope 1 two-revision fixtures establish a genesis class without self-admission; a later exact pin/mapping-only maintenance candidate preserves the trusted predecessor's protected semantic projection and passes the full proof net | PR-B onward | genesis assertion + two-revision maintenance fixture |
| EX-MAINT-002 | the trusted maintenance boundary executes workflow/verifier/dependency bytes from exact live predecessor while candidate Git objects are data and any candidate implementation execution is predecessor-orchestrated subject testing | PR-B onward | trusted-boundary integration fixture + hosted run evidence |

### Property proofs

| Proof ID | Property | Due landing | Method |
|---|---|---|---|
| PROP-LP-001 | extracted effective legacy set bijects with manifest entries | PR-B | set equality including roles/options/ignores |
| PROP-LP-002 | generated engine config contains only manifest-authorized rules/categories | PR-B/C | generated JSON comparison; default categories off |
| PROP-LP-003 | every policy row has exactly one disposition and proof mapping; no orphan fixture | PR-B | schema + referential integrity test |
| PROP-MAP-001 | every engine-mapping row references one existing stable policy ID; semantic policy contains no vendor rule identity and generated config equals policy + selected mapping | PR-B/C | schema/referential/config derivation |
| PROP-TS6-001 | no typecheck/build/generator invokes `tsc6` or compatibility compiler | PR-B/C | package-script scan |
| PROP-TS6-002 | actual compatibility imports equal allowlist | PR-B/C | AST import inventory equality |
| PROP-SEP-001 | lint and typecheck are distinct required commands/results | PR-B/C | workflow/script model test |
| PROP-SEP-002 | architecture gate remains separately invoked and separately tested | PR-B/C | workflow/check.sh structural + behavioral test |
| PROP-FMT-001 | no lint policy/config introduces formatter/stylistic authority | PR-B/C | manifest/config rule-family guard |
| PROP-INSTALL-001 | lifecycle policy remains exactly empty | PR-B/C | workspace policy assertion + package manifest audit |
| PROP-REV-001 | each implementation scope has unique marker and correct epoch sequencing | PR-A / each boundary | review-gate tests |
| PROP-SCOPE-001 | no PR #113 branch/commit/path/content is part of this change | PR-A/B/C | git range/path review |
| PROP-MAINT-001 | a maintenance candidate differs from an exact trusted predecessor only in its class's admitted implementation projections; all protected projections are equal | PR-B onward | two-revision Git fixtures + fail-closed checker |
| PROP-MAINT-002 | authoritative workflow SHA, verifier source, dependencies, and command plan equal the exact live predecessor; candidate workflow/checker bytes never execute as admission authority; start/end head and predecessor identities match | PR-B onward | workflow structure + mocked GitHub API movement tests + hosted evidence |

### Adversarial coverage

| Proof ID | Adversarial case | Required result | Due landing |
|---|---|---|---|
| ADV-LP-001 | engine update adds a default rule or reads nested/ambient config | default remains disabled; policy unchanged | PR-B |
| ADV-LP-002 | rule ID registers but option/semantic behavior differs | intended fixture exposes mismatch; retirement blocked | PR-B |
| ADV-LP-003 | negative fixture fails only due syntax/config error | attribution check rejects false parity | PR-B |
| ADV-LP-004 | active mapping emits warning-only or a fix-bearing option produces a different fixed form | parity fails; diagnostic presence alone is insufficient | PR-B |
| ADV-ROLE-001 | adapter bin exception globs expand to core source | role guard fails | PR-B |
| ADV-ROLE-002 | exported test relaxations applied to all existing test files | assignment drift fails | PR-B |
| ADV-TS6-001 | app/service/library/new script imports compatibility package | exact path reported; gate fails | PR-B/C |
| ADV-TS6-002 | compatibility package resolves unexpected TS6 API version | identity check fails | PR-B/C |
| ADV-INSTALL-001 | package requests install script or missing native optional artifact | install/admission fails; no auto approval/fallback | PR-B/C |
| ADV-PLAT-001 | package metadata lists ARM64 but only x64 executed | completion fails | PR-B/C |
| ADV-CVE-001 | exact engine pin changes for security remediation | full corpus/install/platform/separation net reruns | PR-B onward |
| ADV-TC-001 | used tsconfig/CLI changes between PR-A and PR-C | repeated audit discovers and assigns actual finding | PR-C |
| ADV-TC-002 | TS7 accepts syntax containing governed import edges that the TS6 parser handles differently | edge extraction is equivalent or the gate fails closed; never silent acceptance | PR-C |
| ADV-MAINT-001 | maintenance base/ref is missing, malformed, stale, unreadable, or disagrees unexpectedly | maintenance classification refuses; candidate-local checks cannot substitute | PR-B onward |
| ADV-MAINT-002 | trusted workflow/verifier/dependency missing, candidate invocation offered as fallback, or candidate/predecessor moves | refuse maintenance evidence; never execute fallback or accept stale identity | PR-B onward |

### Mutation coverage

| Mutation ID | Mutation | Killing evidence | Due landing |
|---|---|---|---|
| MUT-LP-001 | delete one extracted policy row | legacy/manifest bijection fails | PR-B |
| MUT-LP-002 | remove ESLint before complete parity | retirement completion guard fails | PR-B/C |
| MUT-LP-003 | disable one replacement mapping | assigned negative fixture survives and fails test | PR-B |
| MUT-LP-004 | enable an unowned Oxlint default/category | generated-config policy guard fails | PR-B |
| MUT-LP-005 | leave one ESLint dependency/config/member import after retirement | orphan/lock/member scan fails | PR-C |
| MUT-ROLE-001 | broaden process/console exception outside adapter bin | role fixture fails | PR-B |
| MUT-TS-001 | member/compiler command resolves TS6 after cutover | version/entry-point test fails | PR-C |
| MUT-TS6-001 | add `tsc6` to typecheck/build/generator | entry-point boundary test fails | PR-B/C |
| MUT-TS6-002 | change resolved compatibility API version without reviewed expectation | identity test fails | PR-B/C |
| MUT-ARCH-001 | switch import gate back to normal TypeScript under TS7 | API/behavior test fails | PR-C |
| MUT-ARCH-002 | remove independent `check:imports` invocation | workflow/check.sh test fails | PR-B/C |
| MUT-ARCH-003 | omit `packages/lint-config` from build-tooling classification, allow production import, or retain retired `packages/eslint-config` in the layer/tooling model | workspace/source architecture tests fail | PR-B/C |
| MUT-SEP-001 | replace `pnpm typecheck` with Oxlint `--type-check` | authority-separation test fails | PR-C |
| MUT-FMT-001 | add stylistic/formatting rule to lint policy | formatting-neutrality guard fails | PR-B/C |
| MUT-INSTALL-001 | use range/tag or mutate lock during frozen install | dependency/frozen checks fail | PR-B/C |
| MUT-INSTALL-002 | add any `onlyBuiltDependencies` entry | install-policy test fails | PR-B/C |
| MUT-PLAT-001 | remove ARM64 row or skip typed lint/import gate there | platform projection/completion test fails | PR-B/C |
| MUT-CVE-001 | engine substitution drops one policy mapping | conformance/bijection fails | PR-B onward |
| MUT-REV-001 | begin Scope 2 under Scope 1 epoch or without fresh review | review gate/authorization fails | PR-C |
| MUT-ENTRY-001 | collapse lint and typecheck to one script result | entry-point separation test fails | PR-B/C |
| MUT-MAP-001 | place a vendor rule ID/normalization back into semantic policy or leave a mapping without a policy row | policy/mapping schema and referential proof fail | PR-B/C |
| MUT-MAINT-001 | change an engine pin while deleting a policy row and its only fixture | predecessor-protected semantic/corpus comparison fails before candidate conformance | PR-B onward |
| MUT-MAINT-002 | change the TypeScript pin while relaxing shared tsconfig and deleting/weakening its negative fixture | compiler-maintenance protected projection fails | PR-B onward |
| MUT-MAINT-003 | request maintenance classification while widening the candidate class, changing trusted-verifier/platform/install/format/architecture/TS6 authority, or moving an unrelated lockfile importer/package | predecessor class and protected/derived-closure comparison fail | PR-B onward |
| MUT-MAINT-004 | change an engine pin, delete one policy row and its fixture, and replace the candidate checker with unconditional success | trusted predecessor verifier executes instead and refuses protected drift | PR-B onward |
| MUT-MAINT-005 | delete the candidate checker path or alter the candidate workflow to skip verification | default-branch boundary still invokes predecessor checker; candidate workflow/checker has no authority | PR-B onward |
| MUT-MAINT-006 | move candidate head or live predecessor after proof begins | final exact-identity recheck fails and a new run is required | PR-B onward |

## Cross-Requirement Interaction Checks

1. **Parity × compiler authority:** tsgolint may use TypeScript-Go semantics in
   Scope 1, but it cannot change the normal compiler. Any policy mismatch blocks
   rather than forcing a compiler cutover early.
2. **Compatibility × architecture:** changing the imported API package is
   allowed only if the source-import behavioral corpus remains unchanged.
3. **Policy × defaults:** rule support discovered from `--print-config` is not
   permission to enable categories or extra rules.
4. **Platform × supply chain:** metadata/tarball inspection proves distribution;
   native matrix proves execution. Neither substitutes for the other.
5. **Security response × policy:** urgency can change implementation priority,
   never fixture/parity requirements.
6. **Scope review × base movement:** each review epoch is bound to then-live main;
   a base advance before implementation requires a fresh epoch per v2 rules.
7. **PR #113 × sequencing:** #113 stays frozen and later crosses the completed
   toolchain transition once; no content is imported from it.
8. **Maintenance × predecessor identity:** a candidate may own new engine pins
   and mappings, but it cannot own the predecessor or redefine which semantic
   authorities its maintenance class must preserve.
9. **Initial cutover × future compiler remediation:** PR-C must land exactly
   TypeScript 7.0.2; a later exact normal-compiler version is a D13 maintenance
   transition, not a second compiler authority.
10. **Maintenance data × verifier authority:** predecessor-owned classes define
    admissible differences, while a separate predecessor-owned default-branch
    verifier applies them. Candidate success cannot satisfy either authority.
11. **Maintenance proof × movement:** cancellation is an optimization only;
    exact end-of-run candidate/predecessor re-resolution is the freshness proof.

## Traceability

| Requirement | Decisions | Invariants | Authorities | Proofs | Due scope |
|---|---|---|---|---|---|
| REQ-TA-001 | D5/D6/D13/D14 | 01,03,07,18,26,27,28 | TS-PINS, TS-CONFIGS, TS-CONFORMANCE, TS-ENTRYPOINTS, MAINTENANCE-CLASSES, MAINTENANCE-VERIFIER | EX-TS-001, EX-MAINT-001/002, PROP-TS6-001 | PR-B/C onward |
| REQ-TA-002 | D1/D6/D7/D8 | 06,07,14,20 | LINT-POLICY, FORMAT, ARCH, TS-CONFIGS | PROP-SEP-001/002, FMT-001 | PR-B/C |
| REQ-TA-003 | D1/D3/D13/D14 | 02,09,10,16,24,25,26,27,28 | LINT-POLICY, ENGINE-MAPPINGS, CONFORMANCE, ENGINE-PINS, MAINTENANCE-CLASSES, MAINTENANCE-VERIFIER | ADV-CVE-001, EX-MAINT-001/002, MUT-CVE-001, MUT-MAINT-001/004 | PR-B onward |
| REQ-TA-004 | D5/D7 | 03,04,05,18 | TS6-CONSUMERS, ARCH-IMPORT | EX-ARCH-001, ADV-TS6-001, ADV-TS6-002 | PR-B/C |
| REQ-TA-005 | D11 | 17,22 | REVIEW-SCOPES | PROP-REV-001, MUT-REV-001, PROP-SCOPE-001 | PR-A/B/C |
| REQ-LP-001 | D1/D13 | 02,19,25 | POLICY-SCHEMA, POLICY, ENGINE-MAPPINGS, LEGACY-EXTRACTOR | PROP-LP-001/003, PROP-MAP-001 | PR-B |
| REQ-LP-002 | D2/D3 | 08,15,20 | POLICY, CONFIG, CONFORMANCE | EX-LP-001/002 | PR-B |
| REQ-LP-003 | D2/D13 | 15,19,25 | POLICY, ENGINE-MAPPINGS, CONFORMANCE | ADV-LP-002/003/004, MUT-LP-003, MUT-MAP-001 | PR-B |
| REQ-LP-004 | D4/D8/D12 | 06,16,21,24 | MEMBER-ROLES, POLICY, FORMAT | EX-ROLE-001, ADV-ROLE-001, ADV-ROLE-002, MUT-ROLE-001 | PR-B/C |
| REQ-LP-005 | D4 | 16,24 | POLICY, CONFIG | PROP-LP-002, ADV-LP-001 | PR-B/C |
| REQ-LP-006 | D2/D11/D12 | 02,08,17,20 | POLICY, CONFORMANCE, ENGINE-PINS | MUT-LP-002/005 | PR-C |
| REQ-TC-001 | D5/D11 | 01,05,17 | TS-CONFIGS, TS-ENTRYPOINTS | ADV-TC-001 | PR-C |
| REQ-TC-002 | D5 | 01,11,13 | TS-PINS, TS-CONFIGS | EX-TS-001, EX-PLAT-001 | PR-C |
| REQ-TC-003 | D5/D7 | 03,04,05,14 | TS6-CONSUMERS, ARCH-IMPORT | EX-ARCH-001, ADV-TC-002, MUT-ARCH-001, MUT-ARCH-002 | PR-B/C |
| REQ-TC-004 | D6 | 07,14,20 | TS-ENTRYPOINTS, LINT-CONFIG | PROP-SEP-001, MUT-SEP-001 | PR-B/C |
| REQ-TC-005 | D11 | 08,13,17 | PINS, POLICY, CONFORMANCE | completion/rollback evidence | PR-C |
| REQ-SC-001 | D3/D5/D9 | 01,11,18 | PINS, RESOLVED-GRAPH | EX-INSTALL-001, MUT-INSTALL-001, MUT-INSTALL-002 | PR-B/C |
| REQ-SC-002 | D9 | 12 | INSTALL-POLICY | PROP-INSTALL-001, ADV-INSTALL-001 | PR-B/C |
| REQ-SC-003 | D10 | 13 | PLATFORM-MATRIX | EX-PLAT-001, MUT-PLAT-001 | PR-B/C |
| REQ-SC-004 | D1/D9/D13/D14 | 09,10,23,26,27,28 | POLICY, ENGINE-MAPPINGS, CONFORMANCE, INSTALL, PLATFORM, MAINTENANCE-CLASSES, MAINTENANCE-VERIFIER | ADV-CVE-001, ADV-MAINT-001/002, MUT-CVE-001, MUT-MAINT-001/004 | ongoing |
| REQ-SC-005 | D1/D3/D5/D13/D14 | 01,09,10,24,26,27,28 | ENGINE-PINS, TS-PINS, POLICY, ENGINE-MAPPINGS, CONFORMANCE, MAINTENANCE-CLASSES, MAINTENANCE-VERIFIER | EX-MAINT-001/002, ADV-CVE-001, MUT-CVE-001 | ongoing |
| REQ-SC-006 | D13/D14 | 01,09,10,25,26,27,28 | MAINTENANCE-CLASSES, MAINTENANCE-VERIFIER, POLICY, ENGINE-MAPPINGS, CONFORMANCE, TS-CONFIGS, TS-CONFORMANCE, TS6-CONSUMERS, FORMAT, ARCH, INSTALL, PLATFORM | EX-MAINT-001/002, PROP-MAINT-001/002, ADV-MAINT-001/002, MUT-MAINT-001/002/003/004/005/006 | PR-B onward |
| REQ-SC-007 | D14 | 09,10,26,27,28 | MAINTENANCE-VERIFIER, MAINTENANCE-CLASSES | EX-MAINT-002, PROP-MAINT-002, ADV-MAINT-002, MUT-MAINT-004/005/006 | PR-B onward |

## Landing Plan

| Landing | Ships | Authority posture | Required canonical authorities | Completion condition |
|---|---|---|---|---|
| PR-A | Proposed ADR-0022; proposal/specs/design/assurance/tasks/review placeholder | inert / proposed | AUTH-ADR-TS7, AUTH-REVIEW-SCOPES | strict validation and planning gates pass; independent review still required |
| PR-B | semantic policy, separate engine mappings, legacy extraction, generated replacement config, complete corpus, predecessor-bound maintenance classes, trusted default-branch verifier boundary, dual blocking lint, TS6 seam/guard, native platform proof | lint policy authority moves to manifest; trusted verifier becomes future predecessor authority; compiler stays TS6 | POLICY-SCHEMA, POLICY, ENGINE-MAPPINGS, LEGACY-EXTRACTOR, CONFIG, CONFORMANCE, MEMBER-ROLES, MAINTENANCE-CLASSES, MAINTENANCE-VERIFIER, TS6-CONSUMERS, PLATFORM-MATRIX, ENGINE-PINS | every Scope 1 proof/mutation green on x64/arm64; allowed maintenance passes; candidate-checker bypass, co-deletion, protected drift, unknown base/verifier, and head/predecessor movement die; ESLint remains |
| PR-C | TS7 pin/cutover, member replacement entrypoints, ESLint removal, retained seam, native proof | compiler authority moves to TS7; old engine retired | TS-PINS, TS-ENTRYPOINTS, existing policy/conformance/boundaries/platform | all Scope 2 proofs/mutations green; no ESLint residue; both platforms |

Every trust-sensitive authority and its verification lands atomically. There is
no partial policy manifest without drift/fixture checks and no TypeScript 7
cutover without the compatibility seam.

## Review Plan

### Architecture review

The PR-A independent review focuses on:

- whether ADR-0022 allocates authority correctly;
- completeness of the current policy/API/config inventories;
- whether manifest/config/fixture ownership avoids competing truth;
- whether maintenance classes and executable verifier authority are separate,
  with candidate bytes unable to supply the deciding workflow/checker;
- whether the dual-engine and two-epoch seams are independently safe;
- supply-chain and platform prerequisites; and
- whether any current unknown requires changing an invariant or authority.

P1 findings require the v2 five-part architecture test. Implementation detail
within an allocated manifest/config/fixture is P2 and must be assigned to a task,
not repeatedly redesign architecture.

### Implementation review

PR-B reviews complete policy extraction, fixture attribution, dual execution,
compatibility guard, trusted default-branch maintenance execution,
candidate-checker bypass/freshness mutations, and both platforms. PR-C reviews
repeat TS7 audit, compiler identity, ESLint removal completeness, retained
parity/trusted verifier boundary, and both platforms.

### Historical review trail

The first independent review is recorded in `preimplementation-review.md` with
`FOCUSED_CLOSURE_REQUIRED` against `aaa0aaf...`. It is not an admitted accepted
epoch. After the bounded planning correction, a fresh independent reviewer
replaces the current report with a new epoch-1 manifest. Superseded accepted
rounds, if any, follow the v2 append-only `reviews/<epoch>-<sha12>.md` protocol.

## Pre-Implementation Exit Gate

The package is ready for independent review only when:

- [x] Scope and non-goals are explicit.
- [x] Every current-scope requirement has positive and refusal/failure scenarios.
- [x] Every invariant has a stable ID and proof obligation.
- [x] Every technical gating decision is closed; human acceptance remains external.
- [x] Every mutable fact family has one `AUTH-*` owner.
- [x] Every planned authority has a contract-first task before consumers.
- [x] Tasks will reference authorities rather than restating exact data.
- [x] Repository assumptions are verified or explicit prerequisites.
- [x] Every proof obligation has a due landing and evidence class.
- [x] No historical finding requires archaeology.
- [x] No unresolved item requires a different invariant or trust boundary.

Architecture acceptance additionally requires:

- [ ] independent review of pinned PR-A planning bytes;
- [ ] no unresolved P1;
- [ ] all P2/P3 assigned;
- [ ] invariant set unchanged or focused closure performed;
- [ ] authority allocation confirmed complete; and
- [ ] explicit owner action for ADR-0022 before implementation authorization.

## Rollout and Rollback

### Scope 1

Rollout is repository-CI only. Both engines are blocking; no production runtime
is affected. The maintenance boundary is genesis only in PR-B and cannot
self-authorize that PR. Roll back the PR atomically if policy extraction, parity,
trusted-verifier, freshness, platform, or install proof fails. ESLint and
TypeScript 6 remain the safe predecessor.

### Scope 2

Rollout is the compiler/lint CI cutover. Rollback is the complete merged Scope 1
state. Do not retain a mixed state in which TypeScript 7 is normal but the source-
import gate or lint policy is disabled.

No already-performed external effects or persisted data require reconciliation.

## Assurance Completeness

**Readiness:** `READY_FOR_FOCUSED_REREVIEW`

### Unresolved items

- **State-model questions:** none.
- **Requirements lacking proof:** implementation proofs are allocated to PR-B/C;
  PR-A is planning-only.
- **Planned authorities lacking contract-first tasks:** none once `tasks.md` is
  complete.
- **Scenarios intentionally deferred:** compatibility-package retirement, owned
  by a future lifecycle change.
- **Repository assumptions requiring confirmation:** repeat TS7 audit against
  PR-C's then-current base; native ARM64 execution in PR-B and PR-C.
- **Human or operational decisions requiring confirmation:** explicit ADR-0022
  acceptance and implementation authorization; independent v2 review verdict.

A complete assurance artifact does not authorize implementation.
