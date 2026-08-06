# services/runner-control

The runner substrate.

> **Status: package boundary only.** No NestJS module, no sandbox construction, no run lifecycle, no evidence capture — that is **issue #27**. This directory previously held a Python placeholder; it is now a TypeScript service.

## What belongs here

- Profile resolution and validation, sandbox construction, run lifecycle, resource
  limits, event emission, and evidence sealing
  ([`runner-model.md`](../../docs/architecture/runner-model.md)).
- A **separate process** from the control plane, deliberately: it launches
  untrusted sandboxes, so it needs its own lifetime and resource envelope — a
  runaway run must not starve the household control path.

## What does not belong here

- **Adapters** — those are [`../../agents/adapters/`](../../agents/adapters/).
  The substrate launches them as isolated processes; it does not contain them.
- **Any provider or framework SDK.** The substrate is neutral
  ([ADR-0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md)).
- **Credentials.** Provisioned per run from the profile, never ambient.
- **Workload identity** — unresolved, [U2](../../docs/architecture/unresolved-decisions.md#u2).

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · ADRs [0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md), [0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md), [0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md), [0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/runner-control run lint
pnpm --filter @secure-home/runner-control run typecheck
pnpm --filter @secure-home/runner-control run build
```
