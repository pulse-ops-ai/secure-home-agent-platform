# Assurance Plan: okf-format-decision

> **In force.** ADR-0015 was accepted 2026-08-15 and U7 is RESOLVED. The
> **structural** invariants below are established. Every **behavioural** one
> remains unproven and is deferred to the implementation landing — the toolchain
> does not exist, and a decision cannot prove a behaviour it has not built.

## Purpose

Establish that the format decision is evidence-backed, that no OKF trust signal
can become authority, and that neither acceptance nor this change opens
authoring.

## Risk Classification

`low` for what lands, `high` for what it decides.

Nothing executable ships and no runtime path is touched. But the decision fixes
the format for every future knowledge module, and it introduces a vocabulary
(`verified`, `human-reviewed`) whose plain reading is an authorization concept.
A future component misreading it would recreate the shadow-policy-source failure
ADR-0010 exists to prevent. The invariants are aimed there.

## Critical Invariants

| ID | Invariant | Class |
|---|---|---|
| KF-INV-01 | The decision rests on the CURRENT upstream specification, read directly and cited, not on recollection | trust |
| KF-INV-02 | OKF is adopted as source representation only; packaging, digest, query, and admission remain this repository's | trust |
| KF-INV-03 | The version is pinned; a different `okf_version` is refused, and moving the pin needs a superseding ADR | trust |
| KF-INV-04 | Admission rejects; consumption tolerates. Neither posture is applied at the other's layer | behavior |
| KF-INV-05 | Digest identity is over raw bytes; envelope violations are rejected, not normalized | behavior |
| KF-INV-06 | **No OKF trust, provenance, or lifecycle signal is an input to execution authority, capability, authorization, safety policy, or live-state interpretation** | trust |
| KF-INV-07 | U7 tracks whether the question is ANSWERED — closed 2026-08-15. `blockedByToolchain` tracks whether authoring is SAFE — still `true`. One state variable never stands for both, and the migration proving it was atomic with the closure | trust |
| KF-INV-09 | `as_of` (factual currency) is distinct from `generated.at` (production time); regeneration never advances factual currency | behavior |
| KF-INV-10 | Execution-bearing OKF content — `Attested Computation`, `runtime`, `computation`, `executor`, `attester` — is refused at admission, by field as well as by type, and the refusal is proven by EXECUTABLE negative tests before the gate opens | trust |
| KF-INV-11 | The manifest's byte serialization is normative and versioned, so two conforming implementations agree on a bundle digest | behavior |
| KF-INV-12 | ADR-0014 is `Accepted` before ADR-0015 may be; `governs` has no meaning without its canonical-source model | trust |
| KF-INV-13 | The acceptance commit migrates `blockedByU7` → `blockedByToolchain` ATOMICALLY with closing U7, so no state exists in which U7 is closed and the only named block is an item that is no longer open | trust |
| KF-INV-14 | Module metadata has ONE authority: the catalog. Frontmatter mirrors it, and a material disagreement is an admission failure — never a merge or a silent precedence rule | trust |
| KF-INV-08 | Nothing is operative while ADR-0015 is `Proposed`, and no lower-precedence artifact makes it so | trust |

## State-Space Model

| Dimension | Values |
|---|---|
| ADR-0015 | `Proposed` (today) · `Accepted` |
| implementation gate | unsatisfied (today) · satisfied |
| authoring | blocked (today, and in three of four combinations) · permitted |

Authoring is permitted in exactly one cell: accepted **and** gate satisfied.
Stating the table is the point — it is the cell an accepted-but-unimplemented
reading would wrongly claim.

## Proof Obligations

| ID | Invariant | Class | Proof |
|---|---|---|---|
| KF-EX-01 | KF-INV-01 | evidence | `okf/SPEC.md`, `okf/README.md`, and directory listings of `okf/src`, `okf/tests`, `okf/samples`, retrieved 2026-08-15 and cited in the ADR |
| KF-EX-02 | KF-INV-01 | evidence | the absence of an upstream validator, conformance suite, and machine-readable schema is established by listing, not assumed |
| KF-EX-03 | KF-INV-05 | spike | one frontmatter block re-serialized three defensible ways produced three digests, none matching the original bytes |
| KF-EX-04 | KF-INV-06 | structural | ADR-0015 §10 states a prohibition, not a mapping, and confines the fields to the knowledge plane |
| KF-EX-05 | KF-INV-07 | structural | U7's pointer says it closes ON ACCEPTANCE and that closing is not permission to author; §12 is an implementation obligation, not U7's state |
| KF-EX-09 | KF-INV-09 | structural | the profile requires `as_of` separately, and the ADR cites the upstream definition of `generated.at` as last meaningful content change |
| KF-EX-10 | KF-INV-10 | structural | §5b refuses the type and the four execution-bearing fields, citing the upstream sentence that a `resource` may be a Skill, script, or container |
| KF-EX-11 | KF-INV-11 | structural | §6 pins the manifest line format, ordering, prefix, and what the final digest hashes |
| KF-EX-12 | KF-INV-12 | structural | §3a states the ordering constraint and the acceptance obligations list it first |
| KF-EX-13 | KF-INV-13 | structural + search | §13 inventories the files and fields the acceptance commit must migrate, AND requires a stale-semantics sweep before and after, because a hand-written list is exactly the artifact that goes stale — this one already did once |
| KF-EX-14 | KF-INV-14 | structural | §5a fixes the catalog as authoritative and the frontmatter as a mirror, with the field mapping and a reject-on-disagreement rule |
| KF-EX-15 | KF-INV-10 | deferred, executable | §12 requires a failing negative test for `Attested Computation` and for each of `runtime`, `computation`, `executor`, `attester`, including one under a different `type` |
| KF-EX-06 | KF-INV-08 | structural | no lower-precedence artifact presents the decision as operative |
| KF-EX-07 | KF-INV-04 | review | the spec delta carries a negative scenario for conflating the two layers |
| KF-EX-08 | — | structural | `check-knowledge.mjs` still passes; no module, set, or catalog entry added |

## Verification Strategy

Evidence and structure. `bash scripts/validate-scaffold.sh` for index coherence,
`node scripts/check-knowledge.mjs` to confirm the knowledge specification is
untouched, `bash scripts/check.sh` for the aggregate.

**Deferred to the implementation landing, deliberately.** Every behavioural
invariant here — pinning, admission/consumption split, digest reproducibility,
envelope rejection, reference integrity — is unproven until the toolchain exists.
That is not a gap in this change; it is the reason ADR-0015 §12 requires a
conformance suite with a failing negative case per prohibited-content class
before authoring. A decision cannot prove a behaviour it has not built.

## Review Plan

Owner review of the ADR before acceptance. The two things worth the most
attention: whether §10's prohibition is airtight, and whether §12's gate is
stated clearly enough that "U7 answered" cannot be read as "authoring open".

## Rollout and Rollback

`not_applicable` with reason: decision and evidence only, no runtime surface, no
consumer. Rollback is reverting the commit; nothing depends on it.

## Assurance Completeness

**Requirements lacking proof:** the behavioural ones, named above, with the
landing that will prove them.

**Known gap, stated rather than hidden.** This change cannot demonstrate that
OKF works for us — only that it is the right thing to try, and why. If the
toolchain landing discovers that the profile cannot be expressed within OKF's
conformance rules, the correct output is a superseding ADR, not a
quietly-widened validator.
