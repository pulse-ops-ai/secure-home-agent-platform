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
| INV-TS7-01 | After Scope 2, exactly one authoritative normal repository compiler exists: TypeScript 7.0.2. | governance / compatibility | REQ-TA-001, D5 | EX-TS-001, MUT-TS-001 |
| INV-TS7-02 | No load-bearing lint policy may disappear during engine replacement. | governance / trust | REQ-LP-001, D1 | PROP-LP-001, MUT-LP-001 |
| INV-TS7-03 | The TypeScript 6 compatibility API is not an authoritative compiler. | governance | REQ-TA-001, REQ-TA-004, D5 | PROP-TS6-001, MUT-TS6-001 |
| INV-TS7-04 | `@typescript/typescript6` may be imported only from explicitly admitted repository-tooling locations. | trust | REQ-TA-004, D5 | PROP-TS6-002, ADV-TS6-001 |
| INV-TS7-05 | `scripts/check-source-imports.mjs` remains fail-closed and behaviorally operational throughout migration. | architecture / compatibility | REQ-TC-003, D7 | EX-ARCH-001, MUT-ARCH-001 |
| INV-TS7-06 | Prettier remains the sole formatting authority. | governance | REQ-TA-002, REQ-LP-004, D8 | PROP-FMT-001, MUT-FMT-001 |
| INV-TS7-07 | Compiler typecheck remains an independent gate from lint. | governance / trust | REQ-TA-002, REQ-TC-004, D6 | PROP-SEP-001, MUT-SEP-001 |
| INV-TS7-08 | ESLint is not removed until fixture-level policy parity is proven. | compatibility | REQ-LP-002, REQ-LP-006, D2 | EX-LP-001, MUT-LP-002 |
| INV-TS7-09 | A lint/tooling implementation may be upgraded or substituted for security remediation only with the complete contract green. | security | REQ-TA-003, REQ-SC-004, D1 | ADV-CVE-001, MUT-CVE-001 |
| INV-TS7-10 | No vulnerability-response substitution may silently remove or weaken a policy. | security / governance | REQ-SC-004, REQ-SC-005 | PROP-LP-001, MUT-CVE-001 |
| INV-TS7-11 | Frozen installs remain deterministic and catalog/lock identities remain exact. | supply chain | REQ-SC-001, D9 | EX-INSTALL-001, MUT-INSTALL-001 |
| INV-TS7-12 | `onlyBuiltDependencies: []` remains enforced unless a separate explicit review authorizes an exception. | supply chain / trust | REQ-SC-002, D9 | PROP-INSTALL-001, MUT-INSTALL-002 |
| INV-TS7-13 | Required Linux AMD64 and ARM64 installation and execution are proven natively before either implementation scope is complete. | compatibility / availability | REQ-SC-003, D10 | EX-PLAT-001, MUT-PLAT-001 |
| INV-TS7-14 | Architecture and lint gates do not become one authority merely because implementations share parser technology. | architecture / governance | REQ-TA-002, D7 | PROP-SEP-002, MUT-ARCH-002 |
| INV-TS7-15 | A green `pnpm lint` alone is insufficient migration evidence; deliberate negative fixtures and mutations prove refusal. | proof / governance | REQ-LP-003 | EX-LP-002, MUT-LP-003 |
| INV-TS7-16 | No engine default, category, ambient config, or global binary silently becomes repository policy. | trust / supply chain | REQ-LP-005, D4 | PROP-LP-002, ADV-LP-001 |
| INV-TS7-17 | Scope 2 cannot begin until Scope 1 is merged, its parity evidence accepted, and a fresh v2 review epoch covers Scope 2. | governance | REQ-TA-005, D11 | PROP-REV-001, MUT-REV-001 |
| INV-TS7-18 | The compatibility wrapper and the TS6 API it resolves are exact, lock-bound identities whose version is checked at runtime. | supply chain / compatibility | REQ-SC-001, D5/D9 | EX-TS6-001, MUT-TS6-002 |
| INV-TS7-19 | Every policy entry has one canonical manifest row, one disposition, explicit role applicability, and executable proof references. | data / governance | REQ-LP-001, REQ-LP-003 | PROP-LP-001, PROP-LP-003 |
| INV-TS7-20 | `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm run check:imports` remain stable conceptual entry points and stay blocking. | compatibility | REQ-TA-002, REQ-LP-006, REQ-TC-004 | EX-ENTRY-001, MUT-ENTRY-001 |
| INV-TS7-21 | Framework neutrality and all current role/path exceptions are preserved; migration does not broaden them. | governance / compatibility | REQ-LP-004, D12 | EX-ROLE-001, MUT-ROLE-001 |
| INV-TS7-22 | PR #113 remains untouched and outside every change, task, authority, and proof in this program. | governance | proposal scope, D11 | PROP-SCOPE-001 |
| INV-TS7-23 | A dev/build dependency that parses PR-controlled bytes is security-relevant regardless of `devDependency` placement. | security | REQ-SC-004, ADR-0022 | ADV-CVE-001 |
| INV-TS7-24 | Repository policy expansion is not smuggled through new-engine defaults during parity; new policy requires separate review. | governance | REQ-LP-005, D4 | PROP-LP-002, MUT-LP-004 |

## Authority Allocation

### Single-authority rule

Every mutable fact family has one hand-authored canonical owner. Engine configs,
workflow matrices, and documentation mirrors are generated or mechanically
checked. Historical reviews are never authority.

### Allocation table

| Authority ID | Mutable fact family | Canonical path / symbol | Authority type | Producer / owner | Consumer / verifier | Mirror and drift rule | Status |
|---|---|---|---|---|---|---|---|
| AUTH-ADR-TS7 | toolchain authority model | `docs/decisions/ADR-0022-decouple-typescript-policy-enforcement-from-lint-engine.md` | prose architecture decision | repository owner through explicit acceptance | all implementation scopes | OpenSpec references; ADR remains non-operative while Proposed | planned in PR-A |
| AUTH-LINT-POLICY-SCHEMA | allowed shape/closed vocabulary for lint policy entries, roles, dispositions, engine mappings, proof refs | `packages/lint-config/policy.schema.json` | JSON Schema | PR-B contract-first task | policy validator/tests | no hand-written schema mirror | planned |
| AUTH-LINT-POLICY | exact policy identities, applicability, options, one disposition, replacement mapping, fixture IDs | `packages/lint-config/policy.json` | machine-readable policy | reviewed policy changes | config generator, legacy drift, conformance harness | docs render counts only; extractor and schema enforce drift | planned |
| AUTH-LEGACY-EXTRACTOR | derivation from effective ESLint config into normalized current policy | `packages/lint-config/src/extract-legacy-policy.mjs` | trusted derivation | PR-B | baseline/drift tests | golden snapshot digest derived from AUTH-LINT-POLICY | planned, Scope 1 only |
| AUTH-LINT-CONFIG | deterministic Oxlint representation | `packages/lint-config/generated/oxlint.json` + generator symbol | generated config | generator consuming AUTH-LINT-POLICY | Oxlint + drift test | generated file must be byte-identical; defaults/categories explicitly disabled | planned |
| AUTH-LINT-CONFORMANCE | positive/negative fixture bytes and policy-to-fixture mapping | `packages/lint-config/tests/fixtures/**` referenced by AUTH-LINT-POLICY | executable fixtures | PR-B | independent legacy and replacement runners | every manifest row references evidence; no orphan fixture | planned |
| AUTH-MEMBER-ROLES | exact role/path assignment, including adapter bin and exported-test distinction | `AUTH-LINT-POLICY#roles` | machine-readable policy | PR-B | member-entry validator/config generator | member configs/scripts are checked projections | planned |
| AUTH-TS-PINS | authoritative compiler declaration | `pnpm-workspace.yaml#catalog.typescript` | package policy | dependency change | version guards, pnpm | lockfile owns resolution, not declaration | existing (6.0.3), changes in Scope 2 |
| AUTH-ENGINE-PINS | selected lint and compatibility package declarations | `pnpm-workspace.yaml#catalog` entries | package policy | dependency change | pnpm, version guards | exact; no duplicate member versions | planned entries |
| AUTH-RESOLVED-GRAPH | exact transitive package and native artifact graph | `pnpm-lock.yaml` | lockfile | pnpm from catalog | frozen install / supply-chain checks | no hand-edited mirror | existing, updated each implementation scope |
| AUTH-INSTALL-POLICY | install-script and engine-strict posture | `pnpm-workspace.yaml#onlyBuiltDependencies`, `.npmrc` | package-manager policy | repository governance | pnpm install/checks | must remain `[]`; no bypass flags | existing |
| AUTH-TOOLCHAIN-BOUNDARIES-SCHEMA | shape of compatibility consumers and required platform set | `scripts/toolchain-boundaries.schema.json` | JSON Schema | PR-B contract-first task | boundary validator | no prose mirror of exact lists | planned |
| AUTH-TS6-CONSUMERS | exact admitted TS6 API consumer paths and allowed use | `scripts/toolchain-boundaries.json#typescript6Consumers` | machine-readable allowlist | reviewed tooling changes | `scripts/check-toolchain-boundaries.mjs` | import scan must equal allowlist; initial singleton | planned |
| AUTH-PLATFORM-MATRIX | required native architectures and scope command packs | `scripts/toolchain-boundaries.json#platforms` | machine-readable policy | reviewed toolchain changes | CI matrix projection + validator | workflow rows drift-checked from policy | planned |
| AUTH-TS-CONFIGS | compiler options and role inheritance | `packages/tsconfig/{base,library,service,application,test}.json` | JSON compiler config | tsconfig package | every member tsc and config tests | member configs extend by package path; no duplicated option table | existing |
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
| Scope 1 baseline extraction | every current effective ESLint rule/role/ignore appears once | INV-TS7-02/19, PROP-LP-001 |
| Scope 1 dual valid fixture | both engines accept | INV-TS7-08, EX-LP-001 |
| Scope 1 negative fixture | both engines reject for intended policy | INV-TS7-15/19, EX-LP-002 |
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

### Property proofs

| Proof ID | Property | Due landing | Method |
|---|---|---|---|
| PROP-LP-001 | extracted effective legacy set bijects with manifest entries | PR-B | set equality including roles/options/ignores |
| PROP-LP-002 | generated engine config contains only manifest-authorized rules/categories | PR-B/C | generated JSON comparison; default categories off |
| PROP-LP-003 | every policy row has exactly one disposition and proof mapping; no orphan fixture | PR-B | schema + referential integrity test |
| PROP-TS6-001 | no typecheck/build/generator invokes `tsc6` or compatibility compiler | PR-B/C | package-script scan |
| PROP-TS6-002 | actual compatibility imports equal allowlist | PR-B/C | AST import inventory equality |
| PROP-SEP-001 | lint and typecheck are distinct required commands/results | PR-B/C | workflow/script model test |
| PROP-SEP-002 | architecture gate remains separately invoked and separately tested | PR-B/C | workflow/check.sh structural + behavioral test |
| PROP-FMT-001 | no lint policy/config introduces formatter/stylistic authority | PR-B/C | manifest/config rule-family guard |
| PROP-INSTALL-001 | lifecycle policy remains exactly empty | PR-B/C | workspace policy assertion + package manifest audit |
| PROP-REV-001 | each implementation scope has unique marker and correct epoch sequencing | PR-A / each boundary | review-gate tests |
| PROP-SCOPE-001 | no PR #113 branch/commit/path/content is part of this change | PR-A/B/C | git range/path review |

### Adversarial coverage

| Proof ID | Adversarial case | Required result | Due landing |
|---|---|---|---|
| ADV-LP-001 | engine update adds a default rule or reads nested/ambient config | default remains disabled; policy unchanged | PR-B |
| ADV-LP-002 | rule ID registers but option/semantic behavior differs | intended fixture exposes mismatch; retirement blocked | PR-B |
| ADV-LP-003 | negative fixture fails only due syntax/config error | attribution check rejects false parity | PR-B |
| ADV-ROLE-001 | adapter bin exception globs expand to core source | role guard fails | PR-B |
| ADV-ROLE-002 | exported test relaxations applied to all existing test files | assignment drift fails | PR-B |
| ADV-TS6-001 | app/service/library/new script imports compatibility package | exact path reported; gate fails | PR-B/C |
| ADV-TS6-002 | compatibility package resolves unexpected TS6 API version | identity check fails | PR-B/C |
| ADV-INSTALL-001 | package requests install script or missing native optional artifact | install/admission fails; no auto approval/fallback | PR-B/C |
| ADV-PLAT-001 | package metadata lists ARM64 but only x64 executed | completion fails | PR-B/C |
| ADV-CVE-001 | exact engine pin changes for security remediation | full corpus/install/platform/separation net reruns | PR-B onward |
| ADV-TC-001 | used tsconfig/CLI changes between PR-A and PR-C | repeated audit discovers and assigns actual finding | PR-C |

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
| MUT-SEP-001 | replace `pnpm typecheck` with Oxlint `--type-check` | authority-separation test fails | PR-C |
| MUT-FMT-001 | add stylistic/formatting rule to lint policy | formatting-neutrality guard fails | PR-B/C |
| MUT-INSTALL-001 | use range/tag or mutate lock during frozen install | dependency/frozen checks fail | PR-B/C |
| MUT-INSTALL-002 | add any `onlyBuiltDependencies` entry | install-policy test fails | PR-B/C |
| MUT-PLAT-001 | remove ARM64 row or skip typed lint/import gate there | platform projection/completion test fails | PR-B/C |
| MUT-CVE-001 | engine substitution drops one policy mapping | conformance/bijection fails | PR-B onward |
| MUT-REV-001 | begin Scope 2 under Scope 1 epoch or without fresh review | review gate/authorization fails | PR-C |
| MUT-ENTRY-001 | collapse lint and typecheck to one script result | entry-point separation test fails | PR-B/C |

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

## Traceability

| Requirement | Decisions | Invariants | Authorities | Proofs | Due scope |
|---|---|---|---|---|---|
| REQ-TA-001 | D5/D6 | 01,03,07,18 | TS-PINS, TS-CONFIGS, TS-ENTRYPOINTS | EX-TS-001, PROP-TS6-001 | PR-B/C |
| REQ-TA-002 | D1/D6/D7/D8 | 06,07,14,20 | LINT-POLICY, FORMAT, ARCH, TS-CONFIGS | PROP-SEP-001/002, FMT-001 | PR-B/C |
| REQ-TA-003 | D1/D3 | 02,09,10,16,24 | LINT-POLICY, CONFORMANCE, ENGINE-PINS | ADV-CVE-001, MUT-CVE-001 | PR-B onward |
| REQ-TA-004 | D5/D7 | 03,04,05,18 | TS6-CONSUMERS, ARCH-IMPORT | EX-ARCH-001, ADV-TS6-001, ADV-TS6-002 | PR-B/C |
| REQ-TA-005 | D11 | 17,22 | REVIEW-SCOPES | PROP-REV-001, MUT-REV-001, PROP-SCOPE-001 | PR-A/B/C |
| REQ-LP-001 | D1 | 02,19 | POLICY-SCHEMA, POLICY, LEGACY-EXTRACTOR | PROP-LP-001/003 | PR-B |
| REQ-LP-002 | D2/D3 | 08,15,20 | POLICY, CONFIG, CONFORMANCE | EX-LP-001/002 | PR-B |
| REQ-LP-003 | D2 | 15,19 | POLICY, CONFORMANCE | ADV-LP-002/003, MUT-LP-003 | PR-B |
| REQ-LP-004 | D4/D8/D12 | 06,16,21,24 | MEMBER-ROLES, POLICY, FORMAT | EX-ROLE-001, ADV-ROLE-001, ADV-ROLE-002, MUT-ROLE-001 | PR-B/C |
| REQ-LP-005 | D4 | 16,24 | POLICY, CONFIG | PROP-LP-002, ADV-LP-001 | PR-B/C |
| REQ-LP-006 | D2/D11/D12 | 02,08,17,20 | POLICY, CONFORMANCE, ENGINE-PINS | MUT-LP-002/005 | PR-C |
| REQ-TC-001 | D5/D11 | 01,05,17 | TS-CONFIGS, TS-ENTRYPOINTS | ADV-TC-001 | PR-C |
| REQ-TC-002 | D5 | 01,11,13 | TS-PINS, TS-CONFIGS | EX-TS-001, EX-PLAT-001 | PR-C |
| REQ-TC-003 | D5/D7 | 03,04,05,14 | TS6-CONSUMERS, ARCH-IMPORT | EX-ARCH-001, MUT-ARCH-001, MUT-ARCH-002 | PR-B/C |
| REQ-TC-004 | D6 | 07,14,20 | TS-ENTRYPOINTS, LINT-CONFIG | PROP-SEP-001, MUT-SEP-001 | PR-B/C |
| REQ-TC-005 | D11 | 08,13,17 | PINS, POLICY, CONFORMANCE | completion/rollback evidence | PR-C |
| REQ-SC-001 | D3/D5/D9 | 01,11,18 | PINS, RESOLVED-GRAPH | EX-INSTALL-001, MUT-INSTALL-001, MUT-INSTALL-002 | PR-B/C |
| REQ-SC-002 | D9 | 12 | INSTALL-POLICY | PROP-INSTALL-001, ADV-INSTALL-001 | PR-B/C |
| REQ-SC-003 | D10 | 13 | PLATFORM-MATRIX | EX-PLAT-001, MUT-PLAT-001 | PR-B/C |
| REQ-SC-004 | D1/D9 | 09,10,23 | POLICY, CONFORMANCE, INSTALL, PLATFORM | ADV-CVE-001, MUT-CVE-001 | ongoing |
| REQ-SC-005 | D1/D3 | 09,10,24 | ENGINE-PINS, POLICY, CONFORMANCE | ADV-CVE-001, MUT-CVE-001 | ongoing |

## Landing Plan

| Landing | Ships | Authority posture | Required canonical authorities | Completion condition |
|---|---|---|---|---|
| PR-A | Proposed ADR-0022; proposal/specs/design/assurance/tasks/review placeholder | inert / proposed | AUTH-ADR-TS7, AUTH-REVIEW-SCOPES | strict validation and planning gates pass; independent review still required |
| PR-B | policy authorities, legacy extraction, generated replacement config, complete corpus, dual blocking lint, TS6 seam/guard, native platform proof | lint policy authority moves to manifest; compiler stays TS6 | POLICY-SCHEMA, POLICY, LEGACY-EXTRACTOR, CONFIG, CONFORMANCE, MEMBER-ROLES, TS6-CONSUMERS, PLATFORM-MATRIX, ENGINE-PINS | every Scope 1 proof/mutation green on x64/arm64; ESLint remains |
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
- whether the dual-engine and two-epoch seams are independently safe;
- supply-chain and platform prerequisites; and
- whether any current unknown requires changing an invariant or authority.

P1 findings require the v2 five-part architecture test. Implementation detail
within an allocated manifest/config/fixture is P2 and must be assigned to a task,
not repeatedly redesign architecture.

### Implementation review

PR-B reviews complete policy extraction, fixture attribution, dual execution,
compatibility guard, and both platforms. PR-C reviews repeat TS7 audit, compiler
identity, ESLint removal completeness, retained parity, and both platforms.

### Historical review trail

No review history is created in PR-A. `preimplementation-review.md` remains
`REVIEW_REQUIRED`. Superseded accepted rounds, if any, follow the v2 append-only
`reviews/<epoch>-<sha12>.md` protocol.

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
is affected. Roll back the PR atomically if policy extraction, parity, platform,
or install proof fails. ESLint and TypeScript 6 remain the safe predecessor.

### Scope 2

Rollout is the compiler/lint CI cutover. Rollback is the complete merged Scope 1
state. Do not retain a mixed state in which TypeScript 7 is normal but the source-
import gate or lint policy is disabled.

No already-performed external effects or persisted data require reconciliation.

## Assurance Completeness

**Readiness:** `READY_FOR_INDEPENDENT_REVIEW`

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
