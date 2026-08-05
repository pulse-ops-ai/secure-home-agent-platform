# ADR-0001: Adopt the security-first platform architecture by pinned reference

- **Status:** Accepted
- **Date:** 2026-08-03
- **Accepted:** 2026-08-05
- **Deciders:** @mikegtech (repository owner)
- **Supersedes:** none
- **Related:** [ADR-0002](ADR-0002-adopt-hybrid-home-deployment-profile.md), [ADR-0004](ADR-0004-treat-agents-as-clients.md), [ADR-0008](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md), [`docs/architecture/trust-boundaries.md`](../architecture/trust-boundaries.md), [`docs/architecture/identity-and-authorization-flow.md`](../architecture/identity-and-authorization-flow.md)

## Context

`secure-home-agent-platform` needs a control model before it needs code. The
alternative — inventing a household-specific security model — would produce a
model that is unreviewed, unshared with the rest of the workspace, and
impossible to compare against the platform the household services will actually
sit behind.

Two upstream repositories already exist and were reviewed for this decision:

| Repository | What it is | Reviewed at |
|---|---|---|
| [`pulse-ops-ai/security-first-platform-architecture`](https://github.com/pulse-ops-ai/security-first-platform-architecture) | Implementation-neutral contract: eight-layer control model, trust zones Z0–Z4, identity/authorization separation, internal identity envelope, agent-as-client rule, deployment profiles | tag `v0.3.0` (`07e65a07bb6f2eab57bfd6dd8619f2eac77098e9`) |
| [`pulse-ops-ai/platform-edge`](https://github.com/pulse-ops-ai/platform-edge) | Concrete shared L1–L5 edge for the `self-hosted-vps` profile: Kong, Traefik, Keycloak verification, OpenFGA audit-only, `authz-audit-sidecar` | `main` at `b70894a8a49b9433a5fca16bc5538b3bd8891a88` (2026-07-13) |

The architecture repository is a **contract, not a runtime**. It contains no
service that this repository can call. `platform-edge` *is* a runtime, but it is
the workspace's shared edge for a different product's traffic — it is a
**reference implementation and a shared L1–L5 dependency**, not the runtime of
this product.

Copying the architecture documents into this repository was considered and is
the failure mode the pinning model exists to prevent: a copied contract drifts
silently and there is no mechanism that detects the drift.

The review also established what `platform-edge` does **not** currently provide,
which matters because those gaps become this repository's obligations:

- Its OpenFGA model is deliberately coarse — two types (`user`, `api_surface`)
  and two relations (`read`, `write`), keyed on the Kong route name. It has no
  household resource types, no `agent` type, and no delegation relation.
- Its principal classification is a heuristic on `preferred_username`
  (`service-account-*` ⇒ `service`, otherwise `user`), and the configuration
  states that agent detection is a later step. Every OpenFGA subject is written
  as `user:<realm>__<sub>` regardless of principal type.
- L4 is **audit-only**. No route runs in `enforce` mode; the decision is
  recorded and forwarded, never acted on.
- The edge **mints no internal identity envelope**. It forwards
  `x-platform-edge-*` context and an `authz_decision_id`; the consuming team's
  L6 mints the envelope.
- L5 operational guardrails are marked `n/a`.

## Decision

1. This repository **adopts** the security-first platform architecture **by
   pinned reference**, at tag `v0.3.0`. The pin is recorded in
   [`docs/architecture/INDEX.md`](../architecture/INDEX.md) and must be changed
   only by a pull request that also records the review of the diff.
2. This repository **does not copy** the architecture documents. It restates
   only the household-specific application of them. Where a rule already exists
   upstream, this repository links to it.
3. This repository inherits, unmodified:
   - the eight-layer control model (L1 network → L8 semantic/agent),
   - trust zones Z0–Z4 and the rule that a zone crossing requires verifiable
     evidence, never a network fact,
   - identity (L3) and authorization (L4) are distinct layers,
   - agents are clients, not insiders,
   - only L6 mints the internal identity envelope; L7 verifies it,
   - a policy decision point decides; it is not a proxy the request travels
     through.
4. `platform-edge` is recorded as a **reference implementation and a shared
   L1–L5 dependency for the remote access path only**. It is explicitly **not**
   the runtime of this product, and its current OpenFGA model is explicitly
   **not** assumed adequate for household resources or agent delegation.
5. This repository **owns** its product-specific L6 and L7 concerns: household
   identity envelope minting, household authorization modelling, deterministic
   safety policy, action mediation, audit, and verification.

## Consequences

**Positive.**

- The household platform speaks the same control vocabulary as the rest of the
  workspace, so a reviewer who knows `platform-edge` can review this repository.
- Upstream improvements arrive as a reviewed pin bump, not as an untracked copy.
- The gaps in the current shared edge are recorded as *this* repository's
  obligations instead of being silently assumed away.

**Negative.**

- A pinned contract can go stale. Nothing in this repository forces a pin bump;
  that requires an operating cadence (see *Validation obligations*).
- Reviewers must read two repositories to fully evaluate a change to identity or
  authorization.
- Inheriting an eight-layer model imposes more conceptual surface than a
  household product strictly needs today.

**Neutral.**

- The architecture is implementation-neutral, so adopting it does not commit
  this repository to Kong, Cloudflare, or any specific vendor at the edge. It
  commits to the *roles*.

## Alternatives considered

- **Vendor the architecture documents into this repository.** Rejected: a copied
  contract drifts and there is no drift detector. This is the stated reason the
  upstream adoption model exists.
- **Write a household-specific security model from scratch.** Rejected: it would
  be unreviewed, incomparable to the rest of the workspace, and would have to
  reinvent the identity/authorization separation and the envelope contract
  anyway.
- **Depend on `platform-edge` as the product runtime.** Rejected: `platform-edge`
  is the *shared* edge. Household control must keep working when the WAN, the
  shared edge, or the coordination plane is unavailable — see
  [ADR-0002](ADR-0002-adopt-hybrid-home-deployment-profile.md) and
  [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md).
- **Adopt only the parts of the architecture that are convenient.** Rejected:
  selective adoption produces the collapsed-concern platform the model exists to
  prevent, and it makes the word "adopted" meaningless in review.
- **Adopt at `main` rather than a tag.** Rejected: an unpinned reference cannot
  be reviewed, because "what we adopted" changes without a pull request here.

## Security implications

- Inheriting the trust-zone crossing rules means no component in this repository
  may treat tailnet membership, Docker network membership, or co-location as
  authentication or authorization. That constraint is load-bearing for the Pi,
  where every service shares a host.
- Recording the shared edge's audit-only posture prevents a dangerous
  assumption: **today, a `deny` at the shared edge does not stop a request.**
  Any household enforcement must therefore be owned locally and must not be
  described as "the edge protects us".
- Recording that the shared edge classifies every subject as `user:` and defers
  agent detection prevents this repository from assuming that an agent principal
  is distinguishable at the edge. Until proven otherwise, it is not.

## Availability implications

- Pinning a *documentation* dependency creates no runtime availability coupling.
  Nothing in this repository calls the architecture repository.
- Depending on `platform-edge` for the **remote** access path does create a
  runtime dependency for that path — and that is precisely why the local
  household path must not traverse it. See
  [ADR-0002](ADR-0002-adopt-hybrid-home-deployment-profile.md).

## Validation and follow-up obligations

1. Create an adoption record (`security-first-adoption.md`) once the ADRs in this
   set are accepted, declaring per-layer posture (`implemented` / `consumed` /
   `n/a`) for this repository, following the structure `platform-edge` uses.
   **Deferred deliberately** — declaring layer posture before any layer exists
   would be an untrue record.
2. Establish a pin-review cadence and record it in the adoption record.
3. Before any household authorization work begins, produce a gap analysis of the
   current shared OpenFGA model against household resources and agent
   delegation. Tracked in
   [`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md).
4. `scripts/validate-scaffold.sh` must keep failing when an index references a
   missing architecture or decision document, so this ADR's links cannot rot
   silently.

## References

- Upstream contract, pinned: `security-first-platform-architecture` @ `v0.3.0`
- Upstream reference implementation: `platform-edge` @ `b70894a8`
- [`docs/architecture/INDEX.md`](../architecture/INDEX.md) — where the pin is recorded
- [`docs/architecture/trust-boundaries.md`](../architecture/trust-boundaries.md)
- [`docs/architecture/identity-and-authorization-flow.md`](../architecture/identity-and-authorization-flow.md)

---

**Accepted and immutable.** Do not edit this ADR. Reverse or amend the decision
by writing a new ADR that supersedes it, and update
[`INDEX.md`](INDEX.md) in the same change.
