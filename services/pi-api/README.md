# services/pi-api

The household read and command surface, and the **governed enforcement point**
that every client re-enters through — browser, Home Assistant Voice, and agent
runner alike.

> **Status: not implemented.** A workspace member with a manifest and a
> placeholder package. No endpoints, no dependencies, no runtime.

## Future ownership

- The household API: read household state, request household actions.
- Enforcement: verify the caller's token locally, resolve `sub` and `actor`,
  consult the policy decision point, and hand the request onward carrying the
  internal identity envelope.
- The single convergence point for both ingress paths, so local and remote
  receive identical decisions.
- Emission of the request-level audit record.

Whether this service is the L6 envelope **issuer** or an L7 **verifier** behind a
separate issuer is [U3](../../docs/architecture/unresolved-decisions.md#u3) —
unresolved.

## What belongs here

- HTTP surface definitions and their request/response contracts.
- Token verification and principal resolution.
- Calls to the policy decision point — `(principal, actor, action, resource,
  context)` only.
- Orchestration of `policy-engine` and `action-gateway`.
- Request audit emission.

## What does not belong here

- **Home Assistant clients or credentials.** Only
  [`../action-gateway/`](../action-gateway/).
- **Safety-policy rules.** Only [`../policy-engine/`](../policy-engine/).
- **Direct device access** of any kind.
- **Agent implementations.** Agents are clients of this service.
- **Business logic that belongs in a shared package** —
  [`../../packages/python/`](../../packages/python/).

## Boundary rules

- Verifies the token **itself**. It does not accept an upstream assertion as
  proof; `x-platform-edge-*` style headers may be consumed only after origin
  provenance is validated.
- Never passes a request body or device command to the policy decision point.
- Calls `policy-engine` **after** authorization succeeds, never before.
- Sensitive actions fail closed when authorization is undecidable.
- Must not require the WAN, the shared edge, the VPS, or the Exxact workstation
  to serve the local path.

## Governed by

[`../AGENTS.md`](../AGENTS.md) · ADRs
[0002](../../docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md),
[0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md),
[0008](../../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md),
[0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Validation

`uv run ruff check .`, `uv run mypy`, `uv run pytest`. Future: envelope
verification conformance, path-equivalence tests, degraded-mode scenarios.
