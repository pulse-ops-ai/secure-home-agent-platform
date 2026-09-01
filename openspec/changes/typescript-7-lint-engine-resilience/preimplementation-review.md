# Pre-Implementation Review: TypeScript 7 and lint-engine resilience

<!--
This report is the first independent architecture review of the complete PR-A
planning package. It is pinned to aaa0aaf1d86f39eb6546baf9aea6966307806e7b
and records one bounded P1 closure question. It does not accept the architecture
and it creates no implementation authority.
-->

<!-- openspec-review-gate
{
  "contract": "preimplementation-review-v2",
  "schema": "governed-spec-driven-v2",
  "rubric": "governed-preimplementation-review-v1",
  "reviewed_commit": "aaa0aaf1d86f39eb6546baf9aea6966307806e7b",
  "reviewed_base_commit": "70f23f43a6ca95f128de664c242187ad6026a67d",
  "review_epoch": 1,
  "scope_id": "replacement-authority-parity",
  "reviewed_at": "2026-08-31T22:15:42Z",
  "reviewer": "Fugu worker agent — independent architecture review",
  "verdict": "FOCUSED_CLOSURE_REQUIRED",
  "unresolved_p1_count": 1,
  "unassigned_p2_p3_count": 0,
  "invariant_set_changed": true,
  "authority_allocation_complete": false,
  "reviewed_artifacts": [
    {
      "path": ".openspec.yaml",
      "sha256": "212a6ad71ca36b84fdbef9c954c23bb5f5551512f74a3b8205c70c639d2111e1"
    },
    {
      "path": "proposal.md",
      "sha256": "b58d7971b9a60e458a4683af1e1e072b1af35004d8dbb901b5d3e1ce8dd6dc4e"
    },
    {
      "path": "specs/lint-policy-parity/spec.md",
      "sha256": "50cfb1795e6ae1e14e490a2bcc7d3f1644692d434ee49c9e82a243c020276950"
    },
    {
      "path": "specs/toolchain-authority/spec.md",
      "sha256": "fc2832fdb79f17021fb650eee9ff52ed2a3939bfeb3f064790fde87c052c4501"
    },
    {
      "path": "specs/toolchain-supply-chain/spec.md",
      "sha256": "382ce564d46f6a67a39a7c75754d835d42fdd6251f30c559630397c22d032209"
    },
    {
      "path": "specs/typescript-7-cutover/spec.md",
      "sha256": "c15f305426a533b7985cb0d67284e2e11398219611cd01efd57b26c13107fd3f"
    },
    {
      "path": "design.md",
      "sha256": "28f618907bcd2fbddb31b4cb9b1e2b1a1991a6f8605b950cf45f641051b5f1cb"
    },
    {
      "path": "assurance.md",
      "sha256": "9a3220709249a7f9a3bd432643e2e1168e518eb0ecb31d8e3c633f33468664e2"
    },
    {
      "path": "tasks.md",
      "sha256": "7980f8cd93d54790c38f9bef61e6725ddc3bf9ae629275968bec5a8deff2ed60"
    }
  ]
}
-->

## Review Pin

| Field | Value |
|---|---|
| Repository | `pulse-ops-ai/secure-home-agent-platform` |
| Branch | `docs/typescript-7-lint-engine-resilience` |
| Reviewed commit | `aaa0aaf1d86f39eb6546baf9aea6966307806e7b` |
| Default branch / planning base | `main` / `70f23f43a6ca95f128de664c242187ad6026a67d`, re-resolved from `refs/heads/main` |
| Worktree state | clean before this report; local and remote branch heads matched |
| Review rubric | `governed-preimplementation-review-v1` |
| Historical review consulted after blind pass | none present |

The reviewed commit contains the complete planning package. This report is the
only worktree change made during the review pass.

## Independent Review Statement

The reviewer did not author the planning package in the same working context.
The exact current package was read before searching for historical review
material; none exists. The review was read-only except for this report.

Repository claims were checked against the current ESLint configs and fixtures,
all member lint entry points, `scripts/check-source-imports.mjs`,
`scripts/workspace-model.mjs`, the v2 schema and review gate, package manifests,
the live remote refs, npm package metadata, and prior repository ADR-acceptance
history. No live external mutation was performed.

## Reviewed Artifact Manifest

The machine-readable block is authoritative for exact paths and SHA-256 values.

| Path | SHA-256 | Read completely? |
|---|---|---|
| `.openspec.yaml` | `212a6ad71ca36b84fdbef9c954c23bb5f5551512f74a3b8205c70c639d2111e1` | yes |
| `proposal.md` | `b58d7971b9a60e458a4683af1e1e072b1af35004d8dbb901b5d3e1ce8dd6dc4e` | yes |
| `specs/lint-policy-parity/spec.md` | `50cfb1795e6ae1e14e490a2bcc7d3f1644692d434ee49c9e82a243c020276950` | yes |
| `specs/toolchain-authority/spec.md` | `fc2832fdb79f17021fb650eee9ff52ed2a3939bfeb3f064790fde87c052c4501` | yes |
| `specs/toolchain-supply-chain/spec.md` | `382ce564d46f6a67a39a7c75754d835d42fdd6251f30c559630397c22d032209` | yes |
| `specs/typescript-7-cutover/spec.md` | `c15f305426a533b7985cb0d67284e2e11398219611cd01efd57b26c13107fd3f` | yes |
| `design.md` | `28f618907bcd2fbddb31b4cb9b1e2b1a1991a6f8605b950cf45f641051b5f1cb` | yes |
| `assurance.md` | `9a3220709249a7f9a3bd432643e2e1168e518eb0ecb31d8e3c633f33468664e2` | yes |
| `tasks.md` | `7980f8cd93d54790c38f9bef61e6725ddc3bf9ae629275968bec5a8deff2ed60` | yes |

Historical reviews and this report are not members of the planning-byte
manifest.

## Review Method

### Pass A — blind current-state review

The review independently reconstructed:

1. the complete current lint topology and 117-rule effective union;
2. the singleton traditional TypeScript compiler-API consumer;
3. compiler, lint, format, architecture, package-install, and platform
   authority boundaries;
4. the two implementation-scope transition;
5. every `AUTH-*` allocation and its planned producer/verifier;
6. positive, property, adversarial, and mutation obligations; and
7. future vulnerability-remediation behavior after the legacy oracle is gone.

The last step found the P1 below: candidate-local policy and candidate-local
fixtures cannot prove that an engine-only maintenance change preserved the
trusted predecessor's policy.

### Pass B — regression and history review

No historical `reviews/**` records exist. Repository history was consulted only
after the current-byte pass to confirm ADR status/acceptance conventions and
that no earlier review disposition supplied the missing predecessor-bound
maintenance proof.

## Architecture Acceptance Checks

| Check | Result | Evidence |
|---|---|---|
| Scope and non-goals are explicit | pass | proposal Scope/Non-Goals; design Goals/Non-Goals |
| Current-scope requirements are observable and scenario-backed | pass | 21 requirements across four delta specs |
| Trust boundaries and external effects are explicit | pass | design TB-TS7-1 through TB-TS7-7 |
| Current-scope gating decisions are closed | fail | engine-maintenance policy continuity has no trusted predecessor boundary |
| Invariants are stable, concise, and traceable | fail | INV-TS7-09/10 need predecessor-bound semantics; initial TS7 cutover identity must be distinguished from later conforming maintenance |
| Every mutable fact family has exactly one canonical authority | fail | engine mapping is mixed into semantic policy and no authority owns maintenance transition admissibility |
| Planned authorities have contract-first tasks before consumers | pass for allocated authorities | tasks 1.1–1.4 and 1.13–1.15 |
| Repository assumptions were verified | pass | effective ESLint API probe, tracked-source scan, npm metadata, v2 gate, live refs |
| Landing seams are atomic and safely ordered | pass for PR-A/B/C | design Landing Seams; tasks Completion Gates |
| Proof obligations and hostile cases have due landings | fail | delete-policy-row-plus-fixture mutation has no killing evidence |
| Tasks are bounded and do not restate canonical data | pass | tasks 1.1–4.5 |
| Material prior findings have executable regression dispositions | not applicable | no prior review |

## Severity Calibration

P1 is reserved for a concrete failure that changes an invariant, authority
allocation, trust boundary, prerequisite, or external identity model. P2 covers
bounded implementation details inside those allocations; P3 covers clarity.

The policy-deletion trace below is P1 because fixing it requires both an
authority split and a trusted predecessor identity for maintenance transitions.
The remaining findings fit existing tasks and proofs and are P2.

## Findings

### P1 findings

**Unresolved P1 findings:** `1`

| ID | Title | Invariant / decision | Concrete failure trace | Evidence | Impact | Architecture change required |
|---|---|---|---|---|---|---|
| P1-001 | Security-remediation parity is candidate-self-consistent, not predecessor-bound | `INV-TS7-02`, `INV-TS7-09`, `INV-TS7-10`, `INV-TS7-19`; D1/D3 | After Scope 2 removes ESLint and `AUTH-LEGACY-EXTRACTOR`, a CVE update deletes policy row R and its only fixture F, changes the engine pin/mapping, regenerates config, and runs the remaining candidate corpus. Schema, no-orphan, config, install, platform, and remaining conformance checks can all pass because every input they compare is supplied by the same candidate. | `assurance.md` AUTH-LINT-POLICY/CONFORMANCE rows, `MUT-CVE-001`; tasks 1.3, 1.15, 3.4; ADR-0022 §§6,10 | The repository can report that replacement Y preserves policy although R and the evidence that would expose its loss disappeared together. The same shape permits a compiler update to relax shared tsconfig/conformance bytes while retaining a green candidate-only run. | Separate engine-neutral policy/conformance authority from engine mappings, and add a fail-closed maintenance-transition authority that binds protected semantic inputs to a trusted predecessor. Engine-only maintenance may change only admitted implementation identities/mappings/generated projections. Unresolvable predecessor identity or any protected-policy/config/corpus drift must refuse maintenance classification and require the separately reviewed policy/architecture path. |

### P2 findings

| ID | Title | Evidence | Required executable closure | Owning task / landing |
|---|---|---|---|---|
| P2-001 | New and retired lint packages need explicit workspace-architecture projection | `scripts/workspace-model.mjs` currently names `packages/eslint-config` in both `LAYERS` and `BUILD_TOOLING_PACKAGES`; tasks 1.1/3.4 do not name that projection | Add `packages/lint-config` as build tooling/layer 0 with source-import mutation coverage; remove the retired package from both maps atomically in Scope 2 | tasks 1.1, 1.3, 3.4; `PROP-SEP-002` |
| P2-002 | Blocking severity and fix-option semantics need explicit fixture evidence | every active current rule resolves at severity 2; `consistent-type-imports.fixStyle=inline-type-imports` affects fix output, not only accept/reject | Require generated enforcement to remain blocking, assert negative-command exit status, and use a fix-output golden case where an existing option governs observable fix behavior | tasks 1.1, 1.3, 1.7, 1.8, 1.12; `ADV-LP-002` |
| P2-003 | The TS6 parser seam needs TS7-language compatibility falsification | `scripts/check-source-imports.mjs` will parse compiler-authoritative TS7 source with TS6 `createSourceFile`; current-base source passing is not a syntax-delta proof | Compile representative TS7-accepted syntax with the authoritative compiler, then require the TS6-backed gate either to extract all import edges equivalently or fail closed; include a forbidden-edge mutation | tasks 3.1, 3.5; `EX-ARCH-001`, `ADV-TC-001` |

### P3 findings

None.

**Unassigned P2/P3 findings:** `0`

## Authority Allocation Assessment

| AUTH ID | Result | Evidence / finding |
|---|---|---|
| AUTH-ADR-TS7 | pass | Proposed ADR is explicit and non-operative |
| AUTH-LINT-POLICY-SCHEMA | focused correction required | schema must distinguish semantic policy from engine mapping |
| AUTH-LINT-POLICY | fail — P1-001 | currently owns both semantic policy and replacement mapping |
| AUTH-LEGACY-EXTRACTOR | pass for Scope 1 | independent bootstrap oracle, explicitly temporary |
| AUTH-LINT-CONFIG | pass | generated engine projection |
| AUTH-LINT-CONFORMANCE | fail — P1-001 | candidate corpus has no trusted-predecessor continuity proof |
| AUTH-MEMBER-ROLES | pass | one policy subsection owns exact assignments |
| AUTH-TS-PINS | focused correction required | initial 7.0.2 cutover and later conforming maintenance need distinct temporal semantics |
| AUTH-ENGINE-PINS | pass | exact catalog declarations |
| AUTH-RESOLVED-GRAPH | pass | frozen lock owns resolution |
| AUTH-INSTALL-POLICY | pass | current empty install-script posture is explicit |
| AUTH-TOOLCHAIN-BOUNDARIES-SCHEMA | pass | closed shape planned contract-first |
| AUTH-TS6-CONSUMERS | pass | singleton allowlist plus equality guard planned |
| AUTH-PLATFORM-MATRIX | pass | exact native rows and command packs have one owner |
| AUTH-TS-CONFIGS | focused correction required | maintenance path must bind compiler-policy config to predecessor |
| AUTH-TS-ENTRYPOINTS | pass | each member owns executable compiler entry points |
| AUTH-FORMAT-POLICY | pass | existing Prettier config remains sole authority |
| AUTH-ARCH-LAYERS | pass with P2-001 | authority exists; package projection is an implementation assignment |
| AUTH-ARCH-IMPORT-GATE | pass with P2-003 | existing behavior owner remains independent |
| AUTH-REVIEW-SCOPES | pass | exactly two implementation scopes are declared |
| Missing maintenance-transition authority | fail — P1-001 | no owner selects trusted predecessor or admitted authority deltas |

**Authority allocation complete:** `NO`

## Repository Feasibility

| Claim | Repository evidence inspected | Result | Finding / consequence |
|---|---|---|---|
| Current lint union is 117 identities with the stated role counts | real ESLint 10.8 `calculateConfigForFile` over library/service/application/adapter/config/test modes | verified | 99/96/96/99/96/88/99/91; union 117 |
| Active rule severity is blocking | effective configs | verified | all enabled settings resolve to severity 2 |
| Traditional compiler API has one direct owned consumer | tracked import/API-symbol scan | verified | only `scripts/check-source-imports.mjs` |
| Current TypeScript configuration count is 35 | tracked files whose basename matches `tsconfig*.json` | verified | shared configs plus members/fixture |
| Exact proposed packages exist with stated distribution shapes | npm registry metadata for TS 7.0.2, Oxlint 1.80.0, oxlint-tsgolint 7.0.2001, and typescript6 6.0.2 | verified | x64/arm64 package publication; execution remains implementation proof |
| `onlyBuiltDependencies` is exactly empty | `pnpm-workspace.yaml` | verified | no exception authorized |
| v2 manifest binds current planning bytes and live base | repository review manifest command with `--remote origin/main` | verified | exact manifest above |
| Maintenance path proves predecessor policy unchanged | specs/design/assurance/tasks | absent | P1-001 |

## Invariant Stability

- Invariant set before review: `INV-TS7-01` through `INV-TS7-24`
- Invariant set after review: focused closure must add predecessor-bound
  maintenance continuity and distinguish the initial TS7 cutover pin from later
  conforming compiler maintenance
- New invariant required by this review: yes — exact IDs assigned by closure
- Existing invariant removed or materially changed: `INV-TS7-01`,
  `INV-TS7-09`, and `INV-TS7-10` require temporal/transition clarification

**Invariant set changed by this review:** `YES`

## Review-Finding Regression Promotion

| Finding | Canonical authority changed | Executable regression evidence | Owning task / existing path |
|---|---|---|---|
| P1-001 | add engine-mapping and maintenance-transition authorities; narrow semantic policy authority | delete one policy row and its only fixture while changing an engine pin; maintenance classification must fail against trusted predecessor. Repeat with shared-tsconfig relaxation during a compiler update and with an unresolvable predecessor. | bounded correction to assurance/tasks; implementation in Scope 1 |
| P2-001 | AUTH-ARCH-LAYERS | production import of `@secure-home/lint-config` must fail; retired package residue must fail | tasks 1.1/3.4 |
| P2-002 | AUTH-LINT-POLICY-SCHEMA / AUTH-LINT-CONFORMANCE | warning-only mapping and wrong fix output must fail | tasks 1.3/1.7/1.8/1.12 |
| P2-003 | AUTH-ARCH-IMPORT-GATE | TS7-accepted syntax containing forbidden import edge cannot pass unseen | tasks 3.1/3.5 |

## Focused Closure Required

| Closure question | Required evidence | Re-review scope | Stop condition |
|---|---|---|---|
| Can a tooling-security maintenance change alter implementation identity/mapping while proving that semantic policy, conformance fixtures, compiler-policy config, platform requirements, install posture, formatting authority, and architecture gates are unchanged from a trusted predecessor? | Separate semantic policy from engine mappings; allocate a trusted predecessor/allowed-delta authority; add fail-closed unresolved-base behavior; add row+fixture deletion, tsconfig relaxation, protected-corpus edit, and allowed mapping-only mutations with bounded tasks/proofs | ADR-0022 §§1/2/6/10, REQ-LP-001/003, REQ-SC-004/005, design D1/D3/D5, assurance authority/proof tables, Scope 1 tasks | one bounded planning correction defines the transition authority and mutations without changing the selected engines, two implementation scopes, TS6 seam, platform set, or PR #113 boundary; then a fresh independent review of the corrected bytes |

Do not reopen the complete architecture. The compiler/lint/format/architecture
separation, dual-engine parity scope, TS7 cutover scope, TS6 compatibility seam,
exact package audit, native platforms, and PR #113 freeze remain accepted review
premises for the focused re-review.

## Verdict

**FOCUSED_CLOSURE_REQUIRED**

### Verdict rationale

The architecture is otherwise complete and repository-feasible, but its
vulnerability-remediation promise is not yet authoritative: after legacy
retirement, the candidate currently supplies both the policy being claimed and
the evidence used to claim it. One bounded authority/transition correction is
required. No implementation is authorized.

## Apply Eligibility

- Review gate metadata valid: yes for a focused finding; not an accepting gate
- Reviewed artifact digests current: yes for reviewed commit `aaa0aaf...`
- Repository state unchanged except this report and `reviews/**`: yes
- Strict OpenSpec validation passed: yes at the reviewed commit
- Verdict is `ARCHITECTURE_ACCEPTED`: no
- Unresolved P1 count is zero: no
- Invariant set unchanged by the accepting review: no
- Authority allocation complete: no
- External implementation authorization recorded and scope-covering: no

**Apply eligible:** `NO`

## Review History

No admitted historical round exists. This focused report is not an accepted
epoch. After the bounded correction, a fresh independent reviewer must replace
the current report with a new epoch-1 manifest over the corrected planning
commit. It must not rely on this report as current authority.

## Subsequent review status (non-accepting addendum, 2026-09-01)

This report remains the pinned first review over `aaa0aaf...` and is **not** an
accepting gate. Two developments postdate it and are recorded here for accuracy;
neither changes this verdict:

1. A second controlling independent review
   (`pull/114#pullrequestreview-5074082616`, over head `700d798...`) raised three
   P1 findings — (P1-1) isolate candidate tool execution into three trust domains
   (trusted control / untrusted subject / trusted verdict) with a precise subject
   isolation contract; (P1-2) add a dedicated acceptance-only ADR vehicle (PR-A2);
   and (P1-3) bind maintenance evidence to merge consumption via a bounded owner
   control (`MAN-TS7-01`) — plus P2 corrections (trust-critical markings,
   credential precision, `REQ-TC-002` refinement, a closed
   `normal-compiler-and-typed-lint` composite class, and emitted-output golden
   evidence).
2. PR #114 (the PR-A vehicle) merged before that review was addressed. This
   remedial planning-only correction applies those findings to the artifacts now
   on `main`.

Because the planning bytes have changed again since both `aaa0aaf...` and
`700d798...`, the machine-readable gate above is intentionally stale and
non-accepting. **A fresh independent epoch-1 review over the exact corrected head
is required.** This addendum does not accept the architecture, does not record
`ARCHITECTURE_ACCEPTED`, and creates no implementation eligibility. Apply
eligibility remains `NO`.
