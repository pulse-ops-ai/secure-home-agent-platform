# ADR-0024: Permit one atomic pre-registry governance acceptance bridge

- **Status:** Accepted
- **Date:** 2026-09-19
- **Accepted:** 2026-09-19
- **Deciders:** @mikegtech (repository owner)
- **Refines in part:** [ADR-0021](ADR-0021-establish-machine-readable-governance-state.md) §12's bounded-bootstrap-exception boundary, and only the directly dependent §§7–7a pre-registry acceptance protocol for the single pair below
- **Supersedes:** no ADR in full. ADR-0021 remains Accepted and byte-immutable
- **Closes:** no unresolved decision
- **Related change:** [governance-state-substrate](../../openspec/changes/governance-state-substrate/proposal.md) — selected and consumed bridge, not implementation authority

## Context

ADR-0021 §12 makes its acceptance the final manual governance transition. Its
final sentence in step 2 anticipates a future bounded exception, but requires
exact scope, fail-closed behavior and mandatory expiry; it selects none. Section
7 requires later acceptance through the atomic registry/header protocol.

The registry cannot yet activate honestly: PR-2's historical audit needs
[ADR-0023](ADR-0023-separate-governance-decision-dates-from-git-commit-timestamps.md)'s
reviewed distinction between a governed decision date and encoded Git metadata.
In particular, ADR-0022 records acceptance on 2026-09-01, while its exact
transition encodes a committer timestamp on September 2. Inventing precision,
changing that human date or weakening extraction would corrupt the evidence.
Yet accepting ADR-0023 before activation through the old manual path would
cross ADR-0021 §12. This is a bootstrap cycle, not implementation permission.

The proposal is based on exact main
`5815094efcc85164bf9bf95fd0cda03192ebb7dc`, the durable merge of PR #128's
independently reviewed head `a443e192ee02e66c9fbaefefbadfbb877650ea32`.
ADR-0023 was Proposed at that base. Its filename cleanup in the proposal preserved
every ADR byte: SHA-256
`86c118c26a1632f6448bf2ce54d262c67ff1d25f7768df0fc90177ee2c38a7fb`.

ADR-0022's post-ADR-0021 manual acceptance is an immutable historical fact and
evidence of this inconsistency, **not authority or precedent** for another such
transition. This bridge must neither retroactively authorize it nor rewrite its
ADR, INDEX acceptance record or evidence. Genesis must retain any required
historical-process disposition explicitly in source/provenance evidence.

## Decision

**Accepted 2026-09-19 in the same atomic bridge as ADR-0023.** This joint
transition selects and consumes the exact exception below. There is no
Accepted-but-unused exception. Once this transition reaches durable main,
the bridge is permanently expired; it grants no future pre-registry manual
acceptance and no implementation authority.

### 1. Bootstrap-legality argument and narrow boundary

ADR-0021 §12 step 2's final sentence is the existing architectural authority to
**define** a future bounded exception. It is not an already-open exception or
permission for a coding agent to waive the registry rule. This ADR defines the
missing exact scope, refusal conditions and expiry; OpenSpec only specifies
subordinate proof and procedure.

The legality argument is that a separately reviewed human decision
can select that expressly anticipated exception **and consume it in the same
atomic act**. There is no earlier revision in which a Proposed ADR authorizes
itself, and no intermediate Accepted exception waiting for a later use.
Independent review must explicitly accept this argument before the owner issues
any joint bridge-acceptance instruction. If review cannot justify the selection
under §12, STOP: do not proceed by ordinary owner instruction, a green check,
PR #128's merge, this proposal's approval, or ADR-0022's historical example.

The sole refinement to §§7–7a is replacing the unavailable registry/header
carrier and registry-based transition preimage for this **one pre-registry
pair** with the bound bridge receipt below. This is not genesis. All ordinary
registry transition preimages and temporal rules outside this pair remain
unchanged. Preserve one authored state authority after activation, primitive
versus derived state, immutable accepted ADRs, typed external human evidence,
digest-bound transitions, non-self-reference, current/history separation, no
authorization inference, atomic activation and the genesis source-manifest model.
No whole-decision supersession or formal `supersedes` relation is introduced.

### 2. One atomic pair, no open manual mode

Select a **one-shot atomic bridge**, identified as `pre-registry-adr-pair-v1`:

```text
exact authorized base B          one legal resulting main revision S
ADR-0024 Proposed          ->    ADR-0024 Accepted
ADR-0023 Proposed          ->    ADR-0023 Accepted
canonical state ABSENT           canonical state ABSENT
no bridge authority in use       bridge permanently EXPIRED
```

Both lifecycle changes must appear together, with all required manual mirrors,
in one reviewed target. Neither singleton target is legal. No intermediate
main revision may contain an Accepted ADR-0024 with an unused bridge; splitting
the pair into commits later made reachable from main is not an atomic bridge.
The exact changed governance-subject set is `{ADR-0023, ADR-0024}`.

There is no permission for another ADR, ADR-0020 acceptance, U4 resolution,
GATE-U4 satisfaction, a landing lifecycle transition, implementation authority,
canonical state creation, registry activation or a second mutable authority.
The future acceptance change contains only the two ADR metadata/status deltas,
necessary manual mirrors, status-only planning reconciliation and immutable
bridge evidence. It changes no executable mechanism or candidate fixture.

### 3. Exact bytes and human evidence, not numbers alone

The eventual owner act and independent acceptance review must bind:

- exact live main **B**, which contains the independently reviewed and merged
  Proposed ADR-0024 and the completed ADR-0023 rename;
- both proposal paths, exact proposal SHA-256s and their reviewed identities;
  ADR-0023 must trace byte-for-byte to the PR #128 identities above;
- both final Accepted ADR SHA-256s, with an enumerated proposal-to-acceptance
  diff restricted to lifecycle/acceptance metadata and status sentences made
  false solely by acceptance; no architectural body rewrite;
- the complete pair, its bridge digest and both subject transition digests;
- explicit human acceptance evidence for **both** ADRs, the actual owner actor,
  the exact evidence source/bytes and a typed authority reference;
- the complete manual-mirror inventory and the independent review's exact
  candidate revision/tree, including proof that no other subject changed;
- canonical state absence at B and target, unchanged accepted ADRs, unchanged
  PR #124 head/candidate and PR #101 head, and every refusal condition in §5.

The proposal selected no B, accepted-byte candidate, acceptance date, human
attestation or S. This acceptance binds those first four facts in the separate
bridge evidence; S is not selected before merge. No future containing commit/hash
is embedded in this ADR. The receipt carries the already-existing proposal identities.
Any changed bound proposal bytes invalidate the candidate and require fresh
review; owner authority cannot be silently carried over to revised bytes.

### 4. Pre-transition time and non-self-referential binding

Both bridge acceptance envelopes use **ADR-0021 §7a's pre-transition RFC 3339
`at` requirement**. ADR-0023 is Proposed in B, so its future date-only envelope
must not validate either member of the very transition that activates it. There
is no hidden sequential acceptance of ADR-0024 first or ADR-0023 first.

A future joint owner instruction must explicitly accept both exact candidates
and their digest-bound bridge. Retain its exact content and the exact timestamp
associated with that instruction in the controlling session/evidence source.
If either subject's acceptance or timestamp is unavailable or ambiguous, REFUSE.
One joint instruction may supply both envelopes, but each must bind its own
subject/content/transition digest. The earlier ADR-0023-only instruction is
not joint acceptance and cannot be reused as the bridge owner act.

Do not infer acceptance or `at` from branch creation, Git author/committer
metadata, PR creation, review approval, CI or merge time. Do not fill a date
with midnight/noon. Source observation and typed-reference shape do not prove
human identity: independent manual provenance review remains required.

The owner also declares the governed decision date for each Accepted header
and INDEX record. These dates need not be inferred from, or forced to the UTC
calendar date of, `at`. After the atomic pair, ADR-0023 governs subsequent ADR
date semantics. Later authorized genesis extraction uses those declared
`decisionDate` values while preserving the original RFC 3339 envelopes and
their exact sources as immutable historical evidence outside canonical state.
It must not rewrite an old envelope into date-only evidence, mislabel Git time
as human time, or add a second timestamp primitive to canonical state.

Use a domain-separated bridge digest over B and the exact two proposal/target
content tuples. Each subject digest additionally binds that common bridge
digest, subject, Proposed-to-Accepted transition and final content digest.
Human envelopes are excluded from both causal preimages and are separately
byte-bound in the immutable receipt. This explicitly defined exception must
not masquerade as ADR-0021's ordinary registry transition or a fabricated
genesis with `priorStateDigest: null`. Design D13 fixes the closed preimages.

The receipt lives with reviewed change evidence, not at `governance/state.json`.
Neither accepted ADR nor receipt contains its own future containing commit ID,
tree hash or self-digest. Independent review binds the completed candidate
externally; after merge, external/post-transition evidence identifies actual S
and the original pair transition. Preserve replayable objects/bytes; a squash
must not silently orphan the exact transition needed by later extraction.

### 5. Conjunctive refusal conditions

Every following condition is required, not an alternative source of permission:

1. Freshly read live main equals the exact owner-authorized B, both before
   preparation and immediately before merge. The reviewed candidate is unchanged.
2. Both ADRs are Proposed at their exact reviewed proposal bytes/paths in B;
   ADR-0023's PR #128 lineage and pure rename are verified.
3. ADR-0021 remains Accepted at its recorded SHA-256
   `0db0b5b7d3342b13b2f23602d3f7017f993705410d3e9a9966b1577cfd8cd66a`;
   all previously Accepted ADR bytes and historical acceptance records are unchanged.
4. ADR-0020 remains Proposed, U4 remains open and GATE-U4 unsatisfied.
5. `governance/state.json` is absent in B and target. No earlier appearance
   followed by deletion may reopen this pre-registry path.
6. PR #124 remains paused/frozen at its bound head with identical provisional
   candidate and implementation bytes; PR #101's bound head/state is untouched.
7. Exact fresh owner acceptance evidence exists for BOTH candidates, under §4,
   and independent bootstrap-legality review preceded that act.
8. The target accepts BOTH and no additional governance subject. No landing,
   question, gate, authorization or previously accepted relationship changes.
9. Both Accepted headers, structured INDEX records and every required manual
   mirror agree in the same target revision. No stale status or broad range hides
   ADR-0020; no generated registry projection is activated early.
10. No executable governance code, dependencies, CI mechanisms, candidate bytes,
    candidate digests, real genesis attestations or implementation work changes.
11. Exact accepted-byte digests, allowed lifecycle-only deltas, complete path
    review, replayable evidence and the joint receipt all validate.
12. Neither a prior pair/singleton acceptance in main history nor prior registry
    activation has already made this bridge unavailable. All observations and
    evidence needed to establish this are available; missing history is REFUSE.

Missing, ambiguous, conflicting or mismatched evidence is REFUSE, never partial
success. Review approval is not the owner act. No partial target may merge.

### 6. Structural, permanent expiry

There is no authored mutable `bridgeEnabled` or `bridgeRemaining` flag. The only
admissible base has both subjects Proposed, no earlier consumption and no prior
canonical registry; the sole target has both Accepted. Landing that target
consumes the exception in the same revision that selects it. Accepted-byte
immutability and history prevent a return to the admissible base. Reverting or
deleting evidence cannot reset consumption; history, not the latest status text
alone, decides availability.

After S no pre-registry acceptance is authorized by ADR-0024. ADR-0020 must wait
for the canonical mechanism. No future ADR may cite this bridge as a reusable
manual-transition precedent, substitute another pair, alias/version its identity
or edit immutable ADR-0024 to reopen it. Canonical state appearing first also
makes the bridge permanently unusable, even if later removed.

A stale base, changed identity or failed attempt grants no fallback or inferred
retry. Re-establishing authority requires new reviewed governance architecture;
this proposal grants no refreshable manual mode. A failed preflight selects no
partial acceptance. Keeping a failed candidate around supplies no authority.

### 7. Post-bridge source and implementation boundaries

Only the durable bridge target recorded from `refs/heads/main` is **S**. A
proposal head, candidate head, synthetic merge or pre-bridge base is not S.
D12.5's common genesis snapshot becomes that exact S, containing both accepted
decisions, only under a later refreshed PR-2 owner authorization. The complete
audit must include both additional decisions and retain all original temporal
and historical-process evidence; it must not hard-code the earlier 21-ADR count.

Archive-stage **M** remains `83e6cd8fa7d2d05ab246a39de039129b4056966d` for
runner/L4, L5 and L7 at their exact archive roots. S changes the common source
observation, never those archived-package identities. L2/L3 and L6 bindings are
also unchanged. No candidate is regenerated by either this proposal or the
future acceptance-only bridge.

Required future order: independently review and merge this ADR **while
Proposed**; separately authorize the exact joint owner acceptance; prepare one
pair-acceptance PR; independently review; merge the bridge; record actual S;
confirm expiry; obtain a fresh owner PR #124 authorization against exact S;
reconcile/resume T.1–T.7; regenerate/freeze the candidate under those proof gates;
independently review and merge PR-2; separately authorize PR-3's real owner
ceremony and atomic activation. Only the canonical mechanism may then carry
ADR-0020's separately authorized acceptance. This sequence is not permission
for any of its later steps, nor for modifying PR #101.

## Consequences

The cycle has an accepted exit with no Accepted-but-unused exception interval.
Both RFC 3339 human evidence and governed decision dates survive without invented
precision, and accepted history is not retrospectively legitimized.

The cost is a dedicated pair-bound review and a one-use historical receipt.
Exact-base drift and missing evidence deliberately stop progress. No runtime,
provider, compiler, dependency or operative governance behavior changes now.

## Alternatives considered

1. **Accept ADR-0023 alone.** Reject: it crosses §§7/12 without selecting the
   exception, even with perfect timestamps and owner approval.
2. **Accept ADR-0024 first, use it later.** Reject: it creates a reusable live
   exception and an intermediate state the bridge is designed to forbid.
3. **Allow manual acceptance until PR-3.** Reject: scope/expiry depend on future
   progress and admit unrelated decisions, including the frozen ADR-0020 path.
4. **Activate state early or relax extraction.** Reject: either creates an
   unvalidated authority or falsifies historical temporal evidence.
5. **Treat ADR-0022 as precedent.** Reject: historical inconsistency is evidence
   to disclose, not a source of permission or a retroactive authorization.
6. **Keep the cycle blocked indefinitely.** Fail-closed and preferable to an
   unjustified exception; retain this outcome if independent review rejects
   §1's legality argument. The atomic pair is the accepted choice, not a waiver
   of that review.

## Security implications

The sensitive boundary is repository governance, not household device control.
Pair-wide digest binding, fresh exact-base checks, complete path review and
immutable expiry prevent substitution or privilege expansion. Human authorship
remains external evidence, never inferred from a timestamp or automation.
No acceptance, landing completion, U-resolution or implementation authority is
inferred merely because the proof shape is well-formed.

## Availability implications

Unavailable history, owner evidence or a reproducible candidate blocks the
bridge; there is no fallback. This is a repository ceremony, never a dependency
of a household runtime. Exact evidence must remain replayable from durable
history; a local object available only in one author's clone is insufficient
for the future bridge handoff.

## Validation and follow-up obligations

1. Independently review §1's bootstrap-legality argument before any owner
   bridge acceptance. Review the temporal ordering, closed bindings and expiry.
2. Prove the sole positive pair and every hostile case in the contingent
   [bridge assurance](../../openspec/changes/governance-state-substrate/assurance.md#contingent-bootstrap-bridge-proof-obligations-adr-0024),
   through later authorized process verification, not claims of implemented tests.
3. Preserve all previously Accepted ADR bytes, historical acceptance records,
   candidate files/digests and PR #101. ADR-0020 remains Proposed; this same
   atomic acceptance transitions ADR-0023 with ADR-0024.
4. Run acceptance documentation, scaffold, strict OpenSpec, review-history,
   link/fence/whitespace, secret, exact-scope and bridge process checks. The
   receipt and retained human evidence are historical, not a bridge checker,
   canonical state or real genesis attestation.
5. Follow §7's separate authorization/review stages; do not activate, merge
   this acceptance or resume PR #124 on a coding agent's initiative.

**Promotion determination (ADR-0014):** the bounded bootstrap exception is
architectural and belongs in this accepted ADR. D13 is subordinate procedure
and proof, not another authority. No operative architecture or portable
knowledge projection is authored by this acceptance.

## Links

- [ADR-0021 §§7–7a, 12](ADR-0021-establish-machine-readable-governance-state.md) — unchanged governing boundary and exception-definition seam
- [ADR-0023](ADR-0023-separate-governance-decision-dates-from-git-commit-timestamps.md) — temporal decision accepted in this same atomic bridge
- [PR #128](https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/128) — reviewed temporal proposal lineage, not bridge authority
- [Decision index](INDEX.md) — joint bridge acceptance records
- [Design D13](../../openspec/changes/governance-state-substrate/design.md#d13-contingent-one-shot-bootstrap-bridge-adr-0024) and [tasks](../../openspec/changes/governance-state-substrate/tasks.md) — bound bridge evidence and separate future gates
- [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) and [promotion model](../architecture/knowledge-promotion-model.md) — one canonical home

---

**Accepted and immutable; bridge selected and consumed by this same atomic
ADR-0024 + ADR-0023 transition.** Permanently expired on landing at durable main.
No future pre-registry manual acceptance, PR #124 resumption or PR-3 authority.
