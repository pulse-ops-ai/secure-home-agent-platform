# ADR-0011: Keep the base runner provider-neutral and coding-agent images provider-specific

- **Status:** Proposed
- **Date:** 2026-08-03
- **Deciders:** repository owner (pending human acceptance)
- **Supersedes:** none
- **Related:** [ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md), [ADR-0004](ADR-0004-treat-agents-as-clients.md), [ADR-0006](ADR-0006-separate-agent-implementation-profile-run-and-automation.md)

## Context

Three coding agents will operate on this repository: Claude Code, GitHub Copilot
CLI, and Codex. Each needs its own CLI, its own runtime dependencies, its own
authentication mechanism, and its own credential shape. They version
independently and they break independently.

The tempting shortcut is one image containing all three, selected at run time by
an environment variable. It is convenient exactly once — at build time — and
then it is a liability:

- **Credential co-residency.** Three providers' credentials are mountable into
  one container. A run using provider A can read provider B's credential unless
  something else prevents it, and "something else" is a mount policy that is
  easy to get subtly wrong.
- **Attack surface multiplication.** Every run carries all three CLIs and all
  their transitive dependencies, whether it uses them or not.
- **Version coupling.** A required upgrade to one CLI rebuilds and re-tests the
  image used by all three. A breakage in one blocks all.
- **Unreviewable provenance.** "Which CLI version actually ran?" becomes a
  runtime question rather than a property of the image digest.
- **Provider identity leakage into the platform.** The moment the platform ships
  a "supports Claude, Copilot, Codex" image, provider names start appearing in
  platform contracts.

The last one is the architectural problem. Claude, Copilot, and Codex are
**adapters** ([ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md)),
not platform identities. A platform whose image inventory is organized by vendor
has already lost neutrality.

## Decision

### 1. One provider-neutral base runner image

`secure-home-runner-base` contains the substrate concerns only: process
isolation posture, profile loading, evidence capture hooks, the event emitter,
and the minimal OS surface. It contains **no coding agent, no provider SDK, no
framework, and no provider credential handling**.

### 2. Derived images, one pinned coding agent each

```
secure-home-runner-base
├── secure-home-runner-claude     — Claude Code, pinned
├── secure-home-runner-copilot    — GitHub Copilot CLI, pinned
└── secure-home-runner-codex      — Codex, pinned
```

Each derived image adds exactly one coding agent, at a pinned version, plus only
what that agent requires.

### 3. No multi-provider image

An image containing more than one coding agent is **prohibited**. This is not a
preference; it is the decision.

### 4. Credentials follow the image and the profile

A provider credential is provisioned only to a run whose profile selects that
provider's image. There is no shared credential mount and no ambient provider
environment. A run using one provider has no path to another's credential.

### 5. Provider names live in exactly two places

- the **image name** of a derived image,
- the value of the `adapter` (and image) field of an execution profile.

They must not appear in the profile schema's structure, the run schema, the
event or evidence contracts, service code, or any platform interface. Adding a
fourth provider must require zero changes to any schema.

### 6. The same lineage rule applies to household runtimes

Framework runtimes — PydanticAI, LangGraph, a custom deterministic loop — derive
from the same base and follow the same one-runtime-per-image rule. Coding and
household runner classes are separate image families with different tool
surfaces and different network posture; see
[`docs/architecture/runner-model.md`](../architecture/runner-model.md).

## Consequences

**Positive.**

- Minimal per-run attack surface: a run carries one agent, not three.
- Credential isolation is structural — enforced by which image was selected, not
  by a mount rule someone has to remember.
- Independent version pinning and independent upgrade cadence per provider.
- Provenance is a digest: "which agent version ran?" is answered by the image.
- Provider neutrality is preserved in every platform contract.

**Negative.**

- More images to build, scan, pin, and keep patched. Base-image patching now
  fans out to every derived image.
- Build and CI complexity grows roughly linearly with provider count.
- A run needing two providers would need two runs. Accepted — that requirement
  has not appeared and would deserve scrutiny if it did.
- Derived images drift from the base unless rebuilds are automated.

**Neutral.**

- The rule does not prescribe a base OS or a container build tool.

## Alternatives considered

- **One image containing all coding agents.** Rejected: credential
  co-residency, tripled attack surface, coupled upgrades, and provider names
  entering platform contracts. The named non-goal of this repository.
- **No base image; three independent images.** Rejected: substrate concerns
  would be duplicated three times and would drift. The substrate must be built
  once.
- **Install the coding agent at run time into the base image.** Rejected: it
  removes provenance (no digest for what ran), requires network egress during
  run start, and makes a supply-chain compromise a per-run event rather than a
  reviewable build event.
- **One image per agent implementation.** Rejected: it confuses implementation
  with runtime. Implementations are code and carry no authority; runtimes are
  images. See [ADR-0006](ADR-0006-separate-agent-implementation-profile-run-and-automation.md).
- **Select the provider by environment variable in a multi-provider image.**
  Rejected: the isolation boundary becomes a variable rather than an image
  identity, and every run still carries every provider's code.

## Security implications

- Credential isolation by image selection is a structural control, materially
  stronger than a mount-policy convention.
- A supply-chain compromise in one provider's CLI is contained to runs using
  that image; runs using another provider are unaffected.
- Pinned versions mean an upgrade is a reviewed, diffable event with a
  changeable digest — not something that happens silently at run start.
- Smaller images mean fewer packages to scan and patch per run.
- **Non-guarantee:** image separation bounds what a run *carries*. It does not
  make the coding agent's behaviour trustworthy. Sandbox capability,
  authorization, and safety policy still apply
  ([ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md)).

## Availability implications

- No runtime installation means run start does not depend on a package registry
  or a provider CDN. Runs start offline if the image is present.
- Image pull is a prerequisite; a missing image fails the run cleanly rather
  than degrading to an unpinned install.
- Base-image patching must fan out to derived images on a schedule, or derived
  images silently age. This is an operational obligation, not an availability
  guarantee.
- Coding-agent runs are not on the household control path. Their unavailability
  must never affect household operation.

## Validation and follow-up obligations

1. Define the base image contract — what the substrate provides and what a
   derived image may add. Not done in this change; no image is built here. See
   [`deploy/images/README.md`](../../deploy/images/README.md).
2. Add a build-time check that a derived image contains exactly one coding
   agent.
3. Add a schema lint that fails when a provider name appears in a structural
   position in any file under [`schemas/`](../../schemas/).
4. Add a profile-conformance test asserting that a run using one provider's
   image cannot access another provider's credential.
5. Establish an automated base-image rebuild that propagates to derived images,
   and record image digests on run records for provenance.

## References

- [`docs/architecture/runner-model.md`](../architecture/runner-model.md)
- [`agents/adapters/README.md`](../../agents/adapters/README.md)
- [`deploy/images/README.md`](../../deploy/images/README.md)
