# schemas/action/

The canonical schema for a **household action** — a request to change something
physical.

> **Status: not defined.**

## Why this schema is load-bearing

Deterministic safety policy can only evaluate what the action carries. If the
action does not include the parameters, the target, and the context, the policy
engine cannot decide whether the action is within the envelope — and the
separation in
[ADR-0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md)
quietly stops working.

**Design this schema against the policy engine's needs, not the caller's
convenience.**

## What an action must carry

| Field group | Contents |
|---|---|
| target | the resource: home, area, device, capability class |
| operation | what is being requested, and its **direction** (lock/unlock, open/close, arm/disarm) |
| parameters | the values — setpoint, level, duration — that policy must bound |
| context | the state policy needs: time, occupancy inputs, equipment state references |
| sensitivity | the resource's sensitivity class |
| principal | `sub`, and `actor` or the explicit autonomous marker |
| provenance | run and profile version when agent-initiated |
| correlation | identifiers joining to the authorization decision and audit |

## Constraints

1. **Direction is explicit.** Lock and unlock are not one operation with a
   boolean. Degraded-mode classification depends on direction
   ([`../../docs/architecture/degraded-mode.md`](../../docs/architecture/degraded-mode.md)).
2. **Sensitivity is explicit**, so policy can require stricter conditions for a
   lock than for a lamp.
3. **Every parameter policy must bound is present.** A missing parameter means
   policy cannot decide — which must be a denial, not a pass.
4. **Correlatable** to its authorization decision and its safety verdict.
5. **No credentials.**

## What belongs here

- The schema and its field documentation.
- Fixtures covering the sensitive and safe directions of the same resource.

## What does not belong here

- **The safety envelope itself** — [`../../services/policy-engine/`](../../services/policy-engine/).
  This schema describes the *request*; the envelope is the *rule*.
- **Device-command mapping** — [`../../services/action-gateway/`](../../services/action-gateway/).
- **Authorization model** — that is relationship data, not action data.

## Governed by

[`../README.md`](../README.md) · ADRs
[0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md),
[0008](../../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md),
[0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Validation

Future: fixture tests, plus policy-scenario coverage
([`../../tests/policy-scenarios/`](../../tests/policy-scenarios/)) proving that
an action missing a policy-relevant parameter is denied rather than permitted.
