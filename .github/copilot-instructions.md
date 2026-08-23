# GitHub Copilot instructions

Repository: **`secure-home-agent-platform`** — a local-first, security-first
platform for household agents, controlling physical devices in a home.

> **This file is an adapter, not the contract.** The contract is
> [`../AGENTS.md`](../AGENTS.md) plus the ADRs in
> [`../docs/decisions/INDEX.md`](../docs/decisions/INDEX.md). If anything here
> conflicts with either, **follow them.** Precedence is defined in `AGENTS.md`:
> accepted ADRs → applicable `AGENTS.md` → provider files like this one → the
> task prompt.

## Orientation

1. [`../AGENTS.md`](../AGENTS.md) — universal contract.
2. [`../docs/decisions/INDEX.md`](../docs/decisions/INDEX.md) — has a *"which
   ADRs apply to what I am changing?"* table. Read the ADRs it names before
   suggesting or reviewing a change.
3. [`../docs/architecture/INDEX.md`](../docs/architecture/INDEX.md).
4. The nearest nested `AGENTS.md` — `services/`, `agents/`, `profiles/`,
   `knowledge/`, `deploy/`, `docs/` each have one.
5. The `README.md` of the directory in question.

## What this repository currently is

Documentation, governance, workspace scaffolding — **and landed code**: the
runner domain contracts, `packages/runner-core`, `services/runner-control`'s L4
orchestration, `packages/knowledge-toolchain` with repository content
admission, the image lineage (`deploy/images/` — digest-locked,
machine-validated, inert; L5 base/Claude/gates plus the L7 Copilot image),
and the L7 coding adapters (`agents/adapters/coding/` — frozen-SPI
translation for Claude Code and GitHub Copilot CLI, conformance-proven,
launched by nothing).

**No deployed or activated runtime.** No Home Assistant, no running service, no
OpenFGA, no Keycloak, no published or activated runner image (the image
definitions are inert), no launcher or process spawn (the adapters exist;
no platform code path invokes them), no L9 physical
enforcement, no credentials. Landed code is not a running system, and neither
half of that sentence may be dropped.

ADR-0001 … ADR-0018 are `Accepted` and **immutable** (foundational set
2026-08-05; the implementation stack 2026-08-06; the runner effect-boundary and
identity decisions 2026-08-17). Of the tracked set U1–U11, **two** are closed:
[U6](../docs/architecture/unresolved-decisions.md#u6) by ADR-0013 (2026-08-12)
and [U7](../docs/architecture/unresolved-decisions.md#u7) by ADR-0015
(2026-08-15). Acceptance is **not** authorization to deploy.

Do not suggest application code, service implementations, deployments, or
dependencies unless the task explicitly authorizes them — and never for work
blocked on an unresolved decision.

## Two kinds of agent

The repository is **operated on by** coding agents and is **about** household
agents. They are different, and conflating them is a security error, not a
wording error. See the table in [`../AGENTS.md`](../AGENTS.md).

## Hard constraints

- No secrets, tokens, keys, or realistic-looking fakes — anywhere.
- No live device control; no contact with Home Assistant.
- No infrastructure mutation: no deploys, no Docker, Tailscale, Keycloak,
  OpenFGA, or Traefik changes.
- No provider credentials or model identifiers.
- No commits to `main`.
- No GitHub issue creation — issues come from the human planning workflow.
- No fake implementations. An empty package with a good README beats a stub.
- No new dependencies without a reviewed decision.
- Nothing in [`../docs/architecture/unresolved-decisions.md`](../docs/architecture/unresolved-decisions.md)
  may be resolved by implementation.
- Never modify the pinned upstream repositories (`platform-edge`,
  `security-first-platform-architecture`).

## Pull request review

Prioritize findings that affect, in order:

1. **Trust boundaries** — anything that treats a network position (Docker
   network, tailnet, co-location on the Pi) as identity or authorization.
2. **The agent-as-client rule** — a privileged back-channel, a Home Assistant
   owner token, a direct database connection from a runner, or an agent granted
   insider status.
3. **The three-control separation** — sandbox capability, platform
   authorization, and deterministic safety policy must stay distinct and ordered
   ([`ADR-0005`](../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md)).
   Watch for safety constraints drifting into authorization tuples, or a model
   appearing in the deterministic policy path.
4. **Approval binding** — an action dispatched on an approval not bound to that
   exact action, resource, and parameter digest; a bare decision reference
   treated as proof
   ([`ADR-0008 §3`](../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md)).
5. **Fail-closed behaviour** — a sensitive action that could proceed when
   authorization is undecidable; a physically-safe direction treated as
   authorization-free; a classification missing the requester axis
   ([`ADR-0009`](../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)).
6. **Physical action semantics** — a claim of atomicity across a device, a
   missing `indeterminate` terminal state, or an automatic inverse command
   ([`services/AGENTS.md`](../services/AGENTS.md)).
7. **Provider neutrality** — a provider or framework name in a structural
   position in a schema or platform contract
   ([`ADR-0003`](../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
   [`ADR-0011`](../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)).
8. **Concept conflation** — implementation, profile, run, and automation merged
   ([`ADR-0006`](../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md)).
9. **Knowledge-bundle content** — secrets, live state, presence, authorization
   tuples, camera media, or raw personal telemetry
   ([`ADR-0010`](../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)).
10. **Index integrity** — a new, renamed, or removed document under
   `docs/architecture/` or `docs/decisions/` that is not reflected in its
   `INDEX.md`.
11. **Silent scope creep** — unrelated changes bundled into one pull request.
12. **Unreported skipped validation** — a PR claiming success without saying
    what it skipped.

Keep comments actionable and tied to a specific ADR or architecture document.
Do not comment when the change is already consistent with the contract.

## Custom agents

Scoped agent definitions live in [`agents/`](agents/):

- [`architecture.agent.md`](agents/architecture.agent.md) — documentation and
  architecture reasoning
- [`implementation.agent.md`](agents/implementation.agent.md) — implementation,
  requires an accepted task contract
- [`review.agent.md`](agents/review.agent.md) — read-only review

Each states its own scope and limits. None implies unrestricted tools or
authority.
