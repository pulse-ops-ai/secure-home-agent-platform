# Change Proposal: runner-baseline-adoption

## Why

Issue #19 (Epic 4: runner substrate and execution profiles) cannot be
decomposed honestly until the existing runner substrate is classified. A
working substrate already exists in `agent-service`: a governed execution
platform with three operationally exercised, heavily tested run modes (packet review, sandboxed
implementation, semantic review), a ~43.5k-line zero-runtime-dependency
trusted host package, and 358k run artifacts of operational evidence.

`profiles/README.md` already mandates this review: "A later runner-baseline
review will map the seam onto the runner substrate that already exists —
classifying each existing capability as adopt unchanged, adapt, replace
deliberately, or defer — and will then update the runner-control and image
issues around what is actually there. Do not author a profile against the
field names in that document before that review."

This change is that review, ratified into the repository.

## Problem

What happens today:

- The platform has contracts (`runner-model.md`, ADR-0003/0006/0011) but no
  substrate, no profile schema, no image, and no adapter.
- The upstream substrate is operationally exercised but provider-coupled (Claude CLI
  flags, transcript format, `claude_posture` field names) and known gaps
  against the platform contract: network egress is declared `open`, the model
  container has no resource ceilings, the image is monolithic, orchestration
  is bash, and the credential is a long-lived operator token.
- Nothing in this repository records which upstream capability is adopted,
  adapted, replaced, or deferred — so #19 and #27 cannot be revised on
  evidence, and the Copilot CLI port risks remain unverified.

Left unchanged, the port would either start from scratch (discarding a tested
trust core) or import the old shape wholesale (forcing it into the new
architecture — the exact failure this change exists to prevent).

## Proposed Capability

A ratified **runner-baseline adoption contract**: the classification matrix,
the adoption invariants, the target repository boundaries, and the landing
plan from which the #19 child issues are minted.

## Scope

### In scope

- Ratify the inventory of the upstream substrate at a pinned baseline.
- The adopt / adapt / replace / defer classification matrix, with verdict
  semantics under reimplementation: **adopt** = preserve the mechanism and
  invariant as-is in new platform code; **adapt** = preserve with platform
  changes; **replace** = a deliberately different mechanism; **defer** = not
  carried, with a named re-evaluation trigger.
- Adoption invariants as a normative spec delta (`runner-adoption`).
- The target package boundary for the trusted core (ADR-0012 taxonomy).
- The sequencing decision: gaps are closed with the Claude adapter as the
  reference vehicle, neutralizing the provider seam as each piece is touched;
  Copilot CLI becomes the first platform derived image.
- The Copilot CLI capability verification obligations as named proof
  obligations — five properties: structured output, fail-closed tool
  allowlisting, machine-readable transcript, cost/usage reporting, and
  noninteractive credential injection and isolation (no credential material
  persisting in `$HOME`, caches, the workspace, image layers, or after
  teardown). Provider credential custody is an adapter/substrate concern
  proven here; it is distinct from platform workload identity, which stays
  with U2.
- The landing plan that seeds the issue decomposition under #19.

### Out of scope

- Implementing any landing. Each landing is applied only under its own
  external authorizing issue, minted from this change after review.
- Resolving U2 (workload identity), U4 (placement), or U6 (adapter SPI
  freeze). This change produces evidence for those ADRs; it decides none of
  them.
- The upstream `review-context/`, `publication/`, `observability/`,
  `knowledge/`, and QA surfaces — classified defer, with named re-evaluation
  triggers (see Dependencies).
- The household runner class and any household profile (#37/#20/#36).
- Container runtime selection (see Kata note under Dependencies).

## Affected Areas

- `packages/` — the future trusted-core package boundary (no platform
  imports; extraction-ready).
- `services/runner-control/` — scope revision input for #27 (the bash
  orchestrator is its migration source).
- `deploy/images/` — base/derived lineage per ADR-0011, gate-toolchain image
  separated from agent images.
- `schemas/execution-profile/` — the platform execution-profile contract the
  upstream posture profile is extended into.
- `profiles/`, `tests/framework-conformance/` — consumers of the contract and
  the conformance seed.
- GitHub issue graph — #19 decomposition, #27 revision (human-minted from
  this change; never by tooling).

## Governance

Name the governing ADRs, from the
[docs/decisions/INDEX.md](../../../docs/decisions/INDEX.md) "which ADRs
apply" table:

- ADR-0001 — governs everything; the upstream is consumed as evidence, the
  pinned architecture contract is untouched.
- ADR-0003, ADR-0006 — framework-neutral runner contracts and the
  implementation / profile / run / automation separation the adoption must
  preserve.
- ADR-0004 — agents as clients; the adopted trust posture (untrusted model,
  evidence over claims) must not weaken it.
- ADR-0011 — provider-neutral base image, one runtime per derived image; the
  upstream monolithic image is classified replace because of it.
- ADR-0012 — the workspace taxonomy the reimplemented trusted core lands
  in, and the Zod-authored contract rule the new domain schemas follow.

Architecture documents: `docs/architecture/runner-model.md` (the contract the
gap analysis measures against), `docs/architecture/knowledge-selection-model.md`
(the knowledge seam the adoption must not pre-empt).

Declare unresolved-decision dependencies:

- **Depends on U1–U11:** this ratification change depends on no unresolved
  decision. Its implementation landings do, and say so: the Copilot adapter
  landing is **gated by U6/#11** (the SPI ADR must be accepted first), and
  the launcher/enforcement landing is **gated by U4/#9** (placement,
  resource-starvation, credential-custody, and mount-isolation decisions).
  U2 remains the platform workload-identity boundary every landing stops
  at. No landing starts partial work past a gate.

This change proposes **no ADR status change**. Amending or reversing an
accepted ADR requires a new superseding ADR through its own human review.

## Trust / Security / Data Considerations

- Runner/review machinery: **yes** — this change is about it. It plans; it
  grants nothing and deploys nothing.
- Authentication/authorization: touched as *analysis only* (the upstream
  token model is named as what U2 exists to replace).
- No credential, secret, or provider token appears in this change or any
  landing plan. No Home Assistant, no live service.
- No upstream code is imported. The reimplementation is validated by this
  repository's own gates; upstream CI and test results are evidence about
  the design, never trust inherited by the port.

## Existing Evidence

- Upstream repository, canonical identity: **`exprealtytech/agent-service`**
  (GitHub; inventoried via the local working copy at
  `/home/mike/dev/exp/agent-service`).
- **Adoption baseline pin: `origin/dev` @
  `941160c0bd6eafc0eb4c4bd708d86b21857e1ec2`** — the upstream integration
  state, which already includes D11 PR-3a (disclosure-policy bootstrap,
  inert). The detailed inventory was conducted 2026-08-08 at feature-branch
  commit `4eee55f8d4432b1088a62186a8c9cf7f9be0e39f`; the delta between the
  two is confined to the deferred `review-context/` surface, so the
  classification is unaffected.
- Upstream operational evidence is *evidence about the design*, not
  inherited trust: the same upstream's later review cycles have continued
  to surface genuine blockers, which is exactly why every reimplemented
  mechanism is re-proven by this repository's own gates.
- Inventoried surfaces: `.ai/` operational harness (8 posture profiles, 6
  policy files, 11 schemas, hardened launch path, consent gates, 358k run
  artifacts) and `exp-global-packages/agent-runner` (50 JSON schemas, 30
  CLIs with the 0/1/2 exit-code contract, ~768 tests including property,
  mutation, and adversarial suites, zero runtime dependencies — verified).
- Platform contract: `docs/architecture/runner-model.md`; issue graph #4,
  #7, #9, #11, #16, #19, #20, #23, #27, #36, #37.

## Dependencies

- **OpenSpec governed workflow** — merged (#47). This change is its first
  consumer; implementation authority for every landing is an external issue
  recorded in `tasks.md`, never this change itself.
- **Upstream D11 sequence** (PR-3 rendering/envelope v2 → PR-4a obligation
  enforcement → PR-4b shadow → PR-5 activation) — touches only the deferred
  `review-context/` surface. Upstream churn there does not invalidate this
  adoption. **Re-evaluation trigger:** after upstream PR-5 (activation), a
  follow-up change may classify citation-evidence adoption; not before.
- **Upstream "bundle-aware implementation profile" (roadmap row 13)** — not
  adopted. It wires knowledge selection into the implement lane upstream;
  in this repository the knowledge seam is governed by
  `knowledge-selection-model.md` and gated by U7. Adopting the upstream
  wiring would resolve U7 by import, which is prohibited.
- **Upstream Kata Containers isolation (roadmap row 14, horizon)** — not
  adopted and not precluded. Adoption invariant: no adopted contract may
  bake in a container runtime; runtime selection is a platform decision
  adjacent to U4.
- **No IP re-homing — decided.** The upstream `@exprealtytech` code and
  schemas do not travel into this repository. Adoption means
  **reimplementation against new platform-owned domain schemas**,
  Zod-authored per ADR-0012, in this repository's own domain vocabulary.
  The upstream substrate is consumed as design evidence only — mechanisms,
  invariants, and failure lessons, never bytes.

## Success

A reviewed, merged change whose matrix and landing plan let the repository
owner mint the #19 child issues directly from `tasks.md` landings — baseline
ratification, domain contracts, trusted-core implementation with its proof
net, runner-control orchestration (the typed run-lifecycle state machine),
image lineage, the Copilot capability/credential spike, then (gated by the
U6/#11 ADR) the Copilot adapter and derived image, coding-adapter
conformance, and (gated by the U4/#9 ADR) the runner-control launcher with
network and resource enforcement, completing with framework-neutral
conformance — each carrying its own external authority, with the #27 scope
revision minted alongside. Subsequent profile, image, and
conformance work cites this change instead of re-deriving the
classification.

## Non-Goals

- No code is ported by this change.
- No adapter SPI is frozen, no workload identity selected, no placement
  decided.
- No household agent or profile is designed.
- No GitHub issue is created by tooling — issues are human-minted from the
  reviewed landing plan.
- No upstream repository is modified.

## Open Questions

- **Q1:** the five Copilot CLI capability/credential verifications —
  answered by the spike landing; their outcome shapes the platform-adapters
  landing that follows the U6 ADR.
- **Q2:** the gate-toolchain image name and registry placement — D7 already
  places the toolchain outside the ADR-0011 runner lineage; only naming and
  registry location remain, confirmed at the image-lineage landing.
