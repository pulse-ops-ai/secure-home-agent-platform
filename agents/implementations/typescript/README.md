# agents/implementations/typescript/

TypeScript household agent implementations.

> **Status: empty.** No agent exists. This directory holds only this README.

## When TypeScript rather than Python

Prefer Python for household agents — the control plane, the tool surface, and the
runner substrate are Python, so a Python agent shares contracts directly. Choose
TypeScript when an agent is genuinely tied to the web surface, or when a
required runtime exists only in the Node ecosystem. Record the reason in the
agent's README; "the author preferred it" is not a reason to split the platform's
tooling.

## What belongs here

One directory per agent, each a `pnpm` workspace member with its own
`package.json` and `README.md`, stating what it observes, what it proposes, its
routing class, and the capability classes its profile must grant.

## What does not belong here

- **Capability grants** — [`../../../profiles/`](../../../profiles/).
- **Credentials, Home Assistant clients, database connections.**
- **Adapters** — [`../../adapters/`](../../adapters/).
- **Shared libraries** — [`../../../packages/`](../../../packages/).
- **Applications** — [`../../../apps/`](../../../apps/).

## Boundary rules

Identical to the Python side: untrusted sandbox, re-entry as a client, governed
tool surface only, denial is a normal outcome, and an implementation grants no
authority.

## Governed by

[`../README.md`](../README.md) → [`../../AGENTS.md`](../../AGENTS.md)

## Validation

`pnpm install --lockfile-only`, `pnpm -r --if-present run check`.
