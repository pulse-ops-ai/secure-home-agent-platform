# ADR-0008: Use OpenFGA for relationship decisions and deterministic policy for safety

- **Status:** Proposed
- **Date:** 2026-08-03
- **Deciders:** repository owner (pending human acceptance)
- **Supersedes:** none
- **Related:** [ADR-0001](ADR-0001-adopt-security-first-architecture.md), [ADR-0004](ADR-0004-treat-agents-as-clients.md), [ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md), [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Context

[ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md) establishes
*that* platform authorization and deterministic safety policy are separate
controls. This ADR decides *what implements each*, and records what the shared
authorization system currently does and does not provide.

The workspace already runs OpenFGA at the shared edge. Reviewing it at
`platform-edge` @ `b70894a8` establishes concrete facts:

- The model has two types and two relations:
  `type user`, `type api_surface { read, write }`.
- Objects are `api_surface:<kong-route-name>`; the relation is derived from the
  HTTP method (`GET`/`HEAD`/`OPTIONS` ⇒ `read`, everything else ⇒ `write`).
- Every subject is written `user:<realm>__<sub>` — including service principals.
  There is no `agent` type and no delegation relation.
- The model file itself states it is "deliberately COARSE".
- L4 runs **audit-only**: the decision is recorded and forwarded, and no route
  is in `enforce` mode.
- Kong never calls OpenFGA directly. A first-party sidecar is the only OpenFGA
  client; it receives already-verified claims and returns a decision. **The
  request body never travels through OpenFGA.**
- When OpenFGA is unreachable the sidecar returns `unknown`, and the computed
  effective action under `enforce` would be `deny`.

So: the pattern at the edge is correct, and the *model* is nowhere near
sufficient for a house. "Can this principal call this route?" is not "can this
person's climate agent adjust the upstairs thermostat between 06:00 and 22:00?"

## Decision

### 1. OpenFGA is the policy decision point for relationship questions

Use OpenFGA to decide questions whose inputs are principals, actors, and
resource relationships:

- who lives here, who is a guest, who is a household administrator;
- which devices belong to which area, which area belongs to which home;
- which agent principal is permitted to act on behalf of which human;
- which capability class an agent principal holds for a resource class.

### 2. OpenFGA is a decision point, never a proxy

The request does not travel through OpenFGA. A governed enforcement point holds
the request, asks a `(user, relation, object)` question, receives a decision, and
enforces it. **No request body, no household payload, and no device command ever
transits the authorization system.** This mirrors the sidecar pattern already
proven upstream and is a hard rule here.

### 3. Deterministic policy owns numeric, temporal, and safety constraints

Setpoint ranges, time windows, occupancy conditions, actuation rate limits,
equipment interlocks, and required-confirmation rules are **not** modelled as
relationships. They are declared, deterministic policy evaluated by
[`services/policy-engine/`](../../services/policy-engine/) after authorization
succeeds. See
[ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md).

### 4. The shared model is not adopted for household resources

The current shared `api_surface` model is explicitly **not** assumed adequate.
This repository owns a household authorization model with, at minimum:

- a distinct `agent` principal type — not `user:` with a naming convention;
- explicit delegation relations linking an agent principal to an actor;
- household resource types (home, area, device, capability class) rather than
  API routes;
- a sensitivity classification on resources, so policy can require stricter
  conditions for locks, alarms, and garage doors than for lights.

**Whether the household model shares an OpenFGA runtime and store with the
shared edge model, or runs separately, is unresolved** — see
[`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md).
This ADR decides the *role*, not the deployment topology.

### 5. Coarse at the edge, fine in the product

The shared edge answers a coarse question ("may this principal reach this
surface at all?"). The product answers the fine question ("may this principal
perform this action on this resource?"). Both must pass. **The coarse decision
is not a substitute for the fine one**, and today the coarse decision does not
even block.

### 6. Fail closed

An undecidable authorization question is a denial for any sensitive action.
`unknown` is never `permit`. Degraded-mode nuance is
[ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md)'s subject.

## Consequences

**Positive.**

- Relationship reasoning — inheritance through areas, delegation chains, guest
  access — is handled by a system designed for it.
- Keeping payloads out of the authorization system bounds both its blast radius
  and its availability impact.
- The household model can evolve independently of the shared edge model.
- Recording the shared model's limitations prevents a future reader from
  assuming household authorization already exists.

**Negative.**

- Two authorization models to keep coherent (shared coarse, household fine), and
  the household one is greenfield work.
- OpenFGA becomes an availability dependency on the sensitive-action path. This
  is the central tension in
  [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md).
- Relationship modelling for a household is genuinely harder than it looks:
  guests, children, contractors, temporary access, and per-device sensitivity
  all interact.

**Neutral.**

- Choosing OpenFGA does not preclude a different decision point later. The
  contract is "a policy decision point that answers relationship questions"; the
  enforcement points call an interface, not a vendor.

## Alternatives considered

- **Adopt the shared `api_surface` model as-is for household resources.**
  Rejected on evidence: no agent type, no delegation, no household resources, and
  route-keyed objects. It would authorize "may you call the action endpoint",
  which is not a household question.
- **Put safety constraints in OpenFGA tuples.** Rejected: numeric and temporal
  bounds as relationship tuples are unreadable, unauditable by a household
  member, and would make the safety envelope depend on the authorization
  system's availability.
- **Route requests through OpenFGA as a proxy.** Rejected: household payloads
  and device commands would transit the authorization system, and its
  availability would become the availability of every request. Also contradicts
  the proven upstream pattern.
- **Roles and scopes in the identity token instead of a decision point.**
  Rejected: it collapses identity and authorization, permissions change at token
  cadence, and revocation waits for token expiry.
- **A hand-rolled household permission table.** Rejected: delegation chains and
  area inheritance are exactly what a relationship engine does correctly and
  hand-rolled code does not.
- **Home Assistant's own user permissions as the model.** Rejected: it has no
  agent principals, no delegation, and no external decision interface, and it
  would move authorization into the device substrate.

## Security implications

- Household data never enters the authorization system, so compromising it does
  not expose household state — it exposes the relationship graph, which is
  sensitive but bounded.
- Modelling `agent` as a first-class type prevents the current shared-edge
  situation, where an agent is indistinguishable from a user in the subject
  identifier.
- Resource sensitivity classification is what lets policy require stricter
  conditions for a door lock than for a lamp. Without it every device is equal,
  which is wrong.
- The authorization model is security-critical configuration: versioned,
  reviewed, and change-audited, never edited live.

## Availability implications

- Making OpenFGA a per-request dependency on the local household path is
  **incompatible with local-first operation** unless a local decision mechanism
  exists. Naming this plainly is the point of recording it here.
- Fail-closed is correct for sensitive actions and is deliberately *not* correct
  for every read. The classification is in
  [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md).
- Decision-caching semantics — whether a decision may be cached, for how long,
  for which actions, and how revocation propagates — are **unresolved**.
  Caching an authorization decision for a door lock is not the same as caching
  one for a temperature read.
- The shared edge's current behaviour is instructive: OpenFGA unreachable ⇒
  `unknown` ⇒ would deny under enforce. That is the right default; it is not by
  itself a household availability answer.

## Validation and follow-up obligations

1. Produce a gap analysis of the shared model against household resources and
   agent delegation, and design the household model from it. Not done in this
   change.
2. Decide whether the shared and household stores share one runtime —
   unresolved; see
   [`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md).
3. Decide policy-decision caching semantics per sensitivity class — unresolved,
   same document.
4. Add policy-scenario tests
   ([`tests/policy-scenarios/`](../../tests/policy-scenarios/)) covering:
   delegation chain permits; delegation absent denies; area inheritance;
   guest scope expiry; decision point unreachable ⇒ sensitive action denied.
5. Add a check that no request body or device command is ever passed to the
   authorization client interface.
6. Assert that every authorization decision emits an audit record carrying a
   decision identifier that joins to the request record — the correlation
   property the shared edge already proves is achievable.

## References

- `platform-edge` @ `b70894a8`: `infra/profiles/self-hosted-vps/openfga/model.fga`, `authz-audit-sidecar/app.py`
- Upstream `architecture/identity-and-authorization.md` @ `v0.3.0`
- [`docs/architecture/identity-and-authorization-flow.md`](../architecture/identity-and-authorization-flow.md)
- [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md)
