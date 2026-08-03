# agents/implementations/

Household agent **domain code** — what an agent observes, concludes, and
proposes.

> **Status: no implementation.** Both language directories are placeholders.

## Layout

| Path | Language |
|---|---|
| [`python/`](python/) | Python — participates in the `uv` workspace |
| [`typescript/`](typescript/) | TypeScript — participates in the `pnpm` workspace |

## Candidate agents

Illustrative, not committed:

| Agent | Would do | Likely routing class |
|---|---|---|
| climate observer | watch comfort and equipment behaviour; propose setpoint changes within the declared envelope | R0/R1 |
| energy planner | use Gridwise signals to propose shifting load | R1/R2 |
| security reviewer | review household configuration and access grants; report | R0/R2 |
| home-state summarizer | produce a readable digest of household state | R1 |

## What belongs here

- Domain logic: observation, reasoning, and **proposals**.
- Agent-specific data shaping and prompt construction, where a model is used.

## What does not belong here

- **Capability grants.** Those are [`../../profiles/`](../../profiles/). An
  implementation carries no authority.
- **Credentials**, **Home Assistant clients**, or **database connections**.
- **Adapters** — [`../adapters/`](../adapters/).
- **Safety rules.** An agent proposes; the envelope is declared elsewhere and is
  not agent-editable
  ([ADR-0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md)).
- **Direct calls that bypass the governed enforcement point.** Acting happens
  through [`../../packages/python/tools/`](../../packages/python/tools/).

## Boundary rules

- An implementation runs inside an **untrusted sandbox** and re-enters the
  platform as a client.
- It may use only the tools its execution profile grants. Importing a tool grants
  nothing.
- It must behave correctly when a tool call is **denied** — denial is a normal
  outcome, not an error to route around.
- A sensitive proposal is subject to authorization **and** safety policy. An
  agent must never assume its proposal will be accepted.

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) · ADRs
[0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md),
[0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md)

## Validation

Python: the standard `uv` checks. TypeScript: the standard `pnpm` checks.
Future: per-agent behavioural tests including the denied-tool path.
