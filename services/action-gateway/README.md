# services/action-gateway

**Action mediation.** The single, narrow choke point between the platform and
the physical house — and the **only** holder of Home Assistant credentials.

> **Status: not implemented.** A workspace member with a manifest and a
> placeholder package. No Home Assistant client, no credentials, no dependencies.

## Why one component

[ADR-0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md) forbids
distributing Home Assistant credentials to runners or services. Concentrating
them here makes this the highest-value credential holder in the house — accepted
deliberately, because one reviewable choke point is far better than credentials
scattered across runners.

**Its surface must therefore be as narrow as possible.** Every capability added
here widens the most sensitive component in the system.

## Future ownership

- The Home Assistant client and its credential.
- **Verification of the bound approval** before anything physical is dispatched.
- Translating an approved platform action into a device command.
- The observable action lifecycle, idempotency, and reconciliation.
- The action audit record: run, profile version, `sub`, `actor`, the verified
  approval, safety verdict, command, and **observed terminal state**.

## Verify the bound approval before dispatch

The gateway is the last component before a physical effect, so it is where
authority is finally checked. A decision **reference** is not a decision: an
artifact saying only "authorization `ad-1234` happened" is a bearer credential
for whatever action its holder attaches to it.

Before dispatching anything, the gateway must:

1. verify the envelope signature, audience, and expiry;
2. **recompute** the canonical request digest from the action it is about to
   perform and compare it to the bound `request_digest`;
3. confirm the bound `action_type` and `resource_id` match the action in hand;
4. confirm `authz_decision_exp` has not passed.

Any mismatch is a **binding failure** — refused, and audited as its own outcome
rather than folded into the generic denial count. A binding failure means
something between the decision point and the device is rewriting requests, so it
should alert. See
[ADR-0008 §3](../../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md).

## Physical actions are observable, not atomic

**This service does not promise atomicity, because it cannot deliver it.** A
command to a physical device can be accepted but not delivered, delivered but not
acknowledged, started and then obstructed, completed after the caller timed out,
reversed manually mid-travel, or reported optimistically before the physical
result exists.

**"Half-open" is a real physical outcome.** It is a state the software must be
able to *represent*, not one it can promise to eliminate.

So the contract is an observable lifecycle:

```
requested
  → authorized
  → policy-approved
  → dispatched
  → acknowledged
  → observed-in-progress
  → observed-succeeded | observed-failed | timed-out | indeterminate
```

`indeterminate` is a **first-class terminal state**, not an error. It is the
honest answer when the gateway cannot establish what physically happened, and
collapsing it into "failed" would be a lie that callers act on.

The gateway must provide:

| Mechanism | Purpose |
|---|---|
| **Idempotency keys** | a retry must not actuate twice |
| **At-most-once dispatch** where the device or integration supports it | double actuation is worse than none |
| **Precondition / expected-state checks** | do not send `close` to a door already closed and in motion |
| **Device-specific terminal-state observation** | success is *observed*, never inferred from a 200 response |
| **Timeouts and reconciliation** | a later sweep resolves what the request could not |
| **Explicit `indeterminate`** | surfaced to the caller and to audit |

**No automatic inverse command.** The gateway must never "undo" a partial action
on its own — reversing a door mid-travel can be exactly the wrong move. An
inverse is a new action, separately authorized and separately policy-approved,
and only where a reviewed safety policy calls for it.

## What belongs here

- Home Assistant integration and credential handling.
- Bound-approval verification.
- Action dispatch, the lifecycle state machine, idempotency, and reconciliation.
- Device-command mapping and the action audit record.

## What does not belong here

- **Authorization decisions.** Made before this service is called. The gateway
  *verifies* the approval; it does not *make* one.
- **Safety-policy rules.** Made by [`../policy-engine/`](../policy-engine/)
  before this service is called.
- **Business logic or orchestration** — that is [`../pi-api/`](../pi-api/).
- **Any second Home Assistant client** anywhere else in the repository.
- **Automatic compensating or inverse actions.**

## Boundary rules

- Executes **only** when authorization permitted, safety policy approved, **and**
  the bound approval verifies against the action in hand.
- Verifies the internal identity envelope. Being on the same Docker network is
  not authority.
- Its credential is **never** readable by a runner, an agent, or another service.
- Every action, every refusal, every binding failure, and every terminal state —
  including `indeterminate` — is audited.

## Open

- Credential strategy — [U10](../../docs/architecture/unresolved-decisions.md#u10).
  Home Assistant's own permission model is coarse; if the chosen credential
  cannot be scoped as narrowly as required, the compensating control must be
  documented.
- Per-device-class terminal-state observation: which devices can be observed to a
  true terminal state, and which can only ever report `indeterminate`. This must
  be known per device class before that class is actuated.

## Governed by

[`../AGENTS.md`](../AGENTS.md) · ADRs
[0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md),
[0008](../../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md),
[0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Validation

`uv run ruff check .`, `uv run mypy`, `uv run pytest`. Future: a repository-wide
check that no other package imports a Home Assistant client; binding-failure
tests for substituted action, resource, and parameters; idempotency tests; and
lifecycle tests asserting that a timeout yields `indeterminate` rather than a
fabricated success or failure.
