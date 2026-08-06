# services/workers/python-inference

**The single admitted Python boundary.** Isolated specialist inference workers.

> **Status: boundary only.** A uv workspace member with a manifest and a
> placeholder package. There is no worker, no model, no inference, and no
> dependency.

## Why Python is permitted here, and only here

TypeScript is the primary implementation language
([ADR-0012](../../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)).
Python is admitted **only** where a mature ML, vision, or audio dependency
requires it and no adequate TypeScript equivalent exists.

Admission is per worker and requires a task contract that names the dependency
that justified it. "It is easier in Python" is not a justification.

## What a worker here may never own

Non-negotiable ([ADR-0012 §6](../../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)):

- authorization decisions,
- deterministic safety policy,
- Home Assistant credentials or any device actuation,
- authoritative persistence,
- envelope minting or verification as an enforcement point.

A worker **consumes inputs and returns inferences**. It is a compute dependency,
not a control-plane component, and it is never on the household request path. It
re-enters the platform through the same governed enforcement point as any other
caller.

This matters because an inference worker carries the largest and
fastest-moving dependency tree in the repository. Giving it a credential or an
actuation path would put the house's physical security behind that supply chain.

## What belongs here

- Inference workers, one directory each, as `uv` workspace members.
- Model-loading and scoring code, and its tests.

## What does not belong here

- **Anything on the household request path.**
- **A TypeScript worker** — those are `services/workers/<name>` as pnpm members,
  built on [`packages/worker-base`](../../../packages/worker-base/).
- **Shared platform libraries** — [`../../../packages/`](../../../packages/).
- **Credentials, database connections, or Home Assistant clients.**

## Interface

A worker is invoked *through* a TypeScript worker built on `worker-base`, or it
implements the same outcome and error contract over its transport. Either way
the platform sees one worker contract, not one per language.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · ADRs
[0004](../../../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0012](../../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
uv sync --all-packages --locked
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
```
