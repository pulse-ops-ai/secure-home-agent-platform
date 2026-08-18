# services/workers/

**Specialist workers** — separate processes doing work on behalf of the
household control path, but never *on* it.

> **Status: one boundary, no workers.** Only
> [`python-inference/`](python-inference/) exists, and it contains no worker.

## What belongs here

| Kind | Manifest | Built on |
|---|---|---|
| **TypeScript worker** | `package.json`, a pnpm member | [`packages/worker-base`](../../packages/worker-base/) |
| **Python inference worker** | `pyproject.toml`, a uv member | [`python-inference/`](python-inference/) |

TypeScript is the default. Python is admitted only where a mature ML, vision, or
audio dependency requires it
([ADR-0012 §6](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)).

## What does not belong here

- **Anything on the household request path.** A worker is asynchronous and
  off-path by definition; if it must answer a request synchronously, it is a
  service, not a worker.
- **Authorization, safety policy, Home Assistant credentials, actuation, or
  authoritative persistence** — for workers of any language.
- **A worker's own lifecycle, shutdown, retry, or health handling.** A TypeScript
  worker composes those from `worker-base` rather than reimplementing them
  ([ADR-0012 §18](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)).

## Boundary rules

1. Separate process, separate failure domain, separate resource envelope.
2. Never on the household request path — a failing worker degrades its own
   function and nothing else.
3. Bounded concurrency, so a worker cannot starve the Pi.
4. Graceful shutdown; in-flight work completes or is dead-lettered.

## Governed by

[`../AGENTS.md`](../AGENTS.md) · [ADR-0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm lint && pnpm typecheck && pnpm test   # TypeScript workers
uv run pytest                    # Python inference workers
```
