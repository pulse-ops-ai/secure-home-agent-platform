# Design: knowledge-promotion-path

> **In force.** ADR-0014 was accepted 2026-08-15. Authoring knowledge remains
> blocked separately, on the ADR-0010 toolchain.

## Context

Canonical homes already exist for several kinds of durable truth — accepted ADRs
and `docs/architecture/` for architecture, governed repository contracts for
governance and review policy, `docs/operations/` for human procedures,
specification owners for normative contracts. `knowledge/` is the agent-facing
projection, and provider files are adapters. What does not exist is the rule
that connects them when a change discovers something durable — so discovered
truths stay where they were found, and are found again later at review cost.

## Goals

- One canonical statement per durable truth, in the home its KIND determines,
  referenced rather than copied.
- `knowledge/` as projection only — never the sole original for any kind, while
  free to summarize, subset, transform, reorganize, or restate for agent use.
- A named destination and a named obligation for a discovered truth.
- Provider neutrality preserved structurally, not by convention.

## Non-Goals

- The OKF toolchain. Any knowledge module. Any `skills/` directory.
- Resolving U7.
- Automating the determination. No validator can decide whether a truth is
  durable; pretending otherwise would produce a check that passes vacuously.

## Current Architecture

```text
docs/decisions/     why — accepted ADRs, highest authority
docs/architecture/  what follows
AGENTS.md, CONTRIBUTING.md
                    governance, coding-agent obligations, review policy
docs/operations/    human operational procedures
schemas/, openspec/specs/
                    normative platform contracts
knowledge/platform/ platform self-description modules (registered, unauthored)
knowledge/runbooks/ ordered procedures (registered, unauthored)
CLAUDE.md, .github/ provider adapters — routing only
```

A change that discovers a durable truth writes it into its own archive, its
tests, or the PR conversation. Nothing routes it further.

## Proposed Architecture

```text
change / review finding
     │  durable, or specific to this change?
     ▼
canonical home — chosen by KIND (architecture · governance contract ·
                 operations · normative contract)
     │  must an agent reason FROM it?
     ▼
portable knowledge module or runbook
     │  which sets require it — and which deny it?
     ▼
knowledge set → profile-selected bundle → provider / runtime
```

Every arrow may legitimately answer **no**. Most findings stop at the first.

## Decisions

### D1: The ADR is required rather than a README paragraph

Rules 1–4 and 7 largely confirm existing practice and could have been written as
documentation. Rules 5, 6, and 8 could not: rule 5 constrains what a provider
artifact may be canonical *for*, which extends an existing `AGENTS.md` rule from
routing to content; rule 6 states a knowledge consequence of ADR-0011; rule 8
creates a standing obligation on every future change. Root `AGENTS.md` is
explicit that a task prompt cannot authorize crossing an architectural contract
and that the correct output is a proposed ADR. This is that.

### D2: One architecture document, not text duplicated into the ADR

`docs/AGENTS.md`: decisions record why, architecture records what follows, and
cross-referencing beats duplication. ADR-0014 carries the decision and its
rationale; `knowledge-promotion-model.md` carries the path, the layer table, and
what is blocked. Neither restates the other.

### D2b: The taxonomy is type-aware, and knowledge is never an origin

An earlier draft named only architecture as the canonical home. That would have
misfiled governance, review policy, and operational procedure — or, worse, left
them with no home and let a `knowledge/runbooks/` module become their original
by default. A procedure does not change its owner by being projected. So the
canonical home is chosen by the KIND of truth, and every module names the source
it projects.

Subordination is about AUTHORITY, not wording. A projection may restate freely —
"reference, never restate" would have made portable knowledge a link index, which
defeats the portability the format was chosen for. It may not claim to be the
source, and it is defective when it materially disagrees with one.

The provider-replacement test is stated in the form that does not leak: *if
information must survive replacing a provider or runtime, its canonical source
must be provider-neutral; where agents need to reason from it, project the
appropriate subset into portable knowledge.* The weaker phrasing — "it belongs
in architecture, knowledge, a runbook, or a platform contract" — offers
`knowledge/` as one origin among several.

### D3: The obligation is to determine, not to promote

A rule that required promotion would produce ceremonial modules for truths no
agent reasons from, and would inflate every set — against the least-context
control in `knowledge/AGENTS.md`. Requiring the *determination* keeps the cost
proportional and makes a negative answer a satisfying answer.

### D4: The rule lands in root `AGENTS.md`, not in a nested one

The obligation applies to any change anywhere — a service, a package, a
document. Nested files exist only where a subtree has rules the root cannot
express, and this is not subtree-scoped.

### D5: Authoring stays blocked, and the ADR says so in its own Consequences

Stating the block inside the decision rather than only in this change means the
constraint travels with the ADR when this change is archived.

## Decision Tables

| Discovered thing | Canonical home | Projected to knowledge? |
|---|---|---|
| a durable invariant an agent must reason from | ADR or `docs/architecture/` | yes, when the toolchain gate opens |
| a durable invariant only humans act on | ADR or `docs/architecture/` | no |
| a coding-agent obligation or review policy | governed repository contract | yes, when the toolchain gate opens |
| a human operational procedure | `docs/operations/` | only if an agent executes it |
| a normative contract | its specification owner | as semantics, when the toolchain gate opens |
| a defect specific to one change | the change archive | no |
| how one runtime queries knowledge | provider artifact | not applicable |

## Interfaces and Contracts

No code interface. The contract surfaces are: root `AGENTS.md` (which would
carry the obligation on acceptance, and today carries an explicitly
non-operative description of it), `docs/decisions/INDEX.md` (the mapping rows
that route a future author), and `docs/architecture/INDEX.md`.

## Failure Classification Boundaries

A missing determination is a **review** failure, not a validation failure, and is
deliberately not machine-checked — see Non-Goals. A missing index entry for the
new ADR or document **is** machine-checked, by `scripts/validate-scaffold.sh`.

## Shared vs Independent Logic

Nothing shared; nothing executable.

## Compatibility and Migration

No migration. Existing modules, sets, and the catalog are untouched. No existing
document changes meaning; root `AGENTS.md` gains a section and two index tables
gain rows.

## Security Implications

The prohibited-content rules of ADR-0010 and `knowledge/AGENTS.md` apply to
promoted content unchanged and are machine-checked. Promotion creates no
exception to them, and rule 7 forecloses reading a promoted module as an
authority. A truth that cannot be stated without an exploitable specific is not
promoted.

## Landing Seams

One landing. Documentation and governance only; nothing to sequence behind
anything else.

## Open Questions

Deferred to authoring time, not blocking: whether architecture *design* and
architecture *falsification* warrant separate knowledge sets. Least context
argues yes; it is a `knowledge/INDEX.md` decision and cannot be taken before U7
opens.
