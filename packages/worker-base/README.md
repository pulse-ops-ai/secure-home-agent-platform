# packages/worker-base

The standard worker runtime contract.

> **Status: package boundary only — and that is the point.** Issue #24 establishes the package so `services/workers/*` cannot each invent their own lifecycle before it exists. The implementation is a later issue. **There is no `createWorker` yet.**

## What belongs here

Once implemented
([ADR-0012 §18](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)):
lifecycle and graceful shutdown · Zod config parsing · Winston logging with
correlation context · health and readiness including dependency health ·
cancellation and timeout · retry, backoff, and dead-letter · concurrency limits ·
metrics and tracing hooks · idempotency hooks · structured outcomes and a shared
error taxonomy.

**Composition, not inheritance.** There will be no base class to extend — a
worker passes a handler and a config schema to a factory, so lifecycle,
shutdown, and timeout are not overridable.

## What does not belong here

- **Worker business logic** — that lives in the worker.
- **A base class.** Inheritance would let a worker override exactly the
  properties that must be uniform for the host to stay predictable.
- **Anything a worker is forbidden to own**: authorization, deterministic safety
  policy, Home Assistant credentials, device actuation, authoritative
  persistence.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · [ADR-0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/worker-base run lint
pnpm --filter @secure-home/worker-base run typecheck
pnpm --filter @secure-home/worker-base run build
```
