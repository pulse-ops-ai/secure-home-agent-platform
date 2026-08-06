# agents/adapters/frameworks/custom-loop

Adapter for a **plain deterministic loop** — a household agent with **no model
in the path**.

> **Status: not implemented.** This directory holds only this README.

## Why this adapter matters most

This is the adapter that keeps
"sensitive home actions must not depend on unbounded LLM discretion" achievable.
An agent that observes state, applies declared rules, and proposes an action is a
**routing class R0** component
([ADR-0007](../../../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md)):
deterministic, offline-capable, and reviewable.

It is also the right adapter to design the SPI against. If the interface fits a
plain loop **and** a coding CLI, it is genuinely neutral. If it only fits
model-driven runtimes, it was a framework interface wearing a neutral name.

## Scope

- Invocation mapping for a deterministic Python entry point.
- Output mapping to the shared event and evidence contract.
- Cancellation and failure handling.
- **No model client. No inference. No provider SDK.**

## What belongs here

- The deterministic run harness and its lifecycle handling.
- Structured result mapping.

## What does not belong here

- **Any model or inference client.** That is the entire point of this adapter.
- **Credentials.** Provisioned by the substrate from the profile.
- **Sandbox construction, mounts, network policy, limits.**
- **Agent logic** — [`../../../implementations/`](../../../implementations/).
- **Safety rules** — [`../../../../services/control-plane/`](../../../../services/control-plane/).

## Boundary rules

- An R0 profile using this adapter is launched with **no model egress at all**,
  enforced by the substrate rather than by convention.
- Cannot widen its sandbox; cannot reach around the substrate.
- Emits exactly the same contract as every other adapter.
- Still a client: authenticated, authorized, and subject to safety policy.

## Governed by

[`../../README.md`](../../README.md) → [`../../../AGENTS.md`](../../../AGENTS.md) ·
ADRs
[0003](../../../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0005](../../../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md),
[0007](../../../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md)

## Validation

Future: framework-conformance coverage, plus a check that an R0 profile using
this adapter cannot reach a model endpoint.
