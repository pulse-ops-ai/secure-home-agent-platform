# agents/implementations/python/

Python household agent implementations.

> **Status: empty.** No agent exists. This directory holds only this README.

## What belongs here

One directory per agent, each a `uv` workspace member with its own
`pyproject.toml` and `README.md`. An agent's README must state what it observes,
what it proposes, which routing class it expects
([ADR-0007](../../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md)),
and which capability classes its profile must grant.

## What does not belong here

- **Capability grants** — [`../../../profiles/`](../../../profiles/).
- **Credentials, Home Assistant clients, database connections.**
- **Adapters** — [`../../adapters/`](../../adapters/).
- **Shared libraries** — [`../../../packages/`](../../../packages/).
- **Anything outside the admitted Python boundary.** Python lives only in
  [`../../../services/workers/python-inference/`](../../../services/workers/python-inference/)
  ([ADR-0012 §6](../../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md));
  a Python *agent* would need its own admission.
- **Safety rules** — [`../../../services/control-plane/`](../../../services/control-plane/).

## Boundary rules

- Runs in an untrusted sandbox; re-enters the platform as a client.
- Acts only through the governed tool surface
  (the governed tool-surface package, not yet created).
- Must handle a denied tool call as a normal outcome.
- Adding an agent here does not make it runnable. It becomes runnable when a
  reviewed execution profile exists.

## Governed by

[`../README.md`](../README.md) → [`../../AGENTS.md`](../../AGENTS.md)

## Validation

`uv sync --all-packages`, `uv run ruff check .`, `uv run mypy`, `uv run pytest`.
