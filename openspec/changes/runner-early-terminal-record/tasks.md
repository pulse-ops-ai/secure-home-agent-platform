# Implementation Tasks: runner-early-terminal-record

## Contract

Implementation is governed by:

- `proposal.md`
- `specs/runner-evidence/spec.md`
- `design.md`
- `assurance.md`

plus the inherited canonical contract `openspec/specs/runner-adoption/spec.md`
and the canonical `runner-evidence` capability being amended.

Task completion does not redefine the specification, architecture, or
assurance model.

Check alias used in task metadata: `repo-check` = `bash scripts/check.sh`.
Every proof this change introduces is a package-level test under
`packages/events/**`, reached by the existing aggregate gate. No task
modifies a script or workflow.

Path authority for this change:

- `packages/events/**`
- `schemas/**`
- `openspec/changes/runner-early-terminal-record/**` (this change's own
  artifacts)

Anything else is out of scope.

---

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

### External authority

| Field | Value |
|---|---|
| Source type | `github_issue` |
| Source id / link | pulse-ops-ai/secure-home-agent-platform#51 |
| Authorized scope | Landing L2 — runner domain contracts, generated schemas, conformance suite; inert. This change is a **correction within that scope**, directed by the L4 planning review (PR #69/#70, blocker 2 / D11): a governed early-termination record for runs that terminate before production authority acquisition completes |
| Constraints | provider-neutral structural positions; no behavioral claims; append-only identity ledger — no published row rewritten or removed; no contract beyond the new `early-termination-record` touched; shared shapes reused by instance, never redefined |
| Owner | repository owner (@mikegtech) |
| Recorded at | 2026-08-11 |

### Status

**`AUTHORIZED`** — recorded 2026-08-12:

- **EQ1 and EQ2** were closed by the owner on 2026-08-11 (recorded on
  PR #71/#72): EQ1 minimal — D11's enumeration only, no partial
  *execution-authority* listing; EQ2 `packages/events`.
- **EQ3 — YES** (owner, 2026-08-12): the record MUST carry mandatory
  requester/principal attribution, available at `REQUESTED`. Requester
  attribution is not partial execution authority and must not be
  omitted.
- **EQ4 — YES** (owner, 2026-08-12): the record MUST use a narrowed
  terminal vocabulary in which success is structurally unrepresentable,
  **reusing the shared authored primitives** — a second terminal
  vocabulary must not be hand-copied to achieve the narrowing.
- **#51 authority — CONFIRMED** (owner, 2026-08-12), explicitly
  authorizing the minting of `early-termination-record@1.0.0` in
  `packages/events`, and covering exactly: the authored contract, the
  generated schema, **one** appended identity-ledger row, the `ET-*`
  conformance net, and the planning/status edits recording this
  authorization. **It does not extend beyond this correction and does
  not authorize L4 implementation.**
- The planning reviews of PR #72 (four rounds) approved the artifact set
  with no blocking findings remaining.
- `openspec validate runner-early-terminal-record --strict` passes on
  the implemented head.

**Recorded downstream obligation (owner-directed).** Before L4's task 0.1
flips, the `runner-control-orchestration` change must carry a proof
obligation that requester attribution used in an early-terminal record
comes from the `REQUESTED`/run-request input and is neither fabricated
nor inferred later. That obligation is recorded in the L4 change by this
same commit series; it is L4's to prove, not this change's.

Status derivation rules (inherited):

- Missing, ambiguous, or unverifiable provenance ⇒ `NOT_AUTHORIZED`.
- Authority narrower than the landing scope ⇒ `NOT_AUTHORIZED` for the
  uncovered work.
- Assurance completeness is necessary but never sufficient.
- An unresolved trust-critical question ⇒ `NOT_AUTHORIZED` regardless of
  recorded authority.
- This change is ungated by U-decisions (it depends on none of U1–U11).

**While the status is `NOT_AUTHORIZED`, no implementation task below may
begin.**

---

## Landing Plan

One PR: the amendment, its generated schema, the appended ledger row, and
its proofs are a single reviewable seam. The L4 landing's task 0.1 gates
on this change landing.

---

# PR-1 — the early-termination record

## Completion Definition

The landing is complete when every task below is done with its declared
proof green, `repo-check` is green with nothing skipped, the identity
ledger shows exactly one appended row and zero rewritten rows against the
accepted base, and no file outside the declared path authority is
modified.

## 0. Post-review authorization

- [x] **0.1 Flip authorization on planning-review approval**
  <!-- agent-task: 0.1 paths=openspec/changes/runner-early-terminal-record/tasks.md checks=repo-check risk=low prerequisites=none -->

  **Change** — On the planning review approving this artifact set and
  closing EQ3/EQ4, and the owner's confirmation of authority — including
  the explicit authorization to mint a new contract identity — record all
  of it, together with the already-closed EQ1/EQ2 and the strict
  validation run, and flip the Status above to `AUTHORIZED`. This task
  changes only the Status block of this file.

  **Proof required** — `repo-check` green **and**
  `openspec validate runner-early-terminal-record --strict` run
  successfully on the reviewed head, both cited in the Status block.

## 1. The contract and its corpus discipline

- [x] **1.1 `EarlyTerminationRecord` at contract version 1.0.0**
  <!-- agent-task: 1.1 paths=packages/events/**,schemas/** checks=repo-check risk=high prerequisites=0.1 -->

  **Implements** — ADDED requirement "A run that terminates before
  authority completes leaves a governed early-termination record"
  (`runner-evidence`); Design D1, D2.

  **Change** — The schema in `packages/events` beside the run-record
  family, shared shapes by instance — including the mandatory
  `requester` (`Principal`) and the narrowed `EarlyTerminationOutcome`
  composed from `run-record.ts`'s extracted terminal options (D1b); the
  artifact catalog entry; `schemas/early-termination-record/1.0.0.json`
  generated with its directory README. The extraction is **byte-neutral
  by obligation**: every existing artifact must regenerate identically.

  **Proof required** — `ET-EX-01` (smuggled authority fields refuse;
  minimal record validates), `ET-EX-02` (null vs stated reference),
  `ET-EX-03` (instance identity), `ET-EX-05` (requester mandatory and
  authority-free), `ET-EX-06` and `ET-ADV-02` (success unrepresentable),
  `ET-ADV-03` (byte-neutral extraction), `ET-ADV-04/05/06`,
  `ET-PROP-01` (every requester × reference × non-success combination
  validates and maps to failure), `ET-PROP-02` (every evidence-only key
  refuses); `ET-MUT-01/02/03/04` registered.

  **Not claimed here** — requester *provenance* (that the value came from
  the request rather than a profile) is not structurally decidable and is
  assigned to L4 (#27); this task proves only the structural half.

- [x] **1.2 Ledger append and corpus proofs**
  <!-- agent-task: 1.2 paths=schemas/**,packages/events/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements** — Design D3; ET-INV-04; the append-only discipline.

  **Change** — Append `early-termination-record@1.0.0` to
  `schemas/identity-ledger.json` by hand. No existing row changes.

  **Proof required** — `ET-EX-04` (set-equality over 11; every prior
  artifact byte-identical); `ET-ADV-01`; the historical guard green
  against the accepted base.

## PR-1 Completion Gate

The landing is complete only when every box above is checked with its
declared proof green, `repo-check` reports no failure and no skip, and
the standing model's final reviews (complete-seam semantic review plus
one falsification review at the frozen head) are recorded here.

Task checkbox state is progress tracking. It is never proof and never
authorization.

---

# Additional Landings

None. This amendment is one PR; the L4 landing consumes it.
