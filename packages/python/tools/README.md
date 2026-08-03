# packages/python/tools

The **governed tool surface**: the typed, capability-scoped client wrappers an
agent implementation may call.

> **Naming note.** "Tools" here means *agent-callable tools*, not developer
> utilities. Build scripts and repository helpers belong in
> [`../../../scripts/`](../../../scripts/).

> **Status: no implementation.** A placeholder package with a docstring.

## Why this package exists

Agents need to *do* things. The question is whether each agent invents its own
way of doing them. If it does, every agent becomes a place where an
authorization step might be skipped.

This package is the single, reviewed answer: **every tool re-enters the platform
through a governed API enforcement point**, exactly as a browser would. A tool is
a typed client of the household API, never a shortcut around it.

## What belongs here

- Typed client wrappers for governed household API operations.
- Tool descriptors: what a tool does, its inputs, its outputs, and which
  capability class an execution profile must grant to permit it.
- Uniform error handling that surfaces *which control denied* — sandbox
  capability, authorization, or safety policy.

## What does not belong here — hard rules

- **No Home Assistant client and no Home Assistant credential.** Ever. Only
  [`../../../services/action-gateway/`](../../../services/action-gateway/).
- **No direct database connection.** No runner has one.
- **No path that bypasses the governed enforcement point.** A "fast path" here
  would be a platform bypass.
- **No ambient credentials.** Credentials come from the profile, scoped to the
  run.
- **No provider or framework names** in a structural position.
- **No agent implementations** — those are
  [`../../../agents/implementations/`](../../../agents/implementations/).

## Boundary rules

- A tool call is a **client** request: authenticated, authorized, and subject to
  safety policy. There is no internal shortcut.
- A tool is available to a run **only** when the execution profile grants its
  capability class. Presence in this package grants nothing.
- Tools must fail closed and must report which control denied.

## Governed by

[`../../README.md`](../../README.md) · ADRs
[0003](../../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0004](../../../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0005](../../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md)

## Validation

`uv run ruff check .`, `uv run mypy`, `uv run pytest`. Future: a check that this
package imports no Home Assistant client and opens no database connection, plus
profile-conformance tests proving an ungranted tool is unreachable.
