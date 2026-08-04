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

### 3. The authorization decision is cryptographically bound to the exact action

A decision **identifier** is not a decision. An artifact that says only "some
authorization happened, decision `ad-1234`" is a bearer token for whatever action
its holder chooses to attach it to.

Concretely, the substitution attack this closes:

1. L6 obtains authorization for a benign action and mints a valid envelope.
2. A compromised caller, a compromised intermediate service, or a manipulated
   transport path replaces the resource identifier or the action parameters.
3. The action-mediation service sees a structurally valid envelope carrying a
   real decision reference.
4. Deterministic safety policy may still reject an unsafe *value* — but it cannot
   establish that the policy decision point ever authorized **this** action on
   **this** resource.

A unique envelope identifier and replay detection do not close this. They prevent
the *second* use of an envelope; the substitution happens on the first.

**The authorization artifact must therefore bind, under the issuer's signature,
at least:**

| Bound claim | Prevents |
|---|---|
| `action_type` | swapping `close` for `open` |
| `resource_id` (fully qualified) | swapping the back door for the front door |
| `request_digest` — canonical digest of the action parameters | altering a setpoint or a duration |
| `context_digest` — digest of the context the decision relied on | replaying a decision made under different conditions |
| `sub` and `actor` | detaching the decision from the principal chain |
| `authz_decision_id` | joining to the decision record |
| `authz_decision_exp` — the decision's own expiry, separate from the envelope's | using a stale decision inside a fresh envelope |
| `policy_model_version` | using a decision made under a superseded model |
| `correlation_id` | audit joining |

**Verification is the action-mediation service's obligation, not an optional
optimization.** Before dispatching anything physical it must:

1. verify the envelope signature, audience, and expiry;
2. **recompute** the canonical request digest from the action it is about to
   perform and compare it to the bound `request_digest`;
3. confirm `action_type` and `resource_id` match the action in hand;
4. confirm the decision has not itself expired.

Any mismatch is a denial, audited as a **binding failure** — a distinct and
alarming outcome, not a generic authorization denial. A binding failure means
something between the decision point and the device is rewriting requests.

Carrying a bare decision reference is acceptable **only** if the gateway
dereferences the decision and verifies the complete approved tuple. Binding it
into the signed artifact is the preferred form, because it needs no round trip and
therefore still works on the degraded local path.

**Canonicalization is security-critical.** Two encodings of the same action must
produce the same digest, and two different actions must never collide. The
canonical form is part of the action schema
([`schemas/action/`](../../schemas/action/)), not an implementation detail.

### 4. Deterministic policy owns numeric, temporal, and safety constraints

Setpoint ranges, time windows, occupancy conditions, actuation rate limits,
equipment interlocks, and required-confirmation rules are **not** modelled as
relationships. They are declared, deterministic policy evaluated by
[`services/policy-engine/`](../../services/policy-engine/) after authorization
succeeds. See
[ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md).

### 5. The shared model is not adopted for household resources

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

### 6. Coarse at the edge, fine in the product

The shared edge answers a coarse question ("may this principal reach this
surface at all?"). The product answers the fine question ("may this principal
perform this action on this resource?"). Both must pass. **The coarse decision
is not a substitute for the fine one**, and today the coarse decision does not
even block.

### 7. Fail closed

An undecidable authorization question is a denial for any sensitive action.
`unknown` is never `permit`. Degraded-mode nuance is
[ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md)'s subject.

## Consequences

**Positive.**

- Relationship reasoning — inheritance through areas, delegation chains, guest
  access — is handled by a system designed for it.
- **Binding closes the substitution gap.** A valid envelope authorizes exactly one
  action on exactly one resource with exactly those parameters, so a compromised
  intermediate cannot repoint an approval.
- **Binding works on the degraded path.** Because the approval is self-contained,
  the gateway verifies it without a round trip to the decision point — which
  matters precisely when the decision point is unreachable.
- Keeping payloads out of the authorization system bounds both its blast radius
  and its availability impact.
- The household model can evolve independently of the shared edge model.
- Recording the shared model's limitations prevents a future reader from
  assuming household authorization already exists.

**Negative.**

- Two authorization models to keep coherent (shared coarse, household fine), and
  the household one is greenfield work.
- **Binding costs flexibility.** An approval cannot be reused for a similar
  action, so batch or fan-out operations need one decision per action, or an
  explicitly-modelled batch action with its own digest. This is friction, and it
  is the correct trade.
- **Canonicalization becomes security-critical.** A digest scheme with an
  ambiguous canonical form is a bypass wearing a signature. It must be specified
  and tested, not left to a serializer's defaults.
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
- **Carry only a decision identifier in the envelope.** Considered, and it is
  what the shared edge does today (`x-platform-edge-authz-decision-id`).
  Rejected as sufficient on its own: an unbound identifier makes the envelope a
  bearer credential for any action its holder attaches it to, and the gateway has
  no way to tell an approved action from a substituted one.
- **Dereference the decision at the gateway instead of binding it.** Considered,
  and it is acceptable *if* the full approved tuple is verified. Rejected as the
  primary mechanism because it requires a round trip to the decision point at
  actuation time — exactly the dependency the local-first posture is trying to
  remove — and it fails precisely during an outage.
- **Rely on transport security between L6 and the gateway.** Rejected: that is
  network-position trust again. It also does not defend against a compromised
  L6-side intermediate, which is inside the transport.
- **Rely on safety policy to catch substituted actions.** Rejected: safety policy
  bounds *values*, not *authority*. Swapping the back door for the front door
  produces a perfectly in-envelope action that nobody authorized.
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
- **Binding is what makes the whole chain non-forgeable.** Without it, every
  component between L6 and the device is effectively trusted to not rewrite the
  request — which is network-position trust reintroduced at the application
  layer. The gateway must be able to verify authority from the artifact alone.
- **A binding failure is an intrusion signal, not a user error.** It means
  something is rewriting requests in flight. It must be audited and alerted
  distinctly from an ordinary denial, or the one event that matters will be lost
  among the many that do not.
- Digest collision or canonicalization ambiguity would defeat binding entirely,
  which is why the canonical form belongs in the reviewed schema.
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

1. **Specify the bound-approval claim set and the canonical request-digest
   form**, in [`schemas/action/`](../../schemas/action/) and the envelope claim
   set. **Blocking prerequisite for any device actuation.** Not done in this
   change.
2. Add tests asserting that a substituted `resource_id`, a substituted
   `action_type`, an altered parameter, an expired `authz_decision_exp`, and a
   superseded `policy_model_version` each produce a **binding failure** — a
   distinct audited outcome, not a generic denial.
3. Add a canonicalization test suite: semantically identical actions must
   produce identical digests, and semantically different actions must not
   collide.
4. Produce a gap analysis of the shared model against household resources and
   agent delegation, and design the household model from it. Not done in this
   change.
5. Decide whether the shared and household stores share one runtime —
   unresolved; see
   [`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md).
6. Decide policy-decision caching semantics per sensitivity class — unresolved,
   same document.
7. Add policy-scenario tests
   ([`tests/policy-scenarios/`](../../tests/policy-scenarios/)) covering:
   delegation chain permits; delegation absent denies; area inheritance;
   guest scope expiry; decision point unreachable ⇒ sensitive action denied.
8. Add a check that no request body or device command is ever passed to the
   authorization client interface.
9. Assert that every authorization decision emits an audit record carrying a
   decision identifier that joins to the request record — the correlation
   property the shared edge already proves is achievable.

## References

- `platform-edge` @ `b70894a8`: `infra/profiles/self-hosted-vps/openfga/model.fga`, `authz-audit-sidecar/app.py`
- Upstream `architecture/identity-and-authorization.md` @ `v0.3.0`
- [`docs/architecture/identity-and-authorization-flow.md`](../architecture/identity-and-authorization-flow.md)
- [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md)
