# Pre-Implementation Review: TypeScript 7 and lint-engine resilience

<!--
This report is the accepting epoch-1 independent architecture review of the
`replacement-authority-parity` scope. It is pinned to
aae33fdd217d66de8d9127576f203c115abc37eb against base
c0a2f5cbcccfaaaa00a2df897457eba48ec2f226. It accepts architecture only: it does
not change ADR-0022 from Proposed and creates no implementation authority.
-->

<!-- openspec-review-gate
{
  "contract": "preimplementation-review-v2",
  "schema": "governed-spec-driven-v2",
  "rubric": "governed-preimplementation-review-v1",
  "reviewed_commit": "aae33fdd217d66de8d9127576f203c115abc37eb",
  "reviewed_base_commit": "c0a2f5cbcccfaaaa00a2df897457eba48ec2f226",
  "review_epoch": 1,
  "scope_id": "replacement-authority-parity",
  "reviewed_at": "2026-09-01T23:47:38Z",
  "reviewer": "GPT-5.6 Sol \u2014 independent architecture review",
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
| Scope                          | `replacement-authority-parity`                      |
| Reviewed commit                | `aae33fdd217d66de8d9127576f203c115abc37eb`          |
| Default branch / reviewed base | `main` / `c0a2f5cbcccfaaaa00a2df897457eba48ec2f226` |
| Review epoch                   | `1`                                                 |
| Review rubric                  | `governed-preimplementation-review-v1`              |
| Reviewer                       | `GPT-5.6 Sol — independent architecture review`     |
| Reviewed at                    | `2026-09-01T23:47:38Z`                              |

The reviewed head is rebased onto the current default-branch state containing PR #116. The reviewed planning package contains no implementation authority and ADR-0022 remains `Proposed`.

The machine-readable review block is authoritative for the exact reviewed-artifact paths and SHA-256 values.

## Independent Review Statement

This review is a fresh independent epoch-1 review of the final corrected planning bytes.

The earlier `FOCUSED_CLOSURE_REQUIRED` review was never an admitted epoch. It is therefore superseded in place rather than copied into `reviews/`; accepted historical epochs only belong in that directory.

The review evaluated the final architecture after closure of the prior findings concerning:

1. predecessor-bound semantic-policy continuity;
2. candidate-independent verifier authority;
3. candidate native-tool isolation;
4. launcher-versus-candidate process isolation;
5. the dedicated ADR-acceptance transition;
6. point-in-time maintenance evidence and merge freshness;
7. normal TypeScript compiler authority versus the bounded TS6 API seam;
8. coupled compiler / typed-lint maintenance;
9. emitted-output compatibility evidence; and
10. retained implementation proof ownership.

No additional architecture correction is required by this review.

## Reviewed Artifact Manifest

The machine-readable block above is authoritative for the exact reviewed
paths and SHA-256 values; this table restates it.

| Path | SHA-256 |
|---|---|
| `.openspec.yaml` | `212a6ad71ca36b84fdbef9c954c23bb5f5551512f74a3b8205c70c639d2111e1` |
| `proposal.md` | `2ae9962c24e2949976f03ad7bb3ecdda390070287d04caa80f4d698abdfb56c8` |
| `specs/lint-policy-parity/spec.md` | `f265eabb97fcc09816f4529d78eef40cb7e7978162cbdefb0aa23d2e84c7a268` |
| `specs/toolchain-authority/spec.md` | `6711db4724e51f7c4eb4d77dde4b5491286cbb75e07155542b0638ad310cbaa9` |
| `specs/toolchain-supply-chain/spec.md` | `591bcb272bece673adec456bad5ae85b351b50deef43ab10ad78856cef5f26c6` |
| `specs/typescript-7-cutover/spec.md` | `a6d03fa663d0298c58f94df68f9c2d15a8398d3674a1fec608f2caa147a07b45` |
| `design.md` | `f849fedc56ee145baa2b22757ac878d1bb0562566fc9835c205984280e1f9da8` |
| `assurance.md` | `2ae675fd430fe1a452be930721ff1dc1231f0b28aa6f96d5b2857d7d074de3a0` |
| `tasks.md` | `08a6691e0d6d8f9fe4af6ce304db081353c4b4db87612ff42cb847ed0cfe9c2a` |

Historical reviews and this report are not members of the planning-byte
manifest.
## Review Method

### Pass A — final-current-state architecture review

The review evaluated the exact final planning package at
`aae33fdd217d66de8d9127576f203c115abc37eb` as a complete architecture rather
than carrying forward the disposition of either earlier non-accepting review.

The current bytes were used to reconstruct and test:

1. the complete 117-rule lint-policy migration model and its separation from
   per-engine mappings;
2. compiler, lint, formatting, architecture, package-install, and compatibility
   authority boundaries;
3. the TypeScript 6 compatibility seam and the prohibition on `tsc6` becoming a
   normal compiler entry point;
4. the two implementation scopes and the distinct PR-A2 ADR-acceptance
   transition;
5. every current `AUTH-*` allocation and the task that creates or verifies it;
6. predecessor-bound tool-maintenance classes, including the closed
   `normal-compiler-and-typed-lint` composite class;
7. the trusted-control / untrusted-subject / trusted-verdict maintenance
   topology;
8. both mandatory candidate-execution isolation boundaries: separation of the
   subject domain from trusted control/verdict and separation of the candidate
   process from the trusted host-side launcher;
9. point-in-time maintenance-evidence identity and the `MAN-TS7-01` merge
   consumption control;
10. positive, property, adversarial, mutation, platform, and emitted-output proof
    obligations; and
11. the PR-B genesis rule that prevents the newly introduced maintenance
    boundary from authorizing the PR that creates it.

The current-state pass found no unresolved authority, invariant, prerequisite,
trust-boundary, or identity defect requiring another planning correction.

### Pass B — prior-finding regression and falsification review

After the current-state model was reconstructed, the review traced every
material finding from the earlier non-accepting reviews into the final planning
package and required an executable disposition rather than relying on prose
closure.

That regression pass specifically re-tested the design against these failure
shapes:

- delete a semantic policy row together with its only fixture during a tool
  update;
- relax shared compiler policy while changing the compiler;
- replace or delete the candidate checker;
- alter the candidate workflow to skip verification;
- run malicious candidate-native tooling beside the deciding verifier;
- run the candidate directly under the trusted launcher's UID/filesystem
  context;
- forge or tamper with the subject result envelope;
- expose a token, secret, Docker socket, shared writable cache, or trusted
  workspace to the subject;
- move the candidate head or trusted predecessor during verification;
- reuse successful evidence after the head, base, protected authority, or
  synthetic merge tree changes;
- begin Scope 1 while ADR-0022 is still `Proposed`;
- resolve a normal compiler entry point through `tsc6`;
- self-compose maintenance classes to widen the admitted delta; and
- accept TypeScript 7 merely because compilation succeeds while governed emitted
  output changes.

Each failure shape now has a fail-closed rule and an assigned executable
regression, adversarial case, mutation, or differential proof in PR-B or PR-C.

The prior `FOCUSED_CLOSURE_REQUIRED` review was non-accepting and therefore was
never an admitted review epoch. No accepted historical `reviews/**` record exists
for this scope. This review is the first admitted epoch if and only if the
current review gate verifies the exact manifest and verdict.

## Architecture Acceptance Checks

| Check                                           | Result | Basis                                                                                                    |
| ----------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| Scope and non-goals are explicit                | pass   | planning package remains bounded to the TypeScript/lint-engine resilience program                        |
| Requirements are observable and scenario-backed | pass   | final normative specs include positive, refusal, hostile, and maintenance cases                          |
| Trust boundaries are explicit                   | pass   | trusted control / untrusted subject / trusted verdict plus merge-consumption boundary                    |
| Candidate executable isolation is complete      | pass   | fresh subject domain and independent launcher/process OS boundary are both mandatory                     |
| Candidate cannot self-authorize maintenance     | pass   | predecessor owns verifier, classes, command plan, and trusted verdict                                    |
| Maintenance continuity is predecessor-bound     | pass   | protected semantic/config/corpus authorities cannot be deleted with their evidence                       |
| Merge freshness is honestly modeled             | pass   | maintenance run is point-in-time evidence; `MAN-TS7-01` owns pre-merge freshness                         |
| ADR acceptance sequencing is executable         | pass   | PR-A2 is an explicit acceptance-only transition before PR-B                                              |
| Compiler authority is singular                  | pass   | normal entry points use the authoritative TypeScript package; `tsc6` is confined to the bounded API seam |
| Coupled maintenance cannot self-widen           | pass   | maintenance classes are closed; compiler + typed-lint coupling has one explicit composite class          |
| Emitted-output preservation is executable       | pass   | differential/golden evidence is assigned for actual governed output surfaces                             |
| Every mutable fact family has a canonical owner | pass   | authority allocation is complete                                                                         |
| Proof obligations have due landings             | pass   | P1/P2 closures are assigned to PR-B/PR-C tasks and mutation evidence                                     |
| PR #113 remains outside the program             | pass   | no #113 content or authority is imported                                                                 |

## Severity Calibration

P1 is reserved for a concrete defect that requires changing an invariant,
canonical-authority allocation, trust boundary, prerequisite, or external
identity model in order for implementation to be safe.

P2 covers a bounded implementation or proof obligation that fits entirely within
an already-correct authority and invariant model. P3 covers non-material
clarity, maintainability, or documentation issues.

Earlier review rounds correctly classified predecessor-policy continuity,
candidate-controlled verifier authority, candidate executable co-residency,
ADR-acceptance sequencing, and merge-evidence freshness as P1 when those
boundaries were missing or incomplete. The final planning bytes now contain the
required authorities, invariants, trust boundaries, prerequisites, and
fail-closed identity model.

The remaining implementation obligations — including workspace classification,
blocking/fix semantics, TS7-versus-TS6 parser differential evidence, native
platform execution, subject-isolation mutations, and emitted-output
differentials — are explicitly assigned to PR-B or PR-C and do not require an
additional architecture change.

Accordingly, this review records:

- unresolved P1 findings: none;
- unassigned P2/P3 findings: zero; and
- no new finding requiring another planning correction.

## Findings

### P1 findings

**Unresolved P1 findings:** `none`

All previously identified P1 architecture defects are closed in the reviewed planning bytes.

In particular, candidate tooling is now separated from the maintenance root of trust by two mandatory isolation boundaries:

- the candidate runs in a fresh secret-free untrusted subject domain; and
- the candidate process is separated from the trusted launcher by an explicit OS-level boundary.

A same-UID / same-filesystem launcher topology is explicitly inadmissible and is assigned mutation coverage.

### P2/P3 findings

**Unassigned P2/P3 findings:** `0`

Previously identified implementation-level obligations remain explicitly assigned to their owning implementation tasks, including:

- `packages/lint-config` workspace/build-tooling classification and later ESLint-package retirement;
- blocking severity and fix-output parity;
- TS7-language / TS6-parser architecture-gate falsification;
- candidate-subject and launcher isolation mutations;
- native AMD64/ARM64 execution;
- composite compiler/typed-lint maintenance; and
- emitted compiler-output differential proof.

Those obligations are implementation work within the accepted architecture and do not require another planning correction.

## Authority Allocation Assessment

The final package establishes one canonical owner for each load-bearing mutable fact family.

The principal authority split is coherent:

- repository semantic lint policy owns policy;
- per-engine mappings own implementation translation;
- TypeScript owns compiler/type correctness;
- Prettier owns formatting;
- dedicated repository gates own package/source architecture;
- `AUTH-TS6-CONSUMERS` owns the bounded compatibility API seam;
- `AUTH-MAINTENANCE-CLASSES` owns what tool-only maintenance may change;
- `AUTH-MAINTENANCE-VERIFIER` owns trusted control and trusted verdict;
- `AUTH-MAINTENANCE-SUBJECT-ISOLATION` owns candidate executable isolation;
- `MAN-TS7-01` owns merge-time consumption of point-in-time maintenance evidence; and
- `AUTH-REVIEW-SCOPES` owns the PR-A2 / PR-B / PR-C governance sequence.

No candidate-controlled policy, verifier, workflow, maintenance class, launcher context, or result envelope can independently establish its own admissibility.

**Authority allocation complete:** `YES`

## Repository Feasibility

| Claim | Repository / package evidence inspected | Result | Finding / consequence |
| --- | --- | --- | --- |
| Current lint union is 117 effective identities with the recorded role-specific counts | effective ESLint configuration resolution across the repository roles | verified | union remains 117; recorded modes resolve to 99/96/96/99/96/88/99/91 |
| Active current lint policy is blocking | resolved effective ESLint rule settings | verified | every enabled current rule resolves at severity 2; replacement proof must preserve blocking behavior |
| Traditional TypeScript compiler API has one direct repository-owned consumer | tracked imports/API-symbol usage | verified | `scripts/check-source-imports.mjs` is the bounded initial `AUTH-TS6-CONSUMERS` member |
| Current TypeScript configuration inventory contains 35 tracked `tsconfig*.json` files | tracked repository configuration inventory | verified | Scope 2 audit must cover the complete set and its entry points rather than a hand-selected subset |
| Selected future package identities exist with the audited distribution shape | TypeScript `7.0.2`, Oxlint `1.80.0`, `oxlint-tsgolint` `7.0.2001`, `@typescript/typescript6` `6.0.2` package evidence | verified for package availability/distribution | native execution and semantic conformance remain implementation proof; package publication alone is insufficient |
| `onlyBuiltDependencies` remains exactly empty | `pnpm-workspace.yaml` and planned supply-chain contract | verified | no install-script exception is authorized by this architecture |
| The governed v2 review mechanism can bind the final planning bytes to the current live base | exact review manifest/verification path using the final head and `--remote origin/main` | verified | first admitted review can remain epoch 1 because the earlier non-accepting round was never admitted |
| The planned maintenance path can preserve predecessor policy without candidate self-authorization | final ADR/spec/design/assurance/tasks allocation for `AUTH-MAINTENANCE-CLASSES`, `AUTH-MAINTENANCE-VERIFIER`, `AUTH-MAINTENANCE-SUBJECT-ISOLATION`, and `MAN-TS7-01` | verified as an implementation-feasible architecture contract | PR-B must implement the predecessor-owned classes/verifier, two-boundary subject isolation, trusted result verification, and required mutations as genesis; PR-B cannot self-admit through the boundary it creates |

The feasibility result does not claim that PR-B or PR-C implementation evidence
already exists. It establishes that the final architecture has an executable,
repository-compatible path to produce that evidence without weakening the
current policy or trust model.

## Invariant Stability

The final planning package contains the corrected invariant set, including the two-boundary subject-isolation semantics in `INV-TS7-29`.

This accepting review does not add, remove, split, merge, or otherwise require modification of an invariant. The prior corrective commits occurred before this review and are the bytes being reviewed.

**Invariant set changed by this review:** `NO`

## Review-Finding Regression Promotion

| Prior finding / seam | Final disposition | Executable regression promoted into the contract | Owning landing |
| --- | --- | --- | --- |
| Candidate-local maintenance could delete policy row R together with its only fixture | closed by predecessor-bound semantic/config/corpus protection and separate engine mappings | engine-pin change + row/fixture co-deletion must fail against the trusted predecessor; compiler-pin change + shared-tsconfig/fixture relaxation must likewise fail | PR-B tasks 1.15 / 2.5; `MUT-MAINT-001/002/003` |
| Candidate could replace its own maintenance checker or workflow with success | closed by exact-predecessor workflow/verifier/invocation authority | checker changed to unconditional success, checker deleted, and candidate workflow skip must not affect which verifier executes or the resulting refusal | PR-B task 1.16 / 2.5; `MUT-MAINT-004/005` |
| Candidate native tooling could execute in the verifier's trust domain | closed by trusted control / untrusted subject / trusted verdict separation | subject attempts verifier/workspace overwrite, environment/output-file write, credential read, cache poisoning, path escape, background survival, command-plan edit, or result forgery must be denied or rejected | PR-B task 1.16 / 2.5; `ADV-MAINT-003`, `MUT-MAINT-007/008` |
| Fresh runner did not mechanically isolate the candidate from the trusted launcher | closed by the second mandatory OS-level launcher boundary in `INV-TS7-29` / `REQ-SC-008` | same-UID / same-filesystem candidate-launcher topology must be refused even with every outer subject-domain control satisfied; launcher/result-envelope tampering must be unreachable | PR-B task 1.16 / 2.5; `MUT-MAINT-009` |
| ADR-0022 could remain Proposed while PR-B was next in sequence | closed by dedicated acceptance-only PR-A2 | attempting Scope 1 while ADR is Proposed or from pre-PR-A2 main must fail; PR-A2 containing implementation must not qualify as the acceptance transition | PR-A2 / PR-B pre-implementation gate; `EX-A2-001`, `PROP-A2-001`, `MUT-A2-001` |
| Successful maintenance evidence could become stale before merge | closed by point-in-time evidence semantics plus `MAN-TS7-01` | candidate-head, base, protected-authority, run-identity, or synthetic-merge-tree movement after success invalidates the evidence and requires a new run | PR-B onward; `PROP-MERGE-001`, `MUT-MERGE-001` |
| `packages/lint-config` / retired ESLint tooling could escape the architecture model | assigned within existing architecture authority | production import of `@secure-home/lint-config` must fail; `packages/eslint-config` layer/build-tooling residue must fail when retirement occurs | PR-B task 1.1 and PR-C retirement task; `MUT-ARCH-003` |
| Blocking severity and fix-bearing option semantics could be lost while diagnostics still appear | assigned within lint-policy/conformance authority | warning-only enforcement must fail parity; an option affecting automatic fix output must match deterministic expected output | PR-B parity/conformance tasks; `ADV-LP-004` and assigned fixed-output proof |
| TS7 source could be accepted while the retained TS6 parser silently misses a governed import edge | assigned within the existing architecture-import authority | TS7-accepted syntax containing governed import edges must be extracted equivalently by the TS6 seam or fail closed; a forbidden edge may never disappear through parser recovery | PR-C audit/import-gate tasks; `ADV-TC-002` plus architecture mutation evidence |
| Normal compiler identity could be confused with the retained TS6 API copy | closed in the compiler-authority contract | ordinary `typecheck`, `build`, and generator entry points resolving `tsc6` must fail, while the admitted source-import tooling path may use the TS6 API | PR-B/C boundary and Scope-2 cutover proof; `MUT-TS6-001` |
| Compiler and typed-lint updates may need to move together | closed by one predecessor-owned composite maintenance class | admitted `normal-compiler-and-typed-lint` composite may move the coupled pins; candidate-defined union/composition of classes must fail | PR-B task 1.15 / 2.5; `PROP-COMPOSE-001`, `MUT-COMPOSE-001` |
| TypeScript 7 build success alone could hide governed emitted-output drift | closed by normalized differential/golden proof allocation | semantic change to `.d.ts`, `.d.ts.map`, `.js.map`, or consumed generator output must fail even when compilation exits successfully | PR-C compiler cutover proof; `EX-TS-002`, `MUT-TS-EMIT-001` |

Every material prior review finding therefore has one of two acceptable final
dispositions:

1. the architecture was corrected and the failure shape was promoted to
   executable regression evidence; or
2. the architecture already owned the concern and the bounded implementation
   proof was explicitly assigned to its landing task.

No material prior finding remains dependent on reviewer memory or prose-only
follow-up.

## Verdict

**ARCHITECTURE_ACCEPTED**

The `replacement-authority-parity` architecture is sufficiently closed to proceed to the separately governed ADR-acceptance transition.

This verdict accepts architecture only.

It does **not**:

- change ADR-0022 from `Proposed`;
- authorize PR-B implementation;
- authorize PR-C implementation;
- authorize dependency or compiler changes;
- authorize ESLint retirement; or
- modify the freeze on PR #113.

The next merge-order vehicle remains PR-A2, the acceptance-only ADR-0022 transition. PR-B remains blocked until PR-A2 is merged and a separate external Scope-1 implementation authorization exists.

## Apply Eligibility

- Review gate metadata: valid
- Exact reviewed head: `aae33fdd217d66de8d9127576f203c115abc37eb`
- Exact reviewed base: `c0a2f5cbcccfaaaa00a2df897457eba48ec2f226`
- Review epoch: `1`
- Verdict: `ARCHITECTURE_ACCEPTED`
- Unresolved P1: none
- Unassigned P2/P3: zero
- Invariant set changed by this review: no
- Authority allocation complete: yes
- ADR-0022 accepted: no — remains a separate PR-A2 transition
- Scope-1 implementation authorization: no — remains externally required

**Apply eligible:** `YES`

`Apply eligible` here means the governed architecture review itself satisfies the v2 review gate. It does not override the separate ADR-acceptance and external implementation-authorization prerequisites recorded in `tasks.md`.

## Review History

The earlier `FOCUSED_CLOSURE_REQUIRED` review was non-accepting and therefore never became an admitted epoch. It is superseded by this epoch-1 accepted review.

No `reviews/**` history entry is created for that non-admitted round.

A separate process/documentation mismatch remains in the governed-v2 review-history README: its unconditional instruction to archive a superseded current review is incompatible with the gate's rule that historical entries must themselves be accepted reviews. That infrastructure/documentation issue is outside PR #115 and is not an architecture blocker for this change.
