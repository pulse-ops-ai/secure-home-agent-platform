# ADR-0003: Use framework-neutral runner contracts and execution profiles

- **Status:** Accepted
- **Date:** 2026-08-03
- **Accepted:** 2026-08-05
- **Deciders:** @mikegtech (repository owner)
- **Supersedes:** none
- **Related:** [ADR-0006](ADR-0006-separate-agent-implementation-profile-run-and-automation.md), [ADR-0011](ADR-0011-keep-coding-agent-images-provider-specific.md), [ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md), [`docs/architecture/runner-model.md`](../architecture/runner-model.md)

## Context

This platform will run agents built several different ways, and the set will
change faster than the platform can be rebuilt:

- coding agents driven by a vendor CLI — Claude Code, GitHub Copilot CLI, Codex;
- agents built on a framework — PydanticAI, LangGraph;
- agents that are a plain deterministic loop calling a provider SDK directly;
- agents that involve no model at all.

The obvious shortcut is to let the framework define the execution environment:
install the framework, give it credentials and filesystem access, and call it an
agent runtime. That shortcut has three failure modes.

1. **The sandbox becomes framework-defined.** Isolation, mounts, network reach,
   and secret exposure end up as incidental properties of whatever the framework
   needs, so they differ per framework and cannot be reviewed as one thing.
2. **Evidence becomes framework-shaped.** Each framework emits its own trace
   format, so there is no uniform record of what ran, under what authority, and
   what it touched.
3. **Adding a framework becomes a platform change.** Every new agent style
   requires reopening the isolation and lifecycle design.

The platform's security properties must be a property of the *substrate*, not of
the agent's implementation choice.

## Decision

Separate the **runner substrate** from the **runtime adapter**, and bind them
together with an **execution profile**.

### The runner substrate

Owns, for every run, regardless of what runs inside it:

- process and container isolation,
- profile loading and validation,
- filesystem mounts and their read/write posture,
- network reachability (default deny; explicit egress allowances),
- secret and credential provisioning,
- resource limits (CPU, memory, wall clock, output size),
- lifecycle: start, cancel, timeout, teardown,
- event emission and evidence capture.

The substrate is **provider-neutral and framework-neutral**. It does not import a
framework and does not know which adapter it is launching.

### The runtime adapter

A thin, replaceable component that translates a run request into whatever the
concrete runtime expects, and translates that runtime's output back into the
platform's event and evidence contract. Adapters cover both classes:

- **coding-agent adapters** — Claude Code, Copilot CLI, Codex;
- **framework adapters** — PydanticAI, LangGraph, a custom deterministic loop, a
  provider SDK.

An adapter **cannot** widen its own sandbox. It receives what the profile grants
and nothing more.

### The execution profile

The declarative, reviewable binding of the two. A profile names: the runner
image, the adapter, the permitted tool surface, filesystem access, network
policy, model route, timeouts and limits, the identity the run authenticates as,
and the evidence contract the run must satisfy.

**A run is launched from a profile, never from ad-hoc parameters.** Anything not
granted by the profile is denied.

### Image lineage

One provider-neutral base runner image. Provider-specific images are **derived**
from it, one pinned coding agent each — see
[ADR-0011](ADR-0011-keep-coding-agent-images-provider-specific.md).

### The neutrality rule

No platform contract — profile schema, run schema, event schema, evidence
contract, tool surface — may contain a provider or framework name in a
structural position. A provider name may appear only as an *opaque value* of an
`adapter` field. If adding a framework requires changing the schema, the schema
was not neutral.

## Consequences

**Positive.**

- Isolation, limits, and evidence are reviewed once and apply to every agent.
- A new framework is a new adapter plus a new derived image — not a platform
  redesign.
- Profiles are diffable and reviewable artifacts. "What was this run allowed to
  do?" is answered by reading a file, not by reading agent code.
- Deterministic, model-free agents are first-class, which keeps sensitive
  automations off LLM discretion. See
  [ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md).

**Negative.**

- An indirection layer exists before there is a second framework to justify it.
- Adapters can leak: a runtime that insists on network access or credential
  shapes the profile did not anticipate will pressure the substrate to widen.
  That pressure must be resolved by changing the profile through review, never
  by the adapter reaching around the substrate.
- Some runtime-specific capability will be unreachable through a neutral
  contract. That is the accepted cost.

**Neutral.**

- The substrate/adapter split does not prescribe a container runtime. Docker
  Compose is the current deployment target; the split does not depend on it.

## Alternatives considered

- **One runtime, chosen now (e.g. LangGraph everywhere).** Rejected: the field
  is moving quickly, and the choice would be embedded in the sandbox, making it
  expensive to revisit. It would also force a model-driven framework onto
  deterministic automations that must not use one.
- **One "kitchen sink" runner image containing every provider.** Rejected: it
  maximizes attack surface, makes credentials for provider A reachable from a
  run using provider B, and makes patching and pinning intractable. Explicitly
  forbidden by [ADR-0011](ADR-0011-keep-coding-agent-images-provider-specific.md).
- **No profiles — pass parameters at launch.** Rejected: run authority would
  become an ephemeral property of the caller rather than a reviewable artifact,
  and there would be nothing to diff, sign, or attach to an automation.
- **Let each agent implementation define its own sandbox.** Rejected: this is
  the failure mode the ADR exists to prevent. Security properties would vary per
  agent and could not be asserted platform-wide.
- **Adapters as plugins loaded in-process by the substrate.** Rejected for now:
  in-process loading puts adapter code inside the substrate's trust boundary. The
  substrate launches adapters as isolated processes instead. Revisit only with
  evidence.

## Security implications

- The sandbox is defined by the profile, not by the agent, so the blast radius
  of a compromised or jailbroken agent is bounded by a reviewed artifact.
- Provider credentials are scoped to the derived image and the profile that uses
  it, so a credential for one provider is not reachable from a run using
  another.
- Uniform evidence makes agent behaviour auditable across frameworks. Without
  it, "what did the agent do?" has a different answer format per framework.
- **Explicit non-guarantee:** the substrate constrains what an agent *can reach*.
  It does not make an agent's *reasoning* trustworthy. Sensitive household
  actions must still pass deterministic policy — see
  [ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md).

## Availability implications

- Profile validation must be a local, offline operation. A run must not be
  blocked on fetching a remote schema or policy bundle.
- Runs must be cancellable and must time out. An agent that hangs must not hold
  Pi resources indefinitely, since the Pi also carries the household control
  path.
- Runner failure must never be able to leave a device in an **unrecorded** state.
  Runners cannot actuate directly; the mediation service owns the action
  lifecycle and observes an in-flight action to a terminal state even if the run
  that requested it is gone. Physical atomicity is *not* claimed — a partially
  actuated device is a representable outcome, not a preventable one. See
  [ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md) and
  [`services/action-gateway/README.md`](../../services/action-gateway/README.md).
- Runs are not part of the local safety path. A dead runner substrate must not
  prevent safety automations from operating.

## Validation and follow-up obligations

1. Define the execution-profile JSON Schema in
   [`schemas/execution-profile/`](../../schemas/execution-profile/) and the run
   and event schemas alongside it. **Not done in this change** — see
   [`profiles/schema/README.md`](../../profiles/schema/README.md).
2. Define the adapter SPI: what the substrate hands an adapter, what an adapter
   must return, and how it reports failure. Currently unresolved; tracked in
   [`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md).
3. Add profile-conformance tests
   ([`tests/profile-conformance/`](../../tests/profile-conformance/)) asserting
   that a profile which omits a required grant results in denial, not in a
   default-open.
4. Add framework-conformance tests
   ([`tests/framework-conformance/`](../../tests/framework-conformance/))
   asserting that every adapter emits the same event and evidence contract for
   the same logical run.
5. Add a lint that fails when a provider or framework name appears in a
   structural position in any schema under [`schemas/`](../../schemas/).

## References

- [`docs/architecture/runner-model.md`](../architecture/runner-model.md)
- [`agents/adapters/README.md`](../../agents/adapters/README.md)
- [`profiles/README.md`](../../profiles/README.md)
- Upstream `architecture/agent-as-client-model.md` @ `v0.3.0`

---

**Accepted and immutable.** Do not edit this ADR. Reverse or amend the decision
by writing a new ADR that supersedes it, and update
[`INDEX.md`](INDEX.md) in the same change.
