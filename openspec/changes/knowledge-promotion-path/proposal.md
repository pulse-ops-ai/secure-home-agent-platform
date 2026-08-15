# Change Proposal: knowledge-promotion-path

## Why

The repository says where knowledge lives, what it may contain, and that it
grants nothing. It does not say **what happens to a durable architectural truth
discovered during implementation or review.**

The L4 orchestration landing made that gap expensive. Fifteen falsification
rounds did not mainly find coding mistakes; they found durable engineering
truths — fencing checked at the resource rather than at the lease store,
publication as one visibility change rather than several compensating writes, a
bound owned by the port rather than by the call site, effect identity with exact
replay distinguished from conflicting replay, and a proof exercised against
something it must catch rather than standing as a lexical proxy for the property
it names.

Every one of those is a fact about how this platform is built, and none is
peculiar to Claude, Codex, or Copilot. Each currently survives only in a change
archive, a test file, a PR discussion, or a provider instruction file — four
places that are, respectively, historical, incidental, ephemeral, and
provider-scoped.

## Problem

A truth with no home is rediscovered at review cost, repeatedly. The tempting
remedy — a provider-native "skill" per lesson — makes the canonical statement of
an architectural invariant a provider artifact, then requires a twin per
provider, then requires somebody to say which twin is authoritative. The
repository has spent thirteen ADRs avoiding that class of question.

## Proposed Capability

Establish the promotion path as a governed rule: canonical homes for durable
architecture, an agent-facing projection in `knowledge/`, provider artifacts
confined to runtime integration, and an explicit obligation to *determine*
whether a discovered truth should be promoted.

## Scope

**In scope.** [ADR-0014](../../../docs/decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
(`Proposed`); `docs/architecture/knowledge-promotion-model.md`; both indexes; one
root `AGENTS.md` rule; this change's artifacts.

**Out of scope.** The OKF toolchain. Any knowledge module. Any change to
`knowledge/catalog.json` or `knowledge/INDEX.md`. Any provider-native skill.

## Affected Areas

- `docs/decisions/` — one new ADR, `Proposed`, plus the index
- `docs/architecture/` — one new document, plus the index
- root `AGENTS.md` — one new rule section
- `openspec/changes/knowledge-promotion-path/` — this change

## Governance

**Governing ADRs**, from the `docs/decisions/INDEX.md` mapping table:

- [ADR-0010](../../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)
  — knowledge is portable, declares ownership and freshness, and is never an
  authority. This change restates §3 rather than amending it.
- [ADR-0011](../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)
  — the base image carries substrate, a derived image one runtime. This change
  states the knowledge consequence of that rule; it does not restate the rule.
- [ADR-0003](../../../docs/decisions/ADR-0003-run-agents-in-declarative-profiles.md),
  [ADR-0006](../../../docs/decisions/ADR-0006-govern-agent-execution-with-versioned-profiles.md)
  — a profile selects a named set.

**Unresolved decisions.** This change **depends on** and does **not** resolve
[U7](../../../docs/architecture/unresolved-decisions.md#u7). U7 gates the first
real bundle on the OKF validator existing. Authoring is therefore blocked and is
explicitly out of scope; what this change lands is the *rule about where a truth
goes*, which U7 does not gate. No other unresolved item is touched.

**ADR status.** This change proposes **no** status change to any existing ADR.
ADR-0014 is authored as `Proposed` and is accepted, if at all, by a human in its
own reviewed change.

## Trust / Security / Data Considerations

The promotion path routes **engineering** truths, not household facts, into
`knowledge/`. `knowledge/AGENTS.md` already requires a bundle to be safe to copy
anywhere, including to a third-party model provider; platform-architecture
content is within that boundary.

The hazard worth naming: a lesson from a security-relevant review could carry an
exploitable specific. The prohibited-content rules apply to promoted content
unchanged and are machine-checked. Promotion is subject to them and creates no
exception. A truth that cannot be stated without the specific stays in `docs/`.

This change grants no capability, no tool, and no authority to any agent.

## Existing Evidence

- `openspec/changes/runner-control-orchestration/` — the landing that produced
  the candidate truths, and the demonstration that they had nowhere to go
- `knowledge/INDEX.md` — `architecture-default` already exists, and
  `platform/` and `runbooks/` already hold exactly the two kinds of content the
  model names
- `knowledge/README.md` — already states that architecture documentation belongs
  under `docs/`; this change completes the other half of that sentence
- root `AGENTS.md` — already says provider instruction files never change what
  the documents say; this change extends it from routing to content

## Dependencies

U7 for any authoring. Nothing else. No package, no dependency, no runtime path.

## Success

The rule is stated once, canonically; both indexes resolve; the scaffold
validator passes; and a future change that discovers a durable truth has a named
obligation and a named destination.

## Non-Goals

- Implementing compile / validate / package / query
- Authoring the L4 knowledge modules
- Creating a `skills/` directory, or any provider-native skill
- Resolving U7, or any other unresolved decision
- Changing what `knowledge/` may contain

## Open Questions

None blocking. One deferred to authoring time: whether architecture *design* and
architecture *falsification* warrant separate sets — `architecture-default` and
an `architecture-review-default` — since least context is a control. That is a
`knowledge/INDEX.md` decision and cannot be taken before U7 opens.
