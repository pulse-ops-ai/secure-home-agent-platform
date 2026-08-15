# Knowledge promotion model

> **Status: proposed, and nothing is authored under it yet.** The decision this
> document follows from is
> [ADR-0014](../decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md),
> which is `Proposed`. Authoring any knowledge module remains blocked by
> [U7](unresolved-decisions.md#u7).

This document records **what follows** from ADR-0014: where a durable
architectural truth lives, and how it reaches an agent. The ADR records *why*.
Where the two appear to disagree, the ADR wins and this document is the defect.

## The problem this solves

A truth discovered during implementation or review has four places it can end
up by default, and all four lose it:

| Where it lands by default | Why it is lost |
|---|---|
| a change archive | historical — read when someone is already looking for it |
| a test file | incidental — available to whoever reads that test |
| PR discussion | ephemeral — unindexed and unsearchable in practice |
| a provider instruction file | provider-scoped — and then which provider is canonical? |

None of those is a home. The promotion model gives one.

## Canonical homes

| Artifact | Is canonical for |
|---|---|
| `docs/decisions/` (accepted ADRs) | **why** a durable decision was taken |
| `docs/architecture/` | **what follows** — models, boundaries, flows |
| `knowledge/platform/` | the agent-facing **projection** of models, invariants, vocabulary, semantics, cross-cutting engineering truths |
| `knowledge/runbooks/` | the agent-facing **projection** of ordered procedures for applying them |
| provider instruction files and provider-native skills | **runtime integration only** — how one runtime routes to or queries what it was given |

A knowledge module is a projection, never a second original. The canonical
statement stays in `docs/`; the module references it and states it in the form an
agent reasons from.

## The path

```text
change / review finding
     │  is this durable, or specific to this change?
     ▼
canonical architecture or ADR
     │  must an agent reason FROM it to work correctly?
     ▼
portable knowledge module or runbook
     │  which profiles need it — and which deny it?
     ▼
knowledge set
     │  resolved to exact module versions, recorded before launch
     ▼
profile-selected resolved bundle
     │
     ▼
provider / runtime
```

Every arrow is a decision that may legitimately be **no**. The obligation is to
*determine*, not to promote. Most findings stop at the first arrow; that is a
correct outcome, not a failure of the model.

## The four layers, and what each controls

```text
IMAGE      what executable runtime exists
           provider CLI, OS/tooling surface, supply-chain provenance

PROFILE    what the run may access
           tools, filesystem, network, credentials, KNOWLEDGE SET, limits

KNOWLEDGE  what the run may reason FROM

TASK       what the run is being asked to accomplish
```

They do not borrow from each other. In particular, **project knowledge does not
travel in a runner image**: that would put domain content in a supply-chain
artifact, make it per-provider, and make it invisible to the pre-launch record
of what the run knew — which is run evidence. See
[ADR-0011](../decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)
and [`knowledge-selection-model.md`](knowledge-selection-model.md).

## Why not provider-native skills

The test, stated once:

> If the information should survive replacing Claude with Codex or Copilot, it
> is **not** a provider skill.

A skill is an adapter *to* knowledge — how one runtime discovers and queries what
was selected for the run. Making it the home of the knowledge would require a
twin per provider and then an answer to "which twin is canonical?". The root
[`AGENTS.md`](../../AGENTS.md) already says provider instruction files never
change what the documents say; this extends that from routing to content.

The payoff is concrete. Two profiles differing only in runtime:

```text
architecture-review-codex@1        architecture-review-claude@1
  image:     codex                   image:     claude
  adapter:   codex                   adapter:   claude
  knowledge: architecture-review@N    knowledge: architecture-review@N
  authority: repo read-only          authority: repo read-only
```

Same architecture, same review expectations, different runtime.

## What promotion does not do

Promotion does not make a module authoritative. An architectural invariant
projected into `knowledge/platform/` is still canonically stated in its ADR or
architecture document; the module is how an agent reads it, not what makes it
true. Knowledge remains context and never authority — it grants no tool, no
capability, and no permission to override live state or an accepted ADR
([ADR-0010](../decisions/ADR-0010-use-okf-for-portable-knowledge-only.md) §3).

Promotion also does not create an exception to the prohibited-content rules. A
truth that cannot be stated without a secret, a live reading, an authorization
tuple, or an exploitable specific stays in `docs/` and is not promoted.

## What is blocked today

**Authoring.** [U7](unresolved-decisions.md#u7) gates the first real bundle on
the OKF validator and toolchain existing, precisely so an unvalidated format does
not become load-bearing by accident. Until U7 closes, the path terminates at
canonical architecture: a change determines whether a truth should be promoted
and records the determination, and no module is written.

The L4 orchestration landing
([`openspec/changes/runner-control-orchestration`](../../openspec/changes/runner-control-orchestration/))
is the first substantial source of candidates — effect classification and
identity, replay semantics, boundary ownership, and proof construction. They are
candidates. Each is subject to the "must an agent reason from it?" criterion when
U7 opens, and some will not survive it.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) ·
[ADR-0014](../decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
· [ADR-0010](../decisions/ADR-0010-use-okf-for-portable-knowledge-only.md) ·
[ADR-0011](../decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)
