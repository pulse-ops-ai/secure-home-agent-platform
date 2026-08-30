# Pre-Implementation Review: <change-name>

<!--
This file is the current review gate. It is not a specification.

Generate the exact planning-file manifest with:

  node scripts/openspec-review-gate.mjs manifest --change <change-name>

Paste the emitted JSON between `openspec-review-gate` and the closing comment,
then complete the review in a fresh, read-only, repository-aware session.

Do not replace REVIEW_REQUIRED with ARCHITECTURE_ACCEPTED unless the acceptance
criteria below are satisfied.
-->

<!-- openspec-review-gate
{
  "contract": "preimplementation-review-v1",
  "schema": "governed-spec-driven-v2",
  "rubric": "governed-preimplementation-review-v1",
  "reviewed_commit": "REPLACE_WITH_40_HEX_COMMIT",
  "reviewed_at": "REPLACE_WITH_RFC3339_TIMESTAMP",
  "reviewer": "REPLACE_WITH_INDEPENDENT_REVIEWER",
  "verdict": "REVIEW_REQUIRED",
  "unresolved_p1_count": null,
  "unassigned_p2_p3_count": null,
  "invariant_set_changed": null,
  "authority_allocation_complete": null,
  "reviewed_artifacts": []
}
-->

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
