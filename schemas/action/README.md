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
| **idempotency** | a caller-supplied idempotency key, so a retry cannot actuate twice |
| **canonical form** | the deterministic serialization the `request_digest` is computed over |
| **lifecycle** | the observable state and terminal outcome (see below) |

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
6. **A canonical form is part of the schema, not the implementation.** The
   `request_digest` bound into the authorization approval
   ([ADR-0008 §3](../../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md))
   is computed over this canonical serialization. Two encodings of the same
   action must produce the same digest, and two different actions must never
   collide. An ambiguous canonical form is a bypass wearing a signature.
7. **Idempotency key required for any actuating action.** A retry must be
   distinguishable from a second request.
8. **The lifecycle is modelled explicitly** — including `indeterminate` as a
   first-class terminal state.

## The action lifecycle

Physical actions are **observable, not atomic**. The schema models what actually
happens rather than a transaction boundary devices cannot honour:

```
requested → authorized → policy-approved → dispatched → acknowledged
  → observed-in-progress
  → observed-succeeded | observed-failed | timed-out | indeterminate
```

- `indeterminate` is a **terminal state, not an error.** It is the honest answer
  when the platform cannot establish what physically happened. Collapsing it into
  `observed-failed` would be a lie callers act on.
- A partially-actuated device — a half-open garage door — is a **representable
  outcome**, not a state the software promises to prevent.
- Terminal states are **observed**, never inferred from a successful dispatch
  response.

See [`../../services/control-plane/README.md`](../../services/control-plane/README.md).

## What belongs here

- The schema and its field documentation.
- Fixtures covering the sensitive and safe directions of the same resource.
- Canonicalization fixtures: semantically identical actions in different
  encodings, and near-identical actions that must not collide.

## What does not belong here

- **The safety envelope itself** — [`../../services/control-plane/`](../../services/control-plane/).
  This schema describes the *request*; the envelope is the *rule*.
- **Device-command mapping** — [`../../services/control-plane/`](../../services/control-plane/).
- **Authorization model** — that is relationship data, not action data.

## Governed by

[`../README.md`](../README.md) · ADRs
[0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md),
[0008](../../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md),
[0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Validation

Future: fixture tests, plus policy-scenario coverage
([`../../tests/policy-scenarios/`](../../tests/policy-scenarios/)) proving that
an action missing a policy-relevant parameter is denied rather than permitted;
canonicalization tests (identical actions agree, different actions do not
collide); binding-failure tests for a substituted action type, resource, or
parameter; and lifecycle tests asserting that a timeout yields `indeterminate`
rather than a fabricated success or failure.
