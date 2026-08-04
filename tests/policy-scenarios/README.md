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

### Approval binding ([ADR-0008 §3](../../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md))

- A substituted `resource_id` produces a **binding failure**, not an actuation.
- A substituted `action_type` — swapping `close` for `open` — produces a binding
  failure.
- An altered parameter (setpoint, duration) produces a binding failure.
- An expired `authz_decision_exp` inside an unexpired envelope is refused.
- A superseded `policy_model_version` is refused.
- A binding failure is audited as its **own** outcome, distinct from a denial.
- Canonicalization: semantically identical actions produce identical digests;
  near-identical actions do not collide.

### Action lifecycle

- A dispatch timeout yields `indeterminate`, never a fabricated success or
  failure.
- A retry with the same idempotency key does not actuate twice.
- No automatic inverse command is emitted on a partial action.
- Every terminal state, including `indeterminate`, is audited.

### Safety policy ([ADR-0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md))

- Authorized but **out of envelope** is denied.
- Unauthorized and in envelope is denied **at authorization**, before policy —
  so bounds are not leaked.
- A safety denial applies to an **administrator** too.
- Safety policy evaluates correctly with the authorization system unreachable.
- The deterministic path contains **no model call**.

### Degraded mode ([ADR-0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md))

**Every cell** of the (operation × requester) table in
[`degraded-mode.md`](../../docs/architecture/degraded-mode.md), for each outage
mode — WAN down, shared edge down, authorization unreachable, identity provider
unreachable, VPS down. Specifically:

- **Unlock, open garage, disable alarm → refused for every requester**, including
  a predeclared automation. No outage grants physical access.
- **Interactive lock / close / arm → refused today** (BOUNDED behaves as FAIL
  CLOSED), while the **equivalent predeclared automation proceeds**. This pair is
  the load-bearing test for the requester axis.
- Reads of local non-sensitive state and lights → continue.
- Smoke/CO, leak shutoff, emergency egress → continue with everything else down,
  and **only** from a life-safety trigger — never from a request.
- No ordinary operation can be reclassified into `EMERGENCY`.
- A predeclared automation cannot widen its scope while degraded, and an expired
  one does not fire.
- Camera, presence, and access-history reads → refused.
- An **unclassified (operation, requester) combination** → refused.
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
