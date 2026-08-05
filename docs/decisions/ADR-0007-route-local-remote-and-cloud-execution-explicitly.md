# ADR-0007: Route local, remote, and cloud execution explicitly

- **Status:** Accepted
- **Date:** 2026-08-03
- **Accepted:** 2026-08-05
- **Deciders:** @mikegtech (repository owner)
- **Supersedes:** none
- **Related:** [ADR-0002](ADR-0002-adopt-hybrid-home-deployment-profile.md), [ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md), [ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md), [`docs/architecture/local-remote-routing.md`](../architecture/local-remote-routing.md)

## Context

Four execution locations are available, with very different cost, latency,
availability, and privacy properties:

- the Pi itself (always present, modest CPU, no GPU),
- the Exxact GPU workstation over the tailnet (fast, private, **not always on**),
- a cloud model provider (capable, metered, **household data leaves the house**),
- and no model at all — plain deterministic code.

If routing is implicit — "call a model and hope it lands somewhere sensible" —
three bad things follow. Basic household operation acquires a dependency on a
machine that may be powered off. Household data reaches a third party without
anyone having decided that it should. And the cheapest correct answer,
deterministic code, is never chosen because the model call is the default.

The requirement is explicit: **basic household operation must not require the
Exxact machine**, and **sensitive home actions must not depend on unbounded LLM
discretion**.

## Decision

Every unit of work is assigned to exactly one of four **routing classes**. The
class is declared in the execution profile ([ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md)),
enforced by the runner substrate, and recorded on the run.

### R0 — Deterministic local

Plain code on the Pi. No model.

- **Use for:** safety interlocks, threshold automations, schedules, state
  transitions, unit conversions, anything with a correct answer.
- **Availability:** must work with the WAN down, the workstation off, and the
  cloud unreachable.
- **Default for anything on the sensitive-action path.**

### R1 — Pi-local lightweight inference

A small model running on the Pi.

- **Use for:** intent classification, short summarization, phrasing — work where
  a wrong answer is an inconvenience, not a hazard.
- **Availability:** works offline; constrained by 8 GB RAM shared with the
  control plane.
- **Constraint:** must not starve the household control path. Resource limits
  are part of the profile.

### R2 — Exxact private heavy inference

Larger models on the GPU workstation, reached over the tailnet.

- **Use for:** deep analysis, long-context reasoning, batch work, evaluation.
- **Availability:** **optional by construction.** The workstation may be off.
- **Rule:** no household operation may block on R2. A profile that routes to R2
  must declare its behaviour when R2 is unavailable — degrade to R1, degrade to
  R0, or fail the run. There is no implicit fallback.
- **Privacy:** data stays within the tailnet.

### R3 — Cloud inference

A third-party model provider over the internet.

- **Use for:** work that genuinely exceeds local capability, and coding-agent
  runs.
- **Rule:** **allowed only when explicitly permitted by the profile, and only
  when required.** Not a default and not a silent fallback.
- **Privacy:** household data leaves the house. The profile must declare what
  categories of data may be sent; anything not declared must not be sent.
- **Availability:** requires the WAN. No household operation may depend on it.

### Rules that bind the classes together

1. **Declared, never inferred.** The routing class is a profile field. There is
   no runtime auto-selection.
2. **No implicit escalation.** R0 never silently becomes R1; R2 never silently
   becomes R3. Fallback, if any, is declared, is only ever *downward* in
   capability, and is recorded on the run.
3. **Sensitive actions are R0 for the decision.** A model may *propose* a
   sensitive action; the decision to permit it is authorization plus
   deterministic safety policy, both R0. See
   [ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md).
4. **The class is enforced, not advisory.** The substrate grants network reach
   for the declared class only. An R0 profile has no model egress at all.
5. **The class is recorded on the run**, so "did household data leave the
   house?" is answerable from audit rather than from inspection of code.

## Consequences

**Positive.**

- Household availability is protected by construction: the Exxact machine and
  the cloud are optional at the level of the profile schema.
- Data egress is a declared, auditable property rather than an emergent one.
- Cost is bounded: cloud calls require an explicit grant.
- Deterministic code is the *default* for the class of problems it solves well,
  which is the majority of household automation.

**Negative.**

- Profile authors must think about routing before writing an agent, which is
  friction at exactly the moment they want to move fast.
- No automatic failover means an R2 profile fails when the workstation is off,
  unless a fallback was declared. This is intentional and will be annoying.
- Four classes is more surface than "local or cloud".

**Neutral.**

- The classes describe *where inference happens*, not which model. Model choice
  within a class is a separate profile field.

## Alternatives considered

- **A single model gateway that picks the best available backend.** Rejected:
  routing becomes an emergent runtime property, data egress becomes
  unpredictable, and "did this leave the house?" becomes unanswerable in advance.
  Convenient, and exactly the wrong shape for a household privacy boundary.
- **Local-only, no cloud at all.** Rejected: coding-agent runs and some analysis
  genuinely need frontier models, and the constraint is *availability of
  household operation*, not a prohibition on cloud use.
- **Cloud-first with local fallback.** Rejected: it inverts the availability
  posture. Basic operation would depend on the WAN.
- **Automatic degradation R3 → R2 → R1 → R0.** Rejected as implicit behaviour: a
  silent downgrade changes answer quality without anyone knowing, and a silent
  *upgrade* would exfiltrate data. Declared fallback only.
- **Two classes (local / remote).** Rejected: it merges "private GPU on the
  tailnet" with "third-party cloud", which have opposite privacy properties, and
  merges "deterministic" with "small model", which have opposite reliability
  properties.

## Security implications

- Data egress becomes a reviewable profile property. Reviewing "may this agent
  send household state to a third party?" is reading one field.
- R0 profiles have no model egress at all, so the sensitive-action path has no
  exfiltration channel through inference.
- The tailnet path to the workstation is private connectivity, not authority.
  The workstation is a separate trust boundary and must authenticate; see
  [`docs/architecture/trust-boundaries.md`](../architecture/trust-boundaries.md).
- Prompt injection reaching an R3 agent cannot escalate its own routing class,
  because the class is enforced by the substrate rather than chosen by the agent.

## Availability implications

- **R0:** available whenever the Pi is up. The floor for household operation.
- **R1:** available whenever the Pi is up, subject to memory pressure. Must be
  bounded so it cannot degrade the control path.
- **R2:** optional. Nothing household-critical may depend on it.
- **R3:** requires the WAN. Nothing household-critical may depend on it.
- Declared fallback behaviour means an outage produces a predictable, recorded
  outcome instead of an unpredictable one.

## Validation and follow-up obligations

1. Add `routing_class` and the declared-fallback field to the execution-profile
   schema ([`schemas/execution-profile/`](../../schemas/execution-profile/)).
   Not done in this change.
2. Enforce the class in the substrate: an R0 profile must be launched with no
   model egress, verified by test rather than by convention.
3. Add profile-conformance tests: R0 profile cannot reach a model endpoint; R2
   profile with the workstation unavailable produces the declared outcome; no
   profile escalates its class at runtime.
4. Add an audit assertion that every run records its effective routing class and
   any fallback that occurred.
5. Define the declared data-category vocabulary for R3 egress before the first
   R3 household profile exists.

## References

- [`docs/architecture/local-remote-routing.md`](../architecture/local-remote-routing.md)
- [`docs/architecture/system-context.md`](../architecture/system-context.md)
- [`profiles/README.md`](../../profiles/README.md)

---

**Accepted and immutable.** Do not edit this ADR. Reverse or amend the decision
by writing a new ADR that supersedes it, and update
[`INDEX.md`](INDEX.md) in the same change.
