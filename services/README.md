# services/

The Pi-hosted control plane. These are the **L6 and L7** components this
repository owns
([ADR-0002](../docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md)).

> **Status: no service is implemented.** Each directory is a Python workspace
> member with a manifest, a placeholder package, and a README describing future
> ownership. There is no runtime, no endpoint, and no dependency.

## What belongs here

Long-running Python services that run on the Raspberry Pi and participate in the
governed request path:

| Service | Layer | Owns |
|---|---|---|
| [`pi-api/`](pi-api/) | L6/L7 | The household read and command surface. The governed enforcement point agents and clients re-enter through. |
| [`runner-control/`](runner-control/) | control plane | The runner substrate: profile loading, sandbox construction, run lifecycle, evidence capture. |
| [`policy-engine/`](policy-engine/) | L7 | Deterministic operational and safety policy. Numeric, temporal, and physical constraints. **No model in this path.** |
| [`action-gateway/`](action-gateway/) | L7 | The **only** component that talks to Home Assistant and the **only** holder of its credentials. |
| [`automation-service/`](automation-service/) | L7 | Persisted automations: trigger, condition, policy scope, resource scope, expiration, profile-version binding. |

## What does not belong here

- **Shared libraries** — those are [`../packages/python/`](../packages/python/).
  A service is deployed; a package is imported.
- **Agent implementations** — those are
  [`../agents/implementations/`](../agents/implementations/). A service is
  platform infrastructure; an agent is a client of it.
- **TypeScript** — those are [`../apps/`](../apps/) and
  [`../packages/typescript/`](../packages/typescript/).
- **Deployment assets** — Compose files, images, and proxy configuration are
  [`../deploy/`](../deploy/). A service defines what it *is*, not how it is run.
- **Anything belonging to the shared edge.** L1–L5 for the remote path are owned
  by `platform-edge`, a separate repository.
- **A second component that holds Home Assistant credentials.** There is exactly
  one, and it is `action-gateway`.

## Ownership and boundary rules

1. **Every service verifies the internal identity envelope.** Sharing a Docker
   network on the Pi conveys nothing. A service that trusts a caller because of
   its network position is a defect.
   ([`../docs/architecture/trust-boundaries.md`](../docs/architecture/trust-boundaries.md))
2. **Only `action-gateway` touches Home Assistant.** No other service, and no
   runner, holds a Home Assistant credential.
   ([ADR-0004](../docs/decisions/ADR-0004-treat-agents-as-clients.md))
3. **Only L6 mints the envelope; L7 verifies it.** Which service is L6 is
   [U3](../docs/architecture/unresolved-decisions.md#u3) — unresolved.
4. **Authorization then safety policy, in that order.** Safety policy must be
   able to constrain an authorized principal, and must not leak resource bounds
   to an unauthorized one.
   ([ADR-0005](../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md))
5. **The policy decision point is not a proxy.** No request body, household
   payload, or device command is passed to it.
   ([ADR-0008](../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md))
6. **The approval is bound to the action, and the binding is verified before
   dispatch.** A bare decision reference is a bearer credential. `action-gateway`
   recomputes the request digest against the action it is about to perform; a
   mismatch is a **binding failure**, audited separately from an ordinary denial.
   ([ADR-0008 §3](../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md))
7. **Physical actions are observable, not atomic.** No service may promise a
   transaction boundary across a device. `indeterminate` is a real outcome.
8. **Sensitive actions fail closed.** An undecidable authorization is never a
   permit.
   ([ADR-0009](../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md))
9. **Local and remote paths get the same decisions.** A control added to one and
   not the other is a bypass.
10. **Services must not depend on the WAN, the shared edge, the VPS, or the
   Exxact workstation** for household operation.

## Governed by

[`../AGENTS.md`](../AGENTS.md) → [`AGENTS.md`](AGENTS.md) →
[`../docs/decisions/INDEX.md`](../docs/decisions/INDEX.md).

Applicable ADRs: 0002, 0004, 0005, 0008, 0009.

## Workspace

Every directory here is a `uv` workspace member declared in the root
[`pyproject.toml`](../pyproject.toml). Adding a service means adding the
directory with a valid `pyproject.toml` — the glob picks it up.

## Validation

```sh
uv sync --all-packages
uv run ruff check . && uv run ruff format --check .
uv run mypy
uv run pytest
```

Future, once services exist: per-service contract tests, envelope-verification
conformance, path-equivalence tests
([`../tests/policy-scenarios/`](../tests/policy-scenarios/)), and degraded-mode
scenario tests.
