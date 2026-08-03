# tests/policy-scenarios/

Scenario tests for **authorization, deterministic safety policy, degraded mode,
and path equivalence** — the household security properties.

> **Status: empty.** No authorization model, no policy engine, and no services
> exist yet.
> **These are the most important tests this repository will ever have.**

## What will be asserted

### Authorization ([ADR-0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md), [ADR-0008](../../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md))

- An agent **without** delegation is denied.
- An agent **with** delegation but whose actor lacks the permission is denied.
- An agent never gains authority its actor lacks.
- An autonomous run on a sensitive action is denied.
- Area inheritance and guest-scope expiry behave as modelled.
- Audit records carry **both** `sub` and `actor`.
- **No request body or device command is ever passed to the decision point.**

### Safety policy ([ADR-0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md))

- Authorized but **out of envelope** is denied.
- Unauthorized and in envelope is denied **at authorization**, before policy —
  so bounds are not leaked.
- A safety denial applies to an **administrator** too.
- Safety policy evaluates correctly with the authorization system unreachable.
- The deterministic path contains **no model call**.

### Degraded mode ([ADR-0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md))

Every row of
[`degraded-mode.md`](../../docs/architecture/degraded-mode.md), for each outage
mode — WAN down, shared edge down, authorization unreachable, identity provider
unreachable, VPS down. Specifically:

- **Unlock, open garage, disable alarm → refused.** No outage grants physical
  access.
- Lock, close garage, arm alarm, turn off a light → continue.
- Smoke/CO and leak automations → continue with everything else down.
- Camera, presence, and access-history reads → refused.
- An **unclassified** capability → refused.
- Every refusal **names the unavailable dependency**.
- Audit that cannot be buffered blocks the sensitive action.

### Path equivalence ([ADR-0002](../../docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md))

- For a representative action set, the local and remote paths reach the **same**
  decision — including the denials.
- The local path does not skip authorization.
- Network position never grants authority.

## What does not belong here

- **Profile grant tests** — [`../profile-conformance/`](../profile-conformance/).
- **Adapter contract tests** — [`../framework-conformance/`](../framework-conformance/).
- **Anything requiring live infrastructure**: no real Home Assistant, no deployed
  OpenFGA, no VPS. Scenarios run against test doubles, offline.

## Boundary rules

- **Denial is the assertion.** A suite that only proves permission proves nothing
  about a security control.
- **Deterministic.** A flaky security test gets disabled, and a disabled security
  test is worse than none.
- Fixtures contain no real household data, device identifiers, or credentials.

## Governed by

[`../README.md`](../README.md) · ADRs
[0002](../../docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md),
[0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md),
[0008](../../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md),
[0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Validation

`uv run pytest tests/policy-scenarios`
