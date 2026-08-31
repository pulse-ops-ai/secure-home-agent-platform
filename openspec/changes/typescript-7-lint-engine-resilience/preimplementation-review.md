# Pre-Implementation Review: TypeScript 7 and lint-engine resilience

<!--
This file is the current review gate, not a specification.

The planning author is not an independent reviewer. After proposal.md,
specs/**, design.md, assurance.md, tasks.md, Proposed ADR-0022, and index/status
reconciliation are committed, generate the exact manifest for the first scope:

  pnpm run review:manifest --change typescript-7-lint-engine-resilience \
      --scope replacement-authority-parity --epoch 1 --base origin/main \
      --remote origin/main

Paste the emitted block below and complete this artifact in a fresh read-only
review session. Do not replace REVIEW_REQUIRED without that independent review
and explicit owner process.
-->

<!-- openspec-review-gate
{
  "contract": "preimplementation-review-v2",
  "schema": "governed-spec-driven-v2",
  "rubric": "governed-preimplementation-review-v1",
  "reviewed_commit": "REPLACE_WITH_40_HEX_COMMIT",
  "reviewed_base_commit": "REPLACE_WITH_40_HEX_COMMIT",
  "review_epoch": 1,
  "scope_id": "replacement-authority-parity",
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
| Repository | `pulse-ops-ai/secure-home-agent-platform` |
| Branch | `docs/typescript-7-lint-engine-resilience` |
| Reviewed commit | not yet pinned — run `review:manifest` after the complete PR-A planning package is committed |
| Default branch / planning base | `main` / `70f23f43a6ca95f128de664c242187ad6026a67d` at PR-A creation; reviewer must resolve live main again |
| Worktree state | not yet reviewed |
| Review rubric | `governed-preimplementation-review-v1` |
| Historical review consulted after blind pass | none present |

The future reviewed commit must contain the complete planning package. This
placeholder creates no acceptance and is not valid gate metadata.

## Independent Review Statement

Independence is **not established** in PR-A authoring. The planning author:

- authored the package in this working context;
- did not perform an independent read-only review;
- did not issue an architecture verdict; and
- performed no live external mutation.

An independent reviewer must replace this section after reviewing the current
package before any historical `reviews/**` material. Until then the verdict
remains `REVIEW_REQUIRED`.

## Reviewed Artifact Manifest

The manifest has not been generated because the planning package has not yet
been independently reviewed.

| Path | SHA-256 | Read completely? |
|---|---|---|
| `.openspec.yaml` | pending manifest | no independent review |
| `proposal.md` | pending manifest | no independent review |
| `specs/toolchain-authority/spec.md` | pending manifest | no independent review |
| `specs/lint-policy-parity/spec.md` | pending manifest | no independent review |
| `specs/typescript-7-cutover/spec.md` | pending manifest | no independent review |
| `specs/toolchain-supply-chain/spec.md` | pending manifest | no independent review |
| `design.md` | pending manifest | no independent review |
| `assurance.md` | pending manifest | no independent review |
| `tasks.md` | pending manifest | no independent review |

The machine-readable block emitted by `review:manifest`, not this pending table,
will become authoritative for exact paths and digests.

## Review Method

### Pass A — blind current-state review

Pending. The independent reviewer must evaluate current planning bytes and
repository evidence for unresolved architecture decisions, unsafe ambiguity,
missing prerequisites, competing authorities, unimplementable tasks, and proof
obligations without executable destinations.

### Pass B — regression and history review

Pending. There is no current historical review directory. If later rounds exist,
they may be read only after Pass A and never override current artifacts.

## Architecture Acceptance Checks

| Check | Result | Evidence |
|---|---|---|
| Scope and non-goals are explicit | pending independent review | proposal |
| Current-scope requirements are observable and scenario-backed | pending independent review | specs |
| Trust boundaries and external effects are explicit | pending independent review | design |
| Current-scope gating decisions are closed | pending independent review | proposal/design |
| Invariants are stable, concise, and traceable | pending independent review | assurance |
| Every mutable fact family has exactly one canonical authority | pending independent review | assurance |
| Planned authorities have contract-first tasks before consumers | pending independent review | tasks |
| Repository assumptions were verified | pending independent review | design feasibility |
| Landing seams are atomic and safely ordered | pending independent review | design/tasks |
| Proof obligations and hostile cases have due landings | pending independent review | assurance/tasks |
| Tasks are bounded and do not restate canonical data | pending independent review | tasks |
| Material prior findings have executable regression dispositions | not applicable — no prior review | none |

## Severity Calibration

The reviewer must apply the v2 rubric:

- P1 only when a concrete in-scope failure trace requires changing an invariant,
  authority allocation, trust boundary, prerequisite, or external ownership/
  identity model;
- P2 for implementation-contract defects within already allocated schemas,
  mappings, fixtures, commands, or platform projections; and
- P3 for clarity/local improvements that do not leave a P1-impact ambiguity.

## Findings

### P1 findings

**Unresolved P1 findings:** not assessed

No P1 conclusion is made by the author.

### P2 findings

Not assessed.

### P3 findings

Not assessed.

**Unassigned P2/P3 findings:** not assessed

## Authority Allocation Assessment

Pending independent review of every `AUTH-*` row in `assurance.md`.

**Authority allocation complete:** `NO — NOT REVIEWED`

## Repository Feasibility

Pending independent verification of the current lint inventory, TypeScript API
consumer inventory, TS7 disposable audit, package/install facts, OpenSpec parser,
and native platform plan recorded in `design.md`.

## Invariant Stability

- Invariant set before review: `INV-TS7-01` through `INV-TS7-24`
- Invariant set after review: pending
- New invariant required by this review: pending
- Existing invariant removed or materially changed: pending

**Invariant set changed by this review:** `NOT ASSESSED`

## Review-Finding Regression Promotion

No findings exist yet. An accepting review must assign every material correction
to executable regression evidence.

## Focused Closure Required

Not assessed. If the reviewer selects `FOCUSED_CLOSURE_REQUIRED`, this section
must name one bounded closure question, exact evidence, paths, and stop condition.

## Verdict

**REVIEW_REQUIRED**

### Verdict rationale

The complete planning package is authored but has not received the independent,
pinned, repository-aware review required by governed-spec-driven-v2. ADR-0022 is
Proposed and implementation authorization is explicitly absent.

## Apply Eligibility

- Review gate metadata valid: no
- Reviewed artifact digests current: no manifest
- Repository state unchanged except this report and `reviews/**`: not assessed
- Strict OpenSpec validation passed: to be recorded after final PR-A validation
- Verdict is `ARCHITECTURE_ACCEPTED`: no
- Unresolved P1 count is zero: not assessed
- Invariant set unchanged by accepting review: not assessed
- Authority allocation complete: not assessed
- External implementation authorization recorded and scope-covering: no

**Apply eligible:** `NO`

## Review History

None. If this report is later superseded after a real review epoch, archive only
an admitted report following the v2 naming/append-only rules.
