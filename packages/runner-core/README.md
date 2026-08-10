# packages/runner-core

The trusted runner decision core (landing L3, #52, change `runner-core`):
given captured authority snapshots and host observations supplied as
immutable values, it returns typed decisions — proceed or refuse with the
cause named — and constructs and independently re-derives run evidence.

> The package is **pure and inert**: it performs no I/O, owns no I/O
> abstraction (no reader, observer, or port interface), launches nothing,
> grants nothing, and nothing imports it until L4 (`services/runner-control`,
> #27). Acquisition — reading each authority source exactly once, retaining
> the snapshot, independently re-observing for verification — is L4's.

## What belongs here

- The four decision capabilities and their proof net:
  - `authority/` + `eligibility/` — snapshot construction from supplied
    bytes; pre-spend eligibility that refuses rather than defaults.
  - `policy/` — write roots, protected governing material, typed prohibited
    rules, bounds that refuse rather than truncate.
  - `workspace/` + `reconciliation/` — authoritative change sets from host
    observation; claims recorded and compared, never merged.
  - `evidence/` + `verification/` — evidence construction and the
    INDEPENDENT verifier (no import edge between them, mechanically
    guarded).
- `decision/` — the `Decision`/`Refusal`/`OperationalFailure` result algebra.
- `primitives/` — deterministic, decision-free helpers both sides may share.

## What does not belong here

- **Any I/O or I/O abstraction** — acquisition and observation are L4.
- **Ordering, scheduling, lifecycle, consent** — orchestration is L4.
- **Enforcement** — mounts, containers, network, resource ceilings are L9.
- **Provider anything** — adapters and transcript parsing are L6/L7
  (post-U6); no provider or framework name in a structural position.
- **New dependencies** — the runtime dependency set is exactly
  `@secure-home/contracts` and `@secure-home/events`, asserted by a
  conformance test.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · the canonical
[`runner-adoption`](../../openspec/specs/runner-adoption/spec.md) contract ·
the `runner-core` change artifacts · ADRs
[0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md),
[0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/runner-core run lint
pnpm --filter @secure-home/runner-core run typecheck
pnpm --filter @secure-home/runner-core run test
pnpm --filter @secure-home/runner-core run build
```
