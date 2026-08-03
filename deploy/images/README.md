# deploy/images/

Runner **image definitions**: the provider-neutral base and its derived images.

> **Status: no image exists.** No Dockerfile, no build, no published image.

## Lineage

```
secure-home-runner-base            provider-neutral substrate
├── secure-home-runner-claude      Claude Code, pinned
├── secure-home-runner-copilot     GitHub Copilot CLI, pinned
├── secure-home-runner-codex       Codex, pinned
├── secure-home-runner-custom-loop deterministic loop, no model
├── secure-home-runner-pydantic-ai PydanticAI, pinned
└── secure-home-runner-langgraph   LangGraph, pinned
```

**One runtime per derived image. A multi-provider image is prohibited**
([ADR-0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)).

## What the base contains

Substrate concerns only: profile loading, run lifecycle, event emission,
evidence capture hooks, and the minimal OS surface those need.

**It contains no coding agent, no framework, no provider SDK, and no provider
credential handling.** If a provider name appears in the base image definition,
the lineage is broken.

## What a derived image adds

Exactly one runtime, at a pinned version, plus only what that runtime requires.
Nothing else.

## What belongs here

- Dockerfiles for the base and each derived image.
- Build documentation and the pinning policy.
- The rebuild-propagation procedure from base to derived.

## What does not belong here

- **Credentials or API keys.** Provisioned at run time from the profile, never
  baked into an image.
- **Runtime installation at run start.** Installing a coding agent when a run
  begins destroys provenance and requires network egress to start. Everything is
  in the image.
- **Agent implementations** or **adapters** — [`../../agents/`](../../agents/).
- **More than one runtime per image.**
- **Compose files** — [`../compose/`](../compose/).

## Boundary rules

1. **Credential isolation by image selection.** A run using one provider's image
   has no path to another provider's credential. This is structural, not a mount
   convention.
2. **Pinned versions.** An upgrade is a reviewed, diffable event with a changed
   digest — not something that happens silently.
3. **Base patching must propagate.** Derived images age silently otherwise; this
   is an operational obligation.
4. **Image digests are recorded on run records** for provenance.
5. **Minimal surface.** Every package in an image is carried by every run using
   it.

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) · ADRs
[0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)

## Validation

Future: a build-time check that a derived image contains exactly one coding
agent, image scanning, and a profile-conformance test proving cross-provider
credential isolation.
