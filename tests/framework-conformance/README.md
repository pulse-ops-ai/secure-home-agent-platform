# tests/framework-conformance/

Tests that **every adapter emits an identical event and evidence contract** for
the same logical run.

> **Status: empty.** No adapter exists yet.

## Why this exists

[ADR-0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md)'s
central claim is that the platform's properties belong to the substrate, not to
the runtime. That claim is only true if it is tested. Without these tests,
"framework-neutral" is an aspiration and each adapter quietly emits its own
shape.

## What will be asserted

| Assertion | Why |
|---|---|
| The same logical run through **any** adapter produces the same event sequence | uniform auditability |
| The evidence bundle has the same shape and required fields across adapters | "what did the agent do?" has one answer format |
| An adapter **cannot widen its sandbox** | the substrate owns isolation |
| An adapter **cannot reach around the substrate** for network, filesystem, or secrets | no back doors |
| **Cancellation is effective**, not advisory, for every adapter | a hung run must be killable |
| Failure is reported through the contract, not by crashing the substrate | fault isolation |
| No adapter requires a schema change to be added | the SPI was genuinely neutral |
| A **deterministic (no-model) adapter** satisfies the contract fully | R0 is first-class, not a degraded case |

## What belongs here

- A shared conformance suite every adapter must pass.
- A reference logical run, expressed neutrally.

## What does not belong here

- **Profile grant tests** — [`../profile-conformance/`](../profile-conformance/).
- **Adapter-internal unit tests** — those live with the adapter.
- **Anything requiring a real provider credential or network call.** Adapters are
  exercised against stubs.

## Boundary rules

- **The suite is written once and applied to every adapter.** A per-adapter
  variant defeats the purpose.
- If an adapter cannot pass, the resolution is either the adapter or the SPI —
  never a relaxed test.
- Offline and deterministic.

## Governed by

[`../README.md`](../README.md) · ADRs
[0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md)

## Validation

`uv run pytest tests/framework-conformance`
