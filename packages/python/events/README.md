# packages/python/events

The **run event and evidence contract** — the uniform record of what a run did,
identical across every adapter.

> **Status: no implementation.** A placeholder package with a docstring.

## Why uniformity matters

[ADR-0003](../../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md)
requires that every adapter — Claude Code, Copilot CLI, Codex, PydanticAI,
LangGraph, a custom loop — emits the **same** event and evidence contract for the
same logical run. Without that, "what did the agent do?" has a different answer
format per framework and cannot be reviewed as one thing.

## Future ownership

- The event vocabulary: run start, capability grant, attempted call and its
  disposition, adapter lifecycle transitions, termination reason.
- The evidence-bundle shape: profile version, image digest, principals (`sub`,
  and `actor` or an explicit autonomous marker), granted capabilities, calls
  attempted / permitted / denied, outputs, outcome, timing.
- Emission helpers and correlation-identifier handling.

## What belongs here

- Event and evidence type definitions and their emission helpers.
- Correlation-identifier propagation.
- Redaction rules — evidence must not capture secrets or sensitive household
  payloads verbatim.

## What does not belong here

- **Transport or storage.** This package defines the contract, not where records
  go.
- **Provider or framework names** in a structural position.
- **Audit for authorization decisions** — that is a service concern, not a run
  concern.
- **Anything that makes evidence optional.** A run without evidence is not a
  valid run.

## Boundary rules

- The contract is adapter-independent. If a field only makes sense for one
  runtime, it does not belong in the shared contract.
- Evidence must be sufficient to answer "what was this run allowed to do, and
  what did it do?" without reading agent code.
- Redaction is part of the contract, not an afterthought.

## Governed by

[`../../README.md`](../../README.md) · ADRs
[0003](../../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0006](../../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md)

## Validation

`uv run ruff check .`, `uv run mypy`, `uv run pytest`. Future:
[`../../../tests/framework-conformance/`](../../../tests/framework-conformance/)
asserts every adapter emits this contract identically.
