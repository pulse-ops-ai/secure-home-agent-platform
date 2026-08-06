# packages/events

Run event and evidence contracts.

> **Status: package boundary only.** No event vocabulary — it arrives with the runner substrate.

## What belongs here

- The **run event** vocabulary: start, capability grant, attempted call and its
  disposition, adapter lifecycle transitions, termination reason.
- The **evidence bundle** shape, identical across every adapter
  ([ADR-0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md)).
- Stable, machine-readable dotted event names.

## What does not belong here

- **Transport or storage.** This package defines the contract, not where records
  go.
- **Provider or framework names** in a structural position.
- **Anything that makes evidence optional.** A run without evidence is not a
  valid run.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · ADRs [0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md), [0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md), [0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/events run lint
pnpm --filter @secure-home/events run typecheck
pnpm --filter @secure-home/events run build
```
