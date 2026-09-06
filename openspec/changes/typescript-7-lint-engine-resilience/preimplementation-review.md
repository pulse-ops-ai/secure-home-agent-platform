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
  "reviewed_at": "REPLACE_WITH_RFC3339_TIMESTAMP",
  "reviewer": "REPLACE_WITH_INDEPENDENT_REVIEWER",
  "verdict": "REVIEW_REQUIRED",
  "unresolved_p1_count": null,
  "unassigned_p2_p3_count": null,
  "invariant_set_changed": null,
  "authority_allocation_complete": null,
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
| Repository | <owner/repository> |
| Branch | <branch> |
| Reviewed commit | <full SHA; must match the gate block> |
| Default branch / merge base | <values> |
| Worktree state | clean / <explain> |
| Review rubric | `governed-preimplementation-review-v1` |
| Historical review consulted after blind pass | yes / no / none present |

The reviewed commit contains the complete planning package. The review report
may be committed afterward; the deterministic gate permits only this current
review file and `reviews/**` to differ from the reviewed commit before apply.

## Independent Review Statement

State:

- the reviewer did not author the planning package in the same working context;
- the review was read-only except for this report;
- the current package was assessed before historical `reviews/**` was read;
- repository claims were checked against current paths, symbols, schemas, and
  tests;
- no live external mutation was performed.

If independence cannot be established, verdict remains `REVIEW_REQUIRED`.

## Reviewed Artifact Manifest

The machine-readable block is authoritative for exact paths and SHA-256 values.

| Path | SHA-256 | Read completely? |
|---|---|---|
| `.openspec.yaml` | <digest> | yes |
| `proposal.md` | <digest> | yes |
| `specs/<capability>/spec.md` | <digest> | yes |
| `design.md` | <digest> | yes |
| `assurance.md` | <digest> | yes |
| `tasks.md` | <digest> | yes |

Every current delta spec must appear. Historical reviews and this report are not
members of the planning-byte manifest.

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
| Scope and non-goals are explicit | pass / fail | <reference> |
| Current-scope requirements are observable and scenario-backed | pass / fail | <reference> |
| Trust boundaries and external effects are explicit | pass / fail | <reference> |
| Current-scope gating decisions are closed | pass / fail | <reference> |
| Invariants are stable, concise, and traceable | pass / fail | <reference> |
| Every mutable fact family has exactly one canonical authority | pass / fail | <reference> |
| Planned authorities have contract-first tasks before consumers | pass / fail | <reference> |
| Repository assumptions were verified | pass / fail | <reference> |
| Landing seams are atomic and safely ordered | pass / fail | <reference> |
| Proof obligations and hostile cases have due landings | pass / fail | <reference> |
| Tasks are bounded and do not restate canonical data | pass / fail | <reference> |
| Material prior findings have executable regression dispositions | pass / fail / not applicable | <reference> |

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

**Unresolved P1 findings:** `none | <count>`

When P1 findings exist:

| ID | Title | Invariant / decision | Concrete failure trace | Evidence | Impact | Architecture change required |
|---|---|---|---|---|---|---|
| P1-001 | <title> | <INV/D> | <steps> | <references> | <impact> | <required change> |

For an accepting review, replace the indicator with exactly `none` and remove
all placeholder P1 rows. The gate block's `unresolved_p1_count` must agree.

### P2 findings

| ID | Title | Evidence | Required executable closure | Owning task / landing |
|---|---|---|---|---|
| P2-001 | <title> | <reference> | <schema/test/code closure> | <task> |

### P3 findings

| ID | Title | Evidence | Disposition |
|---|---|---|---|
| P3-001 | <title> | <reference> | fix / defer / reject with reason |

**Unassigned P2/P3 findings:** `<count>`

A finding is assigned only when it names a task, proof obligation, or explicit
deferred landing. The gate block's `unassigned_p2_p3_count` must agree and must
be zero for acceptance.

## Authority Allocation Assessment

For every `AUTH-*` row in `assurance.md`, verify:

- one fact family has one owner;
- path and symbol are unambiguous;
- authority type can express the claimed fact;
- producer and verifier/consumer are named;
- planned authorities have contract-first tasks;
- prose mirrors are absent, generated, or drift-checked;
- no review ledger is treated as authority.

| AUTH ID | Result | Evidence / finding |
|---|---|---|
| AUTH-001 | pass / fail | <reference> |

**Authority allocation complete:** `YES | NO`

Set `authority_allocation_complete: true` only when this indicator is `YES`,
every current-scope row passes, and no current-scope authority is `blocked`.

## Repository Feasibility

| Claim | Repository evidence inspected | Result | Finding / consequence |
|---|---|---|---|
| <design/task claim> | <path, symbol, schema, test> | verified / mismatch / absent | <result> |

Do not approve an architecture whose safe implementation depends on repository
behavior that was not inspected.

## Invariant Stability

- Invariant set before review: `<IDs and digest or exact list reference>`
- Invariant set after review: `<same | changed>`
- New invariant required by this review: `none | <ID and reason>`
- Existing invariant removed or materially changed: `none | <ID and reason>`

**Invariant set changed by this review:** `YES | NO`

Set `invariant_set_changed: false` only when this indicator is `NO` and no new
invariant or material invariant rewrite is required at the reviewed commit.

## Review-Finding Regression Promotion

For each material historical or current finding resolved before acceptance,
identify durable protection.

| Finding | Canonical authority changed | Executable regression evidence | Owning task / existing path |
|---|---|---|---|
| <finding> | <AUTH-ID> | <fixture/test/schema guard/golden vector> | <reference> |

A prose-only correction is not durable regression protection for an
implementation-grade defect.

## Focused Closure Required

Complete only when the verdict is `FOCUSED_CLOSURE_REQUIRED`.

| Closure question | Required evidence | Re-review scope | Stop condition |
|---|---|---|---|
| <one bounded question> | <exact artifact/test/decision> | <paths> | <deterministic condition> |

Do not request another unrestricted “find more issues” round.

## Verdict

<!--
State exactly ONE governed verdict token, as a bold line of its own:

  REVIEW_REQUIRED  ·  ARCHITECTURE_ACCEPTED
  FOCUSED_CLOSURE_REQUIRED  ·  ARCHITECTURE_REJECTED

The gate refuses this section if it carries more or fewer than one such line,
so the option list above lives inside a comment on purpose: replace the line
below, never add to it. Backticked mentions in prose are not verdicts.
-->

**REVIEW_REQUIRED**

### Verdict rationale

<Concise evidence-based rationale.>

`ARCHITECTURE_ACCEPTED` is permitted with P2/P3 findings only when every one is
assigned to a task, proof obligation, or explicit deferred landing and no P1
remains.

## Apply Eligibility

- Review gate metadata valid: yes / no
- Reviewed artifact digests current: yes / no
- Repository state unchanged except this report and `reviews/**`: yes / no
- Strict OpenSpec validation passed: yes / no
- Verdict is `ARCHITECTURE_ACCEPTED`: yes / no
- Unresolved P1 count is zero: yes / no
- Invariant set unchanged by the accepting review: yes / no
- Authority allocation complete: yes / no
- External implementation authorization recorded and scope-covering: yes / no

**Apply eligible:** `YES | NO`

The deterministic review gate validates the machine-readable subset. External
implementation authorization remains a separate tasks.md check.

`REVIEW_GATE_VALID` proves the planning bytes are still those reviewed and that
this report satisfies the declared contract at the pre-apply boundary. It does
**not** authenticate who wrote this report, and it cannot prove the review was
independent — those remain external, procedural facts.

## Review History

When this report is superseded, it may be copied to
`reviews/<sequence>-<reviewed-sha>.md`. Historical copies preserve findings,
dispositions, and resolving commits but never become current authority.
