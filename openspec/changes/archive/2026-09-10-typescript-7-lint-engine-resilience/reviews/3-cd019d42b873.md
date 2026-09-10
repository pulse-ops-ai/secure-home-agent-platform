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
  "reviewed_commit": "cd019d42b873f040d3c6da9cc7d53d0f622b2388",
  "reviewed_base_commit": "519dcde03ebe5e09861a9d66e9cf38424cc31581",
  "review_epoch": 3,
  "scope_id": "typescript7-cutover",
  "reviewed_at": "2026-09-06T12:14:12Z",
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
      "sha256": "823058780863ceae50a613b990a54df78c281c55c8aaee4746bdbf8d97bcd60c"
    }
  ]
}
-->

> **Epoch 3 was re-minted, not superseded.** The first epoch-3 candidate
> (`0f4d4f7ec94aff1b7a2ca05af5ebe213c033db10`) returned
> `FOCUSED_CLOSURE_REQUIRED` with one P1 on Scope-2 task sequencing. The
> correction changed `tasks.md`, so that manifest no longer covered the bytes
> under review. An unaccepted candidate is not a historical round -- the gate
> admits an archived round only if it is a real accepted review -- so epoch 3
> is re-bound to the corrected commit rather than archived and replaced by an
> epoch 4.


## Scope-2 Review Focus

This epoch reviews **Scope 2 (`typescript7-cutover`) only**, against the exact
post-PR-B base. Epoch 2 already decided Scope 1; this is not a re-review of it.

The question is whether the already-accepted cutover architecture remains
coherent and implementable now that the Scope-1 foundation really exists on the
default branch.

Areas the accepted planning package places in this scope, to be assessed against
the merged repository state:

- **Compiler authority.** Exactly one normal compiler after cutover; every
  `typecheck`, build, generator compilation and shared TS config resolves it;
  neither `tsc6` nor a lint type-aware mode becomes compiler authority.
- **Lint-policy authority.** The machine-readable policy remains authority and
  the replacement engine remains its implementation; no policy disappears merely
  because ESLint does.
- **Compatibility seam.** The accepted completion definition retains the bounded
  seam under TypeScript 7; retirement is not part of this scope.
- **Compiler-output parity.** Whether the planned normalized/differential proof
  over declaration output, declaration maps, source maps and generator output
  remains sufficient against the real Scope-1 foundation.
- **Native platforms.** x64 and ARM64 preserved with deterministic install and
  exact identities.
- **Maintenance authority.** The cutover must not weaken the predecessor-owned
  workflow/verifier, the four closed maintenance classes, subject isolation,
  trusted verdict, point-in-time evidence, or merge-freshness semantics.

Findings, verdict and counts below are for the independent reviewer. They are
deliberately left in their template state.


## Review Pin

| Field | Value |
|---|---|
| Repository | `pulse-ops-ai/secure-home-agent-platform` |
| Branch | `feat/typescript-7-cutover` |
| Reviewed commit | `cd019d42b873f040d3c6da9cc7d53d0f622b2388` |
| Default branch / merge base | `main` @ `519dcde03ebe5e09861a9d66e9cf38424cc31581` (exact post-PR-B) |
| Worktree state | clean at review time; no tracked or untracked modifications |
| Review rubric | `governed-preimplementation-review-v1` |
| Historical review consulted after blind pass | yes — epochs 1 and 2 under `reviews/` |

The reviewed commit contains the complete planning package. This report is
committed afterward; the deterministic gate permits only this current review
file and `reviews/**` to differ from the reviewed commit before apply.

## Independent Review Statement

- The reviewer did not author the planning package in the same working context.
- The review was read-only except for this report.
- The current package was assessed before historical `reviews/**` was read.
- Repository claims were checked against current paths, symbols, schemas and
  tests on the merged post-PR-B default branch, not against planning prose.
- No live external mutation was performed.

Independence is established. This is the second epoch-3 assessment: the first,
against `0f4d4f7ec94aff1b7a2ca05af5ebe213c033db10`, returned
`FOCUSED_CLOSURE_REQUIRED` with one P1. That P1 is now closed, and this report
accepts the corrected commit.

## Reviewed Artifact Manifest

The machine-readable block is authoritative for exact paths and SHA-256 values.

| Path | SHA-256 | Read completely? |
|---|---|---|
| `.openspec.yaml` | `212a6ad71ca36b84fdbef9c954c23bb5f5551512f74a3b8205c70c639d2111e1` | yes |
| `proposal.md` | `2ae9962c24e2949976f03ad7bb3ecdda390070287d04caa80f4d698abdfb56c8` | yes |
| `specs/lint-policy-parity/spec.md` | `f265eabb97fcc09816f4529d78eef40cb7e7978162cbdefb0aa23d2e84c7a268` | yes |
| `specs/toolchain-authority/spec.md` | `6711db4724e51f7c4eb4d77dde4b5491286cbb75e07155542b0638ad310cbaa9` | yes |
| `specs/toolchain-supply-chain/spec.md` | `591bcb272bece673adec456bad5ae85b351b50deef43ab10ad78856cef5f26c6` | yes |
| `specs/typescript-7-cutover/spec.md` | `a6d03fa663d0298c58f94df68f9c2d15a8398d3674a1fec608f2caa147a07b45` | yes |
| `design.md` | `f849fedc56ee145baa2b22757ac878d1bb0562566fc9835c205984280e1f9da8` | yes |
| `assurance.md` | `2ae675fd430fe1a452be930721ff1dc1231f0b28aa6f96d5b2857d7d074de3a0` | yes |
| `tasks.md` | `823058780863ceae50a613b990a54df78c281c55c8aaee4746bdbf8d97bcd60c` | yes |

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
| Scope and non-goals are explicit | pass | `tasks.md` `<!-- review-scope: typescript7-cutover -->`; Scope-2 completion definition |
| Current-scope requirements are observable and scenario-backed | pass | `specs/typescript-7-cutover/spec.md`; `REQ-TC-*` scenarios |
| Trust boundaries and external effects are explicit | pass | `design.md` D14; maintenance boundary now real on the default branch |
| Current-scope gating decisions are closed | pass | ADR-0022 Accepted; TS 7.0.2 target and retained seam both fixed |
| Invariants are stable, concise, and traceable | pass | invariant set unchanged by this review |
| Every mutable fact family has exactly one canonical authority | pass | `assurance.md` `AUTH-*`; verified against merged Scope-1 authorities |
| Planned authorities have contract-first tasks before consumers | pass | 3.1 audit precedes every consumer task |
| Repository assumptions were verified | pass | dual-engine fail-closed runner and `typescript-eslint` 8.66.0 pin confirmed in the merged tree |
| Landing seams are atomic and safely ordered | pass | corrected graph 3.1 → 3.3 → 3.4 → 3.2 → 3.5 → 3.6 → 3.7 |
| Proof obligations and hostile cases have due landings | pass | 4.1–4.5 verification net unchanged |
| Tasks are bounded and do not restate canonical data | pass | correction changed two prerequisite edges plus explanatory prose |
| Material prior findings have executable regression dispositions | pass | `tests/test_openspec_scope2_sequence.py` |

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

Examples of P1 impact include credential disclosure, authorization attached to
an untrusted destination, unauthorized or wrong-target external mutation,
duplicate external creation, concurrent effects, recovery treating ambiguity as
safe retry, or evidence accepted although it does not describe execution.

A trust-critical component is not automatically a P1.

### P2 — implementation-contract blocker

A significant correctness, feasibility, operability, or maintainability defect
that must be resolved before the affected landing ships but can be closed
inside the already accepted architecture through a schema, policy, typed table,
fixture, test, derivation, or bounded implementation choice.

A defect in an allocated codec, pointer, enum, mapping, schema, filename, or
golden vector is normally P2.

### P3 — documentation or local improvement

A clarity, organization, naming, duplication, or non-blocking maintainability
issue.

A propagation mismatch is P3 unless it leaves two plausible normative
implementations and one has P1-class impact.

## Findings

### P1 findings

**Unresolved P1 findings:** `none`

The one P1 raised against the previous epoch-3 candidate — Scope-2 ordering
created a guaranteed red intermediate state — is closed. See
*Review-Finding Regression Promotion*.

### P2 and P3 findings

**Unassigned P2/P3 findings:** `0`

No P2 or P3 findings were raised by this review.

## Authority Allocation Assessment

Every current-scope `AUTH-*` row in `assurance.md` was re-checked against the
merged Scope-1 implementation rather than against planning prose. No row changed
owner, path, type, producer or consumer as a result of this review.

| AUTH ID | Result | Evidence / finding |
|---|---|---|
| All current-scope rows | pass | Scope-1 authorities exist as described on the default branch; Scope-2 rows retain their planned owners |

**Authority allocation complete:** `YES`

## Repository Feasibility

| Claim | Repository evidence inspected | Result | Finding / consequence |
|---|---|---|---|
| Production lint is dual-engine and fail-closed | `packages/lint-config/src/run-lint.mjs` — `ok: legacy.ok && replacement.ok` | verified | Legacy ESLint is a required blocking path until task 3.4 |
| `typescript-eslint` 8.66.0 refuses TypeScript 7 | `pnpm-workspace.yaml` catalog; `proposal.md`; `design.md` | verified | Compiler cutover before retirement cannot be green |
| Scope-1 foundation exists as accepted | policy/mappings, boundary policy, maintenance workflow, platform workflow on `main` | verified | Scope-2 may proceed to its pre-apply boundary |
| Compatibility seam is retained under TS7 | Scope-2 completion definition | verified | Seam retirement is not in this scope |

## Invariant Stability

- Invariant set before review: the accepted `INV-TS7-*` set at
  `cd019d42b873f040d3c6da9cc7d53d0f622b2388`
- Invariant set after review: same
- New invariant required by this review: `none`
- Existing invariant removed or materially changed: `none`

**Invariant set changed by this review:** `NO`

The focused closure changed only the internal prerequisite graph. No invariant,
authority allocation, trust boundary, implementation-scope boundary,
compatibility-seam decision, or final architecture moved.

## Review-Finding Regression Promotion

| Finding | Canonical authority changed | Executable regression evidence | Owning task / existing path |
|---|---|---|---|
| P1-001 Scope-2 ordering admitted a guaranteed red state: TypeScript 7 preceded retirement of the blocking `typescript-eslint` path | none — sequencing only, inside `AUTH-*` rows that did not move | `tests/test_openspec_scope2_sequence.py` asserts by reachability that 3.4 precedes 3.2 and that 3.3/3.4 never wait on 3.2 | `openspec/changes/typescript-7-lint-engine-resilience/tasks.md` |

The defect was one token inside an HTML comment, so prose could not hold it. The
regression is expressed as a property of the graph, which makes it true of every
valid linearization rather than of one execution order.

## Focused Closure Required

Not applicable. The verdict is `ARCHITECTURE_ACCEPTED`; the closure requested by
the previous epoch-3 assessment is complete.

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

The original Scope-2 ordering created a guaranteed red intermediate state:
task 3.2 moved the normal compiler to TypeScript 7.0.2 before task 3.4 retired
ESLint, while Scope-1's merged runner keeps legacy ESLint a required blocking
path and `typescript-eslint` 8.66.0 refuses TypeScript 7. The graph therefore
instructed an implementer into a state the accepted Scope-1 gate refuses.

The focused closure changed only the internal prerequisite graph — two edges,
`3.3` from `3.2` to `3.1` and `3.2` from `3.1` to `3.1,3.4`. Replacement-only
lint (3.3) and ESLint retirement (3.4) now occur while TypeScript 6.0.3 remains
authoritative, and TypeScript 7.0.2 moves only after the legacy engine that
rejects it has left the blocking path. The emitted-output differential baseline
is frozen from the TypeScript 6 state before the pin moves, so `EX-TS-002` is
proved against a baseline that is still obtainable.

`tests/test_openspec_scope2_sequence.py` provides durable, reachability-based
regression protection against reinstating the ordering.

No authority allocation, invariant, trust boundary, implementation-scope
boundary, compatibility-seam decision, or final architecture changed. Zero P1,
P2 and P3 findings remain.

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

This indicator is the REVIEW's determination: the planning bytes are accepted
and the pre-apply boundary may be established. It is not owner authorization to
implement. External implementation authorization remains a separate `tasks.md`
check, and Scope-2 implementation stays `NOT_AUTHORIZED` until the repository
owner records it.

`REVIEW_GATE_VALID` proves the planning bytes are still those reviewed and that
this report satisfies the declared contract at the pre-apply boundary. It does
**not** authenticate who wrote this report, and it cannot prove the review was
independent — those remain external, procedural facts.

## Review History

When this report is superseded, it may be copied to
`reviews/<sequence>-<reviewed-sha>.md`. Historical copies preserve findings,
dispositions, and resolving commits but never become current authority.
