# Implementation Tasks: runner-contract-corrections

## Contract

Implementation is governed by:

- `proposal.md`
- `specs/runner-verification/spec.md`
- `specs/runner-evidence/spec.md`
- `design.md`
- `assurance.md`

plus the inherited canonical contract `openspec/specs/runner-adoption/spec.md`
and the canonical L2 capability specs being amended.

Task completion does not redefine the specification, architecture, or
assurance model.

Check alias used in task metadata: `repo-check` = `bash scripts/check.sh`.
Every proof this change introduces is a package-level test under
`packages/contracts/**` or `packages/events/**`, reached by the existing
aggregate gate. No task modifies a script or workflow.

Path authority for this change:

- `packages/contracts/**`
- `packages/events/**`
- `schemas/**`
- `openspec/changes/runner-contract-corrections/**` (this change's own
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
| Authorized scope | Landing L2 — runner domain contracts, generated schemas, conformance suite; inert. This change is a **correction within that scope**, directed by the delta review on PR #62 (2026-08-10): typed prohibited-path rules; evidence identities completed over the governing path policy and gate registry |
| Constraints | provider-neutral structural positions; no production consumer outside the contract layer; no behavioral claims; append-only identity ledger — no published row rewritten or removed; no contract beyond `path-policy`, `evidence-bundle`, and the shared primitive touched |
| Owner | repository owner (@mikegtech) |
| Recorded at | 2026-08-10 |

### Status

**`NOT_AUTHORIZED`**

#51 authorizes the L2 contract scope, and the completed L2 landing's review
trail (recorded in the archived `runner-domain-contracts` change) does not
extend to this correction. Implementation starts only after:

- the planning review approves this artifact set and closes **CQ1**
  (required identity fields) and **CQ2** (superseded-version retention); and
- the repository owner confirms #51 covers the correction — or records a
  narrower/other authority — and approves implementation; and
- task 0.1 records both and flips this status.

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

One PR: the two amendments, their regenerated schemas, the appended ledger
rows, and their proofs are a single reviewable seam. L3 (`runner-core`)
rebases on it after merge.

---

# PR-1 — L2 contract corrections

## Completion Definition

The landing is complete when every task below is done with its declared
proof green, `repo-check` is green with nothing skipped, the identity ledger
shows exactly two appended rows and zero rewritten rows against the accepted
base, and no file outside the declared path authority is modified.

## 0. Post-review authorization

- [ ] **0.1 Flip authorization on planning-review approval**
  <!-- agent-task: 0.1 paths=openspec/changes/runner-contract-corrections/tasks.md checks=repo-check risk=low prerequisites=none -->

  **Change** — On the planning review approving this artifact set and
  closing CQ1/CQ2, and the owner's confirmation of authority: record both
  and flip the Status above to `AUTHORIZED`. This task changes only the
  Status block of this file.

  **Proof required** — `repo-check` green.

## 1. Shared identity primitive

- [ ] **1.1 `AuthorityIdentity` in contracts primitives**
  <!-- agent-task: 1.1 paths=packages/contracts/** checks=repo-check risk=high prerequisites=0.1 -->

  **Implements** — Design D2; CC-INV-05.

  **Proof required** — `CC-EX-05` seed: authored once, exported for the
  inward events edge; instance-identity test extended.

## 2. Path-policy v2

- [ ] **2.1 Typed prohibited rules at contract version 2.0.0**
  <!-- agent-task: 2.1 paths=packages/contracts/**,schemas/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements** — MODIFIED requirement "Policies and packs are declarative
  references" (`runner-verification`); Design D1, D3, D4; CC-INV-01,
  CC-INV-03.

  **Change** — `ProhibitedPathRule` (closed `kind`, structurally normalized
  `prefix`); `PathPolicy` v2 exported under the existing name; v1 frozen
  module retained in the artifact catalog; `schemas/path-policy/2.0.0.json`
  generated beside the retained `1.0.0.json`.

  **Proof required** — `CC-EX-01`, `CC-EX-03`, `CC-ADV-02`; `CC-MUT-01`
  registered.

## 3. Evidence-bundle v2

- [ ] **3.1 Complete evidence identities at contract version 2.0.0**
  <!-- agent-task: 3.1 paths=packages/events/**,schemas/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements** — MODIFIED requirement "Evidence is never optional and is
  representationally complete" (`runner-evidence`); Design D2, D3, D4;
  CC-INV-02.

  **Change** — `EvidenceIdentities` gains required `path_policy` and
  `gate_registry` (`AuthorityIdentity`); `EvidenceBundle` v2 exported under
  the existing name; v1 frozen module retained;
  `schemas/evidence-bundle/2.0.0.json` generated beside the retained
  `1.0.0.json`.

  **Proof required** — `CC-EX-02`; `CC-MUT-02` registered.

## 4. Ledger append and corpus proofs

- [ ] **4.1 Append the two identity rows; prove the corpus**
  <!-- agent-task: 4.1 paths=schemas/**,packages/contracts/**,packages/events/** checks=repo-check risk=high prerequisites=2.1,3.1 -->

  **Implements** — Design D3; CC-INV-04; the append-only discipline
  (C-INV-10 lineage).

  **Change** — Append `path-policy@2.0.0` and `evidence-bundle@2.0.0` to
  `schemas/identity-ledger.json` by hand (the ledger is authored, never
  generated). No existing row changes.

  **Proof required** — `CC-EX-04` (corpus set-equality over the enlarged
  set; both superseded artifacts byte-identical); `CC-ADV-01` (git-seam
  fixture: rewrite-plus-append fails, pure append passes); the existing
  historical guard green against the accepted base.

## PR-1 Completion Gate

The landing is complete only when every box above is checked with its
declared proof green, `repo-check` reports no failure and no skip, and the
final review requirement of the standing model (complete-seam semantic
review plus one falsification review at the frozen head) is recorded here.

Task checkbox state is progress tracking. It is never proof and never
authorization.

---

# Additional Landings

None. This correction is one PR, and L3 sequences behind it.
