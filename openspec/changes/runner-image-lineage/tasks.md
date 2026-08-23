# Implementation Tasks: runner-image-lineage

## Contract

Implementation is governed by:

- `proposal.md`
- `specs/runner-image-lineage/spec.md`
- `design.md`
- `assurance.md`

These artifacts define the accepted change contract. Task completion does
not redefine the specification, architecture, or assurance model.

---

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

### External authority

| Field | Value |
|---|---|
| Source type | `github_issue` |
| Source id / link | #53 — "Runner L5: Image lineage — runner-base, gates-toolchain, Claude reference derived image" (parent: #19, the mutable program index) |
| Authorized scope | The L5 landing exactly: the three-image inventory, `deploy/images/**` structure, `image-lock.yaml`, lineage validation, `deploy/runtime/README.md`, `deploy/README.md`; governance/CI files only as proven necessary for the authorized build/verification path (`design.md` § Build authority) |
| Constraints | L5 is inert: no profile references or activates an image; no launcher and no Docker socket in runner-control; no concrete runtime (Kata/runc/containerd) selected or configured; no U4 decision; no L9 enforcement claim; no deployment; no registry publication; no Copilot/Codex/other speculative image (Copilot is L7/#55); no knowledge runtime wiring (#93); no local execution of deployment assets by a coding agent (`deploy/AGENTS.md`); no fabricated digest — real identities only through the governed build path, else stop at that boundary |
| Owner | @mikegtech (repository owner) — "The repository owner has explicitly authorized beginning #53" (task instruction, 2026-08-23) |
| Recorded at | 2026-08-23, from exact `main` `b64089569635e9b4e43b07a5e27f344ffb1077f7` (post-PR-#92); L4 prerequisite satisfied per #53/#19 (PR #82, #27 closed) |

Supersession note: the archived `runner-baseline-adoption` L5 wording
("the base image ships what L3/L4 build", Copilot-first derivation) is
superseded by the current #53/#19 text, which this change follows: L4 is a
sequencing prerequisite; no runner-control responsibility enters any
image; Claude is the reference derived image.

### Status

**`AUTHORIZED`**

- Provenance verified: #53 read at authoring time; owner instruction
  received; scope above matches the landing plan exactly.
- Gated-landing check: L5 carries no ADR gate. U4 and U6 gates apply to
  L9 and L7 respectively; nothing here consumes either.

---

## Landing Plan

| Landing | Ships | Authority posture | Completion condition |
|---|---|---|---|
| PR-1 | the whole L5 seam: three definitions, lock, checker + tests, governed build path, docs | inert | every task complete; static net green; governed build verifies recorded digests at the exact head; draft PR open for owner review |

One PR. The in-PR digest bootstrap (author → first governed build emits
digests → record → re-verify at head) is a sequence of commits inside this
one landing, never a partial merge.

---

# PR-1 — Image lineage

## Completion Definition

PR-1 is complete only when every implementation task below is complete,
every current-scope scenario is proven through the real checker or the
governed build, the verification net is green, recorded digests (if any)
came only from governed CI evidence and re-verified at the exact head, and
the draft PR stands for owner review with no undisclosed skip.

---

## 1. Image definitions

- [x] **1.1 Author `secure-home-runner-base`**
  <!-- agent-task: 1.1 paths=deploy/images/runner-base/** checks=check:images,scaffold risk=high prerequisites=none -->

  **Implements**

  - Requirement: base neutrality; base carries no decision-bearing authority
  - Invariant(s): IL-INV-02, IL-INV-03, IL-INV-06, IL-INV-12

  **Change**

  Digest-pinned `debian:trixie-slim`, exact-version-pinned packages, minimal surface
  (`ca-certificates`, `tini`), non-root `runner` user, `/workspace` and
  `/run/platform` conventions, reproducibility normalizations, OCI labels.
  No provider/framework/runtime token anywhere in the definition. README
  states the trust split and what the image deliberately does not contain.

  **Proof required:** IL-ADV-01, IL-ADV-09, IL-ADV-10, IL-MUT-05 (net in
  group 4); checker pass on the real tree (IL-EX-01).

- [x] **1.2 Author `secure-home-runner-claude`**
  <!-- agent-task: 1.2 paths=deploy/images/runner-claude/** checks=check:images risk=high prerequisites=1.1 -->

  **Implements**

  - Requirement: one pinned runtime; immutable identity
  - Invariant(s): IL-INV-04, IL-INV-06, IL-INV-08, IL-INV-12

  **Change**

  `FROM secure-home-runner-base` (logical, resolved by digest at build),
  plus exactly: git, Node 24.18.1 (SHA-256-verified archive), and
  `@anthropic-ai/claude-code@2.1.241` installed from an
  integrity-verified tarball with a build-time refusal if any dependency
  resolves. No credential, no second runtime, no knowledge content.

  **Proof required:** IL-ADV-02, IL-ADV-03, IL-MUT-02; chain proofs in
  group 2.

- [x] **1.3 Author `secure-home-gates-toolchain`**
  <!-- agent-task: 1.3 paths=deploy/images/gates-toolchain/** checks=check:images risk=high prerequisites=none -->

  **Implements**

  - Requirement: gates independence
  - Invariant(s): IL-INV-05, IL-INV-06, IL-INV-12

  **Change**

  Independent `FROM` the pinned Debian digest; the exact gate toolchain
  surface (git, Node 24.18.1, corepack-cached pnpm 11.18.0, uv 0.12.1,
  uv-managed CPython 3.13), inventoried from `checks.yml`/`check.sh`; no
  provider runtime; README states network-none *suitability* without
  claiming enforcement.

  **Proof required:** IL-ADV-04; checker pass.

---

## 2. The lock and its checker

- [x] **2.1 Author `deploy/images/image-lock.yaml`**
  <!-- agent-task: 2.1 paths=deploy/images/image-lock.yaml checks=check:images risk=high prerequisites=1.1,1.2,1.3 -->

  **Implements**

  - Requirement: lock contract; digest kinds; inventory
  - Invariant(s): IL-INV-01, IL-INV-06, IL-INV-07, IL-INV-08

  **Change**

  The canonical-grammar lock: three entries, lineage classes, external
  base identities (recorded index digests), platforms, runtime record for
  the derived image, `pending-first-governed-build` sentinels for the
  not-yet-built identities.

- [x] **2.2 Implement `scripts/check-images.mjs` and wire it**
  <!-- agent-task: 2.2 paths=scripts/check-images.mjs,scripts/check.sh,scripts/README.md,package.json,.github/workflows/checks.yml checks=check:images,check.sh risk=high prerequisites=2.1 -->

  **Implements**

  - Requirement: every mechanical refusal in the spec delta
  - Invariant(s): IL-INV-01…08, IL-INV-10, IL-INV-12
  - Design decision(s): lock grammar; checker rules

  **Change**

  Stdlib-only strict-subset parser + the full rule set from `design.md`
  § The checker; `pnpm run check:images`; a `check.sh` row; one step in
  the unconditional governance job; `scripts/README.md` registration.

  **Proof required:** the whole group-4 net.

---

## 3. Governed build path

- [x] **3.1 Author `deploy/images/scripts/{build.sh,verify.sh,inspect.sh}`**
  <!-- agent-task: 3.1 paths=deploy/images/scripts/** checks=check:images risk=high prerequisites=2.1 -->

  **Implements**

  - Requirement: governed build path; digest chain mechanics
  - Invariant(s): IL-INV-08, IL-INV-09

  **Change**

  CI-side tooling: multi-platform buildx builds to OCI layouts with
  reproducibility flags, base→derived wiring by lock digest
  (`oci-layout://…@parent_digest`), digest extraction, lock comparison,
  human-readable inspection. Authored only — never executed locally by a
  coding agent; the scripts refuse politely outside CI.

- [x] **3.2 Author `.github/workflows/images.yml`**
  <!-- agent-task: 3.2 paths=.github/workflows/images.yml checks=none risk=high prerequisites=3.1 -->

  **Implements**

  - Requirement: real digests come only from the governed build path
  - Invariant(s): IL-INV-09

  **Change**

  `pull_request` (deploy/images/** + itself) and `workflow_dispatch`;
  SHA-pinned actions; QEMU + buildx; builds all three images for both
  platforms; verify step compares to the lock, failing on mismatch or
  sentinel with built digests reported as evidence. No push, no publish,
  no container run.

---

## 4. Verification net for PR-1

- [x] **4.1 `tests/test_image_lineage.py` — control, hostile corpus, grammar properties**
  <!-- agent-task: 4.1 paths=tests/test_image_lineage.py checks=pytest risk=high prerequisites=2.2 -->

  **Proves**

  - IL-EX-01 (real-tree control), IL-ADV-01…10, IL-PROP-01, IL-PROP-02 —
    every fixture through the real checker, each hostile case paired with
    its passing control.

- [x] **4.2 Mutation kills**
  <!-- agent-task: 4.2 paths=tests/test_image_lineage.py checks=pytest risk=high prerequisites=4.1 -->

  **Proves**

  - IL-MUT-01…05: each guard hand-weakened, the named test observed red
    for the intended reason, guard restored; results recorded in the PR.

---

## 5. Docs, digest bootstrap, completion evidence

- [x] **5.1 Register the runtime boundary and retire stale status prose**
  <!-- agent-task: 5.1 paths=deploy/README.md,deploy/images/README.md,deploy/runtime/README.md checks=scaffold risk=medium prerequisites=1.1,1.2,1.3 -->

  **Implements**

  - Requirement: inertness (taxonomy only); IL-INV-10
  - Design decision(s): image ≠ execution-runtime taxonomy

  **Change**

  `deploy/runtime/README.md` (taxonomy only, no runtime content);
  `deploy/README.md` layout row + status refresh; `deploy/images/README.md`
  rewritten to the landed contract (trust split, lock, lineage, L7
  extension path) with the superseded "profile loading / run lifecycle"
  prose replaced by the #53 reading.

- [x] **5.2 Record CI-produced digests and re-verify at head**
  <!-- agent-task: 5.2 paths=deploy/images/image-lock.yaml checks=images.yml risk=high prerequisites=3.2,4.1 -->

  **Implements**

  - Invariant(s): IL-INV-08, IL-INV-09

  **Change**

  Take the digests exactly as emitted by the governed CI build evidence
  (IL-ADV-11 bootstrap run), record them in the lock (index +
  per-platform manifests + parent chain), and obtain a green
  `images.yml` verify at the exact final head (IL-EX-02). If CI cannot
  produce identities, stop: leave the sentinels, record the boundary in
  the PR, and do not fabricate.

---

## PR-1 Completion Gate

PR-1 may merge only when:

- [x] Every task above is complete.
- [x] Every current-scope scenario is proven through the real mechanism.
- [x] IL-INV-01…12 each have their green proof (or, for IL-INV-09's
      recorded-digest half, the explicitly stopped bootstrap boundary).
- [x] The hostile corpus passes and the five mutation kills are recorded.
- [x] `openspec validate runner-image-lineage --strict` passes.
- [x] All deterministic repository gates are green
      (`bash scripts/check.sh`, scaffold, secret scan, full TS + python
      suites), with any environment-only failure disclosed.
- [x] Exact-head CI is green on `checks.yml`, and `images.yml` verify is
      green at the same head (or the stopped boundary is recorded).
- [x] No profile references an image; no launcher, runtime selection,
      Kata configuration, deployment, or knowledge wiring exists.
- [x] The draft PR stands for owner review with the falsification
      checkpoint's findings addressed.
