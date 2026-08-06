# packages/

**Reusable libraries with no runtime identity of their own.** A directory belongs
here when it is *imported* rather than *deployed*
([ADR-0012 §5](../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md),
**`Accepted`** 2026-08-06). Deployable processes are [`../services/`](../services/);
human-facing applications are [`../apps/`](../apps/).

Split by language because the toolchains are separate: Python under a `uv`
workspace, TypeScript under a `pnpm` workspace.

> **Status: no package has an implementation.** Each is a workspace member with a
> manifest, a placeholder module, and a README describing future ownership.

## Layout

| Path | Workspace | Purpose |
|---|---|---|
| [`python/contracts/`](python/contracts/) | uv | Typed models mirroring [`../schemas/`](../schemas/) |
| [`python/events/`](python/events/) | uv | Run event and evidence emission contracts |
| [`python/tools/`](python/tools/) | uv | The governed **tool surface** agent implementations may call |
| [`typescript/contracts/`](typescript/contracts/) | pnpm | TypeScript mirror of [`../schemas/`](../schemas/) |
| [`typescript/ui/`](typescript/ui/) | pnpm | Shared UI primitives for [`../apps/`](../apps/) |
| `worker-base/` *(planned)* | pnpm | The standard worker runtime contract — lifecycle, graceful shutdown, Zod config, logging, health, cancellation, retry and dead-letter, concurrency, metrics, idempotency, error taxonomy ([ADR-0012 §18](../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)) |

## What belongs here

Code that is **imported by more than one** service, app, or agent, and that has
no deployment identity of its own.

## What does not belong here

- **Deployable services** — [`../services/`](../services/). A package is
  imported; a service is deployed.
- **Agent implementations** — [`../agents/implementations/`](../agents/implementations/).
- **Applications** — [`../apps/`](../apps/).
- **Schema source of truth** — [`../schemas/`](../schemas/). Packages hold typed
  bindings *derived from* the schemas; the schema is canonical.
- **Anything used by exactly one consumer.** Keep it in that consumer until a
  second one exists. Premature sharing is how a package becomes a dumping
  ground.
- **Home Assistant clients or credentials** — only
  [`../services/action-gateway/`](../services/action-gateway/).

## Dependency direction

[ADR-0012 §15](../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)
(**`Accepted`** 2026-08-06) fixes one direction, to be enforced in CI:

```
contracts  ←  domain  ←  application  ←  adapters  ←  apps
```

Dependencies point **inward only**. `contracts` imports nothing from the
platform; no package imports a service or an application.

**Version governance is separate from import governance** (ADR-0012 §19):
**pnpm catalogs** hold canonical shared versions, **Syncpack** enforces manifest
consistency against them, and the **lockfile** is the resolved graph — while
ESLint and dependency-graph checks enforce the direction above. Syncpack would
happily approve a manifest that violates it. That is what lets a single Zod
definition be reused by a NestJS controller, a Next.js page, a generated SDK, an
MCP tool, and a test without any of them re-declaring it.

## Ownership and boundary rules

1. **One authored source per contract.** Under
   [ADR-0012](../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)
   the TypeScript contracts package is where API and domain-facing contracts are
   authored in Zod, and [`../schemas/`](../schemas/) becomes generated output.
   A second hand-maintained description of the same contract is a defect, not a
   convenience.
2. **No provider or framework name in a structural position.**
   ([ADR-0003](../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md))
3. **A package never holds a credential** and never reaches a device.
4. **Dependency-free by default.** Adding a dependency is a reviewed decision.
5. **No package may become a bypass.** A shared helper that lets a caller skip
   authorization or safety policy is a defect, however convenient.

## Governed by

[`../AGENTS.md`](../AGENTS.md) → [`../docs/decisions/INDEX.md`](../docs/decisions/INDEX.md).

## Validation

```sh
uv sync --all-packages && uv run ruff check . && uv run mypy && uv run pytest
pnpm install --lockfile-only && pnpm -r --if-present run check
```

Future: a cross-language check that the Python and TypeScript contract packages
agree with [`../schemas/`](../schemas/).
