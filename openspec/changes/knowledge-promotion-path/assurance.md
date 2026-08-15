# Assurance Plan: knowledge-promotion-path

## Purpose

Establish that the promotion rule is stated once, resolves through both indexes,
and cannot be read as granting authority or as resolving U7.

## Risk Classification

`low`, with one elevated concern.

Nothing here is on a runtime path, adds a dependency, or changes what
`knowledge/` may contain. The elevated concern is **governance**: an ADR that
appeared to resolve U7, or a rule that appeared to make a knowledge module
authoritative, would be a serious defect in a repository whose highest authority
is its decision record. The invariants below are aimed at exactly that.

## Critical Invariants

| ID | Invariant | Class |
|---|---|---|
| KP-INV-01 | A durable truth is canonically stated once; other layers reference it. No text is duplicated between ADR-0014 and `knowledge-promotion-model.md` | trust |
| KP-INV-02 | A provider-native skill or instruction file is never the sole canonical home of an architectural invariant, engineering policy, review policy, or operational procedure | trust |
| KP-INV-03 | Project knowledge reaches a run through the profile-selected set, never through the runner image | trust |
| KP-INV-04 | Promotion confers no authority: a projected module never overrides its canonical source, and grants no tool or capability | trust |
| KP-INV-05 | The obligation is to DETERMINE. A recorded negative answer satisfies it | behavior |
| KP-INV-06 | This change resolves no unresolved decision and changes no ADR status; U7 still gates all authoring | trust |

## State-Space Model

| Dimension | Values |
|---|---|
| durability of a finding | durable · change-specific |
| who must reason from it | agent · human only |
| form | model/invariant · ordered procedure |
| U7 | open (today) · closed |

The only state reachable today is **U7 open**, in which every promotion
terminates at canonical architecture regardless of the other dimensions.

## Proof Obligations

| ID | Invariant | Class | Proof |
|---|---|---|---|
| KP-EX-01 | KP-INV-06 | structural | ADR-0014 is `Proposed`; no other ADR's status line changes in this diff |
| KP-EX-02 | KP-INV-06 | structural | `unresolved-decisions.md` is unmodified; U7 remains open |
| KP-EX-03 | KP-INV-01 | structural | the new ADR and the new architecture document appear in their indexes; `validate-scaffold.sh` fails otherwise |
| KP-EX-04 | KP-INV-04 | review | ADR-0014 §7 and the architecture document both state that a projection is never authoritative for what it projects |
| KP-EX-05 | KP-INV-02 | review | the rule is stated in root `AGENTS.md`, which governs every agent, rather than in any provider adapter |
| KP-EX-06 | — | structural | `check-knowledge.mjs` still passes: no module, set, or catalog entry was added |

## Verification Strategy

Static and structural. `bash scripts/validate-scaffold.sh` for index coherence
and OpenSpec governance; `node scripts/check-knowledge.mjs` to confirm the
knowledge specification is untouched; `bash scripts/check.sh` for the aggregate.

**What is deliberately not automated.** KP-INV-05 — no validator can decide
whether a truth is durable, and a check that pretended to would pass vacuously,
which this repository has already been bitten by. It is a review obligation and
is named as one.

## Review Plan

Owner review of the ADR before any acceptance. Acceptance is a separate,
human-only change; this change proposes and does not accept.

## Rollout and Rollback

`not_applicable` with reason: documentation and governance only, no runtime
surface, no consumer. Rollback is reverting the commit.

## Assurance Completeness

**Requirements lacking proof:** none — every requirement in the spec delta maps
to a proof above or is explicitly a review obligation.

**Known gap, stated rather than hidden.** The determination obligation is
unenforceable by tooling. Its only real enforcement is review attention, and it
will be missed sometimes. The alternative — a validator that guesses at
durability — would be worse, because it would report success.
