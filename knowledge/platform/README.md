# knowledge/platform/

**Platform self-description** — what an agent needs to understand about the
system it is running inside.

> **Status: empty.** No bundle exists — the validator must come first.

## What belongs here

- What the platform is, what its components do, and what each is responsible
  for — in agent-readable form.
- **Policies as documentation**: that sensitive actions require authorization and
  safety approval; that a denial is a normal outcome; that an agent proposes and
  does not decide.
- **Limitations**: what the platform cannot do, and what is deliberately not
  automated.
- Ownership and escalation: who is accountable for what.
- Runbooks relevant to agent operation.
- Owner, as-of date, limitations.

## What does not belong here

- **The enforced rules themselves.** Documenting *that* authorization exists is
  knowledge. The authorization model and the safety envelope are enforced
  elsewhere and are **not** agent-readable configuration. An agent that could
  read its own limits as data could reason about circumventing them.
- **Secrets, endpoints, credentials, or internal addresses.**
- **Live platform state** — service health, current runs, queue depth.
- **Authorization tuples.**
- **Architecture documentation for humans** — that is [`../../docs/`](../../docs/).

## The distinction from `docs/`

| `docs/` | here |
|---|---|
| for humans and coding agents | for **household agents at runtime** |
| the full reasoning: ADRs, trade-offs, alternatives | the operational summary an agent needs to behave correctly |
| read by a person deciding what to build | read by a run deciding what to propose |

Do not duplicate `docs/` here. Summarize what an agent must know, and link the
rest.

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) ·
[ADR-0010](../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)

## Validation

Future: `validate` enforces the prohibited-content rules and required metadata.
