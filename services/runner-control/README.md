# services/runner-control

The runner substrate.

> **Status: orchestration landed; nothing launches yet.** L4 (#27) built the
> typed run lifecycle, authority acquisition, gate scheduling, evidence
> finalization, and the port boundary — all behind ports, with **no container
> launch, no process spawn, and no executed bootstrap**. The concrete launcher
> is a later landing, L9 (#57), sequenced `L8 + GATE-U4` and needing its own
> authorizing task contract. **GATE-U4 is satisfied**:
> [ADR-0020](../../docs/decisions/ADR-0020-place-runner-control-by-workload-class.md)
> resolved [U4](../../docs/architecture/unresolved-decisions.md#u4) on 2026-08-26
> — **one package, two deployments**, household on the Pi and coding off it —
> and implemented none of it. **L8 (#56) has not landed**, so L9 is not next.
> Adapters are L7, after
> [ADR-0013](../../docs/decisions/ADR-0013-define-the-runner-adapter-spi.md).

## What is here

| Directory | Owns |
|---|---|
| `lifecycle/` | the data-declared state machine: states, transition table, the total transition function, the run's single writer |
| `consent/` | consent-to-spend, which gates spend and is never authority |
| `acquisition/` | acquire-once tokens in two epoch roles; the production and verification epochs |
| `scheduling/` | gate plans built only from the captured registry; one disposition per identity |
| `workspace/` | workspace provisioning and observation, handed to the core to interpret |
| `execution/` | the execution session behind its port — prepare, start, interrupt, close |
| `finalization/` | the reference implementation of **invisible staging plus one publication transition** ([`distributed-effect-lifecycle.md`](../../docs/architecture/distributed-effect-lifecycle.md)), and the durable record shapes. Not a write ordering: nothing a participant stages is observable until the single visibility transition publishes what the transaction owes |
| `events/` | emission at the moments the closed L2 vocabulary represents |
| `orchestration/` | the effect boundary: per-method effect classes, bounded calls, the absolute expiry, interruption, and the phase walk ([`effect-boundary-model.md`](../../docs/architecture/effect-boundary-model.md)) |
| `run/` | run scope and interruption — what an attempt established, and how it unwinds |
| `run-state/` | the run's authority and visibility state: the fencing token, the outbox, and the publication marker |
| `ports/` | the port interfaces and their value shapes |
| `adapters/` | the shipped implementations — real read-only filesystem, deterministic in-memory everything else |
| `app/` | the **inert** NestJS module tree; nothing in this repository starts it |
| `conformance/` | the executable proofs for the boundaries above |
| `runner.ts` | the framework-free composition root: one run's walk |

## The properties this service is built to hold

- **Orchestration cannot decide.** Every trust judgement is a call into
  [`@secure-home/runner-core`](../../packages/runner-core/), used as returned.
  There is no site here that softens a refusal or recomputes a digest.
- **An attempt's outcome and the logical run's terminal are different facts.**
  A run that terminalizes under this attempt produces a sealed evidence bundle,
  or — if it terminated before authority completed — an early-terminal refusal
  record. If the finite settlement boundary expires before that mandatory record
  becomes durable, the attempt reports the distinct failure `settlement_failed`;
  it never presents an unevidenced lifecycle terminal as recorded. An attempt
  that **lost ownership** reports only the ending of itself, and manufactures no
  verdict for a run it no longer owns. A fabricated bundle is unreachable, not
  merely forbidden. The full outcome vocabulary is
  [`distributed-effect-lifecycle.md`](../../docs/architecture/distributed-effect-lifecycle.md).
- **Ordering claims are scoped to one run.** Port implementations may be shared
  instances, so any ordering property holds among *that run's* operations only.
  Every run-scoped operation carries its `run_id`, and a shared implementation
  must hold no unkeyed mutable per-run state. Finalization makes no ordering
  claim at all — it publishes once, atomically.
- **An owned run is not silently abandoned.** Cancellation and timeout are
  declared transitions, and a terminal reached under this attempt produces its
  record. An attempt that **loses ownership** ends locally without manufacturing
  a lifecycle verdict for a run it no longer owns — it has no authority to give
  one.
- **Effects are bounded at the port boundary, not at the call site.** Every
  asynchronous port method carries exactly one effect class, an interrupted
  continuation starts nothing further, and fencing is enforced at the protected
  resource rather than by consulting the lease —
  [`effect-boundary-model.md`](../../docs/architecture/effect-boundary-model.md).

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

[`../../AGENTS.md`](../../AGENTS.md) · ADRs [0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md), [0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md), [0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md), [0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md), [0013](../../docs/decisions/ADR-0013-define-the-runner-adapter-spi.md), [0017](../../docs/decisions/ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md), [0018](../../docs/decisions/ADR-0018-separate-attempt-durable-fact-and-finalization-identity.md)

Operative architecture: [`effect-boundary-model.md`](../../docs/architecture/effect-boundary-model.md) ·
[`distributed-effect-lifecycle.md`](../../docs/architecture/distributed-effect-lifecycle.md) ·
[`runner-model.md`](../../docs/architecture/runner-model.md)

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
