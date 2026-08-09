# Implementation Tasks: runner-domain-contracts

## Contract

Implementation is governed by:

- `proposal.md`
- `specs/execution-profile/spec.md`
- `specs/runner-execution/spec.md`
- `specs/runner-verification/spec.md`
- `specs/runner-evidence/spec.md`
- `design.md`
- `assurance.md`

plus the inherited canonical contract `openspec/specs/runner-adoption/spec.md`
and the constitution's L2 decomposition contract.

Task completion does not redefine the specification, architecture, or
assurance model.

Check alias used in task metadata: `repo-check` = `bash scripts/check.sh`
(scaffold validation, secret scan, workspace checks). The
regenerate-and-compare drift check and the identity-ledger guard this
change introduces are **package-level conformance tests**, reached by the
existing aggregate gate without modifying any script outside #51's
authorized paths. No task names an undeclared check.

---

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

### External authority

| Field            | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Source type      | `github_issue`                                                     |
| Source id / link | pulse-ops-ai/secure-home-agent-platform#51                         |
| Authorized scope | Landing L2 — runner domain contracts, generated schemas, conformance suite; inert |
| Constraints      | provider-neutral structural positions; no production consumer outside the contract layer; no behavioral claims; Zod via catalog; events → contracts is the only new workspace edge |
| Owner            | repository owner (@mikegtech)                                      |
| Recorded at      | 2026-08-09                                                         |

### Status

**`NOT_AUTHORIZED`** — external authority (#51) is recorded and covering.
The 2026-08-09 planning review returned NOT_READY with required
contract-model corrections; this revision enacts them (four-capability
split included, D1 accepted). The one outstanding condition is the
**delta-only planning review of this final artifact set**. On its approval,
task 0.1 flips this status to `AUTHORIZED` — the flip is the entire task,
so the agent never authorizes the consequences of its own post-review
edits.

Status derivation rules (inherited):

- Missing, ambiguous, or unverifiable provenance ⇒ `NOT_AUTHORIZED`.
- Authority narrower than the landing scope ⇒ `NOT_AUTHORIZED` for the
  uncovered work.
- Assurance completeness is necessary but never sufficient.
- This landing is ungated by U-decisions; the delta review is the only
  outstanding condition.

If the status is `NOT_AUTHORIZED`, implementation tasks must not begin.

---

## 0. Post-review authorization

- [ ] **0.1 Flip authorization on delta-review approval**
  <!-- agent-task: 0.1 paths=openspec/changes/runner-domain-contracts/tasks.md checks=repo-check risk=low prerequisites=none -->

  **Implements**

  - The review gate of the constitution's standing model.

  **Change**

  On the delta-only planning review approving this artifact set: record
  the review outcome here and flip the Status above to `AUTHORIZED`.
  Nothing else changes in this task — planning edits, if the delta review
  requires any, happen *before* this task under `NOT_AUTHORIZED`.

  **Completion**

  Status flipped, citing the delta review; artifacts untouched by this
  task.

## 1. Workspace wiring

- [ ] **1.1 Zod via the catalog; package scaffolds; the events → contracts edge**
  <!-- agent-task: 1.1 paths=pnpm-workspace.yaml,pnpm-lock.yaml,packages/contracts/**,packages/events/** checks=repo-check risk=medium prerequisites=0.1 -->

  **Implements**

  - Design D8; ADR-0012 §19 catalog governance.

  **Change**

  Add the Zod catalog entry; wire both packages' manifests, tsconfig,
  eslint, and vitest per workspace conventions; declare
  `@secure-home/contracts` as a `workspace:*` dependency of
  `packages/events` (the deliberate inward layer edge). No other
  dependency.

  **Proof required**

  - `repo-check` green; `C-EX-004` scaffold in place (zero importers
    outside the contract layer; the events edge passes).

  **Completion**

  Frozen install, lint, typecheck pass; both packages build empty; the
  dependency direction checks accept the inward edge and nothing else.

## 2. Contracts package families

- [ ] **2.1 Shared runner primitives**
  <!-- agent-task: 2.1 paths=packages/contracts/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements**

  - Design D2, D6, D7: `CredentialRef`, `ProfileIdentity`/`ProfileRef`,
    `AdapterId`, `GateId`, `Digest`, `CapabilityGrant` — authored once,
    exported for the inward events edge; no semantically equivalent
    second definition may ever exist in events.
  - Invariant(s): `C-INV-06`, `C-INV-01`; seeds `C-EX-005`

  **Proof required**

  - `C-ADV-001` seed fixtures; `C-MUT-004` target registered.

- [ ] **2.2 Execution profile**
  <!-- agent-task: 2.2 paths=packages/contracts/** checks=repo-check risk=high prerequisites=2.1 -->

  **Implements**

  - Requirement: `The execution profile is the complete authority shape`,
    `Adapter identity is opaque and open` (`execution-profile`)
  - Invariant(s): `C-INV-01`, `C-INV-02`, `C-INV-04`, `C-INV-09`

  **Proof required**

  - `C-EX-001` profile fixtures incl. open-network refusal and
    credentials-as-refs; `C-PROP-001`, `C-PROP-002` seeds

- [ ] **2.3 Launch assertion**
  <!-- agent-task: 2.3 paths=packages/contracts/** checks=repo-check risk=high prerequisites=2.1 -->

  **Implements**

  - Requirement: `The launch assertion is data with no credential-value
    slot` (`runner-execution`)
  - Invariant(s): `C-INV-06`

  **Proof required**

  - `C-ADV-001`, `C-MUT-004`

- [ ] **2.4 Path policy, gate registry, verification packs**
  <!-- agent-task: 2.4 paths=packages/contracts/** checks=repo-check risk=high prerequisites=2.1 -->

  **Implements**

  - Requirement: `Gate identity and dispositions are closed and unique`
    (registry side), `Policies and packs are declarative references`
    (`runner-verification`)
  - Invariant(s): `C-INV-03` (registry), `C-INV-01`

  **Proof required**

  - `C-EX-001` fixtures incl. pack-cannot-smuggle-a-command; `C-ADV-004`
    (registry half)

## 3. Events package families

- [ ] **3.1 Run record and the enumerated terminal vocabulary**
  <!-- agent-task: 3.1 paths=packages/events/** checks=repo-check risk=high prerequisites=1.1,2.1 -->

  **Implements**

  - Requirement: `Run identity and terminal outcomes are a closed,
    enumerated vocabulary` (`runner-execution`)
  - Invariant(s): `C-INV-03`; imports the shared primitives from
    contracts (D2/D8) — proven by `C-EX-005`

  **Proof required**

  - `C-EX-001`, `C-PROP-003` (terminal side)

- [ ] **3.2 Run events with the closed platform vocabulary**
  <!-- agent-task: 3.2 paths=packages/events/** checks=repo-check risk=high prerequisites=3.1 -->

  **Implements**

  - Requirement: `Run events use a closed platform vocabulary with
    provider data` (`runner-execution`)
  - Invariant(s): `C-INV-03`, `C-INV-02`, `C-INV-05`

  **Proof required**

  - `C-EX-001`, `C-ADV-006`, `C-MUT-005`; corpus inclusion in `C-PROP-002`

- [ ] **3.3 Evidence bundle and catalog**
  <!-- agent-task: 3.3 paths=packages/events/** checks=repo-check risk=high prerequisites=3.1 -->

  **Implements**

  - Requirement: `Evidence is never optional and is representationally
    complete` (`runner-evidence`); gate-result dispositions (result side
    of `C-INV-03`)
  - Invariant(s): `C-INV-08`, `C-INV-05` (runtime as opaque data),
    `C-INV-06` (no value slot), `C-INV-03`

  **Proof required**

  - `C-EX-001`, `C-EX-002`, `C-ADV-002`, `C-ADV-004` (result half)

## 4. Generation pipeline

- [ ] **4.1 Deterministic generation into schemas/ with the drift and identity guards**
  <!-- agent-task: 4.1 paths=packages/contracts/**,packages/events/**,schemas/** checks=repo-check risk=high prerequisites=2.2,2.3,2.4,3.1,3.2,3.3 -->

  **Implements**

  - Requirement: `Generated JSON Schema is deterministic, published
    output`, `One schema identity means one schema`
    (`runner-verification`)
  - Invariant(s): `C-INV-07`, `C-INV-09`
  - Design D3 (explicit conversion contract: draft-2020-12,
    unrepresentable: throw, no transforms/defaults, registered shared
    identities), D5.

  **Change**

  One generation entry point per package; committed `schemas/` output with
  exact-version `$id`s; the authored, append-only identity ledger (D5)
  mapping each identity to its generated-bytes digest. The
  regenerate-and-compare and ledger checks are **package-level conformance
  tests** — the existing aggregate gate executes them; **no file outside
  #51's authorized paths is modified.**

  **Proof required**

  - `C-EX-003`, `C-PROP-004`, `C-PROP-005`, `C-ADV-003`, `C-ADV-007`,
    `C-MUT-003`, `C-MUT-006`

## 5. Conformance suite

- [ ] **5.1 Neutrality, strictness, falsification, and mutation net**
  <!-- agent-task: 5.1 paths=packages/contracts/**,packages/events/** checks=repo-check risk=high prerequisites=4.1 -->

  **Implements**

  - Every C-PROP/C-ADV/C-MUT not already landed with its family; the
    adapter-falsification test as a named, re-runnable suite (L7/L8
    re-run).

  **Proof required**

  - Full assurance net green: `C-EX-001…005`, `C-PROP-001…005`,
    `C-ADV-001…007`, `C-MUT-001…006` killed.

---

## Completion Gate

This landing is complete only when:

- [ ] Every task above is complete and every proof obligation is green.
- [ ] All six mutation targets are demonstrably killed.
- [ ] `C-EX-004` confirms zero importers outside the L2 contract layer
      (the events → contracts edge excepted) — the landing is inert.
- [ ] No provider, framework, or runtime name occupies a structural
      position anywhere in the corpus or generated output; runtime
      identity exists only as opaque evidence data.
- [ ] `schemas/` regenerates byte-identically in the merge gate, every
      generated `$id` embeds its exact contract version, and every identity
      matches its ledger digest (changed bytes under an unchanged identity
      fail deterministically).
- [ ] Nothing outside #51's authorized path scope was modified.
- [ ] Repository-aware semantic review of the complete seam has run, and
      one fresh falsification-oriented independent review has completed
      against the frozen final head.
