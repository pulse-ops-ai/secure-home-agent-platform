# packages/testing

Shared test helpers and fixtures.

> **Status: package boundary only.** No helpers, and **no test framework is chosen yet** — that is issue #25. Its `test` script is an honest documented no-op.

## What belongs here

- Helpers and fixtures used by **more than one** suite: test doubles for the
  authorization port, the policy engine, and the Home Assistant client; builders
  for principals, envelopes, and actions.

## What does not belong here

- **Helpers with exactly one consumer.** Keep them in that suite until a second
  one appears.
- **Real credentials, device identifiers, or household data** in fixtures.
- **Fixtures requiring a network or a live service.** Tests run offline.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · [ADR-0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/testing run lint
pnpm --filter @secure-home/testing run typecheck
pnpm --filter @secure-home/testing run build
```
