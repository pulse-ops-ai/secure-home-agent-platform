# apps/

**Human-facing applications only.** A directory belongs here when a person opens
it ([ADR-0012 §5](../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md),
**`Accepted`** 2026-08-06).

**Deployable backend processes do not belong here** — `control-plane`,
`runner-control`, and workers are [`../services/`](../services/). Putting a
backend process under `apps/` would make "app" mean two different things and
would collide with the rule that no package imports an application.

> **Status: no application exists.** [`web/`](web/) is a documented placeholder —
> deliberately not scaffolded, because the BFF and envelope-issuer boundaries it
> depends on are unresolved.

## What belongs here

Deployable, user-facing applications:

| Path | Status | Purpose |
|---|---|---|
| [`web/`](web/) | placeholder | Household web application: Keycloak authentication, BFF over the tailnet |

## What does not belong here

- **Shared UI components** — no `ui` package exists yet; UI primitives stay in
  the application until a second consumer justifies extracting one.
- **Shared types** — [`../packages/contracts/`](../packages/contracts/).
- **Backend services of any language** — [`../services/`](../services/).
- **Agent implementations** — [`../agents/`](../agents/).
- **Deployment assets** — [`../deploy/`](../deploy/).

## Ownership and boundary rules

1. **The UI is never an enforcement point.** Hiding a control is not
   authorization. Every action is authorized server-side, whatever the UI
   renders.
2. **Applications are clients**, subject to the same identity and authorization
   path as any other caller — including agents.
3. **Both ingress paths converge on the same enforcement point.** An application
   reached from inside the house and one reached from outside must receive the
   same decisions
   ([`../docs/architecture/local-remote-routing.md`](../docs/architecture/local-remote-routing.md)).
4. **Degraded state must be visible.** An application must be able to show that
   the platform is degraded and why. Silent degradation is prohibited
   ([ADR-0009](../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)).
5. **No secrets in client code.** No tokens, keys, or endpoints that assume a
   trusted network position.

## Workspace

Applications join the `pnpm` workspace via the `apps/*` glob in
[`../pnpm-workspace.yaml`](../pnpm-workspace.yaml). A directory without a
`package.json` — like `web/` today — is simply not a member yet.

## Governed by

[`../AGENTS.md`](../AGENTS.md) → [`../docs/decisions/INDEX.md`](../docs/decisions/INDEX.md).

## Validation

```sh
pnpm install --frozen-lockfile
pnpm run deps:check && pnpm run format:check
pnpm run check:workspace && pnpm run check:imports
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
