# Implementation Tasks: <change-name>

## Contract

Implementation is governed by:

- `proposal.md`
- `specs/**`
- `design.md`
- `assurance.md`

These artifacts define the accepted change contract.

Task completion does not redefine the specification, architecture, or assurance
model.

---

## Implementation Authorization

Assurance status:

**`<AUTHORIZED | AUTHORIZED_WITH_EXPLICIT_DEFERRED_ITEMS | NOT_AUTHORIZED>`**

If the status is `NOT_AUTHORIZED`, implementation tasks must not begin.

If the status is `AUTHORIZED_WITH_EXPLICIT_DEFERRED_ITEMS`, every deferred item
must be listed below with a named owning landing/task.

---

## Landing Plan

| Landing | Ships | Authority posture | Completion condition |
|---|---|---|---|
| PR-1 | <scope> | inert / advisory / shadow / enforce | <condition> |
| PR-2 | <scope> | ... | ... |
| PR-3 | <scope> | ... | ... |

A landing is the unit that may be independently merged.

Do not merge a partial atomic seam.

Verification required to trust a component must land with that component.

---

# PR-1 — <Landing Name>

## Completion Definition

PR-1 is complete only when:

- every PR-1 implementation task is complete;
- every current-scope PR-1 scenario is proven;
- every required invariant has its assigned proof;
- the declared atomic seam is complete;
- required property/hostile/mutation coverage is green;
- traceability contains no expired debt;
- deferred items remain accurately assigned to later landings;
- required review has completed on the frozen final head.

---

## 1. <Task Group Name>

- [ ] **1.1 <Task title>**
  <!-- agent-task: 1.1 paths=<repo/path/**> checks=<verification-pack> risk=<low|medium|high|trust-critical> prerequisites=<none|task-ids> -->

  **Implements**

  - Requirement: `<requirement-id/name>`
  - Scenario(s): `<scenario-id(s)>`
  - Invariant(s): `<INV-...>`
  - Design decision(s): `<D...>` where relevant

  **Change**

  Describe the implementation responsibility of this task.

  Be explicit about what this task owns and what it does not own.

  **Proof required**

  - `<EX-...>`
  - `<PROP-...>`
  - `<ADV-...>`
  - `<MUT-...>`
  - `<architecture guard / validator / integration test>`

  **Completion**

  This task is complete only when:

  - implementation is complete;
  - all task-owned proof obligations are green;
  - no required proof has been deferred without updating assurance/traceability;
  - the changed implementation is consistent with the accepted design.

- [ ] **1.2 <Task title>**
  <!-- agent-task: 1.2 paths=<repo/path/**> checks=<verification-pack> risk=<risk> prerequisites=1.1 -->

  **Implements**

  - Requirement: ...
  - Scenario(s): ...
  - Invariant(s): ...

  **Change**

  ...

  **Proof required**

  - ...

  **Completion**

  ...

---

## 2. Verification Net for PR-1

Verification does not arrive after the component it protects.

- [ ] **2.1 Example coverage**
  <!-- agent-task: 2.1 paths=<tests/**> checks=<test-pack> risk=<risk> prerequisites=<ids> -->

  **Proves**

  - `<EX-...>`

- [ ] **2.2 Property coverage**
  <!-- agent-task: 2.2 paths=<tests/**> checks=<test-pack> risk=<risk> prerequisites=<ids> -->

  **Proves**

  - `<PROP-...>`

- [ ] **2.3 Hostile/adversarial coverage**
  <!-- agent-task: 2.3 paths=<tests/**> checks=<test-pack> risk=<risk> prerequisites=<ids> -->

  **Proves**

  - `<ADV-...>`

- [ ] **2.4 Mutation coverage**
  <!-- agent-task: 2.4 paths=<tests/**> checks=<test-pack> risk=<risk> prerequisites=<ids> -->

  **Proves**

  - `<MUT-...>`

---

## PR-1 Completion Gate

PR-1 may merge only when:

- [ ] Every PR-1 implementation task is complete.
- [ ] Every PR-1 current-scope scenario is proven.
- [ ] Every PR-1 invariant has its required proof.
- [ ] Required property tests pass.
- [ ] Required hostile/adversarial corpus passes.
- [ ] Required mutation targets are killed.
- [ ] Architecture/independence guards pass where applicable.
- [ ] The complete atomic landing seam is present.
- [ ] No expired traceability debt exists.
- [ ] All deterministic gates are green or explicitly classified as unrelated
      pre-existing failures.
- [ ] Required independent review completed against one frozen head.
- [ ] The landing's authority posture matches the accepted design.

---

# PR-2 — <Landing Name>

## Completion Definition

PR-2 is complete only when:

- every PR-2 task is complete;
- every PR-2 current-scope scenario is proven;
- every required verification component lands with the implementation it
  protects;
- the PR-2 atomic seam is complete;
- required review completes on the frozen final head.

---

## 3. <Task Group Name>

- [ ] **3.1 <Task title>**
  <!-- agent-task: 3.1 paths=<paths> checks=<checks> risk=<risk> prerequisites=<ids> -->

  **Implements**

  - Requirement: ...
  - Scenario(s): ...
  - Invariant(s): ...
  - Design decision(s): ...

  **Change**

  ...

  **Proof required**

  - ...

  **Completion**

  ...

---

## 4. <Task Group Name>

- [ ] **4.1 <Task title>**
  <!-- agent-task: 4.1 paths=<paths> checks=<checks> risk=<risk> prerequisites=<ids> -->

  **Implements**

  - ...

  **Proof required**

  - ...

---

## Verification Net for PR-2

- [ ] **5.1 <verification task>**
  <!-- agent-task: 5.1 paths=<tests/**> checks=<checks> risk=<risk> prerequisites=<ids> -->

  **Proves**

  - ...

---

## PR-2 Completion Gate

PR-2 may merge only when:

- [ ] Every PR-2 task is complete.
- [ ] Every PR-2 current-scope scenario is proven.
- [ ] Every required invariant is proven.
- [ ] The PR-2 verification net is present and green.
- [ ] Independent producer/verifier boundaries are mechanically enforced where
      applicable.
- [ ] No expired traceability debt exists.
- [ ] The complete PR-2 seam is present.
- [ ] Required review has completed against the frozen final head.

---

# Additional Landings

Repeat the same structure for each serial landing:

```text
PR-N
├── Completion Definition
├── Implementation task groups
├── Verification net
└── Completion Gate