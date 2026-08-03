# deploy/traefik/

Local ingress and internal routing configuration for the Pi.

> **Status: no configuration exists.**

## Role

Traefik is the **local L2** for the household path: it terminates the local
ingress and routes to the control-plane services. It is the point where **both**
ingress paths converge — a request from a local client and a request forwarded
from the shared platform edge arrive at the same place and receive the same
enforcement
([`../../docs/architecture/local-remote-routing.md`](../../docs/architecture/local-remote-routing.md)).

## What will belong here

- Static and dynamic Traefik configuration.
- Routing rules from ingress to services.
- TLS configuration for the local path.
- Documentation of which routes exist and why.

## What does not belong here

- **Authentication or authorization logic.** Traefik routes. Identity is L3;
  authorization is L4; enforcement is at L6/L7. A proxy-level auth shortcut would
  be an enforcement point nobody reviewed.
- **Secrets or certificates with real key material.**
- **Kong or shared-edge configuration** — that is `platform-edge`.
- **Service code.**

## Boundary rules

1. **Routing is not authorization.** A reachable route is not a permitted
   action.
2. **Both paths converge and are treated identically.** A rule that applies to
   one path and not the other is a bypass.
3. **Do not trust upstream assertion headers by position.** Headers such as
   `x-platform-edge-*` may be consumed only after origin provenance is validated,
   and that validation belongs at the enforcement point — not here.
4. **Sweep inbound trusted-namespace headers.** A client must not be able to
   forge a header the platform treats as edge-asserted.
5. **The local path must not require the WAN.** Local ingress works with the
   internet down.

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) · ADRs
[0002](../../docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md),
[0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md)

## Validation

Future: configuration linting, a check that no route bypasses the enforcement
point, and a header-spoofing test.
