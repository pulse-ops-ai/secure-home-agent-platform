# Pre-Implementation Review: TypeScript 7 and lint-engine resilience

<!--
This file is the current review gate. It is not a specification.

Generate the exact planning-file manifest with:

  pnpm run review:manifest -- --change <change-name> \
      --scope <tasks.md review-scope id> --epoch <n> --base origin/main

Paste the emitted JSON between `openspec-review-gate` and the closing comment,
then complete the review in a fresh, read-only, repository-aware session.

Do not replace REVIEW_REQUIRED with ARCHITECTURE_ACCEPTED unless the acceptance
criteria below are satisfied.
-->

<!-- openspec-review-gate
{
  "contract": "preimplementation-review-v2",
  "schema": "governed-spec-driven-v2",
  "rubric": "governed-preimplementation-review-v1",
  "reviewed_commit": "5c95299df406023e50507a4c6ef256c9b1b38e90",
  "reviewed_base_commit": "519dcde03ebe5e09861a9d66e9cf38424cc31581",
  "review_epoch": 4,
  "scope_id": "typescript7-cutover",
  "reviewed_at": "2026-09-07T16:37:57Z",
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
      "sha256": "af6e80db95686be42b00feff313f6f59a520c05c907760213ec303362811d338"
    },
    {
      "path": "design.md",
      "sha256": "b33429798052e3c2e387882079195754e7d826b264f644cab605b79dbbf5c588"
    },
    {
      "path": "assurance.md",
      "sha256": "ed041ecb88441821ab6a9e5c6f20d3b8e3348afca5658ad56c26eed10191a6a5"
    },
    {
      "path": "tasks.md",
      "sha256": "102aac693bd7e46e22f03ff6deebf590fb3e7c9537c8b7a5efa8d0727272e6f5"
    }
  ]
}
-->

## Epoch-4 Review Focus

Epoch 4 assesses one focused planning correction, made after task 3.2 stopped at
its own accepted stop condition.

The local TypeScript 7.0.2 cutover typechecked, built, produced byte-identical
runtime JavaScript and byte-identical generator artifacts, and emitted the same
file set — then failed a raw-byte declaration comparison on 164 files. The
differences were two compiler serializer choices: the string-literal quote
delimiter, and TypeScript 7's deterministic member ordering. Map bytes shifted
as a consequence, including `.js.map` for `.js` files that are byte-identical.

Nothing from the cutover has been merged or delivered, so no consumer depends on
TypeScript 6's byte formatting. The question for this epoch is whether the
correction re-states the preservation obligation against what the repository
means and ships, without moving anything architectural.

## Review Pin

| Field | Value |
|---|---|
| Repository | `pulse-ops-ai/secure-home-agent-platform` |
| Branch | `feat/typescript-7-cutover` |
| Reviewed commit | `5c95299df406023e50507a4c6ef256c9b1b38e90` |
| Default branch / merge base | `main` @ `519dcde03ebe5e09861a9d66e9cf38424cc31581` (exact live base, unmoved) |
| Worktree state | clean at review time; no tracked or untracked modifications |
| Review rubric | `governed-preimplementation-review-v1` |
| Historical review consulted after blind pass | yes — epochs 1, 2 and 3 under `reviews/` |

The reviewed commit contains the complete planning package. This report is
committed afterward; the deterministic gate permits only this current review
file and `reviews/**` to differ from the reviewed commit before apply.

## Independent Review Statement

- The reviewer did not author the planning package in the same working context.
- The review was read-only except for this report.
- The current package was assessed before historical `reviews/**` was read.
- Repository claims were checked against current paths, symbols, schemas and
  tests, not against planning prose.
- No live external mutation was performed.

Independence is established.

## Reviewed Artifact Manifest

The machine-readable block is authoritative for exact paths and SHA-256 values.

| Path | SHA-256 | Read completely? |
|---|---|---|
| `.openspec.yaml` | `212a6ad71ca36b84fdbef9c954c23bb5f5551512f74a3b8205c70c639d2111e1` | yes |
| `proposal.md` | `2ae9962c24e2949976f03ad7bb3ecdda390070287d04caa80f4d698abdfb56c8` | yes |
| `specs/lint-policy-parity/spec.md` | `f265eabb97fcc09816f4529d78eef40cb7e7978162cbdefb0aa23d2e84c7a268` | yes |
| `specs/toolchain-authority/spec.md` | `6711db4724e51f7c4eb4d77dde4b5491286cbb75e07155542b0638ad310cbaa9` | yes |
| `specs/toolchain-supply-chain/spec.md` | `591bcb272bece673adec456bad5ae85b351b50deef43ab10ad78856cef5f26c6` | yes |
| `specs/typescript-7-cutover/spec.md` | `af6e80db95686be42b00feff313f6f59a520c05c907760213ec303362811d338` | yes |
| `design.md` | `b33429798052e3c2e387882079195754e7d826b264f644cab605b79dbbf5c588` | yes |
| `assurance.md` | `ed041ecb88441821ab6a9e5c6f20d3b8e3348afca5658ad56c26eed10191a6a5` | yes |
| `tasks.md` | `102aac693bd7e46e22f03ff6deebf590fb3e7c9537c8b7a5efa8d0727272e6f5` | yes |

All nine current planning artifacts appear. Historical reviews and this report
are not members of the planning-byte manifest.

## Review Method

### Pass A — blind current-state review

Before reading `reviews/**`, evaluate the current package and repository for:

- unresolved architecture or identity decisions;
- contradictory normative behavior;
- unsafe ambiguity;
- invalid assumptions about existing repository contracts;
- missing trust boundaries or prerequisites;
- mutable fact families with multiple authorities;
- tasks that cannot be implemented from current authorities;
- proof obligations that cannot be made executable.

Preserve these findings before proceeding.

### Pass B — regression and history review

Only after Pass A, inspect historical review records when present to determine:

- whether current findings are new, stale, or regressions;
- whether prior material findings became executable regression protection;
- whether the current package requires review-history archaeology to be
  implemented;
- whether a correction created competing prose authorities.

Historical wording never overrides the current accepted artifacts.

## Architecture Acceptance Checks

| Check | Result | Evidence |
|---|---|---|
| Scope and non-goals are explicit | pass | `tasks.md` `<!-- review-scope: typescript7-cutover -->`; task 3.2 "Does not own" unchanged |
| Current-scope requirements are observable and scenario-backed | pass | `REQ-TC-002` now carries four emitted-output scenarios, one per failure mode |
| Trust boundaries and external effects are explicit | pass | `design.md` D14/D15 untouched by this correction |
| Current-scope gating decisions are closed | pass | D18 closes the preservation question; TS 7.0.2 target unchanged |
| Invariants are stable, concise, and traceable | pass | no `INV-TS7-*` line added, removed or altered |
| Every mutable fact family has exactly one canonical authority | pass | no `AUTH-*` row changed owner, path, type, producer or consumer |
| Planned authorities have contract-first tasks before consumers | pass | 3.1 audit and the frozen baseline both precede 3.2's differential |
| Repository assumptions were verified | pass | the correction is grounded in executed 7.0.2 evidence, not in prediction |
| Landing seams are atomic and safely ordered | pass | 3.1 → 3.3 → 3.4 → 3.2 → 3.5 → 3.6 → 3.7 unchanged |
| Proof obligations and hostile cases have due landings | pass | `MUT-TS-EMIT-001`…`004` all land in PR-C |
| Tasks are bounded and do not restate canonical data | pass | task 3.2 wording refined; no checkbox touched |
| Material prior findings have executable regression dispositions | pass | see *Review-Finding Regression Promotion* |

## Severity Calibration

### P1 — architecture blocker

A finding is P1 only when it includes all of:

1. a concrete failure trace within declared scope;
2. the exact invariant or design decision violated;
3. exact path/line, symbol, schema, test, or command evidence;
4. concrete trust or correctness impact; and
5. an architecture test showing that closure requires changing at least one:
   - invariant;
   - authority allocation;
   - trust boundary;
   - prerequisite;
   - external identity or ownership model.

### P2 — implementation-contract blocker

A significant correctness, feasibility, operability, or maintainability defect
that must be resolved before the affected landing ships but can be closed
inside the already accepted architecture through a schema, policy, typed table,
fixture, test, derivation, or bounded implementation choice.

### P3 — documentation or local improvement

A clarity, organization, naming, duplication, or non-blocking maintainability
issue.

## Findings

### P1 findings

**Unresolved P1 findings:** `none`

The correction changes no invariant, authority allocation, trust boundary,
prerequisite, or identity model, so no finding met the P1 bar.

### P2 findings

| ID | Title | Evidence | Required executable closure | Owning task / landing |
|---|---|---|---|---|
| P2-001 | Map preservation must prove ATTRIBUTION, not merely map structure | `REQ-TC-002` requires `.d.ts.map` / `.js.map` to be present, valid, internally consistent, correctly scoped and usable for source attribution. A checker verifying only Source Map v3 validity, the `sources[]` list, or non-empty `mappings` satisfies every one of those structural properties while mapping generated code to the WRONG original source line | See *P2-001 required closure* below | task `3.2`; `EX-TS-002`; `MUT-TS-EMIT-003` |

#### P2-001 required closure

Assigned, not deferred. This is an implementation choice inside the accepted
`REQ-TC-002` architecture and requires no new authority and no planning change.

For `.js.map`, where emitted `.js` is required byte-identical:

- exact map file-set equality;
- valid Source Map v3;
- expected emitted `file`;
- sources confined to the expected member/source tree;
- for each TypeScript 6 mapped generated line, TypeScript 7 must retain
  attribution to the same original source FILE and original source LINE;
- generated/original column and segment refinement may differ;
- a mapping to a different source path or original source line FAILS;
- loss of TypeScript 6 source-line coverage FAILS.

For `.d.ts.map`, where declaration serialization may legitimately change:

- exact map file-set equality;
- valid Source Map v3;
- expected emitted target and member scope;
- source-line coverage derived from the TypeScript 6 migration-comparison
  projection;
- every TypeScript 6-covered source file and original source line must remain
  covered under TypeScript 7;
- generated declaration line/column positions may move, because declaration
  serialization and member ordering may move;
- wrong-source attribution or lost source-line coverage FAILS.

Required hostile controls:

| Mutation | Required result |
|---|---|
| map missing | FAIL |
| map malformed | FAIL |
| same `sources[]`, mapping changed to the wrong source LINE | FAIL |
| mapping changed to the wrong source FILE | FAIL |
| source-line coverage removed | FAIL |
| column/segment refinement with source file and line preserved | PASS |

### P3 findings

None.

**Unassigned P2/P3 findings:** `0`

P2-001 is assigned to task 3.2, `EX-TS-002` and `MUT-TS-EMIT-003`.

## Authority Allocation Assessment

Every current-scope `AUTH-*` row in `assurance.md` was re-checked. No row changed
owner, path, type, producer or consumer as a result of this correction.

| AUTH ID | Result | Evidence / finding |
|---|---|---|
| All current-scope rows | pass | unchanged by the correction |
| `AUTH-TS-CONFORMANCE` | pass | continues to own emitted-output conformance; only the obligation it enforces is refined. D18's mention is a reference to the existing allocation in `assurance.md`, not a new authority |

**Authority allocation complete:** `YES`

## Repository Feasibility

| Claim | Repository evidence inspected | Result | Finding / consequence |
|---|---|---|---|
| TypeScript 7.0.2 compiles the workspace | executed `pnpm typecheck` and `pnpm build` under 7.0.2 | verified | the cutover is not blocked by compilation |
| Emitted runtime JavaScript is unchanged | 0 of 257 `.js` differ | verified | exact-byte obligation is achievable and meaningful |
| Generator output is unchanged | 0 of 11 `schemas/` artifacts differ | verified | exact-byte obligation is achievable and meaningful |
| Declaration differences are serializer-only | 28 of 256 `.d.ts` differ: 23 quote delimiter only, 5 including member reordering | verified | raw-byte declaration identity is the over-constraint |
| Map bytes shift without emitted change | 53 of 257 `.js.map` differ although every `.js` is byte-identical | verified | raw-byte map identity is the over-constraint |
| The frozen TypeScript 6 evidence is immutable and bound | `tests/evidence/ts6-emit-baseline.json`, sealed, bound to `362c349e` with the binding verified rather than asserted | verified | the historical record survives the correction |

## Invariant Stability

- Invariant set before review: the accepted `INV-TS7-*` set at
  `5c95299df406023e50507a4c6ef256c9b1b38e90`
- Invariant set after review: same
- New invariant required by this review: `none`
- Existing invariant removed or materially changed: `none`

**Invariant set changed by this review:** `NO`

The correction refines one requirement's proof obligation and adds one decision
record. TypeScript 7.0.2 as the target normal compiler, Scope-2 sequencing, every
`INV-TS7-*` invariant, every `AUTH-*` ownership and allocation, the bounded
TypeScript 6 compatibility seam, lint-policy authority, the retirement
architecture, trust boundaries, and the native platform requirements are all
unchanged.

## Review-Finding Regression Promotion

| Finding | Canonical authority changed | Executable regression evidence | Owning task / existing path |
|---|---|---|---|
| Task 3.2's emitted-output stop: the accepted proof contract required raw-byte identity with an undelivered compiler's serializer, blocking a cutover on differences no consumer can observe | none — `AUTH-TS-CONFORMANCE` keeps the fact family; only its obligation is refined | D18; corrected `REQ-TC-002` scenarios; refined `EX-TS-002`; `MUT-TS-EMIT-001`…`004`; task 3.2's per-surface proof | `openspec/changes/typescript-7-lint-engine-resilience/{design,assurance,tasks}.md`, `specs/typescript-7-cutover/spec.md` |
| P2-001 map preservation must prove attribution, not structure | none | assigned, not yet executable — closure lands in task 3.2 as `MUT-TS-EMIT-003` with the six hostile controls above | task 3.2 |

`MUT-TS-EMIT-004` is the durable protection for the baseline itself: rewriting
the frozen TypeScript 6 evidence, or recapturing it under TypeScript 7, is now a
named hostile case rather than a convention.

## Focused Closure Required

Not applicable. The verdict is `ARCHITECTURE_ACCEPTED`. P2-001 is assigned to an
implementation task inside the accepted architecture and does not require another
review round.

## Verdict

<!--
State exactly ONE governed verdict token, as a bold line of its own:

  REVIEW_REQUIRED  ·  ARCHITECTURE_ACCEPTED
  FOCUSED_CLOSURE_REQUIRED  ·  ARCHITECTURE_REJECTED

The gate refuses this section if it carries more or fewer than one such line,
so the option list above lives inside a comment on purpose: replace the line
below, never add to it. Backticked mentions in prose are not verdicts.
-->

**ARCHITECTURE_ACCEPTED**

### Verdict rationale

The focused correction is architecturally sound. It corrects an over-constrained
proof mechanism that real task-3.2 evidence exposed, and it does so without
moving the target compiler, the sequencing, any invariant, or any authority.

D18 draws the right distinction: before first delivery, preservation means the
repository's contract, not the previous compiler's serializer. `REQ-TC-002` now
allocates that obligation by emitted surface — exact bytes where the repository
ships bytes (runtime JavaScript, generator artifacts), structural type and API
semantics for declarations, and operational source attribution for maps. The
declaration contract is explicit in both directions: quote delimiter and
deterministic member ordering may differ, while a changed exported symbol,
member, literal value, type, optionality, `readonly` modifier, generic
constraint, module specifier, signature or overload semantics, or
union/intersection membership must fail.

The refusal to normalize is correct. A pattern-based normalizer that grows a rule
per observed difference eventually accepts every difference, and the rules needed
here would have had to erase declaration structure and ordering — which is where
meaning lives. Comparing declarations structurally instead keeps the failure
modes enumerable.

The raw TypeScript 6 baseline remains immutable historical evidence and is not
rewritten or recaptured to fit TypeScript 7.

One P2 is raised and assigned: map preservation must prove attribution rather
than structure, because a structurally valid map can still point at the wrong
original line. It closes inside the accepted architecture, in task 3.2.

Zero P1 findings. Zero unassigned findings.

## Apply Eligibility

- Review gate metadata valid: yes
- Reviewed artifact digests current: yes
- Repository state unchanged except this report and `reviews/**`: yes
- Strict OpenSpec validation passed: yes
- Verdict is `ARCHITECTURE_ACCEPTED`: yes
- Unresolved P1 count is zero: yes
- Invariant set unchanged by the accepting review: yes
- Authority allocation complete: yes
- External implementation authorization recorded and scope-covering: tracked
  separately — see below

**Apply eligible:** `YES`

This indicator is the REVIEW's determination: the planning bytes are accepted and
the pre-apply boundary may be established. It is not owner authorization to
implement. Task 3.2 remains paused: implementation resumes only after a fresh
trusted pre-apply boundary succeeds and the owner refreshes implementation
authority.

`REVIEW_GATE_VALID` proves the planning bytes are still those reviewed and that
this report satisfies the declared contract at the pre-apply boundary. It does
**not** authenticate who wrote this report, and it cannot prove the review was
independent — those remain external, procedural facts.

## Review History

When this report is superseded, it may be copied to
`reviews/<sequence>-<reviewed-sha>.md`. Historical copies preserve findings,
dispositions, and resolving commits but never become current authority.
