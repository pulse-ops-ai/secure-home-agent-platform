# packages/typescript/ui

Shared UI primitives for the applications in [`../../../apps/`](../../../apps/).

> **Status: no implementation.** A private workspace member with a manifest and a
> `check` script. No components, no React, no dependencies — deliberately, since
> no application exists yet.

## Future ownership

Presentational primitives shared across household-facing surfaces, plus the
components that make platform state legible:

- **degraded-state indicators** — the platform must never degrade silently
  ([`../../../docs/architecture/degraded-mode.md`](../../../docs/architecture/degraded-mode.md));
- **denial explanations** — a refusal must say which control denied and why;
- **sensitivity affordances** — a lock or garage control must not look like a
  light switch.

## What belongs here

- Presentational components used by **more than one** application.
- Design tokens and layout primitives.
- Accessible form and control primitives.

## What does not belong here

- **Application routing, pages, or data fetching** — those are
  [`../../../apps/web/`](../../../apps/web/).
- **Types and contracts** — those are [`../contracts/`](../contracts/).
- **Business logic or authorization decisions.** A component may *render* a
  decision; it never *makes* one.
- **Anything used by exactly one application.** Keep it in that application
  until a second consumer exists.
- **Secrets, endpoints, or environment-specific values.**

## Boundary rules

- **The UI is never an enforcement point.** Hiding a control is not authorization.
  Every action is authorized server-side regardless of what the UI shows.
- Components must be able to render a degraded state — not just a happy path.
- Private package: never published.
- No dependencies without a reviewed decision. React arrives with the first
  application, not before.

## Governed by

[`../../README.md`](../../README.md) · ADRs
[0005](../../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md),
[0009](../../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Validation

```sh
pnpm --filter @secure-home/ui run check
```

Future: type checking, component tests, and accessibility checks.
