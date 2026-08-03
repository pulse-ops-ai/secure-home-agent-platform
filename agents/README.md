# agents/

**Household agents** — the domain code that observes and acts on the house, and
the adapters that let it run on different runtimes.

> **This is not about coding agents.** Claude Code, Copilot CLI, and Codex
> *operate on* this repository; that is governed by [`../AGENTS.md`](../AGENTS.md).
> This directory is about agents that are *part of the product*. The distinction
> matters: conflating them is how a coding-agent convenience becomes a household
> security hole.

> **Status: no implementation and no adapter.** Every directory here is a
> documented placeholder.

## Layout

| Path | Contains |
|---|---|
| [`implementations/`](implementations/) | domain code — a climate observer, a security reviewer |
| [`adapters/coding/`](adapters/coding/) | shims for coding-agent CLIs: Claude Code, Copilot CLI, Codex |
| [`adapters/frameworks/`](adapters/frameworks/) | shims for agent frameworks: custom loop, PydanticAI, LangGraph |

## The separation that matters

Per [ADR-0006](../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md):

| Concept | Where | Carries authority? |
|---|---|---|
| **implementation** | here | **no** |
| **adapter** | here | **no** |
| **execution profile** | [`../profiles/`](../profiles/) | **yes** |
| **run** | runtime | inherits from the profile |
| **automation** | [`../services/automation-service/`](../services/automation-service/) | **yes, separately** |

**Nothing in this directory grants authority.** Merging an implementation grants
nothing. Adding an adapter grants nothing. Authority is granted by a reviewed
profile, and only there. This is what makes agent authority reviewable without
reading agent code.

## What belongs here

- Agent domain logic — what to observe, what to conclude, what to propose.
- Adapters that translate a run request into a concrete runtime and translate
  its output back into the platform event and evidence contract.

## What does not belong here

- **Credentials.** Never. Credentials come from the profile, scoped to the run.
- **Home Assistant clients.** Only
  [`../services/action-gateway/`](../services/action-gateway/).
- **Database connections.** No runner has one.
- **Platform services** — [`../services/`](../services/).
- **Profiles** — [`../profiles/`](../profiles/). Do not put capability grants in
  agent code.
- **Safety rules.** An agent proposes; it does not set its own bounds
  ([ADR-0005](../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md)).
- **Anything that bypasses the governed enforcement point.**

## Boundary rules

1. **Agents are clients.** A run authenticates as an agent principal, is
   authorized, and passes safety policy — exactly like a browser
   ([ADR-0004](../docs/decisions/ADR-0004-treat-agents-as-clients.md)).
2. **`sub` and `actor` are distinguishable.** An agent never gains authority its
   actor lacks. An autonomous run has **no** `actor`, explicitly.
3. **The sandbox is untrusted**, even on the Pi.
4. **An adapter cannot widen its own sandbox.** A runtime needing more requires a
   reviewed profile change, never a workaround.
5. **Every adapter emits the same event and evidence contract.**
6. **Tools are the only way to act** —
   [`../packages/python/tools/`](../packages/python/tools/) — and every tool
   re-enters through a governed enforcement point.

## Governed by

[`../AGENTS.md`](../AGENTS.md) → [`AGENTS.md`](AGENTS.md) · ADRs
[0003](../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0004](../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0006](../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md),
[0011](../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)

## Validation

Python members participate in the `uv` workspace. Future:
[`../tests/framework-conformance/`](../tests/framework-conformance/) asserts
every adapter emits an identical contract for the same logical run.
