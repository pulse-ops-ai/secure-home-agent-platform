# deploy/compose/

Docker Compose definitions for the Pi control plane.

> **Status: no Compose file exists.** Nothing is defined and nothing is running.

## What will belong here

- Compose files for the control-plane services in
  [`../../services/`](../../services/).
- A Compose definition for Home Assistant Container, once
  [ADR-0002](../../docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md)
  is accepted and [U10](../../docs/architecture/unresolved-decisions.md#u10) is
  answered.
- Network topology documentation: which service reaches which, and why.
- Resource limits per service.
- Obviously-fake example environment files.

## What does not belong here

- **Secrets.** No `.env` with real values, no tokens, no keys.
- **Anything for the shared platform edge.** That is `platform-edge`.
- **Kubernetes manifests.**
- **Service code** — [`../../services/`](../../services/).
- **Image definitions** — [`../images/`](../images/).

## Boundary rules

1. **Network topology is reachability, not trust.** Every service verifies the
   internal identity envelope regardless of which network it is on. Do not
   describe a Compose network as a security control.
2. **The runner sandbox is isolated** from control-plane services by network
   policy — and is still treated as untrusted even so.
3. **Publish nothing beyond its intended interface.** Default to internal-only;
   the local ingress is the entry point.
4. **Resource limits are required.** The Pi has 8 GB shared between the household
   control path and runners. An unbounded container is a hazard to household
   operation.
5. **Local operation must survive** the loss of the WAN, the shared edge, the
   VPS, and the Exxact workstation. A dependency that breaks this is wrong.
6. **Restart policy must not mask failure.** A crash-looping service must be
   visible, since silent degradation is prohibited
   ([ADR-0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)).

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) ·
[ADR-0002](../../docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md)

## Validation

Future: `docker compose config` linting, a check that no secret is present, a
check that no unintended port is published, and a check that every service
declares limits.
