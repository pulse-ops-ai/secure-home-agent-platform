# agents/adapters/coding/codex

Adapter for **Codex**, in the **coding** runner class.

> **Status: not implemented.** This directory holds only this README. No adapter
> code, no CLI, no credentials.

## Scope

Wraps Codex so a coding run can be launched from an execution profile and
produce the platform's standard event and evidence contract.

Paired derived image: `secure-home-runner-codex` — the base runner plus this one
agent, pinned ([ADR-0011](../../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)).

## What belongs here

- Invocation mapping: run request → invocation.
- Output mapping: output → the shared event and evidence contract.
- Cancellation and failure handling specific to this runtime.
- Notes on what it cannot express through the neutral contract.

## What does not belong here

- **Credentials or API keys.** Provisioned by the substrate from the profile.
- **Model identifiers.** A profile field, not an adapter constant.
- **Sandbox construction, mounts, network policy, limits.**
- **The image definition** — [`../../../../deploy/images/`](../../../../deploy/images/).
- **Household device access.** A coding runner has none, ever.

## Boundary rules

- Cannot widen its sandbox; cannot reach around the substrate.
- Emits exactly the same contract as every other adapter.
- Is an **adapter, not a platform identity**.
- Coding runs are not on the household control path.

## Governed by

[`../../README.md`](../../README.md) → [`../../../AGENTS.md`](../../../AGENTS.md) ·
ADRs
[0003](../../../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0011](../../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)

## Validation

Future: framework-conformance coverage, and a check that a run using this image
cannot reach another provider's credential.
