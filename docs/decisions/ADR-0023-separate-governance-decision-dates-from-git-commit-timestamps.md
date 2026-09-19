# ADR-0023: Separate governance decision dates from Git commit timestamps

- **Status:** Accepted
- **Date:** 2026-09-17
- **Accepted:** 2026-09-19
- **Deciders:** @mikegtech (repository owner)
- **Refines in part:** [ADR-0021](ADR-0021-establish-machine-readable-governance-state.md) §7a **only for the temporal evidence of ADR acceptance/rejection**, with the directly dependent §7 rejection shape, §8 current checks, §9 history checks, and §§10–11 projection/query dates. See §1 for the exact boundary
- **Supersedes:** no ADR in full. ADR-0021 remains Accepted and immutable
- **Closes:** no unresolved decision
- **Related change:** [governance-state-substrate](../../openspec/changes/governance-state-substrate/proposal.md) — accepted temporal architecture, not implementation authority

---

## Context

Governance-state PR-2's historical extraction exposed a precision error in the
contract, not contradictory human decisions. ADR-0021 §7a requires RFC 3339 time
in the human acceptance attestation. Its same paragraph separates the human act
from a containing commit recorded later. Historical decision records sometimes
establish a **calendar date**, without establishing an instant within that day.
The implementation cannot meet both facts by assigning Git's committer timestamp
to the human decision or inventing an unobserved time of day.

The complete historical audit at durable PR-2A merge
`83e6cd8fa7d2d05ab246a39de039129b4056966d` found 21 Accepted ADRs, 21 exact
transition objects, 20 same-UTC-calendar-date committer timestamps, one
different-date committer timestamp, zero Rejected ADRs, and zero missing
transitions. These are measured corpus facts, not a closed future ADR count.
The different-date case falsifies date equality as a general rule; it is not
an exception to a retained 20/21 rule.

| Positive historical case | Human decision date | Exact transition commit | Encoded Git committer timestamp (UTC) |
| --- | --- | --- | --- |
| ADR-0015 | `2026-08-15` | `a5cc2a739bd9602e30376400a46ebf7b5bab10f1` | `2026-08-15T16:55:25Z` |
| ADR-0022 | `2026-09-01` | `4334a7b040b14911b7b0894aeb14717b0418ee84` | `2026-09-02T08:03:21Z` |

For ADR-0015 the encoded author timestamp is `2026-08-15T16:39:37Z`; it is not
the committer timestamp. The August 18 delivery to main is not the original
transition and supplies neither metadata value.
Its accepted header, structured INDEX record, and original transition record
all identify August 15, consistent with U7's recorded resolution date.

For ADR-0022 the accepted header, structured INDEX acceptance record, transition
commit message, and [PR #117 / PR-A2 record](https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/117)
all say Accepted September 1. Both encoded Git author and committer timestamps are
`2026-09-02T08:03:21Z`; PR #117 was created at `2026-09-02T08:04:12Z`.
The Git metadata and the separate GitHub PR-creation observation do not supply
a September 1 human decision instant. A mutable PR description is supporting
provenance, not an immutable replacement for the byte-bound ADR, INDEX snapshot,
and commit message.

**ADR-0022 disposition:** the owner-recorded decision became effective as an
ADR acceptance dated 2026-09-01. The exact transition encodes a September 2
committer timestamp. The separate September 2 GitHub PR-creation observation
supports later PR recording in this case; the Git timestamp alone does not
establish when the commit was created, received, published or materialized.
Neither the metadata divergence nor that case-specific GitHub evidence rewrites
the governance date. No September 1 time of day is asserted or recoverable from
the identified evidence.

## Decision

**Accepted 2026-09-19 in the same atomic bridge as ADR-0024.** The temporal
replacement below is accepted architecture within the stated boundary.
Both bridge envelopes retain ADR-0021's pre-transition RFC 3339 evidence;
this decision and its planning amendment grant no PR #124 implementation
authority and change no validator.

### 1. Partial refinement, not whole-decision supersession

Only ADR acceptance/rejection evidence replaces its required `at` instant with
`decisionDate`. This applies generically to historical genesis records and
future acceptance/rejection transitions, not just ADR-0022. Superseded ADRs
retain their original acceptance decision date and immutable accepted bytes.
The `Refines in part` / `Supersedes: no ADR in full` convention follows
[ADR-0022's partial refinement](ADR-0022-decouple-typescript-policy-enforcement-from-lint-engine.md).
It creates no formal `supersedes` relationship that would make ADR-0021 globally
Superseded or remove it from the current Accepted set.

All other ADR-0021 decisions remain unchanged: one authored governance-state
authority; primitive/derived separation; immutable accepted/rejected bytes;
digest-bound lifecycle transitions; external human provenance and typed authority
references; non-self-referential evidence; the current/history split; no
authorization inference; atomic activation; and the genesis source-manifest and
owner-ceremony model. Gate/landing identity, completion policies, historical
completion representations, archive identities, and replacement rules do not
change. RFC 3339 `at` remains required by the existing genesis, completion,
withdrawal, and replacement attestation contracts. This is not a generic change
to every attestation timestamp or an alias accepted by a shared time parser.

### 2. Decision date is canonical evidence; Git timestamps are provenance

`decisionDate` is the date a governed human record declares the ADR accepted or
rejected. Its closed representation is a valid ISO calendar date `YYYY-MM-DD`
(Gregorian calendar, years 0001–9999), with no time, offset, or timezone
conversion. It does not assert midnight, noon, the beginning of an enforcement
window, or any sub-day ordering. No current-clock rule or implementation
authorization is derived from it.

`gitCommitterAt` is the timestamp **encoded in the exact Git transition object's
committer metadata**, normalized losslessly to RFC 3339 UTC. `gitAuthorAt`
separately represents its encoded author timestamp. Git permits these values to
be supplied by the commit creator (including through `GIT_COMMITTER_DATE` and
`GIT_AUTHOR_DATE`). Observing them proves what the identified object encodes,
not when it was actually created, recorded, received, published or materialized,
and not the declared human actor's identity or decision instant.

`recordedAt`, if used to mean an independently observed recording-system event,
is a different evidence concept; this decision does not define or add such a
field. Any actual recording-time claim needs separately identified evidence
and its own observation rule. Git metadata must not be relabelled as that proof.

**Storage decision evaluated:** keeping both values in canonical state would
make each Git metadata observation another authored field to maintain,
despite no lifecycle, gate, readiness, or display rule needing it. It would also
invite treating the two fields as rival dates and tempt a containing commit to
store its own identity/time. Omitting transition provenance altogether would
lose the exact-transition replay and make delivery-time substitution undetectable.

**Accepted choice:** keep `decisionDate` in canonical ADR evidence because
human-facing semantics require it. Keep transition identity and encoded Git
timestamps in byte-bound genesis/source-manifest or history audit evidence, not
as new mutable governance primitives. Preserve the existing typed
`reviewedIdentity` evidence field; moving observations outside state does not
delete existing reviewed-byte identity or human evidence. No `gitCommitterAt`,
`gitAuthorAt`, `recordedAt`, or second acceptance-time field is added to canonical
ADR evidence.

### 3. Closed evidence and authoritative agreement

The acceptance/rejection evidence members are exactly:

```text
transitionDigest, contentDigest, outcome, actor,
decisionDate, authority, reviewedIdentity
```

All non-temporal members retain their current types and validation. `outcome`
remains `accepted` or `rejected`; a Proposed decision has no such envelope.
Legacy `at`, a simultaneous `at` and `decisionDate`, a fabricated RFC 3339 value
in `decisionDate`, unknown fields, and missing/invalid dates are refused. This
is a pre-activation schema correction, not a permissive date-or-instant union.

At genesis, structurally parse the human date and actor from the ADR's governed
Accepted/Rejected metadata and structured INDEX decision record, where present.
All applicable authoritative declarations must agree. Missing dates, conflicting
dates/actors, or unparseable required declarations stop the **complete** audit;
the tool reports all affected ADRs and emits no candidate. Git metadata, inferred
timezone conversions, archive dates, and first occurrences on main never fill
missing human evidence.

After activation, state remains the sole authored machine-readable authority.
The atomic ADR transition's header/date is a checked mirror and final bytes are
digest-bound. A generated INDEX date is checked output, not a new independent
human declaration from which state may bootstrap itself. Retained historical
INDEX acceptance records remain immutable sources.

### 4. Exact transitions and decision-date / Git-committer-date divergence

For every historical Accepted/Rejected ADR, including the original acceptance
of a now-Superseded ADR, the source manifest must bind the exact reviewed
lifecycle-transition commit, the expected lifecycle, exact decided bytes,
declared decision date/actor, encoded author and committer timestamps, extraction
rule, and the structural sources used. Original locally available transition
objects are local evidence even if main received their bytes through a later squash.
Missing objects fail closed; an opaque identity is not silently promoted to
local proof. Main delivery, squash merge, and archive commits are not substitutes.

`committerUtcDateDiffers` is the comparison
`UTC-date(gitCommitterAt) != decisionDate`: a comparison fact only, **not a
refusal by itself** and not proof of recording latency or temporal ordering.
Every difference requires explicit reviewed source-manifest disposition linking
the agreeing decision records and the exact
transition's explicit record of the same decision date. The generic disposition
describes decision-date / Git-committer-date divergence, not proven delay. It
cannot override conflicting decision records, missing bytes, a missing transition,
or a changed date. It is not an ADR-ID allowlist.
ADR-0015 and ADR-0022 are both ordinary positive applications of this rule.

For future post-activation transitions, history observes the actual committed
transition and may emit a separate audit receipt **after** the commit exists.
No state or containing manifest must contain its own future commit ID or
encoded timestamp. The human attestation still binds final bytes and the
transition digest in the atomic registry/header change; a later audit receipt
cannot supply a missing human attestation or authorize a transition.

### 5. Digest identity is not permission to mutate evidence

`decisionDate` is canonical human-evidence metadata, like actor, authority and
the former `at`, not a new input to the lifecycle primitive projection.

- **`primitiveDigest`:** excludes `decisionDate` with the other acceptance
  attestation metadata. The acceptance `contentDigest` remains included. No
  Git timestamp is introduced into that projection.
- **`transitionDigest`:** preserves ADR-0021 §7a's exact preimage and
  attestation exclusion. Replacing metadata representation does not create a
  different causal Proposed → Accepted/Rejected identity when all existing
  preimage inputs are held equal. A source identity correction cannot re-author
  that transition. No decision-date or Git-time comparison becomes a lifecycle
  ordering rule.
- **Other bindings:** exact candidate bytes, source-manifest evidence and their
  existing freeze/freshness bindings still protect the metadata. A candidate
  change changes its byte identity even when `primitiveDigest` does not; no
  claim is made that the attestation-excluding seed digest alone binds dates.
- **History:** after genesis or ordinary acceptance/rejection, `decisionDate`
  is immutable, including across later supersession. Direct field comparison
  and source-evidence/history checks refuse mutation even when an attacker
  recomputes every digest. This decision creates no in-place date-correction or
  provenance-rebinding exception to existing immutable evidence rules.

### 6. Projections and queries preserve date precision

Every displayed Accepted/Rejected date comes from validated `decisionDate`.
Any derived U-resolution date comes from its current accepted resolver's
`decisionDate`: ADR-0015 keeps U7 resolved on `2026-08-15`. Machine query output
uses `resolvedOn` for this date, not a timestamp-shaped `resolvedAt`; an
unresolved question returns `resolvedOn: null`. No date-to-instant compatibility
alias is provided. ADR-0022 displays Accepted `2026-09-01`.

Git author/committer time, squash time, first main occurrence, and archive time
must never supply these dates. An explicitly labelled provenance report may
show an encoded Git timestamp alongside the date, without feeding a derived
governance result. Existing query delivery/readiness/authorization axes and
fail-closed validation remain unchanged.

## Consequences

Positive: historical records remain honest at their actual precision; decision
dates may differ from encoded Git dates; one shared model supplies dates to every
consumer. The audit retains exact objects without claiming Git authenticates a
human or establishes actual recording time.

Cost: a closed schema change and source-manifest/history/projection proof are
required before PR-2 can resume. Previously prepared candidate bytes and digests
cannot be reused as if representation were unchanged. Their later regeneration
needs a refreshed implementation authorization, not this acceptance.

Neutral: this acceptance changes no implementation, dependency, compiler gate,
runtime or canonical registry, and no previously Accepted ADR or historical
acceptance record.

## Alternatives considered

1. **Use the Git committer timestamp as acceptance time.** Rejected: it falsifies
   ADR-0022's agreeing September 1 decision records and gives Git metadata a
   human-decision meaning it does not establish.
2. **Invent a time on the human date.** Rejected: midnight/noon and truncation
   introduce precision no source provides; offset manipulation does the same.
3. **Keep a date-or-instant union.** Rejected: projections and comparisons would
   need two meanings for one field, and a fallback could recreate the defect.
4. **Store both date and Git timestamp in canonical state.** Considered in §2;
   rejected because provenance evidence provides replay without another
   mutable primitive or self-referential commit requirement.
5. **Drop transition provenance, or waive only ADR-0022.** Rejected: the first loses
   exact-transition proof; the second preserves a rule the corpus disproves.
6. **Retrospectively attest a new September 1 instant.** Rejected: a new human
   review now is neither the historical decision nor an observation of its
   original time. The real genesis ceremony remains a separate human act.

## Security implications

Date agreement and exact-byte/transition checks remain fail-closed. A date-divergence
disposition cannot launder conflicting evidence, bypass the manual provenance
boundary, weaken accepted-byte immutability, or issue authorization. The history
check protects excluded evidence metadata independently of causal digest
identity. No device, credential, trust-zone, or runtime boundary changes.

## Availability implications

Validation stays offline and dependency-light. Required historical objects must
be locally available; transition provenance that cannot be observed is a visible
refusal, never an invented timestamp. The complete audit prevents a partly
validated corpus from becoming a frozen seed. Governance tooling remains a
repository control, not a household runtime dependency.

## Validation and follow-up obligations

1. Preserve the independently reviewed partial refinement and storage/digest
   choice; acceptance is the separate human act, not proposal approval.
2. Preserve the bridge's pre-transition ADR-0021 RFC 3339 evidence. Keep PR #124
   paused, candidate bytes/digests unchanged, `governance/state.json` absent,
   PR-3 unauthorized, ADR-0020 Proposed, and PR #101 untouched.
3. After this acceptance lands and a later exact-base owner implementation
   refresh, implement through the existing shared model and thin entry points.
   The [design D12](../../openspec/changes/governance-state-substrate/design.md#d12-contingent-decision-date-amendment-adr-0023)
   owns the source-manifest details, extraction, and dependent source refresh.
4. Prove both named positive cases, the complete source-bound historical corpus,
   rejection fixtures, exact-transition replay, digest invariance, immutable
   dates, renderer/query date behavior, and the boundary between encoded Git
   metadata and independently observed recording events. The
   [assurance corpus](../../openspec/changes/governance-state-substrate/assurance.md#contingent-temporal-proof-obligations-adr-0023)
   requires hostile production-entry-point tests, not just example prose.
5. Acceptance validation supplies no executed temporal implementation proof,
   candidate freeze, real owner genesis attestation, or activation review.

**Promotion determination (ADR-0014):** the decision/provenance distinction is
durable architectural meaning and belongs in this accepted ADR, with subordinate
planning details. It must not live only in the PR-2 audit or coding-agent notes.
A portable governance-knowledge projection may be useful after acceptance, but
none is authorized or authored here; it must never project a Proposed rule as
operative architecture.

## Links

- [Decision index](INDEX.md) — joint bridge acceptance records
- [ADR-0021](ADR-0021-establish-machine-readable-governance-state.md#7a-relationship-provenance-bootstrap-proof-and-evidence-identity) — unchanged contract, partially refined only as specified above
- [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) and [promotion model](../architecture/knowledge-promotion-model.md) — canonical home and subordinate projections
- [ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) and [original transition](https://github.com/pulse-ops-ai/secure-home-agent-platform/commit/a5cc2a739bd9602e30376400a46ebf7b5bab10f1) — same-day positive case
- [ADR-0022](ADR-0022-decouple-typescript-policy-enforcement-from-lint-engine.md) and [original transition](https://github.com/pulse-ops-ai/secure-home-agent-platform/commit/4334a7b040b14911b7b0894aeb14717b0418ee84) — decision-date / Git-committer-date divergence positive case
- [Planning proposal](../../openspec/changes/governance-state-substrate/proposal.md), [design](../../openspec/changes/governance-state-substrate/design.md), [assurance](../../openspec/changes/governance-state-substrate/assurance.md), [tasks](../../openspec/changes/governance-state-substrate/tasks.md), and [specification delta](../../openspec/changes/governance-state-substrate/specs/governance-state/spec.md)

---

**Accepted and immutable.** Accepted with ADR-0024 in one atomic bridge.
Acceptance grants no implementation authority and does not resume PR #124.
