# Implementation Tasks: governance-state-substrate

## Contract

Implementation is governed by:

- `proposal.md`
- `specs/governance-state/spec.md`
- `design.md`
- `assurance.md`

These artifacts define the accepted change contract. Task completion does not
redefine the specification, architecture, or assurance model.

**This PR is a planning and decomposition contract. No implementation task
below is executed in it.** It creates no `governance/` directory, no
`state.json`, no scripts, no tests, and no CI change.

---

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

### External authority

| Field | Value |
|---|---|
| Source type | `github_issue` |
| Source id / link | **#106** — *Implement ADR-0021 governance-state substrate and migrate mutable governance projections* |
| Governing ADR | **ADR-0021** — `Accepted`, immutable, SHA-256 `0db0b5b7d3342b13b2f23602d3f7017f993705410d3e9a9966b1577cfd8cd66a` |
| Base revision | `origin/main` `eb6e24806cb76898e74f16208ab40587313c126a` (merge of PR #105) |
| Authorized scope | Phase 1 of #106 — **the OpenSpec planning contract only** |
| Constraints | Phase 1 does not authorize implementation of the registry, validators, renderer, query interface, migration, or CI changes. PR #101 is not to be modified. |
| Owner | @mikegtech (repository owner) |
| Recorded at | this change, on branch `spec/governance-state-substrate` |

### Status

**`NOT_AUTHORIZED`**

Issue #106 is the standing external authority for the substrate, and phase 1 —
this planning contract — is the only phase released. Every implementation
landing below is therefore `NOT_AUTHORIZED` for execution until the repository
owner explicitly releases it.

Status derivation:

- Authority narrower than the landing plan ⇒ `NOT_AUTHORIZED` for every
  uncovered landing. PR-1 through PR-6 are all uncovered by the phase-1
  release and are named explicitly below.
- Assurance completeness is necessary but never sufficient. `assurance.md`
  being complete does not authorize a single task here.
- Neither the existence of issue #106, nor ADR-0021's acceptance, nor any
  future satisfied prerequisite manufactures permission to start.

**While this status is `NOT_AUTHORIZED`, implementation tasks must not begin.**

### PR #101

PR #101 remains **untouched** — not modified, rebased, narrowed, closed, or
merged — until the completed substrate has independently passed review and
merged. Its later rebase is PR-7 below, and it is not authorized here.

---

## Landing Plan

| Landing | Ships | Authority posture | Completion condition |
|---|---|---|---|
| PR-1 | model, strict reader, current-revision checker, hostile corpus | inert | model rules proven; nothing generated, nothing seeded |
| PR-2 | genesis seed, genesis attestation, equivalence proof | inert | seed validates under PR-1 and provably changes no operative state |
| PR-3 | renderer, `governance/STATE.md`, marker registry | advisory | `--check` byte-for-byte no-op; no consumer depends on it |
| PR-4 | projection migration, prohibited-field refusal | **enforce** | each generated region lands with the deletion of the copy it replaces |
| PR-5 | history checker, explicit-base CI wiring | enforce | regression corpus green; invalid base fails with no fallback |
| PR-6 | query interface | read-only | axes separate; `AUTHORIZED` unreachable |
| PR-7 | rebase and narrow PR #101 | consumer | only after PR-1–PR-6 merged and reviewed |

A landing is the unit that may be independently merged. Do not merge a partial
atomic seam. Verification required to trust a component lands with that
component.

---

# PR-1 — Model, strict reader, and current-revision checker

## Completion Definition

PR-1 is complete only when every PR-1 task is complete, every PR-1 scenario is
proven, every assigned invariant has its proof, the atomic seam is present, the
hostile and mutation coverage is green, and review has completed on one frozen
head.

---

## 1. Canonical representation and schema closure

- [ ] **1.1 Strict canonical reader and serializer**
  <!-- agent-task: 1.1 paths=scripts/governance/model/** checks=node,pytest risk=trust-critical prerequisites=none -->

  **Implements**
  - Requirement: *The registry is the sole authored authority in a closed canonical representation*
  - Scenario(s): well-formed validates; duplicate key; unknown field; noncanonical; malformed-never-empty
  - Invariant(s): `INV-G11`, `INV-G12`, `INV-G13`, `INV-G04`

  **Change**
  A reader that rejects duplicate keys **before object construction**, a closed
  schema validator that rejects unknown fields, and a deterministic canonical
  serializer. Owns representation only — no governance semantics.

  **Proof required**
  - `ADV-G01` duplicate key · `ADV-G02` unknown field · `ADV-G03` noncanonical
  - `ADV-G23` truncated registry does not read as empty
  - `PROP-G02` canonical round-trip and key-order independence
  - `MUT-G01` strict reader → permissive `JSON.parse` must fail the suite
  - `MUT-G12` unknown-field rejection → ignore must fail the suite

  **Completion**
  Implementation complete; all task-owned proofs green; no deferred proof.

- [ ] **1.2 Digest computation and preimage construction**
  <!-- agent-task: 1.2 paths=scripts/governance/model/** checks=node,pytest risk=trust-critical prerequisites=1.1 -->

  **Implements**
  - Requirement: *Acceptance and genesis attestations are non-self-referential and digest-bound*
  - Invariant(s): `INV-G15`
  - Design decision(s): `D3`

  **Change**
  `contentDigest`, `primitiveDigest`, `relationshipDigest`, `transitionDigest`,
  `completionDigest`, with attestation envelopes excluded from the preimages
  they attest.

  **Proof required**
  - `ADV-G19` attestation inside its own preimage
  - `PROP-G03` any security-relevant field change changes the digest

  **Completion**
  As above.

---

## 2. Decision, question, and gate semantics

- [ ] **2.1 Decision lifecycle and header-mirror rules**
  <!-- agent-task: 2.1 paths=scripts/governance/model/** checks=node,pytest risk=trust-critical prerequisites=1.1 -->

  **Implements**
  - Requirement: *The decision lifecycle is a closed vocabulary with a closed transition matrix*
  - Invariant(s): `INV-G14`
  - Design decision(s): `D5.1`, `D5.2`

  **Change**
  The closed transition matrix and the allowed-mirror rule, including the
  deliberate `Superseded`/`Accepted` divergence.

  **Proof required**
  - `ADV-G04` accepted-byte mutation · `ADV-G05` superseded header rewritten
  - `ADV-G08` accepted→proposed / accepted→rejected · `ADV-G25` rejection
    without final-byte attestation
  - `EX-G07` legal supersession leaves old bytes and header intact
  - `MUT-G02` digest comparison → unconditional pass

- [ ] **2.2 Derived resolution and gate predicates**
  <!-- agent-task: 2.2 paths=scripts/governance/model/** checks=node,pytest risk=trust-critical prerequisites=2.1 -->

  **Implements**
  - Requirement: *Question resolution and gate satisfaction are derived, never authored*
  - Invariant(s): `INV-G02`, `INV-G17`, `INV-G04`

  **Change**
  Resolution derived from a current accepted resolver; the closed predicate
  vocabulary; unevaluable ⇒ unsatisfied **and** checker failure.

  **Proof required**
  - `ADV-G06` two current resolvers · `ADV-G07` proposed resolver resolves
    nothing · `ADV-G09` unevaluable predicate
  - `EX-G01` authored `resolved`/`satisfied` rejected as unknown fields
  - `MUT-G03` resolver uniqueness → first-match-wins
  - `MUT-G11` unevaluable → silently false

---

## 3. Landings, prerequisites, and completion policies

- [ ] **3.1 Landing lifecycle, rule inputs, and readiness derivation**
  <!-- agent-task: 3.1 paths=scripts/governance/model/** checks=node,pytest risk=trust-critical prerequisites=2.2 -->

  **Implements**
  - Requirement: *Landings carry immutable rule inputs and a closed delivery lifecycle*
  - Invariant(s): `INV-G16`, `INV-G18`, `INV-G02`
  - Design decision(s): `D5.3`

  **Change**
  Closed delivery vocabulary and transitions; identity-bearing rule inputs;
  derived readiness with unsatisfied identifiers and explanation. No authored
  `blockedOn`.

  **Proof required**
  - `ADV-G10` cycle · `ADV-G12` dangling reference
  - `EX-G02` `Planned`/`InProgress` never satisfy a prerequisite

- [ ] **3.2 Completion policies and identity verification**
  <!-- agent-task: 3.2 paths=scripts/governance/model/** checks=node,pytest risk=trust-critical prerequisites=3.1 -->

  **Implements**
  - Requirement: *Completion is an identity-bound transition under a closed policy vocabulary*
  - Design decision(s): `D4`

  **Change**
  `reviewed-delivery-v1` and `reviewed-spike-evidence-v1` only; scope-bound
  delivered identity; `local-git-commit` / `external-git-commit` /
  `content-sha256` distinction; fail closed with
  `COMPLETION_REQUIRES_EXTERNAL_VERIFICATION`.

  **Proof required**
  - `ADV-G26` arbitrary commit as completion evidence
  - `ADV-G27` arbitrary issue + merged PR as spike evidence
  - `ADV-G28` retrospective OpenSpec archive substituted
  - `ADV-G29` terminal delivery evidence mutated
  - `ADV-G30` unknown / generic-legacy policy
  - `ADV-G33` absent `local-git-commit` object
  - `MUT-G09` scope binding → bare hash accepted

- [ ] **3.3 Current-revision checker entry point**
  <!-- agent-task: 3.3 paths=scripts/check-governance-state.mjs checks=node,pytest risk=trust-critical prerequisites=3.2 -->

  **Implements**
  - Requirement: *Current-revision validation is offline, dependency-light, and fails closed*
  - Invariant(s): `INV-G05`, `INV-G10`

  **Change**
  A thin entry point over the model. Implements **no** rule of its own.

  **Proof required**
  - `EX-G12` offline run with no network available
  - `MUT-G05` a predicate re-implemented in the entry point is detected
  - Every `ADV-` case above must fail through **this** entry point

---

## 4. Verification Net for PR-1

- [ ] **4.1 Hostile corpus and fixtures**
  <!-- agent-task: 4.1 paths=tests/test_governance_state.py,tests/fixtures/governance/** checks=pytest risk=trust-critical prerequisites=3.3 -->
  **Proves** — `ADV-G01`–`ADV-G12`, `ADV-G23`, `ADV-G25`–`ADV-G30`, `ADV-G33`

- [ ] **4.2 Property coverage**
  <!-- agent-task: 4.2 paths=tests/test_governance_state.py checks=pytest risk=high prerequisites=3.3 -->
  **Proves** — `PROP-G01`, `PROP-G02`, `PROP-G03`, `PROP-G06`, `PROP-G07`

- [ ] **4.3 Mutation coverage**
  <!-- agent-task: 4.3 paths=tests/test_governance_state.py checks=pytest risk=trust-critical prerequisites=4.1 -->
  **Proves** — `MUT-G01`, `MUT-G02`, `MUT-G03`, `MUT-G05`, `MUT-G09`,
  `MUT-G11`, `MUT-G12`

---

## PR-1 Completion Gate

- [ ] Every PR-1 task complete.
- [ ] Every PR-1 scenario proven through a real entry point.
- [ ] Every assigned invariant proven.
- [ ] Property, hostile, and mutation coverage green.
- [ ] No rule implemented outside the model.
- [ ] No expired traceability debt.
- [ ] Deterministic gates green or explicitly classified as pre-existing.
- [ ] Review completed on one frozen head.

---

# PR-2 — Genesis seed and attestation

## Completion Definition

Complete only when the seed validates under PR-1's checker, the genesis
attestation binds every identity-bearing rule input, and state-preservation is
demonstrated.

## 5. Genesis

- [ ] **5.1 Seed the exact pre-transition state**
  <!-- agent-task: 5.1 paths=governance/state.json,governance/README.md checks=node,pytest risk=trust-critical prerequisites=3.3 -->

  **Implements**
  - Requirement: *Genesis seeds the exact pre-transition state and changes nothing*
  - Invariant(s): `INV-G25`, `INV-G26`

  **Change**
  Seed ADR-0001…ADR-0019 `Accepted`, **ADR-0020 `Proposed`**, ADR-0021
  `Accepted`, U4 open, GATE-U4 unsatisfied, L8 outstanding, L9 requiring
  `L8 + GATE-U4` with anchor issue #57, readiness `NotReady`, and the L6 spike
  under `reviewed-spike-evidence-v1`. The accepted set is recorded as the
  **non-contiguous** set it is.

  **Proof required**
  - `EX-G16` before/after derivation identical — seeding moves nothing
  - `EX-G17` non-contiguous accepted set preserved, never a continuous range
  - `ADV-G32` seed mutated to claim ADR-0020 accepted / U4 resolved / GATE-U4
    satisfied

- [ ] **5.2 Genesis attestation and relationship equivalence**
  <!-- agent-task: 5.2 paths=governance/state.json,scripts/governance/model/** checks=node,pytest risk=trust-critical prerequisites=5.1 -->

  **Implements**
  - Requirement: *Acceptance and genesis attestations are non-self-referential and digest-bound*
  - Design decision(s): `D6`

  **Change**
  Field-by-field comparison against the selected source snapshot; separate
  `seedDigest` and `relationshipEquivalenceDigest`; `priorStateDigest: null`.

  **Proof required**
  - `ADV-G20` byte-correct seed, wrong relationship — must fail **without** a
    prior revision
  - `ADV-G31` omitted / unparseable / conflicting source label
  - `MUT-G10` equivalence digest → derived-count comparison only

- [ ] **5.3 Genesis verification net**
  <!-- agent-task: 5.3 paths=tests/test_governance_state.py,tests/fixtures/governance/** checks=pytest risk=trust-critical prerequisites=5.2 -->
  **Proves** — `ADV-G20`, `ADV-G31`, `ADV-G32`, `EX-G16`, `EX-G17`, and the
  real L6 spike fixture

## PR-2 Completion Gate

- [ ] Seed validates under PR-1's checker.
- [ ] State-preservation demonstrated.
- [ ] Genesis hostile cases green.
- [ ] **ADR-0020 still `Proposed`; U4 still open; GATE-U4 still unsatisfied.**
- [ ] Review completed on one frozen head.

---

# PR-3 — Renderer and `governance/STATE.md`

## 6. Rendering

- [ ] **6.1 Deterministic renderer with a registered marker set**
  <!-- agent-task: 6.1 paths=scripts/render-governance-state.mjs,governance/STATE.md checks=node,pytest risk=high prerequisites=5.2 -->

  **Implements**
  - Requirement: *Projections are generated, registered, and byte-for-byte verified*
  - Invariant(s): `INV-G21`, `INV-G22`
  - Design decision(s): `D7.1`, `D7.2`

  **Proof required**
  - `EX-G11` `--check` no-op; write mode a separate invocation
  - `ADV-G22` unregistered target or marker
  - `ADV-G36` generated projection edited by hand
  - `PROP-G04` renderer output is a pure function of the registry
  - `MUT-G07` `--check` → non-byte-exact comparison

- [ ] **6.2 Scripts documentation for write vs `--check`**
  <!-- agent-task: 6.2 paths=scripts/README.md checks=none risk=low prerequisites=6.1 -->
  Record the write/`--check` distinction, because the current scripts contract
  describes repository scripts as read-only.

## PR-3 Completion Gate

- [ ] `--check` is a byte-for-byte no-op.
- [ ] No consumer yet depends on the renderer.
- [ ] Drift controls green.

---

# PR-4 — Projection migration (activation seam)

## 7. Migration

- [ ] **7.1 Generate the decision-index lifecycle regions**
  <!-- agent-task: 7.1 paths=docs/decisions/INDEX.md,scripts/render-governance-state.mjs checks=node,pytest,scaffold risk=trust-critical prerequisites=6.1 -->
  **Atomic:** the generated region and the deletion of the hand-authored values
  it replaces land together.
  **Proof required** — `EX-G14` generated index still satisfies
  `validate-scaffold.sh` bidirectional index rules; `ADV-G36`

- [ ] **7.2 Generate the unresolved-decision regions**
  <!-- agent-task: 7.2 paths=docs/architecture/unresolved-decisions.md checks=node,pytest,scaffold risk=trust-critical prerequisites=7.1 -->
  **Atomic**, as above. Summary table and resolution banners.

- [ ] **7.3 Convert remaining consumers to stable references**
  <!-- agent-task: 7.3 paths=AGENTS.md,CLAUDE.md,CONTRIBUTING.md,README.md,docs/**,services/**,knowledge/**,deploy/**,.github/**,openspec/config.yaml checks=node,pytest,scaffold risk=high prerequisites=7.2 -->
  Replace mutable status text with pointers. `openspec/config.yaml` is the named
  regression case: generated or a pointer, never an independent state store.

- [ ] **7.4 Prohibited-field refusal for registered consumers**
  <!-- agent-task: 7.4 paths=scripts/check-governance-state.mjs,tests/test_governance_state.py checks=node,pytest risk=trust-critical prerequisites=7.3 -->
  **Proof required** — `ADV-G24` reintroduced range / count / status list /
  blocker summary outside a registered region

- [ ] **7.5 Structural coverage of the `governance/` domain**
  <!-- agent-task: 7.5 paths=scripts/validate-scaffold.sh checks=scaffold risk=medium prerequisites=7.4 -->
  Cover the root domain, its required files, and generated `STATE.md`. The v1
  layout has **no** nested `governance/AGENTS.md`.

## PR-4 Completion Gate

- [ ] Every generated region landed with the deletion of its hand-authored copy.
- [ ] No coequal authored copy survives anywhere in the registered set.
- [ ] `ADV-G24` green.
- [ ] Formatting, secret scan, and `git diff --check` green on generated state.

---

# PR-5 — History checker

## 8. History

- [ ] **8.1 Git history adapter (bytes only)**
  <!-- agent-task: 8.1 paths=scripts/governance/history/** checks=node,pytest risk=trust-critical prerequisites=3.3 -->
  Resolves a revision to bytes. Encodes **no** rule.
  **Proof required** — `MUT-G06` a regression rule moved into the adapter is
  detected

- [ ] **8.2 History checker with exclusive explicit base**
  <!-- agent-task: 8.2 paths=scripts/check-governance-history.mjs checks=node,pytest risk=trust-critical prerequisites=8.1 -->

  **Implements**
  - Requirement: *History validation uses an exclusive explicit base and refuses regression*
  - Invariant(s): `INV-G23`, `INV-G16`

  **Proof required**
  - `ADV-G21` invalid / missing / non-commit base — **no fallback**
  - `ADV-G11` GATE-U4 predicate mutated in place
  - `ADV-G13` `L8` removed from `L9` prerequisites
  - `ADV-G14` `L9` repointed away from issue #57
  - `ADV-G15` node kind / completion policy mutated
  - `ADV-G16` replacement identity without supersession + attestation
  - `ADV-G18` authorization-evidence record introduced
  - `ADV-G29`, `ADV-G34`, `ADV-G35`
  - `MUT-G04` explicit-base exclusivity → silent fallback
  - `MUT-G08` rule-input immutability → in-place edit permitted

- [ ] **8.3 CI wiring in the unconditional governance job**
  <!-- agent-task: 8.3 paths=.github/workflows/** checks=ci risk=high prerequisites=8.2 -->
  Never behind affected-target classification. Base supplied explicitly.

## PR-5 Completion Gate

- [ ] Every history hostile case fails validation.
- [ ] An invalid base fails with no inferred fallback.
- [ ] No rule lives in the adapter.

---

# PR-6 — Query interface

## 9. Query

- [ ] **9.1 Read-only query with separated axes**
  <!-- agent-task: 9.1 paths=scripts/query-governance-state.mjs checks=node,pytest risk=trust-critical prerequisites=3.3 -->

  **Implements**
  - Requirement: *The query reports separate axes and never authorizes*
  - Invariant(s): `INV-G06`, `INV-G07`, `INV-G08`
  - Design decision(s): `D5.4`

  **Proof required**
  - `PROP-G05` no output in either form contains `AUTHORIZED`
  - `ADV-G17` readiness read as authorization
  - `ADV-G18` authorization-evidence record
  - `EX-G18` the derived chain for a **hypothetical** ADR-0020 acceptance:
    GATE-U4 satisfied, `L8` unsatisfied, L9 `NotReady`, anchor #57, no
    authorization inferred — proven as a fixture, **not** by transitioning the
    real registry
  - `MUT-G05` axis separation → collapsed status

## PR-6 Completion Gate

- [ ] `AUTHORIZED` unreachable from any input.
- [ ] Delivery, readiness, and authorization remain separate axes.
- [ ] Prospective and historical authorization questions remain distinct.

---

# PR-7 — PR #101 as the first consumer

**Not authorized here, and not part of the substrate's completion.**

- [ ] **10.1 Rebase and narrow PR #101**
  <!-- agent-task: 10.1 paths=docs/** checks=node,pytest,scaffold risk=trust-critical prerequisites=8.3,9.1 -->

  Only after PR-1 through PR-6 have independently passed review and merged.
  PR #101 then retains only genuine semantic architecture edits — the two
  physical realizations of B4, the system topology, and the runner "Runs on"
  semantics — while ADR-0020 `Proposed -> Accepted` becomes one registry
  transition whose U4, GATE-U4, count, table, and L9-blocker consequences are
  regenerated. ADR-0020's obligation F5 is satisfied by mechanical
  reconciliation.

  **Until then, PR #101 is not modified, rebased, narrowed, closed, or merged.**

---

## Deferred, with named owners

| Deferred item | Owning landing / authority |
|---|---|
| Locally consumable authorization-evidence contract | a **new ADR**; refused as an unknown field until then |
| Additional completion policies | a **new ADR** fixing eligible identities, evidence, transitions, expiry |
| Nested `governance/AGENTS.md` | a later decision; v1 has none |
| Fact families beyond ADR-0021 §3 | a later ADR |
| U-item severity: authored or derived | PR-2 seed review; changes no validator |
| GitHub issue #19 as a human-facing mirror | PR-4 (`7.3`), as a reference, never a second authority |

---

## Genesis state this plan must not disturb

No task in this change alters any of the following, and PR-1 through PR-6 must
each leave them unchanged until a separate, legal, human-attested transition
occurs:

- ADR-0001 through ADR-0019 `Accepted`; **ADR-0020 `Proposed`**; ADR-0021
  `Accepted` — a **non-contiguous** accepted set
- **U4 open**; **GATE-U4 unsatisfied**
- L8 outstanding; L9 requires `L8 + GATE-U4`; L9 anchor issue #57; L9 readiness
  `NotReady`
- No implementation authorization inferred from registry state, issue
  existence, accepted ADRs, or satisfied prerequisites
