# packages/

Shared libraries. Split by language because the toolchains are separate: Python
under a `uv` workspace, TypeScript under a `pnpm` workspace.

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

## Ownership and boundary rules

1. **Schemas are canonical; packages are bindings.** The Python and TypeScript
   contract packages must stay consistent with [`../schemas/`](../schemas/) and
   with each other. Drift between them is a defect.
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
