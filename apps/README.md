# apps/

User-facing applications. TypeScript, `pnpm` workspace members.

> **Status: no application exists.** [`web/`](web/) is a documented placeholder —
> deliberately not scaffolded, because the BFF and envelope-issuer boundaries it
> depends on are unresolved.

## What belongs here

Deployable, user-facing applications:

| Path | Status | Purpose |
|---|---|---|
| [`web/`](web/) | placeholder | Household web application: Keycloak authentication, BFF over the tailnet |

## What does not belong here

- **Shared UI components** — [`../packages/typescript/ui/`](../packages/typescript/ui/).
- **Shared types** — [`../packages/typescript/contracts/`](../packages/typescript/contracts/).
- **Python services** — [`../services/`](../services/).
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
pnpm install --lockfile-only
pnpm -r --if-present run check
```
