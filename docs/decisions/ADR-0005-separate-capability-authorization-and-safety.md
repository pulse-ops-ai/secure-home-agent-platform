# ADR-0005: Separate sandbox capability, platform authorization, and safety policy

- **Status:** Proposed
- **Date:** 2026-08-03
- **Deciders:** repository owner (pending human acceptance)
- **Supersedes:** none
- **Related:** [ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md), [ADR-0004](ADR-0004-treat-agents-as-clients.md), [ADR-0008](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md), [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Context

"Can this happen?" is three different questions, and collapsing them is how home
automation systems end up doing something technically permitted and physically
wrong.

Consider: an agent asks to set the thermostat to 92 °F in August while nobody is
home.

- Was the agent's sandbox able to reach the household action API at all?
- Is this principal, acting for this actor, permitted to control this
  thermostat?
- Is 92 °F in August, unoccupied, within the operating envelope the household
  has set for this equipment?

The first is a **capability** question, answered by the runner substrate before
any request is made. The second is an **authorization** question about
relationships between principals and resources. The third is an **operational
and safety** question about numbers, time, occupancy, equipment limits, and
interlocks — and it has nothing to do with who is asking.

A relationship-based authorization system answers the second question well and
the third question badly: encoding "setpoint must be between 60 and 82" as
relationship tuples is possible and awful. It is unreadable, unauditable by a
household member, and impossible to evaluate deterministically offline.

Conversely, a rules engine that also owns identity relationships duplicates the
authorization model and will drift from it.

The requirement "sensitive home actions must not depend on unbounded LLM
discretion" cannot be satisfied by authorization alone, because authorization
says *may*, not *should* or *within what bounds*.

## Decision

Three independent, ordered controls. Each is owned by a different component,
each can deny, and **none can be skipped**.

### 1. Sandbox capability — can the run reach it at all?

- **Owner:** runner substrate ([`services/runner-control/`](../../services/runner-control/))
- **Decided:** before the run starts, from the execution profile.
- **Question:** does this run have the tool, the network reach, and the mount to
  even attempt this?
- **Failure mode:** the request is never made.
- **Not:** a security boundary on its own. It is the outermost bound.

### 2. Platform authorization — is this principal permitted?

- **Owner:** the policy decision point, consulted by the governed API
  enforcement point (L6/L7)
- **Decided:** per request, from relationships between principals, actors, and
  household resources.
- **Question:** may this `sub`, acting for this `actor`, perform this action on
  this resource?
- **Failure mode:** denied, audited, request rejected.

### 3. Deterministic operational and safety policy — is this action within bounds?

- **Owner:** [`services/policy-engine/`](../../services/policy-engine/)
- **Decided:** per request, **after** authorization succeeds, from declared
  numeric ranges, time windows, occupancy and equipment state, rate limits on
  physical actuation, interlocks, and required-confirmation rules.
- **Question:** is *this* action, with *these* parameters, in *this* context,
  within the envelope the household has declared?
- **Properties:** deterministic, evaluable offline, readable by a household
  member, and **no model in the path**.
- **Failure mode:** denied, audited, request rejected — even for an
  administrator, unless an explicit, audited override applies.

### Ordering

```
sandbox capability  →  authentication  →  authorization  →  safety policy  →  action mediation
                                              │                                      │
                                              └────── bound approval ────────────────┘
                                                 verified before dispatch
```

Safety policy runs **after** authorization: it must be able to constrain an
authorized principal. A principal that "may control the thermostat" is still not
permitted to set it to 92 °F if the envelope forbids it.

### The controls are chained, not merely sequenced

Ordering alone is not enough. Between the authorization decision and the physical
dispatch there are several hops — L6, L7, the policy engine, the mediation
service — and any of them could, if compromised, present a valid-looking approval
for a *different* action than the one that was approved.

Therefore the approval that reaches action mediation must be **bound to the exact
action**: action type, fully-qualified resource, a canonical digest of the
parameters, the principal chain, and the decision's own expiry — all under the
issuer's signature. The mediation service **recomputes the digest from the action
it is about to perform** and refuses on any mismatch.

The claim set and the verification obligation are specified in
[ADR-0008 §3](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md).

**Safety policy cannot substitute for this.** Safety policy bounds *values*, not
*authority*: substituting the front door for the back door yields a perfectly
in-envelope action that no one authorized. A mismatch is audited as a **binding
failure**, distinct from an ordinary denial, because it means something in the
chain is rewriting requests.

### Non-negotiables

- **Safety policy is never a model call.** No LLM, no learned ranker, no
  probabilistic component, in the deterministic policy path.
- **Safety policy is never derived from agent output.** An agent supplies the
  requested action; it does not supply the bounds.
- **No control may be bypassed by any principal type.** There is no
  administrator path that skips safety policy. Overrides are themselves modelled,
  bounded, and audited.
- **A sensitive action requires all three to succeed.** Absence of a decision is
  not a permit.
- **The approval is bound to the action.** A decision reference not bound to a
  specific action, resource, and parameter digest is a bearer credential, not an
  authorization. Action mediation verifies the binding before dispatch.

## Consequences

**Positive.**

- Each control is independently reviewable, testable, and explainable.
  "Why was that denied?" has one of three precise answers.
- The safety envelope is legible to a household member. Relationship tuples are
  not.
- Safety survives the failure of the other two: a deterministic local policy
  needs no remote call. This is load-bearing for
  [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md).
- LLM discretion is bounded by construction, not by prompt.

**Negative.**

- Three places to look when something is denied, and three places to keep
  correct. Denial responses must say which control denied, or debugging becomes
  guesswork.
- Some rules could plausibly live in either authorization or safety policy;
  placement needs a stated rule (below) or the boundary will blur.
- Latency: two decisions per sensitive action instead of one.

**Neutral.**

- The split does not prescribe an implementation for safety policy. It
  prescribes determinism, offline evaluability, and legibility.

### Placement rule

If a rule's inputs are *principals, actors, and resource relationships*, it is
**authorization**. If a rule's inputs are *numbers, times, physical state,
rates, or equipment constraints*, it is **safety policy**. If a rule needs both,
it is two rules.

## Alternatives considered

- **One policy engine for everything (safety rules as authorization tuples).**
  Rejected: numeric and temporal constraints in a relationship model are
  unreadable and unauditable, and it makes offline evaluation depend on the
  authorization system's availability.
- **Safety checks inside each service.** Rejected: guarantees would vary per
  service, duplicated logic would drift, and there would be no single place to
  read "what is this house allowed to do?".
- **Safety checks inside the agent prompt or agent code.** Rejected outright:
  that is exactly "sensitive actions depend on unbounded LLM discretion". An
  agent must not be the enforcer of its own limits.
- **Safety checks in Home Assistant automations.** Rejected as the *primary*
  control: Home Assistant is a device/state substrate and its automations are
  editable through a different governance path. Home Assistant may hold
  *additional* local interlocks as defence in depth, but the platform must not
  depend on them for enforcement.
- **Safety policy before authorization.** Rejected: it would leak whether a
  resource exists and what its bounds are to principals with no authority over
  it.
- **Two controls (merge sandbox capability into authorization).** Rejected:
  capability is decided before the run exists and by a different owner; merging
  them would make the substrate call the policy decision point for questions it
  can answer statically.

## Security implications

- Defence in depth: compromising the agent does not bypass authorization;
  compromising authorization does not bypass the safety envelope.
- **Binding is what makes the chain hold.** Without it, the three controls are
  merely sequential and any compromised hop between the decision point and the
  device can present a valid approval for a different action. Separation without
  binding gives defence in depth against the *agent* but not against the
  *pipeline*.
- The safety envelope is a declared artifact and must be governed like code —
  reviewed, versioned, and signed off. An unreviewed change to it is a
  privilege escalation.
- Denial responses must not leak resource existence or bounds to unauthorized
  principals; the ordering above is what prevents that.
- Every denial from every control is audited with the control that denied and
  the reason, or post-incident analysis is impossible.

## Availability implications

- Safety policy must evaluate **locally and offline**. It is the control that
  keeps working when the coordination plane does not.
- Sandbox capability is decided at run start from a local profile — no remote
  dependency.
- Authorization is the availability-sensitive control. What happens when it is
  unreachable is
  [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md)'s
  subject, not this one's.
- Safety policy must not become a remote service call. If it ever needs remote
  state, that state is cached with an explicit staleness bound and a documented
  behaviour when stale.

## Validation and follow-up obligations

1. Define the safety-policy declaration format and its evaluation semantics —
   not done in this change. See
   [`services/policy-engine/README.md`](../../services/policy-engine/README.md).
2. Define the action schema so that every action carries the parameters safety
   policy needs. See [`schemas/action/`](../../schemas/action/).
3. Add policy-scenario tests
   ([`tests/policy-scenarios/`](../../tests/policy-scenarios/)) covering, at
   minimum: authorized-but-out-of-envelope denied; unauthorized-and-in-envelope
   denied at authorization; safety denial for an administrator; safety
   evaluation with the authorization system unreachable.
4. Add a check that the deterministic policy path has no dependency on any model
   or inference client.
5. Every denial path must be asserted to emit an audit record naming the
   deciding control.

## References

- [`docs/architecture/runner-model.md`](../architecture/runner-model.md)
- [`docs/architecture/identity-and-authorization-flow.md`](../architecture/identity-and-authorization-flow.md)
- [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md)
- [`services/policy-engine/README.md`](../../services/policy-engine/README.md)
