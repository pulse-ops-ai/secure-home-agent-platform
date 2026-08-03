# profiles/coding/

Execution profiles for the **coding runner class** — runs that operate on
repositories and documents.

> **Status: empty.** No profile exists. This directory holds only this README.

## What a coding profile grants

| Concern | Typical grant |
|---|---|
| tool surface | source control, filesystem within the workspace, build and test |
| filesystem | the repository working copy, explicit read/write posture |
| network | source control and, for R3, a model provider |
| routing class | usually **R3** — coding work benefits from frontier models |
| image | one derived coding image: `secure-home-runner-{claude,copilot,codex}` |
| limits | bounded wall clock, memory, output size |

## The rule that defines this class

**A coding profile has no household device access. None.**

No household tools, no reachability to the household API, no path to
[`../../services/action-gateway/`](../../services/action-gateway/), no Home
Assistant. This is enforced by the tool surface and the network policy, not by
convention.

A coding run is the run most likely to process untrusted content — issue text,
dependency documentation, web results. Giving it a path to a door lock would be
indefensible.

## What belongs here

- Versioned profiles for coding runs, one per purpose and provider combination.
- Notes on why each grant is present.

## What does not belong here

- **Household profiles** — [`../household/`](../household/).
- **Credentials.** A profile names one; it never contains one.
- **Adapter or agent code** — [`../../agents/`](../../agents/).

## Boundary rules

- Least privilege: repository scope only.
- R3 profiles declare which data categories may leave the house. Repository
  content **is** data leaving the house — say so.
- Images are digest-pinned and contain exactly one coding agent.
- Coding runs are **not** on the household control path. Their unavailability
  must never affect the house.

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) · ADRs
[0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0007](../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md),
[0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)

## Validation

Future: schema validation, plus a conformance test asserting that no coding
profile can reach a household tool or the household API.
