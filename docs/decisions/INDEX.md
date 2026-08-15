# docs/decisions/ — Architecture Decision Records

An ADR records **why** a decision was made, not just what it is. It is the
answer to "why is it like this?" eighteen months from now.

> **All eleven foundational ADRs are `Accepted`** as of **2026-08-05**, by
> @mikegtech (repository owner), in PR #2. They are now **immutable**: reverse or
> amend a decision by writing a new ADR that supersedes it — never by editing an
> accepted file.
>
> **Neither foundational acceptance resolved anything in
> [`unresolved-decisions.md`](../architecture/unresolved-decisions.md).** One
> item has closed since: **[U6](../architecture/unresolved-decisions.md#u6)**,
> by [ADR-0013](ADR-0013-define-the-runner-adapter-spi.md) on 2026-08-12 — the
> only item of the tracked set **U1–U11** ever closed. Every other item still
> blocks the work that depends on it. See
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
| **Unresolved decisions resolved** | **none** — every item then open stayed open, by explicit decision |
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
- the runner substrate, and — since **ADR-0013** closed
  [U6](../architecture/unresolved-decisions.md#u6) on 2026-08-12 — the adapter
  SPI in full, not only its neutral parts;
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
| [ADR-0012](ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md) | Adopt TypeScript, NestJS, and pnpm as the primary implementation stack | Accepted | [`apps/`](../../apps/), [`packages/`](../../packages/), [`services/`](../../services/), [`schemas/`](../../schemas/) |
| [ADR-0013](ADR-0013-define-the-runner-adapter-spi.md) | Define the runner adapter SPI | Accepted | [`agents/adapters/`](../../agents/adapters/), [`services/runner-control/`](../../services/runner-control/) |
| [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) | Promote durable lessons into canonical architecture and portable knowledge | Proposed | [`docs/`](../), [`knowledge/`](../../knowledge/), provider instruction files |

> **ADR-0012 is `Accepted`** (2026-08-06) and **immutable**. It **refines**
> ADR-0003 and ADR-0006 — deciding how their contracts are authored — without
> editing or superseding either. See
> [the ADR-0012 acceptance record](#adr-0012-acceptance-record).

### ADR-0013 acceptance record

| | |
|---|---|
| **Accepted** | 2026-08-12 |
| **Accepted by** | @mikegtech (repository owner) |
| **Scope** | ADR-0013 in full: the ten SPI decisions, including the cross-layer capability split and the terminal-state posture |
| **Review** | issue #11 (U6 gate); PR #74, drafted from the L6 spike evidence in PR #73 |
| **Unresolved decisions resolved** | **[U6](../architecture/unresolved-decisions.md#u6)** — the first item ever to leave `unresolved-decisions.md`. Every other item remains open |

**What was accepted.** Adapters translate and report, never decide or enforce ·
capability is a **cross-layer** property — the adapter narrows the
provider-visible tool surface from the profile (defense in depth, proven at
L7/L8 as translation fidelity) while the substrate enforces the real boundary
(proven at L9), so *"one adapter cannot widen the profile"* is a cross-layer
proof · provider terminal state is observational input and the lifecycle
decides among the six terminal states · model output is untrusted text until
the platform validates it · provider event shapes are normalized at the adapter
boundary against a pinned provider version and never leak upward · usage is
recorded in native token and credit units, never as modeled currency · adapters
hold credential references only, with per-run semantics left to U2 and
enforcement to L9 · cancellation is effected by the substrate · neutrality holds
structurally, so adding an adapter changes no schema.

**Decided on evidence, not expectation.** Every decision traces to the L6 spike
([`docs/spikes/l6-copilot-cli/`](../spikes/l6-copilot-cli/)), which found that
Copilot CLI 1.0.79 enforces no caller schema, that `--allow-tool` is not a
closed allowlist, and that the CLI reported success while being killed.

**Now eligible for implementation — under a specific issue or task contract:**

| Issue | Work |
|---|---|
| #55 | L7 platform adapters, against the frozen SPI |
| #56 | L8 coding-adapter conformance seed |

**Still not authorized by this acceptance.** No adapter is implemented, no
provider credential is provisioned, no image is built, and
[U2](../architecture/unresolved-decisions.md#u2) (workload identity),
[U4](../architecture/unresolved-decisions.md#u4) (placement), and
[U11](../architecture/unresolved-decisions.md#u11) (persistence) remain open.
The ADR's own § Validation and follow-up obligations lists what L7, L8, and L9
must each prove.

### ADR-0012 acceptance record

| | |
|---|---|
| **Accepted** | 2026-08-06 |
| **Accepted by** | @mikegtech (repository owner) |
| **Scope** | ADR-0012 in full, including §5 taxonomy, §18 `worker-base`, §19 dependency governance, §20 CI model |
| **Review** | issue #5; PR #41, two rounds |
| **Unresolved decisions resolved** | **none** — every item then open stayed open |

**What was accepted.** TypeScript primary · NestJS 11 on Fastify 5 · pnpm
workspaces · pnpm catalogs · Syncpack manifest governance · frozen
`pnpm-lock.yaml` · Next.js for `apps/web` · the repository taxonomy
(`services/` deployable backend processes, `apps/` human-facing applications,
`packages/` reusable libraries, `agents/` agent implementations and profiles) ·
`services/control-plane`, `services/runner-control`, `services/workers/*` ·
`packages/worker-base` · Zod as the authored source for DTOs, shared API/domain
types, validation, metadata, OpenAPI, SDK, and MCP contracts · no handwritten
NestJS DTO duplication · deterministic normalized OpenAPI · authorization-aware
metadata routes · one projection configuration per API module · cursor
pagination and the standard response envelopes · an allowlisted MCP operation
catalog · path-aware CI with unconditional governance gates · persistence
toolkit deferred to U11 · Python restricted to isolated specialist inference
workers.

**Now eligible for implementation — under a specific issue or task contract:**

| Issue | Work |
|---|---|
| #24 | pnpm workspace and canonical repository-layout migration |
| #25 | shared TypeScript configuration and testing packages |
| #26 | NestJS/Fastify `control-plane` shell |
| #27 | `runner-control` shell |
| #28 | Zod contract packages |
| *(future)* | Next.js web shell; `packages/worker-base` |

**Acceptance is not a general authorization.** It permits building *against*
ADR-0012 when an issue authorizes the specific work. It is **not** authorization
to deploy, and it does not make any unresolved decision decided.

**Still blocked, unchanged by this acceptance:**

- **No persistence toolkit is selected** — [U11](../architecture/unresolved-decisions.md#u11).
  No schema, migration, or repository code.
- **No Home Assistant runtime is authorized**, and no credential strategy exists
  — [U10](../architecture/unresolved-decisions.md#u10).
- **No OpenFGA runtime is deployed** — [U8](../architecture/unresolved-decisions.md#u8).
- **No runner workload identity is selected** — [U2](../architecture/unresolved-decisions.md#u2).
- **`BOUNDED` still behaves as `FAIL CLOSED`** — [U1](../architecture/unresolved-decisions.md#u1).
- U3, U4, U5, U6, U7, U9 likewise remain open and still block the work that
  depends on them.

## Which ADRs apply to what I am changing?

| If you are touching… | Read at least |
|---|---|
| anything | ADR-0001 |
| a service under `services/` | ADR-0002, ADR-0004, ADR-0005, ADR-0008, ADR-0009 |
| an execution profile or the profile schema | ADR-0003, ADR-0006, ADR-0007 |
| an agent implementation or adapter | ADR-0003, ADR-0004, ADR-0006, ADR-0011, **ADR-0013** |
| the runner substrate or a runner image | ADR-0003, ADR-0005, ADR-0011 |
| authorization, identity, or the envelope | ADR-0004, ADR-0008 |
| safety policy or device actuation | ADR-0005, ADR-0008, ADR-0009 |
| availability, offline, or failure behaviour | ADR-0002, ADR-0007, ADR-0009 |
| a knowledge bundle | ADR-0010 |
| a knowledge module, set, or the selection contract | ADR-0010, ADR-0003, ADR-0006 + [`../architecture/knowledge-selection-model.md`](../architecture/knowledge-selection-model.md) |
| where a durable lesson from a change or review belongs | **ADR-0014** + [`../architecture/knowledge-promotion-model.md`](../architecture/knowledge-promotion-model.md) |
| a provider instruction file or provider-native skill | **ADR-0014**, ADR-0011 |
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
