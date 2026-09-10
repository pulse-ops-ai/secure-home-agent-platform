# Pre-Implementation Review: TypeScript 7 and lint-engine resilience

<!--
This report is the accepting epoch-2 focused base-freshness review of the
`replacement-authority-parity` scope.

Epoch 1 already accepted the Scope-1 architecture. This epoch does not reopen
that architecture. It determines whether repository movement after epoch 1
invalidated any accepted Scope-1 assumption, invariant, authority allocation,
trust boundary, prerequisite, or external identity model.

PR-B historically began from exact post-PR-A2 main
cb7836148db24971826b886361593950570b4af4 as required by INV-TS7-31. Before
implementation, that same zero-implementation branch incorporated the reviewed
governance-infrastructure advance by fast-forward to current target base
10d04a05df18db634d47737c8235d0e4351f8ac0.
-->

<!-- openspec-review-gate
{
  "contract": "preimplementation-review-v2",
  "schema": "governed-spec-driven-v2",
  "rubric": "governed-preimplementation-review-v1",
  "reviewed_commit": "70680c1c3eea2421ac39f6c4c6be862f4c0a0cdc",
  "reviewed_base_commit": "10d04a05df18db634d47737c8235d0e4351f8ac0",
  "review_epoch": 2,
  "scope_id": "replacement-authority-parity",
  "reviewed_at": "2026-09-03T16:11:39Z",
  "reviewer": "GPT-5.6 Sol — independent architecture review",
  "verdict": "ARCHITECTURE_ACCEPTED",
  "unresolved_p1_count": 0,
  "unassigned_p2_p3_count": 0,
  "invariant_set_changed": false,
  "authority_allocation_complete": true,
  "reviewed_artifacts": [
    {
      "path": ".openspec.yaml",
      "sha256": "212a6ad71ca36b84fdbef9c954c23bb5f5551512f74a3b8205c70c639d2111e1"
    },
    {
      "path": "proposal.md",
      "sha256": "2ae9962c24e2949976f03ad7bb3ecdda390070287d04caa80f4d698abdfb56c8"
    },
    {
      "path": "specs/lint-policy-parity/spec.md",
      "sha256": "f265eabb97fcc09816f4529d78eef40cb7e7978162cbdefb0aa23d2e84c7a268"
    },
    {
      "path": "specs/toolchain-authority/spec.md",
      "sha256": "6711db4724e51f7c4eb4d77dde4b5491286cbb75e07155542b0638ad310cbaa9"
    },
    {
      "path": "specs/toolchain-supply-chain/spec.md",
      "sha256": "591bcb272bece673adec456bad5ae85b351b50deef43ab10ad78856cef5f26c6"
    },
    {
      "path": "specs/typescript-7-cutover/spec.md",
      "sha256": "a6d03fa663d0298c58f94df68f9c2d15a8398d3674a1fec608f2caa147a07b45"
    },
    {
      "path": "design.md",
      "sha256": "f849fedc56ee145baa2b22757ac878d1bb0562566fc9835c205984280e1f9da8"
    },
    {
      "path": "assurance.md",
      "sha256": "2ae675fd430fe1a452be930721ff1dc1231f0b28aa6f96d5b2857d7d074de3a0"
    },
    {
      "path": "tasks.md",
      "sha256": "08a6691e0d6d8f9fe4af6ce304db081353c4b4db87612ff42cb847ed0cfe9c2a"
    }
  ]
}
-->

## Review Pin

| Field                          | Value                                               |
| ------------------------------ | --------------------------------------------------- |
| Repository                     | `pulse-ops-ai/secure-home-agent-platform`           |
| Branch                         | `feat/typescript-lint-engine-parity-foundation`     |
| Scope                          | `replacement-authority-parity`                      |
| Review type                    | focused base-freshness review                       |
| Reviewed commit                | `70680c1c3eea2421ac39f6c4c6be862f4c0a0cdc`          |
| Default branch / reviewed base | `main` / `10d04a05df18db634d47737c8235d0e4351f8ac0` |
| Review epoch                   | `2`                                                 |
| Previous accepted epoch        | `1`                                                 |
| Previous reviewed commit       | `aae33fdd217d66de8d9127576f203c115abc37eb`          |
| PR-B historical genesis        | `cb7836148db24971826b886361593950570b4af4`          |
| Worktree state at review pin   | clean                                               |
| Review rubric                  | `governed-preimplementation-review-v1`              |
| Reviewer                       | `GPT-5.6 Sol — independent architecture review`     |
| Reviewed at                    | `2026-09-03T16:11:39Z`                              |

The reviewed commit contains no Scope-1 implementation. It contains only the
two review-ceremony commits required to admit accepted epoch 1 into history and
prepare the current review slot for epoch 2.

The machine-readable review block is authoritative for the exact reviewed
artifact paths and SHA-256 values.

## Independent Review Statement

This is an independent, read-only, repository-aware focused review.

The reviewer did not author the governed planning package in the same working
context. The review did not modify repository state, execute candidate
implementation, or perform a live external mutation.

The current epoch-2 pin, current target-base identity, two-commit ceremony,
planning-byte identities, accepted ADR state, PR-B genesis relationship, and
governance-infrastructure movement were evaluated before the accepted epoch-1
review was used as the structural template for this report.

Epoch 1 was then consulted as accepted historical evidence to determine whether
any previously accepted architecture assumption had been invalidated or
regressed by the intervening repository movement.

The review is intentionally narrower than epoch 1. It does not repeat an
unrestricted architecture search. The reviewed question is whether the
unchanged `replacement-authority-parity` planning package remains valid against
the exact current target base before Scope-1 implementation begins.

It does.

## Reviewed Artifact Manifest

The machine-readable block above is authoritative for the exact reviewed paths
and SHA-256 values. This table restates it.

| Path                                   | SHA-256                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `.openspec.yaml`                       | `212a6ad71ca36b84fdbef9c954c23bb5f5551512f74a3b8205c70c639d2111e1` |
| `proposal.md`                          | `2ae9962c24e2949976f03ad7bb3ecdda390070287d04caa80f4d698abdfb56c8` |
| `specs/lint-policy-parity/spec.md`     | `f265eabb97fcc09816f4529d78eef40cb7e7978162cbdefb0aa23d2e84c7a268` |
| `specs/toolchain-authority/spec.md`    | `6711db4724e51f7c4eb4d77dde4b5491286cbb75e07155542b0638ad310cbaa9` |
| `specs/toolchain-supply-chain/spec.md` | `591bcb272bece673adec456bad5ae85b351b50deef43ab10ad78856cef5f26c6` |
| `specs/typescript-7-cutover/spec.md`   | `a6d03fa663d0298c58f94df68f9c2d15a8398d3674a1fec608f2caa147a07b45` |
| `design.md`                            | `f849fedc56ee145baa2b22757ac878d1bb0562566fc9835c205984280e1f9da8` |
| `assurance.md`                         | `2ae675fd430fe1a452be930721ff1dc1231f0b28aa6f96d5b2857d7d074de3a0` |
| `tasks.md`                             | `08a6691e0d6d8f9fe4af6ce304db081353c4b4db87612ff42cb847ed0cfe9c2a` |

The set and every digest are identical to accepted epoch 1.

Historical review records and this report are review evidence and are not
members of the planning-byte manifest.

## Review Method

### Pass A — focused current-base review

The review first evaluated the current state without reopening already accepted
Scope-1 architecture.

The following were checked:

1. exact reviewed commit `70680c1c3eea2421ac39f6c4c6be862f4c0a0cdc`;
2. exact current target base `10d04a05df18db634d47737c8235d0e4351f8ac0`;
3. unchanged identity of all nine governed planning artifacts;
4. unchanged accepted ADR-0022 architectural body;
5. historical PR-B genesis at exact post-PR-A2 main
   `cb7836148db24971826b886361593950570b4af4`;
6. absence of any Scope-1 implementation commit before the base-freshness
   review;
7. fast-forward-only incorporation of the intervening governance infrastructure;
8. exact contents of the two epoch ceremony commits; and
9. whether any intervening repository movement changed an accepted Scope-1
   assumption, authority, invariant, trust boundary, prerequisite, or external
   identity model.

No such invalidating change was found.

### Pass B — accepted-history and regression review

Only after establishing the current-base facts, the accepted epoch-1 review and
the intervening transitions were used to test continuity.

The review considered:

* the accepted epoch-1 `replacement-authority-parity` decision;
* PR-A2's acceptance of ADR-0022;
* the exact post-PR-A2 PR-B genesis requirement;
* PR #118's trusted review-boundary corrections;
* the historical reviewed-commit object availability seam fixed by #118;
* the nested review-history path-set seam fixed by #118;
* epoch-1 admission provenance;
* current base-freshness semantics; and
* the still-required first live trusted `review-boundary.yml` dispatch.

The result is continuity, not a new architecture.

The remaining first live trusted-boundary execution is an executable pre-apply
proof. Failure of that execution would block implementation; it would not
retroactively convert the unchanged planning architecture into a new design.

## Architecture Acceptance Checks

| Check                                                              | Result | Evidence                                                                                                         |
| ------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------- |
| Scope and non-goals remain explicit                                | pass   | all nine planning artifacts are byte-identical to accepted epoch 1                                               |
| Current Scope-1 requirements remain observable and scenario-backed | pass   | no normative planning byte changed                                                                               |
| Trust boundaries remain explicit                                   | pass   | accepted trusted-control / untrusted-subject / trusted-verdict model unchanged                                   |
| Current-scope gating decisions remain closed                       | pass   | ADR-0022 is Accepted; Scope 1 is externally authorized; trusted pre-apply dispatch remains the final gate        |
| PR-B genesis prerequisite remains satisfied                        | pass   | branch was created at exact post-PR-A2 `cb783614...` with zero implementation commits                            |
| Target-base movement is accounted for                              | pass   | zero-implementation branch fast-forwarded to reviewed descendant `10d04a05...` before epoch 2                    |
| Invariants remain stable and traceable                             | pass   | no governed planning byte or invariant changed                                                                   |
| Canonical authority allocation remains singular                    | pass   | no intervening change transferred or duplicated Scope-1 authority                                                |
| Review-history admission is provenance-bearing                     | pass   | epoch-1 bytes were copied from the then-current accepted review and verified by the two-revision history checker |
| Squash-discarded historical review pins remain verifiable          | pass   | trusted exact-SHA prefetch infrastructure landed in #118 without weakening real-commit identity                  |
| Historical-round path representation is singular                   | pass   | #118 aligned gate, pin enumerator, and history checker on direct-child rounds                                    |
| PR-C remains separately gated                                      | pass   | no Scope-2 implementation or authorization was introduced                                                        |
| PR #113 remains outside the program                                | pass   | frozen branch remains untouched                                                                                  |
| Proof obligations still have due landings                          | pass   | PR-B and PR-C task/proof allocations are unchanged                                                                |

No acceptance check requires an architecture correction.

## Severity Calibration

P1 remains reserved for a concrete defect whose safe closure requires changing
an invariant, canonical-authority allocation, trust boundary, prerequisite, or
external identity/ownership model.

P2 is a significant implementation-contract, feasibility, operability, or
maintainability defect that can be closed inside the already accepted
architecture through its allocated schema, policy, fixture, test, derivation,
or bounded implementation choice.

P3 is a non-blocking documentation, organization, naming, clarity, or local
maintainability issue.

Under that calibration, neither legitimate base movement nor the fact that the
trusted boundary has not yet executed live is itself a new architecture
finding.

The base movement is exactly why governed-spec-driven-v2 permits a fresh review
epoch.

The first live trusted-boundary execution remains a required pre-apply proof. If
it refuses, implementation remains unauthorized and the concrete refusal must be
reviewed. No local or candidate-provided success may replace it.

## Findings

### P1 findings

**Unresolved P1 findings:** `none`

No current-base change requires alteration of an accepted invariant, authority
allocation, trust boundary, prerequisite, or external identity model.

PR-A2 completed the ADR-acceptance prerequisite already anticipated by the
accepted architecture.

PR #118 repaired the review-governance mechanism without modifying this
program's planning authority or implementation semantics.

The two epoch-2 ceremony commits modify review evidence only.

### P2 findings

No new P2 finding was identified by this focused review.

Implementation obligations already assigned by epoch 1 remain assigned to their
existing PR-B or PR-C tasks and proof obligations.

### P3 findings

No new P3 finding requires disposition before Scope-1 apply.

**Unassigned P2/P3 findings:** `0`

The first live trusted review-boundary dispatch is not an unassigned finding. It
is the already-required executable pre-apply proof.

## Authority Allocation Assessment

The accepted authority model remains intact.

The principal Scope-1 split remains:

* repository-owned semantic lint policy owns lint-policy semantics;
* per-engine mappings own implementation translation;
* the authoritative TypeScript package owns normal compiler/type correctness;
* Prettier owns formatting;
* dedicated repository gates own package/source architecture;
* `AUTH-TS6-CONSUMERS` owns the bounded traditional TypeScript 6 API seam;
* `AUTH-MAINTENANCE-CLASSES` owns admissible tool-maintenance classes;
* `AUTH-MAINTENANCE-VERIFIER` owns trusted maintenance control and verdict;
* `AUTH-MAINTENANCE-SUBJECT-ISOLATION` owns candidate execution isolation;
* `MAN-TS7-01` owns merge-time consumption of point-in-time maintenance
  evidence; and
* `AUTH-REVIEW-SCOPES` owns the PR-A2 / PR-B / PR-C sequence.

The intervening transitions do not create a competing authority.

ADR-0022's lifecycle transition makes the already-selected architecture
effective; it does not duplicate planning authority.

Historical `reviews/**` records remain evidence, not normative authority.

PR #118 changes how the trusted default-branch review boundary makes historical
Git commit objects available and how review-history paths are validated. It
does not allow candidate or historical bytes to become workflow, schema,
verifier, or acceptance authority.

The external repository-owner Scope-1 task remains the implementation
authorization. This review neither creates nor widens that authorization.

**Authority allocation complete:** `YES`

## Repository Feasibility

| Claim                                                                   | Repository evidence inspected                                                          | Result   | Finding / consequence                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| PR-B began at exact post-PR-A2 main                                     | branch genesis and zero-commit proof at `cb783614...`                                  | verified | INV-TS7-31 remains satisfied as a historical genesis fact                |
| Current reviewed target is the post-#118 base                           | live `main` at `10d04a05...` and fast-forward-only incorporation                       | verified | epoch 2 correctly binds the current pre-implementation target            |
| Planning package remains unchanged                                      | nine SHA-256 identities                                                                | verified | no architecture re-review is triggered by artifact drift                 |
| ADR-0022 remains the accepted decision                                  | accepted ADR digest `f6709c12ae60d0285d588de717c21354a2e56b1577c8aae24c1fd5fe974088ab` | verified | Scope-1 prerequisite remains satisfied                                   |
| Epoch 1 is admitted historical evidence                                 | direct-child `reviews/1-aae33fdd217d.md` and two-revision byte provenance              | verified | epoch 2 has a valid accepted predecessor                                 |
| Historical reviewed commit is a real Git object                         | `aae33fdd217d66de8d9127576f203c115abc37eb` object proof                                | verified | historical identity requirement remains intact                           |
| Squash-discarded review pins can be obtained on a fresh trusted runner  | #118 exact-SHA prefetch mechanism and regression net                                   | verified | trusted execution no longer depends on accidental developer object state |
| Nested historical rounds cannot bypass admission provenance             | #118 direct-child path rule across gate, pin enumerator, and history checker           | verified | history path authority is consistent                                     |
| Current epoch can be checked without executing candidate implementation | governed review gate and default-branch boundary                                       | verified | remaining pre-apply proof is executable and fail-closed                  |
| Scope-1 implementation has not begun                                    | reviewed branch contains ceremony commits only                                         | verified | no implementation byte exists outside the reviewed planning contract     |

The feasibility result does not claim the first live trusted-boundary dispatch
has already succeeded.

That dispatch remains deliberately pending. The architecture is feasible because
the trusted boundary exists on default branch and can now be exercised against
the exact candidate/base pair without depending on candidate-controlled
verification.

## Invariant Stability

The invariant set before this focused review is the accepted epoch-1 invariant
set recorded by the unchanged `assurance.md`.

The invariant set after this review is the same set.

In particular:

* `INV-TS7-31` is unchanged;
* PR-B's historical genesis remains exact post-PR-A2
  `cb7836148db24971826b886361593950570b4af4`;
* current base freshness is independently bound to
  `10d04a05df18db634d47737c8235d0e4351f8ac0`;
* the trusted maintenance three-domain model is unchanged;
* both candidate-isolation boundaries are unchanged;
* normal compiler authority remains distinct from the TS6 compatibility seam;
* Scope 1 and Scope 2 remain independently releasable;
* PR-C remains gated on successful completion and acceptance of PR-B; and
* PR #113 remains frozen outside this program.

No new invariant is required by this review.

No existing invariant must be removed, split, merged, or materially rewritten.

**Invariant set changed by this review:** `NO`

## Review-Finding Regression Promotion

| Prior finding / seam                                                                               | Current disposition                                            | Durable executable protection                                                                                                | Owning path / landing                                             |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Epoch-1 review could not remain directly usable after legitimate target-base movement              | closed by governed v2 fresh-epoch semantics                    | exact `reviewed_base_commit` binding plus `REVIEW_BASE_DRIFT` refusal                                                        | current review gate / epoch 2                                     |
| Squash merge could leave an accepted historical `reviewed_commit` absent from a fresh runner       | closed by #118 without weakening commit identity               | trusted enumerator plus exact-SHA fetch into inert refs; fresh-repository regression and unfetchable-pin refusal             | default-branch `review-boundary.yml` / `openspec-review-pins.mjs` |
| Recursive gate consumption and direct-child history validation disagreed                           | closed by #118                                                 | gate, pin enumerator, and history checker all refuse nested historical rounds; hostile and mutation coverage                 | governed-spec-driven-v2 review infrastructure                     |
| Epoch history could be admitted merely by naming rather than transition provenance                 | preserved as closed                                            | two-revision checker requires archived bytes to equal the parent's current review; altered-byte falsification refuses        | `check-openspec-review-history.mjs`                               |
| Candidate-controlled review machinery could become deciding authority                              | remains closed                                                 | trusted boundary continues to execute default-branch workflow/gate/tooling while candidate Git objects remain inert data     | default-branch trusted boundary                                   |
| PR-B could lose its post-PR-A2 genesis while current base legitimately advanced                    | closed by preserving distinct genesis and freshness identities | recorded zero-implementation genesis at `cb783614...`, followed only by fast-forward before epoch 2                          | INV-TS7-31 plus epoch-2 review pin                                |
| Previously accepted lint-policy/compiler/maintenance architecture findings could regress unnoticed | unchanged from epoch 1                                         | their existing PR-B/PR-C mutation, adversarial, parity, native-platform, and differential proof obligations remain unchanged | accepted planning package                                         |

The intervening repository work therefore strengthens the review-governance
mechanism without altering the accepted TypeScript/lint-engine architecture.

No material finding remains dependent on reviewer memory or an unallocated
prose follow-up.

## Verdict

**ARCHITECTURE_ACCEPTED**

### Verdict rationale

Epoch 1 already established that the `replacement-authority-parity` architecture
was complete.

This focused epoch establishes that the subsequent base movement did not
invalidate that decision.

All nine planning artifacts are unchanged.

ADR-0022 is now Accepted through the prerequisite transition already anticipated
by the architecture.

PR-B satisfied its exact post-PR-A2 genesis requirement before any
implementation occurred.

The intervening #118 infrastructure work changes only the trusted governed-v2
review mechanism and closes two concrete review-history seams without weakening
identity or transferring authority to candidate bytes.

The epoch ceremony changes review evidence only.

No new P1 exists, no P2/P3 finding is unassigned, no invariant changed, and no
authority allocation changed.

The accepted architecture remains valid against exact target base
`10d04a05df18db634d47737c8235d0e4351f8ac0`.

This verdict does not substitute for the pending trusted hosted pre-apply
boundary and does not authorize PR-C.

## Apply Eligibility

* Review gate metadata valid: yes
* Exact reviewed commit:
  `70680c1c3eea2421ac39f6c4c6be862f4c0a0cdc`
* Exact reviewed base:
  `10d04a05df18db634d47737c8235d0e4351f8ac0`
* Review epoch: `2`
* Scope: `replacement-authority-parity`
* Reviewed artifact digests current: yes
* Repository state expected to differ from reviewed commit only by this current
  review file and admitted `reviews/**`: yes
* Verdict is `ARCHITECTURE_ACCEPTED`: yes
* Unresolved P1 count is zero: yes
* Unassigned P2/P3 count is zero: yes
* Invariant set changed by this review: no
* Authority allocation complete: yes
* External Scope-1 implementation authorization exists: yes
* Trusted hosted pre-apply boundary completed: no — still required before
  implementation begins
* PR-C authorized: no

**Apply eligible:** `YES`

`Apply eligible` means this focused architecture review itself satisfies the
governed v2 acceptance conditions for the exact reviewed candidate/base pair.

It does not permit implementation to begin until the trusted
`review-boundary.yml` execution also succeeds against this exact epoch-2
candidate and exact live base.

If `main` moves from
`10d04a05df18db634d47737c8235d0e4351f8ac0` before that boundary succeeds, this
epoch is stale and must not be reused.

A successful trusted boundary, combined with the already-existing external
Scope-1 implementation authorization, completes the remaining pre-apply
conditions for PR-B.

This review provides no authorization for PR-C.
