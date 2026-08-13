# services/runner-control

The runner substrate.

> **Status: orchestration landed; nothing launches yet.** L4 (#27) built the
> typed run lifecycle, authority acquisition, gate scheduling, evidence
> finalization, and the port boundary — all behind ports, with **no container
> launch, no process spawn, and no executed bootstrap**. The concrete launcher
> is a later landing gated on [U4](../../docs/architecture/unresolved-decisions.md#u4);
> adapters are L7, after [ADR-0013](../../docs/decisions/ADR-0013-define-the-runner-adapter-spi.md).

## What is here

| Directory | Owns |
|---|---|
| `lifecycle/` | the data-declared state machine: states, transition table, the total transition function, the run's single writer |
| `consent/` | consent-to-spend, which gates spend and is never authority |
| `acquisition/` | acquire-once tokens in two epoch roles; the production and verification epochs |
| `scheduling/` | gate plans built only from the captured registry; one disposition per identity |
| `observation/` | workspace and artifact observation, handed to the core to interpret |
| `finalization/` | the per-run write ledger that enforces seal-last, and the two durable record shapes |
| `events/` | emission at the moments the closed L2 vocabulary represents |
| `ports/` | the port interfaces and their value shapes |
| `adapters/` | the shipped implementations — real read-only filesystem, deterministic in-memory everything else |
| `app/` | the **inert** NestJS module tree; nothing in this repository starts it |
| `runner.ts` | the framework-free composition root: one run's walk |

## The properties this service is built to hold

- **Orchestration cannot decide.** Every trust judgement is a call into
  [`@secure-home/runner-core`](../../packages/runner-core/), used as returned.
  There is no site here that softens a refusal or recomputes a digest.
- **A run ends in one of two governed shapes**: a sealed evidence bundle, or —
  for a run that terminated before authority completed — an early-terminal
  refusal record. A fabricated bundle is unreachable, not merely forbidden.
- **Ordering claims are scoped to one run.** Port implementations may be shared
  instances, so "seal last" means last among *that run's* writes. Every
  run-scoped operation carries its `run_id`, and a shared implementation must
  hold no unkeyed mutable per-run state.
- **A run is never abandoned.** Cancellation and timeout are declared
  transitions, and every terminal produces its record.

## What does not belong here

- **Adapters** — those are [`../../agents/adapters/`](../../agents/adapters/).
  The substrate launches them as isolated processes; it does not contain them.
- **Any provider or framework SDK**, beyond the ADR-0012 application framework
  the inert shell needs. The substrate is neutral
  ([ADR-0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md)).
- **Zod.** Contracts are authored once, in
  [`packages/contracts`](../../packages/contracts/), and consumed by instance.
- **Credentials.** Provisioned per run from the profile, never ambient.
- **Workload identity** — unresolved, [U2](../../docs/architecture/unresolved-decisions.md#u2).

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · ADRs [0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md), [0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md), [0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md), [0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md), [0013](../../docs/decisions/ADR-0013-define-the-runner-adapter-spi.md)

Canonical requirements: [`runner-execution`](../../openspec/specs/runner-execution/spec.md) ·
[`runner-verification`](../../openspec/specs/runner-verification/spec.md) ·
[`runner-evidence`](../../openspec/specs/runner-evidence/spec.md)

## Validation

```sh
pnpm --filter @secure-home/runner-control run lint
pnpm --filter @secure-home/runner-control run typecheck
pnpm --filter @secure-home/runner-control run test
pnpm --filter @secure-home/runner-control run build
```
