# Change Proposal: runner-baseline-adoption

## Why

Issue #19 (Epic 4: runner substrate and execution profiles) cannot be
decomposed honestly until the existing runner substrate is classified. A
working substrate already exists in `agent-service`: a governed execution
platform with three production-proven run modes (packet review, sandboxed
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
- The upstream substrate is proven but has provider coupling (Claude CLI
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
- The adopt / adapt / replace / defer classification matrix.
- Adoption invariants as a normative spec delta (`runner-adoption`).
- The target package boundary for the trusted core (ADR-0012 taxonomy).
- The sequencing decision: gaps are closed with the Claude adapter as the
  reference vehicle, neutralizing the provider seam as each piece is touched;
  Copilot CLI becomes the first platform derived image.
- The Copilot CLI capability verification obligations (structured output,
  fail-closed tool allowlisting, machine-readable transcript, cost/usage
  reporting) as named proof obligations.
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
- ADR-0012 — the workspace taxonomy the trusted-core package lands in.

Architecture documents: `docs/architecture/runner-model.md` (the contract the
gap analysis measures against), `docs/architecture/knowledge-selection-model.md`
(the knowledge seam the adoption must not pre-empt).

Declare unresolved-decision dependencies:

- **Depends on U1–U11:** none — and three are load-bearing *constraints*:
  the change must not select a workload-identity mechanism (U2), place
  runner-control (U4), or freeze the adapter SPI (U6). Landings that border
  them are scoped to stay on the near side.

This change proposes **no ADR status change**. Amending or reversing an
accepted ADR requires a new superseding ADR through its own human review.

## Trust / Security / Data Considerations

- Runner/review machinery: **yes** — this change is about it. It plans; it
  grants nothing and deploys nothing.
- Authentication/authorization: touched as *analysis only* (the upstream
  token model is named as what U2 exists to replace).
- No credential, secret, or provider token appears in this change or any
  landing plan. No Home Assistant, no live service.
- Imported code is treated as untrusted until re-validated by this
  repository's gates; adoption never means trusting upstream CI.

## Existing Evidence

- Upstream repository: `agent-service` (local working copy at
  `/home/mike/dev/exp/agent-service`).
- **Adoption baseline pin: `origin/dev` @ `941160c0`** — the upstream
  integration state, which already includes D11 PR-3a (disclosure-policy
  bootstrap, inert). The detailed inventory was conducted at feature-branch
  commit `4eee55f8`; the delta between the two is confined to the deferred
  `review-context/` surface, so the classification is unaffected.
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
- **Re-homing / IP confirmation** — the upstream package is
  `@exprealtytech`-namespaced with employer CI and ownership metadata.
  Whether code travels or is reimplemented against the (language-neutral)
  schemas is an ownership question the repository owner answers before any
  code landing. Blocking for code landings; not blocking for this change.

## Success

A reviewed, merged change whose matrix and landing plan let the repository
owner mint the #19 child issues directly from `tasks.md` landings — inventory
ratification, #27 revision, execution-profile contract, base image, Copilot
capability spike, Copilot derived image, conformance suite, network
enforcement — each carrying its own external authority. Subsequent profile,
image, and conformance work cites this change instead of re-deriving the
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

- **Q0 (blocking for code landings):** re-homing/IP confirmation for the
  upstream trusted core — travel the code, or reimplement against the
  schemas?
- **Q1:** upstream sync posture — one-shot vendor pin at `941160c0` with the
  PR-5 re-evaluation trigger (recommended), or periodic re-inventory?
- **Q2:** the four Copilot CLI capability verifications — answered by the
  capability-spike landing before the derived-image landing is authorized.
- **Q3:** gate-toolchain image naming and whether it lives in the ADR-0011
  lineage or beside it (input to the base-image landing).
