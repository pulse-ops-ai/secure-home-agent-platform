# docs/decisions/ — Architecture Decision Records

An ADR records **why** a decision was made, not just what it is. It is the
answer to "why is it like this?" eighteen months from now.

> **All eleven foundational ADRs are `Accepted`** as of **2026-08-05**, by
> @mikegtech (repository owner), in PR #2. They are now **immutable**: reverse or
> amend a decision by writing a new ADR that supersedes it — never by editing an
> accepted file.
>
> **Acceptance did not resolve anything in
> [`unresolved-decisions.md`](../architecture/unresolved-decisions.md).** U1–U10
> remain open, and each still blocks the work that depends on it. See
> [What acceptance does and does not unblock](#what-acceptance-does-and-does-not-unblock).

This index is validated by [`scripts/validate-scaffold.sh`](../../scripts/validate-scaffold.sh):
every ADR file referenced here must exist, and every ADR file present must be
referenced here.

## Conventions

- Filenames are `ADR-NNNN-short-title.md`, zero-padded, never renumbered.
- Status is one of `Proposed`, `Accepted`, `Superseded`, `Rejected`.
- An accepted ADR is **immutable**. Reverse it with a new ADR that supersedes it;
  do not edit history.
- Every ADR carries: status, date, context, decision, consequences, alternatives
  considered, security implications, availability implications, validation and
  follow-up obligations, and links.
- Write an ADR when the trade-off was real and another reasonable engineer would
  have chosen differently.

## Acceptance record

| | |
|---|---|
| **Accepted** | 2026-08-05 |
| **Accepted by** | @mikegtech (repository owner) |
| **Scope** | ADR-0001 … ADR-0011, as one set |
| **Unresolved decisions resolved** | **none** — U1–U10 remain open by explicit decision |
| **Review** | PR #1 (scaffold), three rounds of security review; PR #2 (acceptance) |

The set was accepted **as a whole**, which matters:
[ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md),
[ADR-0008](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md),
and [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md) are
only defensible in combination — the three-control separation, the bound
approval, and the degraded-mode classes each assume the other two.

## What acceptance does and does not unblock

**Now unblocked** — an accepted ADR can be implemented against, once a task
contract or issue authorizes the specific work
([`.github/agents/implementation.agent.md`](../../.github/agents/implementation.agent.md)):

- the execution-profile, run, action, and automation schemas;
- the runner substrate and the adapter SPI's *neutral* parts;
- the household authorization model's structure (types, relations, delegation);
- the deterministic safety-policy declaration format and evaluator;
- the knowledge-bundle validator and the four OKF interfaces;
- the base runner image and the derived per-provider images;
- conformance and policy-scenario test suites.

**Still blocked** — acceptance changed nothing here, because these depend on
questions the ADRs deliberately left open:

| Blocked work | Blocked on |
|---|---|
| Any offline/bounded local authority mechanism | [U1](../architecture/unresolved-decisions.md#u1) — **BOUNDED still behaves as FAIL CLOSED** |
| Issuing run credentials to a sandbox | [U2](../architecture/unresolved-decisions.md#u2) |
| Building the L6 envelope issuer | [U3](../architecture/unresolved-decisions.md#u3) |
| Deploying `runner-control` to a host | [U4](../architecture/unresolved-decisions.md#u4) |
| Automation persistence and scheduling | [U5](../architecture/unresolved-decisions.md#u5) |
| Freezing the adapter SPI | [U6](../architecture/unresolved-decisions.md#u6) |
| Authoring a real knowledge bundle | [U7](../architecture/unresolved-decisions.md#u7) |
| Deploying an OpenFGA store | [U8](../architecture/unresolved-decisions.md#u8) |
| Caching an authorization decision | [U9](../architecture/unresolved-decisions.md#u9) |
| Giving `action-gateway` a Home Assistant credential | [U10](../architecture/unresolved-decisions.md#u10) |

**Acceptance is not authorization to deploy.** No runtime service, no
credential, and no Home Assistant instance is authorized by this change. Those
require their own reviewed work, and several require an unresolved decision to be
closed first.

Each accepted ADR's *"Validation and follow-up obligations"* section is now a
live obligation rather than a proposal.

## The foundational set

These eleven ADRs are one coherent set. Several are only defensible in
combination — in particular
[ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md),
[ADR-0008](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md),
and [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md).

| ADR | Title | Status | Governs |
|---|---|---|---|
| [ADR-0001](ADR-0001-adopt-security-first-architecture.md) | Adopt the security-first platform architecture by pinned reference | Accepted | the whole repository |
| [ADR-0002](ADR-0002-adopt-hybrid-home-deployment-profile.md) | Adopt a hybrid-home deployment profile | Accepted | [`deploy/`](../../deploy/), [`services/`](../../services/) |
| [ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md) | Use framework-neutral runner contracts and execution profiles | Accepted | [`profiles/`](../../profiles/), [`agents/adapters/`](../../agents/adapters/), [`services/runner-control/`](../../services/runner-control/) |
| [ADR-0004](ADR-0004-treat-agents-as-clients.md) | Treat agents as clients, not insiders | Accepted | [`agents/`](../../agents/), [`services/`](../../services/) |
| [ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md) | Separate sandbox capability, platform authorization, and safety policy | Accepted | [`services/policy-engine/`](../../services/policy-engine/), [`services/action-gateway/`](../../services/action-gateway/) |
| [ADR-0006](ADR-0006-separate-agent-implementation-profile-run-and-automation.md) | Separate agent implementation, execution profile, run, and automation | Accepted | [`agents/`](../../agents/), [`profiles/`](../../profiles/), [`schemas/`](../../schemas/), [`services/automation-service/`](../../services/automation-service/) |
| [ADR-0007](ADR-0007-route-local-remote-and-cloud-execution-explicitly.md) | Route local, remote, and cloud execution explicitly | Accepted | [`profiles/`](../../profiles/), [`schemas/execution-profile/`](../../schemas/execution-profile/) |
| [ADR-0008](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md) | Use OpenFGA for relationship decisions and deterministic policy for safety | Accepted | [`services/policy-engine/`](../../services/policy-engine/), [`services/pi-api/`](../../services/pi-api/) |
| [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md) | Define degraded mode and offline authorization posture | Accepted | [`services/`](../../services/), [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md) |
| [ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) | Use OKF for portable knowledge only | Accepted | [`knowledge/`](../../knowledge/) |
| [ADR-0011](ADR-0011-keep-coding-agent-images-provider-specific.md) | Keep the base runner provider-neutral and coding-agent images provider-specific | Accepted | [`deploy/images/`](../../deploy/images/), [`agents/adapters/coding/`](../../agents/adapters/coding/) |

## Implementation decisions

The foundational set decides the *logical* architecture and is deliberately
implementation-neutral. These decide how it is built.

| ADR | Title | Status | Governs |
|---|---|---|---|
| [ADR-0012](ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md) | Adopt TypeScript, NestJS, and pnpm as the primary implementation stack | **Proposed** | [`apps/`](../../apps/), [`packages/`](../../packages/), [`services/`](../../services/), [`schemas/`](../../schemas/) |

> **ADR-0012 is `Proposed`.** It is not accepted, so it does not yet authorize
> implementation. It **refines** ADR-0003 and ADR-0006 — deciding how their
> contracts are authored — without editing or superseding either.

## Which ADRs apply to what I am changing?

| If you are touching… | Read at least |
|---|---|
| anything | ADR-0001 |
| a service under `services/` | ADR-0002, ADR-0004, ADR-0005, ADR-0008, ADR-0009 |
| an execution profile or the profile schema | ADR-0003, ADR-0006, ADR-0007 |
| an agent implementation or adapter | ADR-0003, ADR-0004, ADR-0006, ADR-0011 |
| the runner substrate or a runner image | ADR-0003, ADR-0005, ADR-0011 |
| authorization, identity, or the envelope | ADR-0004, ADR-0008 |
| safety policy or device actuation | ADR-0005, ADR-0008, ADR-0009 |
| availability, offline, or failure behaviour | ADR-0002, ADR-0007, ADR-0009 |
| a knowledge bundle | ADR-0010 |
| deployment assets | ADR-0002, ADR-0011 |
| a TypeScript package, app, or API contract | **ADR-0012** + [`../architecture/api-contract-model.md`](../architecture/api-contract-model.md) |
| an OpenAPI, MCP, or metadata surface | **ADR-0012**, ADR-0004 |
| anything touching persistence | **ADR-0012** + [U11](../architecture/unresolved-decisions.md#u11) |

## Deliberately not decided

The hardest open questions are **not** settled by these ADRs, and were **not**
settled by accepting them. They are tracked in
[`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md)
and each leaves that file only via a **new** ADR — never via an implementation.

The most consequential is the bounded-authority mechanism for offline household
authorization, which
[ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md) names and
explicitly refuses to guess at. Until it is closed, every `BOUNDED` operation
behaves as `FAIL CLOSED`.
