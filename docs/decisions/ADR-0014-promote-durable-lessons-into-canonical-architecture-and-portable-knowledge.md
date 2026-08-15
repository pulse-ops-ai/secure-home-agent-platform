# ADR-0014: Promote durable lessons into canonical architecture and portable knowledge

- **Status:** Accepted
- **Date:** 2026-08-15
- **Accepted:** 2026-08-15
- **Deciders:** @mikegtech (repository owner)
- **Supersedes:** none
- **Related:** [ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md), [ADR-0011](ADR-0011-keep-coding-agent-images-provider-specific.md), [ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md), [ADR-0006](ADR-0006-separate-agent-implementation-profile-run-and-automation.md)
- **Closes:** no unresolved decision. Authoring knowledge remains blocked because the ADR-0010 validator and toolchain do not exist — a block [U7](../architecture/unresolved-decisions.md#u7) currently tracks. [ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) (`Proposed`) would separate the two, so that U7 records whether the format question is answered and a named toolchain gate records whether authoring is safe.

## Context

The repository already says where knowledge lives, what it may contain, and that
it grants nothing ([ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md)).
It already says a coding-agent image carries one runtime and not application
behaviour ([ADR-0011](ADR-0011-keep-coding-agent-images-provider-specific.md)).
It already says provider instruction files are adapters that route an agent to
documents and never change what those documents say (root `AGENTS.md`).

What it does not say is **what happens to a durable architectural truth that is
discovered during implementation or review.**

That gap has a cost, and the cost is now observable. The L4 orchestration
landing (`openspec/changes/runner-control-orchestration`) has already produced
repeated falsification rounds that exposed recurring architectural classes
rather than isolated coding mistakes. Examples of the durable engineering
truths they surfaced — that a fencing token
must be checked at the resource rather than by consulting the lease store; that
publication must be one visibility change rather than several compensating
writes; that a bound belongs at the port rather than at the call site, because a
call site can forget and a port cannot; that an asynchronous operation which can
create durable state before its acknowledgement returns is an *effect* and needs
a stable caller-known identity, with exact replay distinguished from conflicting
replay; that a proof must be exercised against something it must catch, or it is
a lexical proxy for the property it names.

That landing is still under falsification, so the list above is illustrative
rather than complete — further classes may emerge, and this ADR is deliberately
not a register of them. Every one of those is a fact about how this platform is
built. None of them is peculiar to Claude, Codex, or Copilot. Yet each currently survives only in a
change archive, a test file, a PR discussion, or a provider instruction file —
four places that are, respectively, historical, incidental, ephemeral, and
provider-scoped.

The tempting answer is a provider-native "skill" per lesson. That answer is
wrong here, and expensively so: it would make the canonical statement of an
architectural invariant a Claude artifact, then require a Codex twin and a
Copilot twin, and then require somebody to answer which of the three is
authoritative. The repository has spent thirteen ADRs avoiding exactly that
class of question.

The right answer is already latent in the architecture. `docs/architecture/`
plus the accepted ADRs are canonical. `knowledge/` is the portable, agent-facing
projection, already split into `platform/` (models, invariants, vocabulary) and
`runbooks/` (ordered procedures), already registered in `knowledge/INDEX.md`,
already selected by a profile as a named **set** and resolved to exact module
versions recorded in run evidence
([`knowledge-selection-model.md`](../architecture/knowledge-selection-model.md)).
An `architecture-default` set already exists for "reasoning about architecture,
proposing decisions."

What is missing is not a mechanism. It is a **rule that says the promotion must
be considered, and where each layer's authority ends.**

## Decision

### 1. Every durable truth has ONE canonical home, and the home depends on the KIND of truth

A durable truth is canonically stated once. Which artifact is canonical depends
on what kind of truth it is — architecture is not the only legitimate origin,
and treating it as one would either misfile governance and operations or leave
them with no canonical home at all:

| Kind of truth | Canonical home |
|---|---|
| durable system architecture, architectural invariants | accepted ADRs (why) and `docs/architecture/` (what follows) |
| repository governance, coding-agent obligations, review policy | the applicable governed repository contract — root or nested `AGENTS.md`, `CONTRIBUTING.md`, or another explicitly authoritative contract |
| human operational procedures | `docs/operations/` |
| executable or normative platform contracts | their existing governed contract or specification owner — `schemas/`, `openspec/specs/`, or the owning package's contract |
| portable, agent-facing representation of any of the above | `knowledge/platform/` or `knowledge/runbooks/`, **as a projection** |

Every other layer is **subordinate** to the canonical statement. What
subordination means for a portable knowledge projection is stated in §2 — it is
not a prohibition on restating.

### 2. `knowledge/` is the portable, agent-facing projection of durable truths and procedures

Knowledge is not a second architecture, and it is not a second anything else.
It is the form in which a *subset* of canonical truth is packaged so an agent
can reason from it — versioned, validated, digest-addressed, and selected by
profile.

**A knowledge module or runbook is never the sole original.** This holds for
every kind of truth in §1, not only architecture: a procedure does not become
canonically owned by `knowledge/runbooks/` merely because it is a procedure
rather than an invariant. Its canonical home is whichever row of §1 it belongs
to — a governed contract, `docs/operations/`, or a specification owner — and the
runbook projects it.

#### What a projection MAY and MUST do

A portable knowledge projection **MAY** summarize, subset, transform,
reorganize, or restate semantic content from its governing canonical sources as
needed for agent reasoning.

It **MUST**:

- identify its governing canonical source or sources;
- never claim independent authority for the projected statement;
- remain subordinate to those sources;
- be **defective** when it disagrees materially with them.

**The canonical source owns the truth. The knowledge module owns only the
agent-facing representation.**

This is deliberately weaker than "reference, never restate." That formulation
would have turned portable knowledge into a link index — an agent handed a
bundle of pointers to documents it cannot open, which is the opposite of the
portability ADR-0010 chose. Restating is how a projection does its job;
restating *while claiming to be the source* is the defect. The distinction is
authority, not wording.

A module that names no governing source is either a projection of nothing or an
original in the wrong place, and both are defects.

Not every durable truth becomes a knowledge module. Promotion is a judgement,
and the criterion is whether an agent must reason **from** the truth in order to
do its work correctly. A truth that only humans act on stays where §1 puts it.

### 3. `knowledge/platform/` holds models, invariants, vocabulary, semantics, and cross-cutting engineering truths

This confirms and names existing practice: `core-operating-model`, `governance`,
`runner-model`, `degraded-operation`, `review-conventions` are already modules of
exactly this kind.

### 4. `knowledge/runbooks/` holds ordered procedures for applying those truths

Also existing practice: `repository-validation` describes an ordered procedure
and what each step proves. A procedure is knowledge when its *steps and their
justification* are the portable content.

### 5. Provider-native skills are runtime integration artifacts only

A provider-native skill — a Claude skill, a Copilot instruction set, a Codex
equivalent — may adapt a runtime to the platform: how *this* runtime discovers
and queries the knowledge that was selected for the run. It may never be the
sole canonical home of an architectural invariant, an engineering policy, a
review policy, or an operational procedure.

**The test, in the form that does not leak:**

> If information must survive replacing a provider or runtime, its **canonical
> source must be provider-neutral**. Where agents need to reason from it,
> project the appropriate subset into portable knowledge.

The earlier, weaker phrasing — "it belongs in architecture, knowledge, a
runbook, or a platform contract" — offers `knowledge/` as one origin among
several, which permits a module to become the original. It does not. Knowledge
is where a provider-neutral canonical source is *projected to*, never where a
truth first becomes canonical.

This extends the existing root-`AGENTS.md` rule about provider instruction files
from *routing* to *content*, and it is the reason this ADR exists rather than a
paragraph in a README.

### 6. The runner and profile control which knowledge an agent sees; the image does not carry it

Four layers, four responsibilities, and they do not borrow from each other:

| Layer | Controls |
|---|---|
| **image** | what executable runtime exists — provider CLI, OS/tooling surface, supply-chain provenance |
| **profile** | what the run may access — tools, filesystem, network, credentials, **knowledge set**, limits |
| **knowledge** | what the run may reason **from** |
| **task** | what the run is being asked to accomplish |

Baking project knowledge into a runner image would place domain content in a
supply-chain artifact, make it per-provider, and — decisively — make it
invisible to the pre-launch record of what the run knew, which is run evidence.
[ADR-0011](ADR-0011-keep-coding-agent-images-provider-specific.md) keeps the
base image to substrate and each derived image to exactly one runtime; this
decision states the knowledge consequence of that rule rather than restating the
rule.

### 7. Knowledge remains context, never authority

Unchanged and restated only to make the promotion path unable to launder a truth
into an authority. Promoting an architectural invariant into a knowledge module
does not make the module authoritative for that invariant: the ADR or
architecture document remains canonical, and the module is a projection of it.
Authorization, safety bounds, and live state are owned elsewhere
([ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) §3).

### 8. A discovered lesson has an explicit promotion path

```text
change / review finding
     │
     │  which KIND of truth is this?  (§1)
     ▼
canonical home
     architecture / invariant   → docs/decisions, docs/architecture
     governance / review policy → AGENTS.md, CONTRIBUTING.md, other contract
     human procedure            → docs/operations
     normative contract         → schemas, openspec/specs, contract owner
     │
     │  must an agent reason FROM it?
     ▼
portable knowledge module or runbook   ← knowledge/platform, knowledge/runbooks
     │   naming its governing canonical source
     ▼
knowledge set                          ← knowledge/INDEX.md
     │
     ▼
profile-selected resolved bundle       ← knowledge-selection-model.md
     │
     ▼
provider / runtime                     ← any adapter
```

Each arrow is a decision that may legitimately be **no**. The obligation is to
*determine*, in the change that discovered the truth, not to promote everything.

## Consequences

**Positive.** The same knowledge set backs a Codex profile and a Claude profile
identically, so an architectural review means the same thing on either runtime.
A lesson learned once at review cost is available to every later run rather than
being rediscovered. The question "which provider's copy is canonical?" cannot
arise. Existing structure is confirmed rather than replaced — no new top-level
directory, and specifically **no `skills/` directory**.

**Negative.** Every substantial change now carries an extra determination, and
determinations cost review attention. Some will be answered "no" and will look,
in hindsight, like ceremony. Accepted deliberately: the alternative is losing
the truths, which the L4 landing is demonstrating is the more expensive
failure.

**Neutral.** This decision changes no runtime behaviour and adds no dependency.

**Blocked, and stated plainly.** No knowledge module can be authored under this
decision while the ADR-0010 validator and toolchain do not exist. The reason is
unchanged: "authoring bundles first would put unvalidated content in the
repository and make the format load-bearing by accident."

[U7](../architecture/unresolved-decisions.md#u7) currently tracks that block.
[ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md)
(`Proposed`) would split the two facts — U7 recording whether the format
question is answered, a named toolchain gate recording whether authoring is safe
— because a closed U7 must not read as permission to author. Under either model
the block holds today.

This ADR **does not resolve U7 and does not weaken it.** It establishes where a
lesson goes, not when the knowledge layer may be populated. Until then the promotion path terminates at
canonical architecture, and the determination is recorded rather than acted on.

## Alternatives considered

**A provider-native skill suite.** Rejected. It makes the canonical statement of
an invariant a provider artifact, multiplies it per provider, and creates an
unanswerable authority question. It also inverts the dependency: the platform
would depend on a runtime's extension mechanism to state its own architecture.

**Leave lessons in the change archive and tests.** Rejected, on evidence. The L4
landing has gone through repeated review rounds in which the recurring verdict
was that a fix repaired the reported instance without closing the class. A truth
that lives only in the test that caught it is available to whoever reads that
test, which is nobody, later.

**A new top-level `skills/` or `lessons/` directory.** Rejected. The repository
already has the two homes this needs, with a registry, a validator, a selection
model, and run evidence. A third home would compete with both.

**Do nothing until U7 closes.** Rejected as sequencing. The determination costs
nothing to require now and is cheap to record; waiting means the L4 lessons are
cold by the time there is somewhere to put them. Authoring waits for the
toolchain; *deciding where things go* does not have to.

## Security implications

Neutral to positive, with one hazard named.

The promotion path routes engineering truths — not household facts — into
`knowledge/`. `knowledge/AGENTS.md` states the governing rule: a bundle is
portable, non-sensitive, and safe to copy anywhere, **including to a third-party
model provider**. Platform-architecture modules are within that boundary; they
describe how the platform is built, which is already public in intent.

**The hazard.** A lesson discovered during a security-relevant review could
carry an exploitable specific — a concrete bypass, a real identifier, a
credential-adjacent detail. The prohibited-content list in
[ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) and
`knowledge/AGENTS.md` applies unchanged to promoted content, and it is
machine-checked. Promotion is subject to it; it does not create an exception to
it. Where a truth cannot be stated without the specific, it stays canonical in
`docs/` and is not promoted.

This decision grants no capability, no tool, and no authority to any agent, and
§7 forecloses the reading under which it could.

## Availability implications

None. Nothing here is on a runtime path. The knowledge layer remains
specification-only under U7, and a profile that selects a set today resolves
nothing at run time.

## Validation and follow-up obligations

1. `bash scripts/validate-scaffold.sh` — index coherence for the new ADR and the
   new architecture document.
2. `node scripts/check-knowledge.mjs` — unchanged expectations; this ADR adds no
   module, and the specification-only invariants must still hold.
3. **Nothing in this ADR is operative while it is `Proposed`.** There is no
   enforcement surface today, and none may be created by a lower-precedence
   artifact: the root `AGENTS.md` section describing this proposal is explicitly
   non-operative, and a `Proposed` decision that became binding through a file
   below it in the precedence order would invert the order. **On acceptance**,
   the determination obligation takes effect through root `AGENTS.md`. It is
   deliberately not automated: no validator can decide whether a truth is
   durable, and one that claimed to would report success.
4. **When the toolchain gate opens** — the L4 lessons named in Context are candidate material
   for authoring, and the determination recorded in the accompanying change is
   an input to that work. They are examples, not a complete or final set: that
   landing is still under falsification, and further classes may emerge. Each
   candidate is subject to §2's criterion when it is considered.
5. This ADR proposes **no** status change to any existing ADR and resolves **no**
   item in `unresolved-decisions.md`.

## Links

- [ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) — knowledge is
  portable, declares ownership and freshness, and is never an authority
- [ADR-0011](ADR-0011-keep-coding-agent-images-provider-specific.md) — the base
  image carries substrate; a derived image carries one runtime
- [`docs/architecture/knowledge-promotion-model.md`](../architecture/knowledge-promotion-model.md)
  — what follows from this decision
- [`docs/architecture/knowledge-selection-model.md`](../architecture/knowledge-selection-model.md)
  — how a profile selects a set and what a run records
- [U7](../architecture/unresolved-decisions.md#u7) — today's tracker for the block on authoring; ADR-0015 (`Proposed`) would separate the format question from the toolchain gate
- [`openspec/changes/knowledge-promotion-path/`](../../openspec/changes/knowledge-promotion-path/)
  — the change that establishes this model
