# agents/adapters/frameworks/langgraph

Adapter for **LangGraph**, in the **household** runner class.

> **Status: not implemented.** This directory holds only this README. LangGraph
> is **not** a dependency of this repository and must not be added until an
> accepted task contract authorizes it.

## Scope

Wraps LangGraph so a household agent built on it can be launched from an
execution profile and produce the platform's standard event and evidence
contract.

Paired derived image: `secure-home-runner-langgraph` — the base runner plus this
one framework, pinned.

## What belongs here

- Invocation mapping: run request → graph invocation.
- Output mapping: graph execution → the shared event and evidence contract,
  including node transitions and tool calls.
- Cancellation and failure handling — graph execution may be long-running, so
  cancellation must be **effective**, not advisory.
- Notes on what the framework cannot express through the neutral contract.

## What does not belong here

- **Credentials or API keys.** Provisioned by the substrate from the profile.
- **Model identifiers.** A profile field, not an adapter constant.
- **Sandbox construction, mounts, network policy, limits.**
- **Agent logic** — [`../../../implementations/`](../../../implementations/).
- **Tool definitions** — the governed tool-surface package (not yet created).
- **Graph state persistence outside the run's evidence contract.** Hidden
  durable state would escape the run record.

## Boundary rules

- Cannot widen its sandbox; cannot reach around the substrate.
- **Framework tool calls are platform tool calls** and re-enter through a
  governed enforcement point.
- Model access is bounded by the profile's routing class.
- Long-running graphs are still bound by the profile's wall-clock limit; there is
  no unbounded run.
- Emits exactly the same contract as every other adapter.

## Governed by

[`../../README.md`](../../README.md) → [`../../../AGENTS.md`](../../../AGENTS.md) ·
ADRs
[0003](../../../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0004](../../../../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0007](../../../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md)

## Validation

Future: framework-conformance coverage, cancellation-effectiveness tests, and a
check that no framework-native tool bypasses the governed tool surface.
