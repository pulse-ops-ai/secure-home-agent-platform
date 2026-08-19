# knowledge/platform/

**Platform self-description** — what an agent needs to understand about the
system it is running inside.

> **Status: some modules here are authored and `Validated` at `1.0.0`,** each
> against its own human-reviewed bytes; the rest are `Planned` and
> specification-only. [`../INDEX.md`](../INDEX.md) and
> [`../catalog.json`](../catalog.json) carry the per-module rows.

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

## Planned bundle: developer-platform conventions

[ADR-0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)
(**`Accepted`** 2026-08-06) specifies a governed bundle so that agents adding API surface
follow the contract-first rules rather than rediscovering them. Content:

- contract-first conventions and the one-authored-source rule;
- thin-controller rules and the prohibition on duplicate DTO classes;
- Zod `.meta()` rules and which features are publishable;
- the OpenAPI normalization pipeline and its CI gates;
- projection configurations and query-AST conventions;
- response envelopes, pagination, and count modes;
- error and problem-details conventions;
- the operation catalog and MCP exposure rules;
- logging, request context, and audit rules.

Matching skills: **add Zod contract · add API operation · add list route · add
projection config · add metadata resource · add MCP tool · add audit event · add
persistence model.**

**Gated on the OKF validator** ([U7](../../docs/architecture/unresolved-decisions.md#u7)).
Generated API and operation reference comes from code and the normalized OpenAPI
document — **never** hand-maintained Markdown.

This bundle describes *how to build*; it is not agent-readable runtime
configuration and confers no authority.

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) · ADRs
[0010](../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md),
[0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

Future: `validate` enforces the prohibited-content rules and required metadata.
