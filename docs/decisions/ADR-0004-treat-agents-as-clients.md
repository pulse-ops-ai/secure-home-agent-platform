# ADR-0004: Treat agents as clients, not insiders

- **Status:** Proposed
- **Date:** 2026-08-03
- **Deciders:** repository owner (pending human acceptance)
- **Supersedes:** none
- **Related:** [ADR-0001](ADR-0001-adopt-security-first-architecture.md), [ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md), [ADR-0008](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md), [`docs/architecture/identity-and-authorization-flow.md`](../architecture/identity-and-authorization-flow.md)

## Context

The upstream architecture already states the rule: agents authenticate,
authorize, and route through the same controls as any other caller. This ADR
exists because the household case makes three specific shortcuts unusually
tempting, and each one is a platform compromise:

1. **A Home Assistant long-lived owner token.** Home Assistant issues
   long-lived access tokens with the creating user's full authority. Handing one
   to an agent runner is a single credential that can unlock every door and
   disable every alarm, with no per-action authorization and no way to
   distinguish which agent or which human is responsible.
2. **A direct database connection.** The VPS TimescaleDB is reachable over the
   tailnet. Giving a runner its own connection would let an agent read household
   history and write records while bypassing every service-level control and
   every audit path.
3. **Co-location as trust.** Runners will share a Docker host with the control
   services. "It's on the same Docker network" is not identity.

There is a fourth problem that is specific to agents and is not solved by simply
authenticating them: an agent usually acts *for a person*. If the platform
records only the agent, accountability is destroyed — there is no way to
distinguish "the climate agent lowered the setpoint on its own schedule" from
"a household member asked the climate agent to lower the setpoint".

The review of `platform-edge` showed that this distinction is **not yet
available upstream**: every OpenFGA subject is written as
`user:<realm>__<sub>`, principal type is a heuristic on `preferred_username`,
and agent detection is explicitly deferred. This repository cannot assume it
inherits agent delegation.

## Decision

**Agents are clients.** Every agent run — coding or household, model-driven or
deterministic — authenticates at L3, is authorized at L4, passes operational
guardrails at L5, and re-enters the platform through the same governed API
enforcement points as any other caller.

Concretely:

1. **No Home Assistant owner tokens.** No component in this repository, and no
   agent runner, holds a Home Assistant long-lived owner token. Device actuation
   is reachable only through the action-mediation service, which is the single
   component permitted to hold Home Assistant credentials.
   ([`services/action-gateway/`](../../services/action-gateway/))
2. **No privileged database back-channels.** No runner connects to the VPS
   database. Data access is through governed service APIs.
3. **No co-location trust.** Runner sandboxes are treated as an untrusted zone
   even though they run on the same host. See
   [`docs/architecture/trust-boundaries.md`](../architecture/trust-boundaries.md).
4. **Agents have their own principal identity.** A run authenticates as an agent
   principal with `principal_type=agent`, using a short-lived workload-identity
   credential — never a shared static API key, never a human's credential.
5. **`sub` and `actor` are distinguishable, always.** When a run acts on behalf
   of a person, `sub` is the agent principal and `actor` is the human principal.
   Both are carried in the internal identity envelope, both are recorded in
   audit, and both are evaluated at authorization time:
   - is this agent permitted to act on behalf of this actor?
   - is this actor permitted this action on this resource?
   - are there obligations that apply specifically to agent-mediated access?

   Both checks must pass. **An agent never gains authority its actor lacks**, and
   an actor never gains authority by routing through an agent.
6. **An autonomous run has no `actor`.** A scheduled or triggered run with no
   human behind it must be authorized on the agent principal alone, and the
   absence of `actor` must be explicit in the envelope and in audit — never an
   empty field that reads like a missing value.
7. **Tighter limits for agents.** Guardrails for `principal_type=agent` are at
   least as strict as for humans, never looser.

## Consequences

**Positive.**

- Every existing control constrains agents automatically. A compromised agent is
  bounded by its policy scope, which is a subset of its actor's scope.
- Accountability is correct by construction: audit can answer both "what did
  this agent do?" and "what did this person authorize this agent to do?".
- Adding a new agent means issuing a principal and writing policy, not carving
  an exception path.
- Removing an agent's authority is a policy change, not a credential hunt.

**Negative.**

- Every agent call pays an identity and authorization round trip. On the local
  household path this is the very latency budget that
  [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md) has to
  reason about.
- Agent principals must be provisioned, rotated, and revoked — real operational
  work.
- The delegation relationships must be modelled explicitly, and the current
  shared model does not have them. This is work this repository owns.

**Neutral.**

- The rule applies identically to coding agents and household agents. They
  differ in what they are authorized to touch, not in whether they are governed.

## Alternatives considered

- **Agent runtime as trusted insider.** Rejected: the agent's privileges become
  the platform's privileges, and in a house that means physical access. Lowest
  friction, highest blast radius.
- **One Home Assistant long-lived token shared by the platform.** Rejected: no
  per-action authorization, no attribution, and revocation is all-or-nothing.
  This is the single most dangerous shortcut available here, which is why it is
  named explicitly in the decision.
- **Agents impersonate the human (agent uses the human's token).** Rejected:
  attribution is destroyed, the agent silently inherits everything the human can
  do, and revoking the agent requires revoking the human.
- **Agent-specific allow-list in front of the policy decision point.** Rejected:
  the allow-list becomes the security model, it does not scale, and "why was
  this allowed?" becomes a question about list history rather than about a
  decision log.
- **Elevated default permissions for agents.** Rejected: "elevated by default"
  is the failure mode this ADR exists to prevent. Differences belong in the
  policy model.
- **Rely on the shared edge to classify agent principals.** Rejected on
  evidence: it currently does not. Principal type is a heuristic and agent
  detection is deferred upstream.

## Security implications

- The blast radius of an agent compromise is bounded by policy rather than by
  credential possession.
- Concentrating Home Assistant credentials in a single mediation service makes
  that service a high-value target — accepted, because a single reviewable
  choke point is strictly better than credentials distributed across runners.
  That service must have the narrowest possible surface.
- Delegation modelling is security-critical and currently absent upstream. Until
  it exists here, **no agent may be granted a sensitive household capability.**
- The absence of `actor` must never be indistinguishable from a dropped field,
  or an autonomous run could be mistaken for a human-authorized one.

## Availability implications

- Authorization is on the critical path for agent-initiated household actions.
  When the decision point is unreachable, sensitive agent actions fail closed.
  See [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md).
- Short-lived credentials mean agents need reachable token issuance. A local
  degraded posture for agent authentication is unresolved and is tracked in
  [`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md).
- Deterministic local safety automations are deliberately **not** agent-mediated,
  so they are unaffected by agent authentication availability. This is the main
  reason safety automations are kept off the agent path.

## Validation and follow-up obligations

1. Model `agent` as a distinct principal type with explicit delegation relations
   in the household authorization model. Do not reuse the shared coarse model.
   See [ADR-0008](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md).
2. Decide the workload-identity mechanism for runner-issued credentials —
   unresolved; see
   [`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md).
3. Decide the Home Assistant credential strategy for the mediation service —
   unresolved, same document.
4. Add policy-scenario tests
   ([`tests/policy-scenarios/`](../../tests/policy-scenarios/)) covering:
   agent-without-delegation denied; agent-with-delegation-but-actor-unauthorized
   denied; autonomous agent run on a sensitive action denied; audit record
   contains both `sub` and `actor`.
5. Add a repository check that fails if any manifest, profile, or compose file
   grants a runner direct database or Home Assistant access.

## References

- Upstream `architecture/agent-as-client-model.md` @ `v0.3.0`
- Upstream `ADR-0002 — Agents are clients, not insiders` @ `v0.3.0`
- [`docs/architecture/identity-and-authorization-flow.md`](../architecture/identity-and-authorization-flow.md)
- [`docs/architecture/trust-boundaries.md`](../architecture/trust-boundaries.md)
