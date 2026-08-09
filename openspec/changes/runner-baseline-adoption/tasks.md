# Implementation Tasks: runner-baseline-adoption

## Contract

Implementation is governed by:

- `proposal.md`
- `specs/runner-adoption/spec.md`
- `design.md`
- `assurance.md`

These artifacts define the accepted change contract.

**This file contains no executable tasks.** It is the decomposition
contract: the landing boundaries, their prerequisite DAG, and the scope and
proof obligations every child change inherits. It deliberately carries no
checkbox tasks and no `agent-task:` metadata, so the generated apply
workflow has nothing it can implement from this parent — the
mechanical-boundary principle applied to the parent itself. Task completion
never redefines the specification, architecture, or assurance model.

Verification checks are declared per child change. The platform gate
registry and verification packs are themselves deliverables of the L2/L4
landings; until they exist, a child change declares its checks explicitly
(for repository gates: `bash scripts/check.sh`) and may name nothing
undeclared.

---

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

**This parent is permanently `NOT_AUTHORIZED` for implementation.** No
future edit records landing authority here — after merge, this change moves
only by superseding change. Authority for a landing lives in exactly two
places:

- the landing's **GitHub issue**, minted by the repository owner (agents
  never create issues), with **#19 as the mutable program index** linking
  the L2–L10 issues;
- the landing's **child OpenSpec change**, whose own `tasks.md` records the
  authority source type and id, authorized scope, constraints, owner, and
  date.

### Inherited status derivation rules (applied by every child change)

- Missing, ambiguous, or unverifiable provenance ⇒ `NOT_AUTHORIZED`.
- Authority narrower than the landing scope ⇒ `NOT_AUTHORIZED` for the
  uncovered work, named explicitly.
- Assurance completeness is necessary but never sufficient. A complete
  assurance artifact with no external authority is `NOT_AUTHORIZED`.
- Gated landings additionally require their accepted ADR: L7 the U6 ADR
  (#11), L9 the U4 ADR (#9) — per the assurance authorization table.
- Every landing requires its own externally authorized child change with
  complete artifacts before implementation begins (the schema's apply gate
  enforces the artifact chain).

### Landing implementation contract — this parent is a constitution

**L2–L10 are decomposition and authorization boundaries, not direct
implementation contracts.** Before implementation begins for any landing,
that landing SHALL have its own externally authorized
`governed-spec-driven-v1` OpenSpec change. The child change inherits all
applicable `runner-adoption` requirements and SHALL define its
landing-specific proposal, specification delta where required, design,
assurance model, tasks, state-space interactions, proof obligations,
hostile corpus, mutation targets, and completion gate — its assurance and
tasks artifacts complete **before** implementation.

Changes arising from a later ADR, spike finding, or implementation
discovery are absorbed by the affected child change or a new superseding
change; **they do not turn this parent ratification into a running
implementation diary.**

Trust-critical child changes additionally carry the Authority Chain table
and the before × after transition matrix defined in `assurance.md`'s
standing model.

---

## Landing Plan

| Landing | Ships                                                                                 | Authority posture | Completion intent                                                                                                  |
| ------- | ------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| L1      | ratification effects: issues minted, #19/#27 revised, docs pointers                    | inert             | issues exist under the #19 index; docs updated                                                                     |
| L2      | runner domain contracts (`packages/contracts`, `packages/events`) + generated schemas  | inert             | contracts validate; EX-002/007, PROP-001/004 green                                                                 |
| L3      | `packages/runner-core` + its proof net                                                 | inert             | EX-001/003/006, ADV-002…005, ADV-009, PROP-003/005, MUT-001…003/006 green                                          |
| L4      | runner-control orchestration (state machine, ports; no launch)                         | inert             | EX-004, EX-005A, PROP-002/007, ADV-001/006/007/015…018, MUT-004/005/009/010 green; boundary proven both directions |
| L5      | image lineage: runner-base, gates-toolchain, Claude reference derived image            | inert             | images build reproducibly, digest-pinned, unreferenced                                                             |
| L6      | Copilot capability/credential spike                                                    | inert             | SPIKE-01…05 answered with captured evidence                                                                        |
| — GATE  | #11 / U6 SPI ADR (human)                                                               | —                 | ADR accepted                                                                                                       |
| L7      | platform adapters: Claude reference + Copilot + Copilot derived image                  | inert             | adapters conform to accepted SPI; EX-002/PROP-004 re-run                                                           |
| L8      | coding-adapter conformance seed                                                        | inert             | same profile, same run → same events/evidence across both adapters                                                 |
| — GATE  | #9 / U4 placement ADR (human)                                                          | —                 | ADR accepted                                                                                                       |
| L9      | concrete launcher + network default-deny + resource ceilings                           | **enforce**       | enforcement active; EX-005B, EX-008/ADV-013, MUT-007 green; rollout/rollback obligations met                       |
| L10     | framework-neutral conformance (deterministic-loop adapter)                             | inert             | ADR-0003 uniform-across-adapters claim proven at full strength                                                     |

A landing is the unit that may be independently merged. Do not merge a
partial atomic seam. Verification required to trust a component lands with
that component.

The prerequisite graph is **authoritative** over the visual ordering of
this document:

```text
L2 ← L1        L3 ← L2        L4 ← L3        L5 ← L4
L6 ← L1        (intentionally parallel with L2–L5)
L7 ← L5 + GATE-U6   (Copilot adapter additionally ← L6)
L8 ← L7
L9 ← L8 + GATE-U4
L10 ← L8 + L9
```

---

## L1 — Post-ratification actions (human; not parent tasks)

These are post-merge instructions for the repository owner, deliberately
not pending implementation tasks of this change:

- **Mint one issue per landing (L2–L10)** plus the #11/#9 ADR scope
  updates, from this landing plan. Human-only — coding agents never create
  issues. **#19 becomes the mutable program index** linking the landing
  issues; landing authority is then recorded in each child change's
  `tasks.md`, never here. (MAN-002.)
- **Revise #19 and #27**: #19's body becomes the L2–L10 tree; #27's scope
  names the orchestration interface list from D6 and its U4 gate. Both
  cite this change as their source of truth. (MAN-001.)
- **Update the documentation pointers** — `profiles/README.md`'s
  runner-baseline paragraph and `runner-model.md`'s status notes point at
  the merged change — via a small docs PR that passes the repository
  gates.

---

## L2 — Runner domain contracts (decomposition contract)

- **Ships:** Zod-authored execution-profile, launch-assertion, path-policy,
  gate-registry, and verification-pack contracts in `packages/contracts`;
  the run-record/run-event vocabulary and evidence-bundle shapes (including
  the closed gate-outcome vocabulary) in `packages/events`; generated JSON
  Schema in `schemas/`; the contract conformance suite, re-runnable at
  L7/L8.
- **Prerequisites:** L1.
- **Inherited requirements:** provider neutrality (opaque `adapter` value;
  INV-002), runtime neutrality (INV-012), authority-from-profile shape
  (INV-005), outcome and gate-outcome vocabulary shapes (INV-003,
  INV-016), evidence-never-optional (`packages/events` charter).
- **Inherited proof obligations:** EX-002, EX-007, PROP-001, PROP-004;
  PROP-007's vocabulary shape.
- **Expected scope (child task metadata):** `packages/contracts/**`,
  `packages/events/**`, `schemas/**`, `pnpm-workspace.yaml` (Zod catalog
  entry), `pnpm-lock.yaml`.
- **Completion intent:** contracts validate; generated schemas
  deterministic; no provider or framework name in any structural position;
  nothing consumes the contracts yet (inert verified); review on the
  frozen final head.

## L3 — Trusted runner-core (decomposition contract)

- **Ships:** `packages/runner-core` — package boundary with enforced
  dependency direction; authority-input capture and eligibility; path
  policy, protected context, and bounds; workspace observation and claim
  reconciliation; evidence catalog and independent verifier — with its
  full proof net landing alongside.
- **Prerequisites:** L2.
- **Inherited requirements:** INV-001, INV-003, INV-006, INV-007, INV-008
  (governing data/path protection), INV-010, INV-011, INV-015.
- **Inherited proof obligations:** EX-001, EX-003, EX-006; ADV-002,
  ADV-003, ADV-004, ADV-005, ADV-009, ADV-011; PROP-003, PROP-005,
  PROP-006; MUT-001, MUT-002, MUT-003, MUT-006, MUT-008.
- **Expected scope:** `packages/runner-core/**`, `packages/README.md`,
  `scripts/workspace-model.mjs`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`.
- **Completion intent:** full L3 proof net green; mutation targets
  demonstrably killed; no expired traceability debt; nothing consumes the
  core yet; review on the frozen final head. Trust-critical: Authority
  Chain + before × after analysis required.

## L4 — runner-control orchestration (decomposition contract)

- **Ships:** the typed run-lifecycle state machine; consent-to-spend and
  profile resolution; gate scheduling against the registry with the closed
  outcome vocabulary; workspace lifecycle, cancellation, timeout, and
  evidence-finalization ports — all behind an execution port with **no
  container launch** (#27 constraints intact; the launcher waits for
  U4) — and the core/control boundary proven in both directions.
- **Prerequisites:** L3.
- **Inherited requirements:** INV-004, INV-005, INV-007, INV-009, INV-011,
  INV-016, and INV-008's orchestration clause — decision-bearing
  orchestration and interpreter code executes only from trusted
  platform-controlled provenance, never from the writable workspace.
- **Inherited proof obligations:** EX-004, EX-005A; PROP-002, PROP-007;
  ADV-001 (plus the consent-without-profile refusal), ADV-006, ADV-007,
  ADV-012, ADV-015, ADV-016, ADV-017, **ADV-018**; MUT-004, MUT-005,
  MUT-009, **MUT-010**.
- **Expected scope:** `services/runner-control/**`, `pnpm-workspace.yaml`,
  `pnpm-lock.yaml`.
- **Completion intent:** L4 proof net green with no container launch
  anywhere; boundary proven both directions (decisions cannot orchestrate,
  orchestration cannot decide); review on the frozen final head.
  Trust-critical: Authority Chain + before × after analysis required.

## L5 — Image lineage (decomposition contract)

- **Ships:** `secure-home-runner-base` (neutral substrate only), the
  gates-toolchain image outside the runner lineage (name and registry
  placement confirmed here), and the Claude reference derived image (base
  plus one pinned CLI, nothing else — ADR-0011).
- **Prerequisites:** L4 (the base image ships what L3/L4 build: profile
  loading, run lifecycle, event emission, evidence hooks).
- **Inherited requirements:** INV-002 (no provider content in the base),
  INV-012, INV-015 (digest chains).
- **Inherited proof obligations:** reproducible digest-pinned builds;
  PROP-004 over image metadata; MAN-001-style provider-name audit;
  PROP-006 re-proof for image-digest consumption.
- **Expected scope:** `deploy/images/**`.
- **Completion intent:** reproducible builds, digest pins recorded, no
  profile references the images (inert).

## L6 — Copilot capability and credential spike (decomposition contract)

- **Ships:** captured evidence answering SPIKE-01 structured output,
  SPIKE-02 fail-closed tool allowlist, SPIKE-03 machine-readable
  transcript, SPIKE-04 cost/usage reporting, SPIKE-05 credential
  injection/isolation (no persistence in `$HOME`, caches, workspace, image
  layers, or after teardown). Each is explicitly answerable "no" — a "no"
  shapes L7's design; it does not fail the spike.
- **Prerequisites:** L1 (intentionally parallel with L2–L5).
- **Completion intent:** five evidence artifacts recorded; findings
  summarized as input to the U6 ADR (#11); no platform contract modified.

## GATE — #11 / U6 adapter-SPI ADR

Human decision through the decisions process. L7 child changes are
`NOT_AUTHORIZED` until the ADR is `Accepted`. This change contributes
evidence (L6 findings, the donor transcript-adapter analysis recorded in
this change's evidence); it does not write the ADR.

## L7 — Platform adapters (decomposition contract; post-U6)

- **Ships:** the Claude reference adapter and the Copilot adapter against
  the accepted SPI (Copilot shaped by L6 findings), and the Copilot
  derived image (depending on the L5 base image, not only the adapter);
  the L2 neutrality proofs re-run now that adapters exist.
- **Prerequisites:** L5 + GATE-U6; the Copilot adapter additionally L6.
- **Inherited proof obligations:** SPI conformance; EX-002 and PROP-004
  re-run; PROP-006 re-proof for transcript consumption.
- **Expected scope:** `agents/adapters/coding/claude-code/**`,
  `agents/adapters/coding/copilot-cli/**`, `deploy/images/**`,
  `pnpm-lock.yaml`.
- **Completion intent:** both adapters conform to the accepted SPI;
  neutrality re-proof green; adapters unlaunchable (no launcher exists —
  inert).

## L8 — Coding-adapter conformance seed (decomposition contract)

- **Ships:** the conformance harness — same profile, same run → same
  events and evidence across the Claude and Copilot adapters at the
  execution-port level. Explicitly a **seed**, not framework conformance.
- **Prerequisites:** L7.
- **Expected scope:** `tests/framework-conformance/**`.
- **Completion intent:** suite green across both adapters; divergences are
  named findings, never averaged away.

## GATE — #9 / U4 placement ADR

Human decision. L9 child changes are `NOT_AUTHORIZED` until the ADR is
`Accepted`. Placement, resource-starvation posture, credential custody,
and mount isolation are decided there — not here.

## L9 — Launcher and enforcement (decomposition contract; post-U4)

- **Ships:** the concrete runner-control launcher per the accepted
  placement (hardened launch posture, adapted flag set plus ceilings,
  runtime-neutral); per-run network default-deny with profile-declared
  egress only; resource ceilings (memory, CPU, pids, wall clock, output
  size) with Pi-contention evidence per #19; effective cancellation and
  teardown — cancel/timeout → process tree dead → container gone → mounts
  gone → credential inaccessible → terminal evidence recorded.
- **Prerequisites:** L8 + GATE-U4.
- **Inherited proof obligations:** EX-005B (a real gate container has no
  egress, surviving profile egress activation), EX-008 and ADV-013
  (teardown), MUT-007; ADV-001 and container-level re-proofs; PROP-006 at
  the launch boundary.
- **Expected scope:** `services/runner-control/**`, `deploy/**`.
- **Completion intent:** rollout obligations from assurance met
  (advisory/shadow observation, measurements, activation condition,
  rollback condition — defined in the landing issue before authorization);
  the enforce flip is the only posture change in the sequence.
  Trust-critical: Authority Chain + before × after analysis required.

## L10 — Framework-neutral conformance (decomposition contract)

- **Ships:** the deterministic-loop adapter joining the conformance
  matrix; the ADR-0003 uniform-across-adapters claim proven at full
  strength (two coding CLIs + one deterministic loop). Authoring location
  (this program or the household-runner change) is decided when the U6 ADR
  fixes the SPI shape.
- **Prerequisites:** L8 + L9.
- **Expected scope:** `tests/framework-conformance/**`.
- **Completion intent:** three-adapter matrix green; only now may "uniform
  across adapters" be claimed without qualification.
