# Knowledge promotion model

> **Status: PROPOSED and NON-OPERATIVE.** The decision this document follows
> from is
> [ADR-0014](../decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md),
> which is `Proposed`. **Nothing here is an obligation today**, and nothing here
> may become one through this document or through root `AGENTS.md` — a proposed
> decision cannot be made binding by an artifact below it in the precedence
> order. This document describes the model under review; it takes effect if and
> when ADR-0014 is `Accepted` in its own reviewed change.
>
> Separately and independently: authoring any knowledge module remains blocked
> by [U7](unresolved-decisions.md#u7), which ADR-0014 neither resolves nor
> weakens.

This document records **what would follow** from ADR-0014: where a durable
truth lives, by kind, and how it reaches an agent. The ADR records *why*.
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

## Canonical homes, by kind of truth

Architecture is not the only legitimate origin. Which artifact is canonical
depends on **what kind of truth** it is:

| Kind of truth | Canonical home |
|---|---|
| durable system architecture, architectural invariants | accepted ADRs (why) and `docs/architecture/` (what follows) |
| repository governance, coding-agent obligations, review policy | the applicable governed repository contract — root or nested `AGENTS.md`, `CONTRIBUTING.md`, or another explicitly authoritative contract |
| human operational procedures | `docs/operations/` |
| executable or normative platform contracts | their existing governed contract or specification owner — `schemas/`, `openspec/specs/`, or the owning package |
| portable, agent-facing representation of any of the above | `knowledge/platform/` or `knowledge/runbooks/`, **as a projection** |
| how one runtime discovers or queries what it was given | provider instruction files and provider-native skills — **runtime integration only** |

**A knowledge module or runbook is never the sole original**, and this holds for
every row above — not only for architecture. A procedure does not become
canonically owned by `knowledge/runbooks/` merely because it is a procedure: its
canonical home is whichever row it belongs to, and the runbook projects it.

### What a projection may do

A projection **MAY** summarize, subset, transform, reorganize, or restate
semantic content from its governing canonical sources as needed for agent
reasoning.

It **MUST** identify those sources, never claim independent authority for the
projected statement, remain subordinate to them, and is **defective** when it
disagrees materially with them.

**The canonical source owns the truth. The module owns only the agent-facing
representation.**

Note what this is not. "Reference, never restate" would make portable knowledge
a link index — pointers to documents an agent may not be able to open, which
defeats the portability the format was chosen for. Restating is how a projection
works. Restating *while claiming to be the source* is the defect. The line is
authority, not wording.

One that names no governing source is either a projection of nothing or an
original in the wrong place.

## The path

```text
change / review finding
     │  is this durable, or specific to this change?
     ▼
canonical home — chosen by KIND of truth
     architecture / invariant   → docs/decisions, docs/architecture
     governance / review policy → AGENTS.md, CONTRIBUTING.md, other contract
     human procedure            → docs/operations
     normative contract         → schemas, openspec/specs, contract owner
     │  must an agent reason FROM it to work correctly?
     ▼
portable knowledge module or runbook
     │  naming its governing canonical source
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

> If information must survive replacing a provider or runtime, its **canonical
> source must be provider-neutral**. Where agents need to reason from it,
> project the appropriate subset into portable knowledge.

Note what this does *not* say. "It belongs in architecture, knowledge, a
runbook, or a platform contract" would offer `knowledge/` as one origin among
several, and so permit a module to become the original. Knowledge is where a
provider-neutral canonical source is projected *to*.

A skill is an adapter *to* knowledge — how one runtime discovers and queries what
was selected for the run. Making it the home of the knowledge would require a
twin per provider and then an answer to "which twin is canonical?". The root
[`AGENTS.md`](../../AGENTS.md) already says provider instruction files never
change what the documents say — that rule is in force independently of
ADR-0014; what ADR-0014 would add is the extension from routing to content.

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
tuple, or an exploitable specific stays in its canonical home and is not
promoted.

## What is blocked today

**Authoring.** The ADR-0010 validator and toolchain do not exist, precisely so
an unvalidated format does not become load-bearing by accident.
[U7](unresolved-decisions.md#u7) currently tracks that block;
[ADR-0015](../decisions/ADR-0015-adopt-okf-v0-2-as-source-representation-only.md)
(`Proposed`) would separate the format question from the toolchain gate, so a
closed U7 cannot read as permission to author. Under either model the block
holds today, and the path terminates at the canonical home: a change would
determine whether a truth should be promoted and record the determination, and
no module is written.

The L4 orchestration landing
([`openspec/changes/runner-control-orchestration`](../../openspec/changes/runner-control-orchestration/))
is a substantial source of candidates — effect classification and identity,
replay semantics, boundary ownership, and proof construction among them. That
landing is still under falsification, so those are examples rather than a
complete or final set, and further classes may emerge. Each candidate is subject
to the "must an agent reason from it?" criterion when the toolchain gate opens,
and some will not survive it.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) ·
[ADR-0014](../decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
· [ADR-0010](../decisions/ADR-0010-use-okf-for-portable-knowledge-only.md) ·
[ADR-0011](../decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)
