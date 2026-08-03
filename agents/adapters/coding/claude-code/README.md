# agents/adapters/coding/claude-code

Adapter for the **Claude Code** CLI, in the **coding** runner class.

> **Status: not implemented.** This directory holds only this README. No adapter
> code, no CLI, no credentials.

## Scope

Wraps the Claude Code CLI so a coding run can be launched from an execution
profile and produce the platform's standard event and evidence contract.

Paired derived image: `secure-home-runner-claude` — the base runner plus this one
CLI, pinned ([ADR-0011](../../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)).

## What belongs here

- Invocation mapping: run request → CLI invocation.
- Output mapping: CLI output → the shared event and evidence contract.
- Cancellation and failure handling specific to this CLI.
- Notes on what this CLI cannot express through the neutral contract.

## What does not belong here

- **Credentials or API keys.** Provisioned by the substrate from the profile.
- **Model identifiers.** Those are a profile field, not an adapter constant.
- **Sandbox construction, mounts, network policy, limits.**
- **The image definition** — [`../../../../deploy/images/`](../../../../deploy/images/).
- **Household device access.** A coding runner has none, ever.

## Boundary rules

- Cannot widen its sandbox; cannot reach around the substrate.
- Emits exactly the same contract as every other adapter.
- Is an **adapter, not a platform identity**. "Claude" appears here and as an
  opaque profile value — never in a schema's structure.
- Coding runs are not on the household control path; their unavailability must
  never affect the house.

## Governed by

[`../../README.md`](../../README.md) → [`../../../AGENTS.md`](../../../AGENTS.md) ·
ADRs
[0003](../../../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0011](../../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)

## Validation

Future: framework-conformance coverage, and a check that a run using this image
cannot reach another provider's credential.
