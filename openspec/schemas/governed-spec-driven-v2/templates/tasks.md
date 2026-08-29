# Implementation Tasks: <change-name>

## Contract and Ownership

Implementation is governed by distinct authorities:

| Source | What it owns |
|---|---|
| `proposal.md` | motivation, scope, impact, non-goals |
| `specs/**` | observable normative behavior |
| `design.md` | architecture and decisions |
| `assurance.md` | invariants, proof obligations, authority allocation, review exit |
| `AUTH-*` canonical artifacts | exact mutable facts in their allocated families |
| `tasks.md` | sequencing, paths, prerequisites, checks, and progress only |
| `preimplementation-review.md` | current acceptance decision for the pinned package |

`reviews/**` is historical evidence, not a current implementation authority.

Task completion cannot redefine a requirement, decision, invariant, canonical
authority, or authorization.

## Pre-Implementation Gate

Before any implementation task begins:

- `openspec validate <change-name> --strict` must pass;
- `node scripts/openspec-review-gate.mjs verify --change <change-name>` must
  pass;
- the review verdict must be `ARCHITECTURE_ACCEPTED`;
- unresolved P1 count must be zero;
- the selected landing and task must be covered by external authorization.

A present review file, an assurance checklist, an issue reference, or a task
checkbox is not sufficient by itself.

---

## Implementation Authorization

This section RECORDS external authorization. It never creates it.

OpenSpec artifacts are planning documents. Implementation authority comes from
a GitHub issue, explicit user task, or another repository-approved task
contract.

### External authority

| Field | Value |
|---|---|
| Source type | `github_issue | user_task | task_contract` |
| Source id / link | <issue number, user task reference, or contract path> |
| Authorized scope | <landings/tasks actually covered> |
| Constraints | <constraints, or `none stated`> |
| Owner | <who authorized, where available> |
| Recorded at | <date and revision, where available> |

### Status

**`AUTHORIZED | AUTHORIZED_WITH_EXPLICIT_DEFERRED_ITEMS | NOT_AUTHORIZED`**

Derivation:

- missing, ambiguous, or unverifiable provenance ⇒ `NOT_AUTHORIZED`;
- authority narrower than the selected landing ⇒ that landing is not
  authorized;
- assurance completeness and architecture acceptance are necessary but never
  sufficient.

If status is `AUTHORIZED_WITH_EXPLICIT_DEFERRED_ITEMS`, list each deferred item
with its owning landing/task.

---

## Task Construction Rules

Every task:

- has one stable ID;
- is bounded to no more than one focused engineering day;
- names exact affected paths or a deliberately constrained path class;
- names prerequisites;
- references requirement, scenario, invariant, decision, authority, and proof
  IDs;
- changes one coherent responsibility;
- ships the verification needed to trust what it introduces;
- preserves explicit deferred work;
- does not copy enum members, state edges, classifier rows, pointers, bounds,
  inventories, mappings, or digest formulas from its canonical authority.

For high-risk and trust-critical changes, contract-first tasks precede all
functional consumers.

## Landing Plan

| Landing | Ships | Authority posture | Required canonical authorities | Completion condition |
|---|---|---|---|---|
| PR-1 | <scope> | inert / advisory / shadow / enforce | <AUTH IDs> | <condition> |
| PR-2 | <scope> | ... | ... | ... |

A landing is the independently mergeable unit. Do not merge a partial atomic
seam.

---

# PR-1 — <Contract Authorities / First Vertical Slice>

## Completion Definition

PR-1 is complete only when:

- every PR-1 task is complete;
- all PR-1 current-scope scenarios are proven;
- all PR-1 canonical authorities exist and validate;
- positive fixtures prove intended contracts are expressible;
- refusal, hostile, property, and mutation coverage required by the landing is
  green;
- the declared atomic seam is complete;
- no expired traceability or review debt exists;
- required implementation review completed on one frozen head.

## 1. <Task Group Name>

- [ ] **1.1 <Task title>**
  <!-- agent-task: 1.1 paths=<repo/path/**> checks=<verification-pack> risk=<low|medium|high|trust-critical> prerequisites=<none|task-ids> -->

  **Task type**

  `contract-first | implementation | proof | documentation`

  **Implements / proves**

  - Requirement: `<REQ-ID>`
  - Scenario(s): `<scenario names or IDs>`
  - Invariant(s): `<INV-ID>`
  - Design decision(s): `<D-ID>`
  - Canonical authority/authorities: `<AUTH-ID — exact path#symbol>`
  - Proof obligation(s): `<EX/PROP/ADV/MUT-ID>`

  **Change**

  Describe the single implementation responsibility.

  **Does not own**

  State adjacent behavior, decisions, or exact contract data this task must not
  redefine.

  **Affected paths**

  - `<path or constrained glob>`

  **Proof required**

  - `<test, schema validation, fixture, golden vector, or command>`
  - `<negative/refusal proof where relevant>`

  **Size and atomicity**

  Explain why this is no more than one focused engineering day and what must
  land atomically with it. Split the task if that cannot be stated credibly.

  **Completion**

  This task is complete only when:

  - its implementation responsibility is complete;
  - task-owned proof is green;
  - generated/checkable mirrors agree with the canonical authority;
  - no new behavior or architecture was introduced through the task;
  - any newly discovered architecture issue stopped implementation and reopened
    the planning gate explicitly.

- [ ] **1.2 <Task title>**
  <!-- agent-task: 1.2 paths=<repo/path/**> checks=<verification-pack> risk=<risk> prerequisites=1.1 -->

  Repeat the complete task structure above.

## PR-1 Verification Net

- [ ] **2.1 Positive contract fixture**
  <!-- agent-task: 2.1 paths=<tests/**> checks=<test-pack> risk=<risk> prerequisites=<ids> -->

  **Proves**

  - `<EX-ID / CONTRACT-ID / AUTH-ID>`

- [ ] **2.2 Property coverage**
  <!-- agent-task: 2.2 paths=<tests/**> checks=<test-pack> risk=<risk> prerequisites=<ids> -->

  **Proves**

  - `<PROP-ID>`

- [ ] **2.3 Hostile/adversarial coverage**
  <!-- agent-task: 2.3 paths=<tests/**> checks=<test-pack> risk=<risk> prerequisites=<ids> -->

  **Proves**

  - `<ADV-ID>`

- [ ] **2.4 Mutation coverage**
  <!-- agent-task: 2.4 paths=<tests/**> checks=<test-pack> risk=<risk> prerequisites=<ids> -->

  **Proves**

  - `<MUT-ID>`

## PR-1 Completion Gate

- [ ] Every task is complete.
- [ ] Every landing-scoped requirement and scenario is proven.
- [ ] Every required `AUTH-*` artifact exists and validates.
- [ ] Positive fixtures pass.
- [ ] Required refusal and hostile fixtures pass.
- [ ] Required properties pass.
- [ ] Required mutations are killed.
- [ ] Producer/consumer or producer/verifier independence is enforced where
      required.
- [ ] Generated mirrors pass drift checks.
- [ ] The complete atomic seam is present.
- [ ] Deterministic gates are green or an unrelated pre-existing failure is
      explicitly evidenced.
- [ ] Implementation review completed against one frozen head.
- [ ] The landing's authority posture matches the accepted design.

---

# PR-2 — <Next Vertical Slice>

## Completion Definition

PR-2 is complete only when its bounded behavior, canonical-authority changes,
and verification net form one reviewable atomic seam.

## 3. <Task Group Name>

- [ ] **3.1 <Task title>**
  <!-- agent-task: 3.1 paths=<paths> checks=<checks> risk=<risk> prerequisites=<ids> -->

  Use the complete task structure from task 1.1.

## PR-2 Verification Net

- [ ] **4.1 <verification task>**
  <!-- agent-task: 4.1 paths=<tests/**> checks=<checks> risk=<risk> prerequisites=<ids> -->

  **Proves**

  - `<proof IDs>`

## PR-2 Completion Gate

Use the same gate as PR-1, scoped to PR-2.

---

# Additional Landings

Repeat:

```text
PR-N
├── Completion Definition
├── Bounded implementation task groups
├── Verification net
└── Completion Gate
```

Do not create one catch-all final verification task for proof required by
earlier landings.
