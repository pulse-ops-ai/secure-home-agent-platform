# Implementation Tasks: runner-domain-contracts

## Contract

Implementation is governed by:

- `proposal.md`
- `specs/runner-domain-contracts/spec.md`
- `design.md`
- `assurance.md`

plus the inherited canonical contract `openspec/specs/runner-adoption/spec.md`
and the constitution's L2 decomposition contract.

Task completion does not redefine the specification, architecture, or
assurance model.

Check alias used in task metadata: `repo-check` = `bash scripts/check.sh`
(scaffold validation, secret scan, workspace checks) plus, from task 4
onward, the regenerate-and-compare drift gate this change introduces. No
task names an undeclared check.

---

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

### External authority

| Field            | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Source type      | `github_issue`                                                     |
| Source id / link | pulse-ops-ai/secure-home-agent-platform#51                         |
| Authorized scope | Landing L2 — runner domain contracts, generated schemas, conformance suite; inert |
| Constraints      | provider-neutral structural positions; no consumer; no behavioral claims; Zod via catalog only |
| Owner            | repository owner (@mikegtech)                                      |
| Recorded at      | 2026-08-09                                                         |

### Status

**`NOT_AUTHORIZED`** — external authority (#51) is recorded and covering,
but the standing model requires this planning seam to pass the
architecture/assurance review (including the D1 decomposition decision)
before implementation begins. On review approval and design freeze, this
status flips to `AUTHORIZED` in a commit that also enacts the accepted D1
grouping (task 0).

Status derivation rules (inherited):

- Missing, ambiguous, or unverifiable provenance ⇒ `NOT_AUTHORIZED`.
- Authority narrower than the landing scope ⇒ `NOT_AUTHORIZED` for the
  uncovered work.
- Assurance completeness is necessary but never sufficient.
- This landing is ungated by U-decisions; the review freeze is the only
  outstanding condition.

If the status is `NOT_AUTHORIZED`, implementation tasks must not begin.

---

## 0. Post-review alignment

- [ ] **0.1 Enact the accepted D1 decomposition and flip authorization**
  <!-- agent-task: 0.1 paths=openspec/changes/runner-domain-contracts/** checks=repo-check risk=low prerequisites=none -->

  **Implements**

  - Open question Q1 / design D1, as decided by the review.

  **Change**

  Reorganize the spec delta into the accepted capability grouping (four-way
  split as proposed, or the review's alternative), reconcile design/assurance
  references, and flip the Status above to `AUTHORIZED` citing the review.

  **Completion**

  `openspec validate runner-domain-contracts --strict` valid; artifacts
  agree with the accepted grouping; status flipped.

## 1. Workspace wiring

- [ ] **1.1 Zod via the catalog; package scaffolds**
  <!-- agent-task: 1.1 paths=pnpm-workspace.yaml,pnpm-lock.yaml,packages/contracts/**,packages/events/** checks=repo-check risk=medium prerequisites=0.1 -->

  **Implements**

  - Design D8; ADR-0012 §19 catalog governance.

  **Change**

  Add the Zod catalog entry; wire both packages' manifests, tsconfig,
  eslint, and vitest per the workspace conventions; no other dependency.

  **Proof required**

  - `repo-check` green; `C-EX-004` scaffold (zero importers) in place.

  **Completion**

  Frozen install, lint, typecheck pass; both packages build empty.

## 2. Contracts package families

- [ ] **2.1 Execution profile**
  <!-- agent-task: 2.1 paths=packages/contracts/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements**

  - Requirement: `The execution profile has a complete, versioned shape`,
    `Adapter identity is opaque and open`
  - Invariant(s): `C-INV-01`, `C-INV-02`, `C-INV-04`, `C-INV-09`

  **Proof required**

  - `C-EX-001` profile fixtures; `C-PROP-001`, `C-PROP-002` seeds

- [ ] **2.2 Launch assertion and credential references**
  <!-- agent-task: 2.2 paths=packages/contracts/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements**

  - Requirement: `The launch assertion is data with unrepresentable secrets`
  - Invariant(s): `C-INV-06`

  **Proof required**

  - `C-ADV-001`, `C-MUT-004`

- [ ] **2.3 Path policy, gate registry, verification packs**
  <!-- agent-task: 2.3 paths=packages/contracts/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements**

  - Requirement: `Gate identity and dispositions are closed and unique`
    (registry side), `Policies and packs are declarative references`
  - Invariant(s): `C-INV-03` (registry), `C-INV-01`

  **Proof required**

  - `C-EX-001` fixtures incl. pack-cannot-smuggle-a-command; `C-ADV-004`
    (registry half)

## 3. Events package families

- [ ] **3.1 Run record and terminal vocabulary**
  <!-- agent-task: 3.1 paths=packages/events/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements**

  - Requirement: `Run identity and terminal outcomes are closed
    vocabularies`
  - Invariant(s): `C-INV-03`

  **Proof required**

  - `C-EX-001`, `C-PROP-003` (terminal side)

- [ ] **3.2 Run events**
  <!-- agent-task: 3.2 paths=packages/events/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements**

  - Requirement: `Run events are uniform, dotted, and provider-blind`
  - Invariant(s): `C-INV-02`, `C-INV-05`

  **Proof required**

  - `C-EX-001`, corpus inclusion in `C-PROP-002`

- [ ] **3.3 Evidence bundle and catalog**
  <!-- agent-task: 3.3 paths=packages/events/** checks=repo-check risk=high prerequisites=3.1 -->

  **Implements**

  - Requirement: `Evidence is never optional and carries verifiable
    identity`; gate-result dispositions (result side of `C-INV-03`)
  - Invariant(s): `C-INV-08`, `C-INV-03`

  **Proof required**

  - `C-EX-001`, `C-ADV-002`, `C-ADV-004` (result half)

## 4. Generation pipeline

- [ ] **4.1 Deterministic generation into schemas/ with the drift gate**
  <!-- agent-task: 4.1 paths=packages/contracts/**,packages/events/**,schemas/**,scripts/** checks=repo-check risk=high prerequisites=2.1,2.2,2.3,3.1,3.2,3.3 -->

  **Implements**

  - Requirement: `Generated JSON Schema is deterministic, published
    output`, `Contracts are versioned with stated compatibility`
  - Invariant(s): `C-INV-07`, `C-INV-09`
  - Design D3, D5.

  **Change**

  One generation entry point per package (Zod v4 native export, stable
  serialization); committed `schemas/` output; regenerate-and-compare wired
  into `scripts/check.sh` so drift fails the repository gate.

  **Proof required**

  - `C-EX-003`, `C-PROP-004`, `C-PROP-005`, `C-ADV-003`, `C-MUT-003`

## 5. Conformance suite

- [ ] **5.1 Neutrality, strictness, falsification, and mutation net**
  <!-- agent-task: 5.1 paths=packages/contracts/**,packages/events/** checks=repo-check risk=high prerequisites=4.1 -->

  **Implements**

  - Every C-PROP/C-ADV/C-MUT not already landed with its family; the
    adapter-falsification test as a named, re-runnable suite (L7/L8
    re-run).

  **Proof required**

  - Full assurance net green: `C-EX-001…004`, `C-PROP-001…005`,
    `C-ADV-001…005`, `C-MUT-001…004` killed.

---

## Completion Gate

This landing is complete only when:

- [ ] Every task above is complete and every proof obligation is green.
- [ ] All four mutation targets are demonstrably killed.
- [ ] `C-EX-004` confirms zero importers — the landing is inert.
- [ ] No provider, framework, or runtime name occupies a structural
      position anywhere in the corpus or generated output.
- [ ] `schemas/` regenerates byte-identically in the merge gate.
- [ ] Repository-aware semantic review of the complete seam has run, and
      one fresh falsification-oriented independent review has completed
      against the frozen final head.
