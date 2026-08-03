# apps/web

The household web application.

> **Status: intentionally not scaffolded.** This directory contains only this
> README. There is no `package.json`, so it is not yet a `pnpm` workspace member.

## Why it is not scaffolded yet

Scaffolding a Next.js application now would bake in decisions that are still
open — most importantly **which service is the L6 envelope issuer**
([U3](../../docs/architecture/unresolved-decisions.md#u3)). The application's BFF
is a candidate for that role, so its shape depends on an answer that does not
exist. Generating a framework skeleton first would make that decision by
accident.

## Planned shape

- **Next.js**, authenticating against **Keycloak**.
- A **BFF** reaching the Pi API over the tailnet via Traefik.
- Reachable on both ingress paths: locally when in-home, through the shared
  platform edge when remote — receiving **identical decisions** on both.
- Explicit **degraded-state** presentation.

## What will belong here

- Routes, pages, and layouts.
- The BFF: session handling, token exchange, calls to the household API.
- Application-specific components.

## What will not belong here

- **Shared UI primitives** — [`../../packages/typescript/ui/`](../../packages/typescript/ui/).
- **Shared types** — [`../../packages/typescript/contracts/`](../../packages/typescript/contracts/).
- **Authorization decisions.** The UI renders decisions; it never makes them.
- **Home Assistant access.** Only
  [`../../services/action-gateway/`](../../services/action-gateway/).
- **Secrets in client code.**

## Boundary rules

- **Hiding a control is not authorization.** Every action is authorized
  server-side.
- If the BFF becomes the L6 envelope issuer, it holds a signing key and becomes
  a high-value target — that must be a deliberate, reviewed decision, not a
  side effect of where the code happened to go.
- **Degraded state must be visible**, with the unavailable dependency named
  ([ADR-0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)).
- Sensitive controls must be visually distinct from routine ones.

## Blocked on

- [U3](../../docs/architecture/unresolved-decisions.md#u3) — which service issues
  the L6 envelope.
- Acceptance of [ADR-0002](../../docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md).

## Governed by

[`../README.md`](../README.md) → [`../../AGENTS.md`](../../AGENTS.md).

## Validation

Once a manifest exists: `pnpm --filter <name> run check`, then build and type
checks.
