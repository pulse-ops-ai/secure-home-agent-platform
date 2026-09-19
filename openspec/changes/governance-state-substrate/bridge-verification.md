# Atomic ADR-0023 + ADR-0024 bridge: source and verification record

This is acceptance-stage historical evidence under D13, not canonical state,
a reusable authorization file, a candidate registry, genesis or implementation.
The candidate selects and consumes the one-shot bridge together. Permanent
durable expiry is established when that target reaches main. **S does not yet
exist.** Independent final semantic/human-provenance review and merge remain
outstanding. The coding agent must not merge or resume PR #124.

**Future merge method: MERGE COMMIT, not squash or rebase-merge.** Preserve the
single pair-changing commit in durable ancestry. Record its identity and actual
S externally after those objects exist; neither belongs inside its own receipt
or ADR. A merge wrapper with the same tree is not a second use.

## Bound identities

- B: `ff7b240397385e8d2571ee1208e2e440cb77825c`, exact fetched main.
- PR #129 reviewed head: `89c5669e8a858adae3dcd9987c03cf7f5d5ea2ad`.
- PR #128 reviewed head: `a443e192ee02e66c9fbaefefbadfbb877650ea32`.
- PR #128 durable merge: `5815094efcc85164bf9bf95fd0cda03192ebb7dc`.
- Archive-stage M: `83e6cd8fa7d2d05ab246a39de039129b4056966d`, unchanged for
  runner/L4/L5/L7 at their existing exact archive roots.
- Both proposalIdentity values use PR #129's reviewed commit and each final path.
  ADR-0023 there is byte-identical to its former filename at both PR #128 identities.
- Receipt: [bridge-evidence.json](bridge-evidence.json).
- bridgeDigest: `565051d7340f95022a6a0dd6425ea0f5907acc407a65123c69af77a83d7e0a64`.

| Subject | Proposed content SHA-256 | Accepted content SHA-256 | Subject transitionDigest |
| --- | --- | --- | --- |
| ADR-0023 | `86c118c26a1632f6448bf2ce54d262c67ff1d25f7768df0fc90177ee2c38a7fb` | `16af9b56e4b29fe8d9e4047bf3ca0f9d25046b1d16c2a86315fb38f437ae6487` | `e3f3dc1cdc90eb3b86def37cdb3e1484dd7afd166dba10d28fac0a5e8181ade1` |
| ADR-0024 | `ac69103cd41c5c023c3a72a432e92b5bf96a7c7d094e9720d9d6d0186018db5a` | `4201262d2a77357dddef2ff8a560d53b570badd84d374c5e980f0ede321d9b71` | `a0cfa7afbf76d611d9cfd04831519aba9546ba0c97aae372e9d74bc70f6d1eca` |

D13.1's exact ordered UTF-8 JSON, two-space indent and one trailing LF define
the preimage bytes. The bridge excludes human envelopes; each domain-separated
subject preimage binds that bridge, its own subject and final Accepted content.
No registry digest, null genesis predecessor or self-containing identity is
fabricated. The human act remains external evidence, not a digest-derived act.

## Joint owner instruction

The only admissible human acceptance source is the fresh **OWNER CORRECTION —
PR #130 JOINT ACCEPTANCE EVIDENCE ONLY** instruction retained below. It
explicitly accepts both subjects and supersedes every earlier ADR-0023/ADR-0024
acceptance instruction. The rejected candidate
`132dbe0e2a1929f5428790b6a0d1d573a92b5b60` used an owner act preceding the
durable legality review; it is not a reviewed/mergeable identity. Its old
`07:07:39Z` evidence is not admissible. No architecture, ADR byte, subject or
causal preimage is changed by this correction.

The evidenceIdentity is SHA-256 of the **exact single JSONL record below,
including its one trailing LF**, not of this Markdown file or instruction text
alone:

`abc8eaef58097d57197190f6dbe4d13837dd05488198530bb01755661d32cef4`

Exact `at = 2026-09-19T09:59:46.7922478Z`. Extraction reads the lexical
`payload.internal_chat_message_metadata_passthrough.create_time` value
`1789811986.7922478`: convert integer Unix seconds to UTC and retain all
seven encoded fractional digits without floating-point rounding. The rollout
wrapper `2026-09-19T09:59:46.792Z` corroborates at millisecond precision;
it does not replace the more precise message timestamp. This preserves
encoded precision, not a claim about clock accuracy or human identity.

Source: controlling session `01a0ad46-d909-7371-b0e6-17813b2e67d5`,
`rollout-2026-09-16T21-51-36-01a0ad46-d909-7371-b0e6-17813b2e67d5.jsonl`,
response_item / user message, observed line 3654. The retained exact
extract supports replay without unrelated private session material. No Git,
PR, CI, commit, merge, review timestamp or fabricated time supplies `at`.

Both envelopes use pre-transition ADR-0021 §7a, actor `@mikegtech`, outcome
`accepted`, this same new evidenceIdentity and the existing typed task-contract
reference to this section. Each keeps its own content and transition digest.
The separately declared decision date for both remains `2026-09-19`.
Later authorized extraction must retain these original instant envelopes
outside canonical state, not rewrite them into date-only evidence.

<!-- joint-owner-source:start -->
```json
{"timestamp":"2026-09-19T09:59:46.792Z","ordinal":3653,"type":"response_item","payload":{"type":"message","id":"msg_01a0b91b-9168-7412-8dcb-ff4c5538654e","role":"user","content":[{"type":"input_text","text":"OWNER CORRECTION — PR #130 JOINT ACCEPTANCE EVIDENCE ONLY\n\nPR #130 at head:\n\n`132dbe0e2a1929f5428790b6a0d1d573a92b5b60`\n\nis NOT mergeable.\n\nIndependent review found that the candidate binds the superseded earlier joint-owner instruction at:\n\n`2026-09-19T07:07:39.7871783Z`\n\nwhile the durable independent bootstrap-legality review was created later at:\n\n`2026-09-19T09:23:12Z`\n\nDurable independent review evidence:\n\nhttps://github.com/pulse-ops-ai/secure-home-agent-platform/issues/106#issuecomment-5740741488\n\nGitHub comment id:\n\n`5740741488`\n\nGitHub created_at:\n\n`2026-09-19T09:23:12Z`\n\nThat review explicitly APPROVES the bootstrap-legality argument for reviewed PR #129 head:\n\n`89c5669e8a858adae3dcd9987c03cf7f5d5ea2ad`\n\nTherefore the `07:07:39Z` instruction and every earlier ADR-0023 / ADR-0024 acceptance instruction are superseded and MUST NOT be used as acceptance evidence.\n\n## Fresh owner joint acceptance\n\nI, @mikegtech, now explicitly accept BOTH architectural decisions in one atomic governance act, AFTER the durable independent legality review above:\n\n1. ADR-0024 — “Permit one atomic pre-registry governance acceptance bridge”\n2. ADR-0023 — “Separate governance decision dates from Git commit timestamps”\n\nGoverned decision date for BOTH:\n\n`2026-09-19`\n\nThis exact instruction is the human acceptance act for the bridge.\n\nIt selects and consumes:\n\n`pre-registry-adr-pair-v1`\n\natomically.\n\nIt authorizes no implementation.\n\nIt does NOT authorize:\n\n* PR #124 resumption;\n* candidate regeneration;\n* canonical `governance/state.json`;\n* PR-3;\n* ADR-0020 acceptance;\n* U4 resolution;\n* GATE-U4 satisfaction;\n* L8/L9;\n* PR #101 modification.\n\n## Required correction to PR #130\n\nDo not add a second acceptance commit.\n\nRewrite/amend the existing PR #130 branch so that the final branch still contains exactly ONE pair-changing commit whose sole parent is exact bridge base:\n\n`B = ff7b240397385e8d2571ee1208e2e440cb77825c`\n\nThe resulting single commit must still transition ADR-0023 and ADR-0024 together.\n\nNo reachable commit may contain only one Accepted ADR.\n\nBecause the candidate has not been independently accepted for merge, rewriting the draft candidate is permitted, but all old candidate identities become stale and must not be reused as reviewed identities.\n\n## Human evidence replacement\n\nExtract and retain the exact source record for THIS owner instruction.\n\nUse the exact timestamp associated with THIS message in the controlling source.\n\nRequire that timestamp to be strictly later than:\n\n`2026-09-19T09:23:12Z`\n\nIf the exact source record or timestamp cannot be recovered, STOP.\n\nDo NOT use:\n\n* `2026-09-19T07:07:39.7871783Z`;\n* its evidenceIdentity\n  `e5871b1dfdbe33214d7517bf59a893b0bd0a1cf5d8e69ddfd3a91efac94528c5`;\n* the earlier joint instruction;\n* the earlier ADR-0023-only instruction;\n* Git/PR/CI/commit/merge timestamps;\n* fabricated time.\n\nBoth acceptance rows may reference this same new joint instruction, but each retains its own subject/content/transition binding.\n\n## Bind the prior independent review\n\n`bridge-verification.md` must explicitly record the prerequisite review:\n\n* issue #106 comment `5740741488`;\n* URL above;\n* reviewed PR #129 head\n  `89c5669e8a858adae3dcd9987c03cf7f5d5ea2ad`;\n* disposition `APPROVE — no P1/P2 findings`;\n* bootstrap-legality explicitly affirmed;\n* GitHub `created_at = 2026-09-19T09:23:12Z`.\n\nThe verification must establish:\n\n`independent legality review created_at < this fresh joint owner acceptance at`\n\nDo not merely state that ordering; compare the observed timestamps and refuse if false.\n\nThe GitHub review comment is independent-review provenance.\n\nThis exact owner instruction is human-acceptance provenance.\n\nDo not collapse those evidence classes.\n\n## Expected invariant identities\n\nRecompute everything from source.\n\nBecause D13 excludes human envelopes from the causal bridge/subject preimages, verify whether these remain exactly unchanged:\n\nADR-0023 Accepted content SHA-256:\n\n`16af9b56e4b29fe8d9e4047bf3ca0f9d25046b1d16c2a86315fb38f437ae6487`\n\nADR-0024 Accepted content SHA-256:\n\n`4201262d2a77357dddef2ff8a560d53b570badd84d374c5e980f0ede321d9b71`\n\nbridgeDigest:\n\n`565051d7340f95022a6a0dd6425ea0f5907acc407a65123c69af77a83d7e0a64`\n\nADR-0023 transitionDigest:\n\n`e3f3dc1cdc90eb3b86def37cdb3e1484dd7afd166dba10d28fac0a5e8181ade1`\n\nADR-0024 transitionDigest:\n\n`a0cfa7afbf76d611d9cfd04831519aba9546ba0c97aae372e9d74bc70f6d1eca`\n\nDo NOT force these values to remain unchanged.\n\nRecompute them mechanically.\n\nIf changing only human-envelope provenance changes one of these causal identities, STOP and explain why—the reviewed D13 model says it should not.\n\n## Identities that MUST change\n\nGenerate and report the NEW:\n\n* exact `at`;\n* human source SHA-256 / `evidenceIdentity`;\n* `bridge-evidence.json` SHA-256;\n* `bridge-verification.md` SHA-256;\n* candidate tree;\n* candidate commit/head.\n\nRemove every statement that treats the `07:07:39Z` source as the active acceptance evidence.\n\nHistorical discussion may state that the old candidate was rejected for ordering, but it must not remain an admissible envelope/source.\n\n## Protected boundaries\n\nReverify all existing #130 boundaries from scratch:\n\n* live main still exact B;\n* PR #124 remote/local/candidate unchanged;\n* PR #101 unchanged;\n* ADR-0021 unchanged;\n* ADR-0020 Proposed;\n* U4 open;\n* GATE-U4 unsatisfied;\n* canonical state absent currently and historically;\n* no prior bridge consumption;\n* no implementation/CI/dependency/runtime changes;\n* T.1–T.7 unchecked/unexecuted.\n\nIf B has moved, STOP. Do not silently rebase or refresh authority.\n\n## Process proof\n\nRerun EX-G36 and ADV-G114–ADV-G134 against the NEW candidate.\n\nAdd an explicit hostile chronology case:\n\n* legality review timestamp >= owner acceptance timestamp → REFUSE.\n\nAlso prove:\n\n* old `07:07:39Z` evidenceIdentity → REFUSE;\n* superseded owner instruction → REFUSE;\n* missing durable review evidence → REFUSE;\n* altered review head/disposition/comment identity → REFUSE.\n\nKeep human authorship as independent manual provenance; timestamps alone do not authenticate the human.\n\n## Validation\n\nRerun the full applicable gate against the rewritten single commit.\n\nAt minimum:\n\n* full `scripts/check.sh`;\n* strict OpenSpec;\n* scaffold/index;\n* documentation authority;\n* review history;\n* secret scan;\n* format/whitespace/link/fence;\n* exact changed-path/hunk comparison;\n* receipt canonicalization/digest recomputation;\n* one-commit parent/atomicity proof;\n* chronology proof;\n* bridge expiry/process proof;\n* protected PR/candidate verification.\n\nHosted CI must bind the NEW head; prior #130 CI is stale evidence after rewrite.\n\n## Handoff\n\nForce-update the existing DRAFT PR #130 with the rewritten one-commit candidate.\n\nDo not open another PR.\n\nUpdate the PR description to identify the superseded head:\n\n`132dbe0e2a1929f5428790b6a0d1d573a92b5b60`\n\nas rejected due to human-provenance ordering.\n\nRecord all NEW identities.\n\nKeep:\n\n**MERGE COMMIT ONLY — NO SQUASH / NO REBASE-MERGE**\n\nSTOP for independent review.\n\nDo NOT merge.\nDo NOT resume PR #124."}],"internal_chat_message_metadata_passthrough":{"turn_id":"01a0b91b-913d-7fb2-9278-42d97241d114","create_time":1789811986.7922478,"content_item_kinds":["user.text"]}}}
```
<!-- joint-owner-source:end -->

## Durable prerequisite independent architecture review

The independent-review source is [issue #106 comment 5740741488](https://github.com/pulse-ops-ai/secure-home-agent-platform/issues/106#issuecomment-5740741488),
fetched from the GitHub REST comment endpoint. It is **review provenance**,
not either human acceptance envelope. The fresh controlling instruction above
is **human-acceptance provenance**. The evidence classes are not interchangeable.

- Comment id: `5740741488`; issue: `106`.
- GitHub `created_at = 2026-09-19T09:23:12Z`.
- GitHub `updated_at = 2026-09-19T09:23:12Z` in the observed response.
- Reviewed PR #129 head: `89c5669e8a858adae3dcd9987c03cf7f5d5ea2ad`.
- Reviewed proposal base: `5815094efcc85164bf9bf95fd0cda03192ebb7dc`.
- Disposition: **APPROVE — no P1/P2 findings**.
- Bootstrap-legality explicitly affirmed: “The bootstrap-legality argument in
  Proposed ADR-0024 is accepted.”
- Observed publisher account: `mikegtech`. Publication identity is not an
  invented reviewer identity or mechanical proof of reviewer independence.

The retained raw API response text plus one LF has SHA-256
`2306d34dcd46c9978a18c5c1819639048e055873012915ccb134392b0f4590fb`. The normalized comments listing omitted
timestamps; the raw endpoint supplied them. The exact body and metadata are
retained together below. Hashing a captured response detects later byte changes;
it does not authenticate a human or make the mutable GitHub endpoint immutable.

<!-- durable-review-source:start -->
```json
{"url":"https://api.github.com/repos/pulse-ops-ai/secure-home-agent-platform/issues/comments/5740741488","html_url":"https://github.com/pulse-ops-ai/secure-home-agent-platform/issues/106#issuecomment-5740741488","issue_url":"https://api.github.com/repos/pulse-ops-ai/secure-home-agent-platform/issues/106","id":5740741488,"node_id":"IC_kwDOTsVWG88AAAABVizDcA","user":{"login":"mikegtech","id":94987127,"node_id":"U_kgDOBaljdw","avatar_url":"https://avatars.githubusercontent.com/u/94987127?u=409955676bc1f72ec089282c0886fd894bad173c&v=4","gravatar_id":"","url":"https://api.github.com/users/mikegtech","html_url":"https://github.com/mikegtech","followers_url":"https://api.github.com/users/mikegtech/followers","following_url":"https://api.github.com/users/mikegtech/following{/other_user}","gists_url":"https://api.github.com/users/mikegtech/gists{/gist_id}","starred_url":"https://api.github.com/users/mikegtech/starred{/owner}{/repo}","subscriptions_url":"https://api.github.com/users/mikegtech/subscriptions","organizations_url":"https://api.github.com/users/mikegtech/orgs","repos_url":"https://api.github.com/users/mikegtech/repos","events_url":"https://api.github.com/users/mikegtech/events{/privacy}","received_events_url":"https://api.github.com/users/mikegtech/received_events","type":"User","user_view_type":"public","site_admin":false},"created_at":"2026-09-19T09:23:12Z","updated_at":"2026-09-19T09:23:12Z","author_association":"MEMBER","body":"INDEPENDENT ARCHITECTURE REVIEW — PR #129\n\nReviewed candidate:\n\n`89c5669e8a858adae3dcd9987c03cf7f5d5ea2ad`\n\nBase:\n\n`5815094efcc85164bf9bf95fd0cda03192ebb7dc`\n\nDisposition:\n\n**APPROVE — no P1/P2 findings.**\n\n## Bootstrap-legality finding\n\nThe bootstrap-legality argument in Proposed ADR-0024 is accepted.\n\nADR-0021 §12 is the prior Accepted architectural authority for defining a future bounded bootstrap exception. Its statement that any future exception requires exact scope, fail-closed behavior, and mandatory expiry would be ineffective in its bootstrap context if such an exception could only be selected after the canonical registry already existed.\n\nADR-0024 does not self-authorize.\n\nWhile ADR-0024 is Proposed, it grants no acceptance authority. The exception becomes selectable only through a later explicit human act after independent review.\n\nThe reviewed one-shot design is valid because that later act:\n\n* accepts ADR-0024 and ADR-0023 atomically;\n* creates no intermediate revision with an Accepted-but-unused exception;\n* restricts the subject set to exactly ADR-0024 + ADR-0023;\n* preserves ADR-0021 and all other Accepted ADRs unchanged;\n* creates no canonical governance state;\n* grants no implementation authority;\n* consumes the exception in the same transition that selects it; and\n* makes reuse structurally impossible through durable history.\n\nAccordingly, the proposed `pre-registry-adr-pair-v1` bridge is a valid bounded exception under ADR-0021 §12, subject to the exact reviewed D13 bindings, refusal conditions, human-evidence requirements, atomic-history proof, and permanent-expiry requirements.\n\n## Other reviewed findings\n\nThe review also confirmed:\n\n* both bridge acceptance envelopes must use pre-transition ADR-0021 §7a RFC3339 `at` semantics;\n* ADR-0023's future `decisionDate` semantics cannot bootstrap their own acceptance;\n* the bridge receipt is domain-separated and non-self-referential;\n* the bridge must not masquerade as an ordinary registry transition or genesis;\n* ADR-0022 remains historical inconsistency evidence, not authority or precedent;\n* post-bridge main S advances only the common genesis source snapshot;\n* archive-stage M remains `83e6cd8fa7d2d05ab246a39de039129b4056966d` for L4/L5/L7;\n* PR #124, its candidate, PR #101 and canonical governance state remain untouched.\n\nHosted checks were successful at the exact reviewed head.\n\nThis review authorizes no acceptance or implementation by itself. A later explicit owner joint acceptance act is still required.\n","reactions":{"url":"https://api.github.com/repos/pulse-ops-ai/secure-home-agent-platform/issues/comments/5740741488/reactions","total_count":0,"+1":0,"-1":0,"laugh":0,"hooray":0,"confused":0,"heart":0,"rocket":0,"eyes":0},"performed_via_github_app":null,"minimized":null,"pin":null}
```
<!-- durable-review-source:end -->

### Observed chronology and refusal

The process verifier parses both observed instants with full fractional
precision and compares integer nanoseconds, not strings or rounded floats:

```text
GitHub legality review created_at = 2026-09-19T09:23:12Z
fresh owner acceptance at        = 2026-09-19T09:59:46.7922478Z
review < acceptance              = true
```

It refuses equality and reversed order, missing review evidence, changed
comment identity/head/disposition, superseded instructions and the rejected
source identity. No assumption about an earlier private review is needed.
Timestamps establish this observed ordering only; actual human authorship,
review independence and provenance still require independent manual review.
A well-formed timestamp cannot authenticate the repository owner.

## Allowed ADR deltas

The following literal diffs are the complete allowlist, not normalization rules.
Reproduce each with `git diff --no-ext-diff --no-color --unified=0 B -- <path>`
on the uncommitted target, or `git diff --no-ext-diff --no-color --unified=0 B
HEAD -- <path>` on the committed candidate. Applying exactly these changes to
the bound Proposed bytes produces the final content hashes above. Any other
change refuses, even if every digest is recomputed.

Categories: (1) Status/Accepted/Deciders metadata; (2) Proposed/non-operative
status sentences becoming false, including related-change/link descriptions;
(3) explicit joint-acceptance/consumed/expiry status and continued lack of
implementation authority. Date-precision, digest, source/provenance, refusal,
subject-set, expiry and handoff semantics are not rewritten. ADR-0024's
precondition and future-stage requirements remain requirements, not assertions
that final review, durable S or PR-2/PR-3 already occurred. Independent review
must examine the literal hunks, not trust these category labels.

### ADR-0023 literal allowed delta

```diff
diff --git a/docs/decisions/ADR-0023-separate-governance-decision-dates-from-git-commit-timestamps.md b/docs/decisions/ADR-0023-separate-governance-decision-dates-from-git-commit-timestamps.md
index bdb53b4..85550d3 100644
--- a/docs/decisions/ADR-0023-separate-governance-decision-dates-from-git-commit-timestamps.md
+++ b/docs/decisions/ADR-0023-separate-governance-decision-dates-from-git-commit-timestamps.md
@@ -3 +3 @@
-- **Status:** Proposed
+- **Status:** Accepted
@@ -5 +5,2 @@
-- **Deciders:** @mikegtech (repository owner) — acceptance is a separate explicit human act
+- **Accepted:** 2026-09-19
+- **Deciders:** @mikegtech (repository owner)
@@ -9 +10 @@
-- **Related change:** [governance-state-substrate](../../openspec/changes/governance-state-substrate/proposal.md) — contingent temporal amendment, not implementation authority
+- **Related change:** [governance-state-substrate](../../openspec/changes/governance-state-substrate/proposal.md) — accepted temporal architecture, not implementation authority
@@ -62,4 +63,5 @@ the identified evidence.
-**Proposed only.** Every rule in this section is a proposed replacement within
-the stated boundary. While this ADR is Proposed, ADR-0021's existing RFC 3339
-contract remains operative. This file and its contingent planning amendment
-cannot release PR #124 or change a validator.
+**Accepted 2026-09-19 in the same atomic bridge as ADR-0024.** The temporal
+replacement below is accepted architecture within the stated boundary.
+Both bridge envelopes retain ADR-0021's pre-transition RFC 3339 evidence;
+this decision and its planning amendment grant no PR #124 implementation
+authority and change no validator.
@@ -107 +109 @@ and not the declared human actor's identity or decision instant.
-is a different evidence concept; this proposal does not define or add such a
+is a different evidence concept; this decision does not define or add such a
@@ -118 +120 @@ lose the exact-transition replay and make delivery-time substitution undetectabl
-**Proposed choice:** keep `decisionDate` in canonical ADR evidence because
+**Accepted choice:** keep `decisionDate` in canonical ADR evidence because
@@ -129 +131 @@ ADR evidence.
-The proposed acceptance/rejection evidence members are exactly:
+The acceptance/rejection evidence members are exactly:
@@ -206 +208 @@ the former `at`, not a new input to the lifecycle primitive projection.
-  recomputes every digest. This proposal creates no in-place date-correction or
+  recomputes every digest. This decision creates no in-place date-correction or
@@ -234 +236 @@ cannot be reused as if representation were unchanged. Their later regeneration
-needs a refreshed implementation authorization, not this proposal.
+needs a refreshed implementation authorization, not this acceptance.
@@ -236,2 +238,3 @@ needs a refreshed implementation authorization, not this proposal.
-Neutral: no operative state, accepted ADR, historical acceptance record,
-dependency, compiler gate, runtime, or canonical registry changes here.
+Neutral: this acceptance changes no implementation, dependency, compiler gate,
+runtime or canonical registry, and no previously Accepted ADR or historical
+acceptance record.
@@ -275,3 +278,3 @@ repository control, not a household runtime dependency.
-1. Independently review this partial refinement and its storage/digest choice.
-   Acceptance is a separate human-reviewed change; proposing is not accepting.
-2. While Proposed, preserve ADR-0021's operative RFC 3339 rule. Keep PR #124
+1. Preserve the independently reviewed partial refinement and storage/digest
+   choice; acceptance is the separate human act, not proposal approval.
+2. Preserve the bridge's pre-transition ADR-0021 RFC 3339 evidence. Keep PR #124
@@ -280 +283 @@ repository control, not a household runtime dependency.
-3. After separate acceptance and a later exact-base owner implementation
+3. After this acceptance lands and a later exact-base owner implementation
@@ -282 +285 @@ repository control, not a household runtime dependency.
-   The contingent [design D12](../../openspec/changes/governance-state-substrate/design.md#d12-contingent-decision-date-amendment-adr-0023)
+   The [design D12](../../openspec/changes/governance-state-substrate/design.md#d12-contingent-decision-date-amendment-adr-0023)
@@ -287 +290 @@ repository control, not a household runtime dependency.
-   metadata and independently observed recording events. The contingent
+   metadata and independently observed recording events. The
@@ -290,3 +293,2 @@ repository control, not a household runtime dependency.
-5. This proposal runs documentation/scaffold and strict OpenSpec validation
-   only; it supplies no executed temporal implementation proof, candidate freeze,
-   real owner attestation, or activation review.
+5. Acceptance validation supplies no executed temporal implementation proof,
+   candidate freeze, real owner genesis attestation, or activation review.
@@ -295 +297 @@ repository control, not a household runtime dependency.
-durable architectural meaning and belongs in this proposed ADR, with subordinate
+durable architectural meaning and belongs in this accepted ADR, with subordinate
@@ -303,2 +305,2 @@ operative architecture.
-- [Decision index](INDEX.md) — Proposed registration, not an acceptance record
-- [ADR-0021](ADR-0021-establish-machine-readable-governance-state.md#7a-relationship-provenance-bootstrap-proof-and-evidence-identity) — operative contract pending separate acceptance
+- [Decision index](INDEX.md) — joint bridge acceptance records
+- [ADR-0021](ADR-0021-establish-machine-readable-governance-state.md#7a-relationship-provenance-bootstrap-proof-and-evidence-identity) — unchanged contract, partially refined only as specified above
@@ -308 +310 @@ operative architecture.
-- [Contingent proposal](../../openspec/changes/governance-state-substrate/proposal.md), [design](../../openspec/changes/governance-state-substrate/design.md), [assurance](../../openspec/changes/governance-state-substrate/assurance.md), [tasks](../../openspec/changes/governance-state-substrate/tasks.md), and [specification delta](../../openspec/changes/governance-state-substrate/specs/governance-state/spec.md)
+- [Planning proposal](../../openspec/changes/governance-state-substrate/proposal.md), [design](../../openspec/changes/governance-state-substrate/design.md), [assurance](../../openspec/changes/governance-state-substrate/assurance.md), [tasks](../../openspec/changes/governance-state-substrate/tasks.md), and [specification delta](../../openspec/changes/governance-state-substrate/specs/governance-state/spec.md)
@@ -312,2 +314,2 @@ operative architecture.
-**Proposed and non-operative.** Do not accept or implement this decision as part
-of its proposal, and do not use it to resume PR #124.
+**Accepted and immutable.** Accepted with ADR-0024 in one atomic bridge.
+Acceptance grants no implementation authority and does not resume PR #124.
```

### ADR-0024 literal allowed delta

```diff
diff --git a/docs/decisions/ADR-0024-permit-one-atomic-pre-registry-governance-acceptance-bridge.md b/docs/decisions/ADR-0024-permit-one-atomic-pre-registry-governance-acceptance-bridge.md
index bf8bfba..dec9fa3 100644
--- a/docs/decisions/ADR-0024-permit-one-atomic-pre-registry-governance-acceptance-bridge.md
+++ b/docs/decisions/ADR-0024-permit-one-atomic-pre-registry-governance-acceptance-bridge.md
@@ -3 +3 @@
-- **Status:** Proposed
+- **Status:** Accepted
@@ -5 +5,2 @@
-- **Deciders:** @mikegtech (repository owner) — a future explicit joint acceptance act is required
+- **Accepted:** 2026-09-19
+- **Deciders:** @mikegtech (repository owner)
@@ -9 +10 @@
-- **Related change:** [governance-state-substrate](../../openspec/changes/governance-state-substrate/proposal.md) — contingent bridge planning, not implementation authority
+- **Related change:** [governance-state-substrate](../../openspec/changes/governance-state-substrate/proposal.md) — selected and consumed bridge, not implementation authority
@@ -30 +31 @@ independently reviewed head `a443e192ee02e66c9fbaefefbadfbb877650ea32`.
-ADR-0023 remains Proposed. Its filename cleanup in this proposal preserves
+ADR-0023 was Proposed at that base. Its filename cleanup in the proposal preserved
@@ -42,3 +43,5 @@ historical-process disposition explicitly in source/provenance evidence.
-**Proposed and non-operative.** The following is the exact exception offered
-for independent architectural review. Its presence or merge while Proposed
-authorizes neither acceptance, implementation nor a changed gate.
+**Accepted 2026-09-19 in the same atomic bridge as ADR-0023.** This joint
+transition selects and consumes the exact exception below. There is no
+Accepted-but-unused exception. Once this transition reaches durable main,
+the bridge is permanently expired; it grants no future pre-registry manual
+acceptance and no implementation authority.
@@ -50 +53 @@ ADR-0021 §12 step 2's final sentence is the existing architectural authority to
-permission for a coding agent to waive the registry rule. This ADR proposes the
+permission for a coding agent to waive the registry rule. This ADR defines the
@@ -54 +57 @@ subordinate proof and procedure.
-The proposed legality argument is that a separately reviewed human decision
+The legality argument is that a separately reviewed human decision
@@ -117,3 +120,4 @@ The eventual owner act and independent acceptance review must bind:
-The current proposal does not select B, an accepted-byte candidate, acceptance
-date, human attestation or S. Its own future commit/hash is not embedded in
-itself. The later receipt carries the already-existing proposal identities.
+The proposal selected no B, accepted-byte candidate, acceptance date, human
+attestation or S. This acceptance binds those first four facts in the separate
+bridge evidence; S is not selected before merge. No future containing commit/hash
+is embedded in this ADR. The receipt carries the already-existing proposal identities.
@@ -249 +253 @@ for any of its later steps, nor for modifying PR #101.
-The cycle has a proposed exit with no Accepted-but-unused exception interval.
+The cycle has an accepted exit with no Accepted-but-unused exception interval.
@@ -271 +275 @@ provider, compiler, dependency or operative governance behavior changes now.
-   §1's legality argument. The atomic pair is the proposed choice, not a waiver
+   §1's legality argument. The atomic pair is the accepted choice, not a waiver
@@ -298,7 +302,9 @@ for the future bridge handoff.
-3. Preserve all existing Accepted ADR bytes, historical acceptance records,
-   candidate files/digests and PR #101. ADR-0020 and ADR-0023 remain Proposed now.
-4. Run proposal-only documentation, scaffold, strict OpenSpec, review-history,
-   link/fence/whitespace, secret and exact-scope checks. Create no bridge checker,
-   canonical state, receipt instance or human attestation in this proposal.
-5. Follow §7's separate authorization/review stages; do not accept, activate,
-   merge this proposal or resume PR #124 on a coding agent's initiative.
+3. Preserve all previously Accepted ADR bytes, historical acceptance records,
+   candidate files/digests and PR #101. ADR-0020 remains Proposed; this same
+   atomic acceptance transitions ADR-0023 with ADR-0024.
+4. Run acceptance documentation, scaffold, strict OpenSpec, review-history,
+   link/fence/whitespace, secret, exact-scope and bridge process checks. The
+   receipt and retained human evidence are historical, not a bridge checker,
+   canonical state or real genesis attestation.
+5. Follow §7's separate authorization/review stages; do not activate, merge
+   this acceptance or resume PR #124 on a coding agent's initiative.
@@ -307 +313 @@ for the future bridge handoff.
-architectural and belongs in this proposed ADR. D13 is subordinate procedure
+architectural and belongs in this accepted ADR. D13 is subordinate procedure
@@ -309 +315 @@ and proof, not another authority. No operative architecture or portable
-knowledge projection is authored while this decision is Proposed.
+knowledge projection is authored by this acceptance.
@@ -314 +320 @@ knowledge projection is authored while this decision is Proposed.
-- [ADR-0023](ADR-0023-separate-governance-decision-dates-from-git-commit-timestamps.md) — byte-preserved Proposed temporal decision
+- [ADR-0023](ADR-0023-separate-governance-decision-dates-from-git-commit-timestamps.md) — temporal decision accepted in this same atomic bridge
@@ -316,2 +322,2 @@ knowledge projection is authored while this decision is Proposed.
-- [Decision index](INDEX.md) — Proposed registration only
-- [Design D13](../../openspec/changes/governance-state-substrate/design.md#d13-contingent-one-shot-bootstrap-bridge-adr-0024) and [tasks](../../openspec/changes/governance-state-substrate/tasks.md) — non-operative plan and separate future gates
+- [Decision index](INDEX.md) — joint bridge acceptance records
+- [Design D13](../../openspec/changes/governance-state-substrate/design.md#d13-contingent-one-shot-bootstrap-bridge-adr-0024) and [tasks](../../openspec/changes/governance-state-substrate/tasks.md) — bound bridge evidence and separate future gates
@@ -322,2 +328,3 @@ knowledge projection is authored while this decision is Proposed.
-**Proposed and non-operative.** This file does not accept either ADR, open a
-manual acceptance mode, resume PR #124 or authorize PR-3.
+**Accepted and immutable; bridge selected and consumed by this same atomic
+ADR-0024 + ADR-0023 transition.** Permanently expired on landing at durable main.
+No future pre-registry manual acceptance, PR #124 resumption or PR-3 authority.
```

## Complete changed-path and mirror inventory

The full candidate remains the same 19-path acceptance scope against B.
Compared with rejected head `132dbe0e2a1929f5428790b6a0d1d573a92b5b60`, this
correction changes only INDEX's two human-evidence timestamps, tasks' active
owner-source record, the two receipt envelopes and this verification record.
All other paths, including both final ADRs and all architecture/planning rules,
remain byte-identical. The old candidate is used only as a rejected comparison
baseline, never as reviewed authority. All old head/tree/receipt/source identities
are stale for review. The five causal identities are independently recomputed.

Exactly 19 paths, all documentation/planning or the closed historical receipt:

- `.github/agents/architecture.agent.md`
- `.github/agents/implementation.agent.md`
- `.github/copilot-instructions.md`
- `AGENTS.md`
- `CLAUDE.md`
- `CONTRIBUTING.md`
- `README.md`
- `docs/AGENTS.md`
- `docs/README.md`
- `docs/decisions/ADR-0023-separate-governance-decision-dates-from-git-commit-timestamps.md`
- `docs/decisions/ADR-0024-permit-one-atomic-pre-registry-governance-acceptance-bridge.md`
- `docs/decisions/INDEX.md`
- `openspec/changes/governance-state-substrate/assurance.md`
- `openspec/changes/governance-state-substrate/bridge-evidence.json`
- `openspec/changes/governance-state-substrate/bridge-verification.md`
- `openspec/changes/governance-state-substrate/design.md`
- `openspec/changes/governance-state-substrate/proposal.md`
- `openspec/changes/governance-state-substrate/specs/governance-state/spec.md`
- `openspec/changes/governance-state-substrate/tasks.md`

Inventory method: scan all tracked paths at B for ADR-0023/0024, accepted-set
ranges, Proposed/current-set summaries, then inspect the matching sections and
their authority. Current mirrors include the nine README/instruction surfaces
above plus INDEX; all receive the non-contiguous set 0001–0019, 0021–0024, with
0020 Proposed. Existing substrate planning gets status-only reconciliation.
All 11 prior INDEX acceptance sections are compared byte-for-byte; two new
sections are added separately. No historical record is edited.

Other findings are deliberately not edited: Accepted ADRs and their historical
lists; archived OpenSpec; immutable knowledge projections; existing tests and
fixture corpora; older planning-epoch snapshots; `openspec/config.yaml`'s
explicitly deferred stale-context migration. Substring mentions of a historical
subset are not converted into new current-state authorities. No generated
projection, registry migration, broad stale-tooling cleanup or permission
change is introduced. Future architecture/knowledge promotion is unnecessary
for this metadata transition; ADR-0023/0024 already own the reviewed meaning.

## Protected observations

- PR #124 remote OPEN / DRAFT:
  `dcd32f073c4ca6f8da6efd7e38e0f1b327f70e8e`.
- Available local PR #124 reconciliation HEAD:
  `bffc11c6c1f93b57ada459b04cfcbdad1301ef19`.
- Its entire tracked working diff against HEAD (binary diff serialization)
  SHA-256: `9d27321e18a12bf9707eecc0ece739a8024362eb217018d5bd6aded61e432d94`.
  The existing staged/unstaged status is retained and not edited.
- Candidate state: `671bd1460142cc47a77b7766476aea0bc9278cfa6d0e4ff2b532a98d714a2770`.
- Source manifest: `edb37bf4d5bcb38a1b71a4c5ee3acc64c97b50b1fe1ac4e429a5193c58473867`.
- Consumers: `7e15758e2815f003f0ea31e5a0465e904635303acf19443cbed9fe629eba7da0`.
- PR #101 OPEN / DRAFT: `559d78cc32cc40f8eaa7aba15a961554f3033b43`.
- ADR-0021 Accepted: `0db0b5b7d3342b13b2f23602d3f7017f993705410d3e9a9966b1577cfd8cd66a`.
- ADR-0020 Proposed; U4 open; GATE-U4 unsatisfied; every landing and
  implementation-authority fact unchanged. No L8/L9 or PR-3/PR-4 work.
- Canonical `governance/state.json` absent at B/target; full available B
  ancestry contains no appearance. Git repository is not shallow.
- No earlier singleton/pair acceptance or receipt consumption in B ancestry.
- Every previously Accepted ADR and every non-subject ADR is byte-identical.
  All existing task checkbox lines, including T.1–T.7, remain unchanged.

These are observations, not reusable authority. Remote identity/draft state
and exact main must be rechecked immediately before any later authorized merge.
An inaccessible candidate or missing history is a refusal, not an assumed pass.

## Process proof and validation

The read-only acceptance comparator ran against the real working candidate.
Its source is retained below as historical proof, not registered in production,
not a new repository checker, and not an authorization mechanism. It writes
nothing to the repository. Literal allowed ADR deltas reconstruct each target
from B; recomputing receipt digests cannot conceal additional body changes.

Results: EX-G36 mechanical shape passes; 58 hostile variants covering
ADV-G114–ADV-G134 and the correction's chronology/source controls refuse;
four additional changed-head/state observations for
PR #124/#101 refuse; three isolated comparator mutations are detected.
MUT-G22/G23/G24 here mean acceptance-process comparator controls, **not passing
production-checker mutation tests**. T.1–T.7 were not executed.

### Reproduction and limits

Copy the JavaScript block below to `process-proof.mjs` in a temporary directory
**outside tracked implementation content**, then run with Node 24:

```sh
node /absolute/temporary/path/process-proof.mjs /absolute/path/to/acceptance-worktree
node /absolute/temporary/path/process-proof.mjs /absolute/path/to/acceptance-worktree HEAD
```

The second invocation is required after creating the sole pair-changing commit;
its exact commit/tree and result are recorded externally in the PR, avoiding a
self-containing commit identity here. It requires one child of B, sole parent B,
and both subjects Accepted in every new reachable commit. The same script
recomputes the receipt and all preserved source/ADR identities. Its document
pins describe this candidate only, not general governance policy.

The supplied remote heads are recorded observations, not a fresh network
request by the script. Live GitHub API and main checks are separate. Local
PR #124 comparison is explicitly unavailable (not passing) on another host
without that worktree; reviewers must independently establish those identities.
No history/hostile fixture is written to any protected PR or actual main.

Manual review remains indispensable:

- ADV-G126: the comparator rejects substitution of ADR-0022 as the authority
  reference. The legal meaning of prose and the absence of an inferred precedent
  are human review obligations, not language-authentication by a hash.
- ADV-G129: the exact retained event and encoded timestamp are byte-bound.
  This establishes correspondence, not the owner's identity or clock accuracy.
- ADV-G131/G132: fabricated self-identities, S and archive rebinding refuse.
  Real durable merge ancestry, exact S and permanent landed expiry cannot yet
  be observed; merge-commit retention and later proof remain mandatory.
- ADV-G133: replacing the joint source with approval/retry language refuses.
  No failed-attempt or proposal-review record creates renewed owner authority.
- Observed chronology is checked against the retained GitHub response and fresh
  owner event. Human authorship and reviewer independence remain external
  provenance judgments; no automated result authenticates them.

The candidate consumes the exception structurally by accepting exactly the
pair, with no enabled-mode field or remaining-use counter. Full B ancestry
contains neither prior pair consumption nor canonical state. Hostile history
inputs demonstrate refusal even after a Proposed-looking rollback, deleted
state/evidence or an alternate bridge version. Actual durable expiry is a
post-merge observation, **not claimed complete here**.

### Recorded process output

```text
EX-G36 real candidate: MECHANICAL_PASS_MANUAL_REVIEW_REQUIRED
Historical INDEX acceptance sections preserved: 11
Previously Accepted ADR bytes preserved: 21
Envelope metadata excluded from causal bridge preimage: PASS; source mismatch still refuses
ADV-G114 singleton ADR-0023: REFUSE (PAIR)
ADV-G115 singleton ADR-0024: REFUSE (PAIR)
ADV-G116 ADR-0020 included: REFUSE (OTHER_ADR)
ADV-G117 third ADR relationship: REFUSE (OTHER_ADR)
ADV-G117 third ADR lifecycle: REFUSE (OTHER_ADR)
ADV-G118 U4 RESOLVED: REFUSE (PATH_SCOPE)
ADV-G118 GATE-U4 satisfied: REFUSE (PATH_SCOPE)
ADV-G118 Complete: REFUSE (PATH_SCOPE)
ADV-G119 canonical state target: REFUSE (CANONICAL_STATE)
ADV-G119 canonical state base: REFUSE (CANONICAL_STATE)
ADV-G119 deleted prior registry: REFUSE (REGISTRY_EVER)
ADV-G120 moved main observation: REFUSE (BASE)
ADV-G120 alternate base identity: REFUSE (BASE_IDENTITY)
ADV-G121 altered ADR-0023 proposal: REFUSE (DIGEST)
ADV-G121 substituted lineage: REFUSE (LINEAGE)
ADV-G122 altered ADR-0024 proposal identity: REFUSE (PROPOSAL_IDENTITY)
ADV-G122 rehashed accepted body widening: REFUSE (DELTA_TARGET)
ADV-G123 missing envelope 0: REFUSE (ENVELOPE_COUNT)
ADV-G123 missing envelope 1: REFUSE (ENVELOPE_COUNT)
ADV-G123 missing source: REFUSE (OWNER_SOURCE)
ADV-G124 sequential history: REFUSE (SEQUENTIAL_PAIR)
ADV-G125 reused after rollback: REFUSE (CONSUMED)
ADV-G125 alternate bridge version: REFUSE (CONTRACT)
ADV-G126 ADR-0022 as authority: REFUSE (AUTHORITY_SOURCE)
ADV-G127 mirror disagreement: REFUSE (MIRROR_SET)
ADV-G128 hidden tests/fixtures/governance/candidate/state.json: REFUSE (PATH_SCOPE)
ADV-G128 hidden scripts/governance/model/history.mjs: REFUSE (PATH_SCOPE)
ADV-G128 hidden .github/workflows/checks.yml: REFUSE (PATH_SCOPE)
ADV-G128 hidden pnpm-lock.yaml: REFUSE (PATH_SCOPE)
ADV-G129 substituted at 2026-09-19T07:07:39.7871783Z: REFUSE (ENVELOPE_BINDING)
ADV-G129 substituted at 2026-09-19T00:00:00Z: REFUSE (ENVELOPE_BINDING)
ADV-G129 substituted at 2026-09-19T12:00:00Z: REFUSE (ENVELOPE_BINDING)
ADV-G129 substituted at 2026-09-02T08:03:21Z: REFUSE (ENVELOPE_BINDING)
ADV-G129 substituted at 2026-09-19: REFUSE (ENVELOPE_BINDING)
ADV-G129 date-only envelope: REFUSE (ENVELOPE_SHAPE)
ADV-G130 old latency field: REFUSE (ENVELOPE_SHAPE)
ADV-G130 old recording-date difference field: REFUSE (ENVELOPE_SHAPE)
ADV-G130 duplicate subject: REFUSE (ENVELOPE_BINDING)
ADV-G130 wrong transition digest: REFUSE (DIGEST)
ADV-G130 duplicate JSON key: REFUSE (NONCANONICAL_JSON)
ADV-G130 genesis alias: REFUSE (PREIMAGE_SHAPE)
ADV-G131 future self commit: REFUSE (RECEIPT_SHAPE)
ADV-G131 future self tree: REFUSE (RECEIPT_SHAPE)
ADV-G131 receipt self digest: REFUSE (RECEIPT_SHAPE)
ADV-G132 invented S: REFUSE (PREIMAGE_SHAPE)
ADV-G132 archive rebinding: REFUSE (SOURCE_HANDOFF)
ADV-G133 review/failed-attempt as owner source: REFUSE (OWNER_SOURCE)
ADV-G134 edit Accepted ADR-0021: REFUSE (OTHER_ADR)
ADV-G134 fully rehashed temporal widening: REFUSE (DELTA_TARGET)
chronology review equals owner: REFUSE (REVIEW_NOT_BEFORE_OWNER)
chronology review after owner: REFUSE (REVIEW_NOT_BEFORE_OWNER)
superseded evidenceIdentity: REFUSE (EVIDENCE_IDENTITY)
superseded owner instruction: REFUSE (OWNER_SOURCE)
missing durable review: REFUSE (DURABLE_REVIEW_MISSING)
altered review head: REFUSE (REVIEW_HEAD)
altered review disposition: REFUSE (REVIEW_DISPOSITION)
altered review comment identity: REFUSE (REVIEW_IDENTITY)
missing bootstrap-legality finding: REFUSE (REVIEW_LEGALITY)
Chronology: 2026-09-19T09:23:12Z < 2026-09-19T09:59:46.7922478Z: PASS (full precision)
Correction: exactly four evidence/reference paths; both ADRs and causal preimages unchanged
ADV-G128 protected remote observations: changed head/state REFUSE for PR #124 and #101 (4 controls)
MUT-G22/G23/G24: 3/3 isolated comparator mutations detected; not production-checker mutants
Working-tree proof; repeat against HEAD after the one atomic commit
PR #124 local HEAD, full diff and three candidate members unchanged
SUMMARY {"positive":1,"hostileRefusals":58,"comparatorMutations":3,"changedPaths":19,"receiptSha256":"fc9e69baa6abfdae473ed287061e970936bdb1fa45fd6f35f27946edc1e0ed30","result":"MECHANICAL_PASS_MANUAL_REVIEW_REQUIRED"}
Manual review remains: human authorship/reviewer independence, semantic hunks, live PR states, future merge/S/expiry.
```

### Read-only process source

```javascript
// Read-only acceptance process proof, NOT a production or reusable authorization checker.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
const root = path.resolve(process.argv[2] ?? '.')
const revision = process.argv[3]
const B = 'ff7b240397385e8d2571ee1208e2e440cb77825c'
const P = '89c5669e8a858adae3dcd9987c03cf7f5d5ea2ad'
const M = '83e6cd8fa7d2d05ab246a39de039129b4056966d'
const AT = '2026-09-19T09:59:46.7922478Z'
const SOURCE = 'abc8eaef58097d57197190f6dbe4d13837dd05488198530bb01755661d32cef4'
const REVIEW_SOURCE = '2306d34dcd46c9978a18c5c1819639048e055873012915ccb134392b0f4590fb'
const REJECTED = '132dbe0e2a1929f5428790b6a0d1d573a92b5b60'
const dir = 'openspec/changes/governance-state-substrate/'
const receiptPath = dir + 'bridge-evidence.json'
const verifyPath = dir + 'bridge-verification.md'
const protectedPr2 = '/home/mike/dev/secure-home-agent-platform-pr2'
const pins = {
  ".github/agents/architecture.agent.md": "c85d6e69941dfa5a2ce137063ade1046ce5883465cc64a228adbc8d626ca8abf",
  ".github/agents/implementation.agent.md": "356bf915c61a7305761f906e6bc80b3911b58caa23a171a133647c7c2a0c5a31",
  ".github/copilot-instructions.md": "2c8b92a1ecb52dfc68eda4722da0bbd4cbf1606049bab87411f1d83e7e8398da",
  "AGENTS.md": "d3aa0bb95e868ce841e6731b262e3f7f6d83bf4d5912b272bd91fab0139891be",
  "CLAUDE.md": "f5b417183782c1cc9a8067488bcc720323b3d9aa0f7dd85e12f3bd6a139236b4",
  "CONTRIBUTING.md": "d076f75efd98a8b3fa509d8479be3f5bf58bcfe67ebb6bb44177e3eeaf3b3eaa",
  "README.md": "f0ed7c6d5a13a05aad0147783423ff538c3bb9f54f5d942ad382807eee81fbab",
  "docs/AGENTS.md": "c2e46288a3075552875d7aa7391edb0af62e28365a464e0158c0bd685956a792",
  "docs/README.md": "7090f79ef14062d5e3d8b4496111ec0f5627a02cf0353f3f588874cce7302ddd",
  "docs/decisions/ADR-0023-separate-governance-decision-dates-from-git-commit-timestamps.md": "16af9b56e4b29fe8d9e4047bf3ca0f9d25046b1d16c2a86315fb38f437ae6487",
  "docs/decisions/ADR-0024-permit-one-atomic-pre-registry-governance-acceptance-bridge.md": "4201262d2a77357dddef2ff8a560d53b570badd84d374c5e980f0ede321d9b71",
  "docs/decisions/INDEX.md": "f57c9fe52208298464ab08ce4c1adc78c5418cbd9e62963050158b7dfc6183e4",
  "openspec/changes/governance-state-substrate/assurance.md": "0329294b018117b520a24bf0e87b74e1ebc4c15f6e3d4e06843dfa4b6ed95b8b",
  "openspec/changes/governance-state-substrate/design.md": "ed9060ca29096fc11d4a6c52acf2c12b0e92bd39311a134e465af3c59ade9141",
  "openspec/changes/governance-state-substrate/proposal.md": "aad6fb9f2ba20c583b8710502fb6fd211dbdf25aed14f1c6a3a83e9493acd976",
  "openspec/changes/governance-state-substrate/specs/governance-state/spec.md": "967f44d88c2a991802b6a3d3582326bd378fcb92d709c1d2525a9d2cb362d1e1",
  "openspec/changes/governance-state-substrate/tasks.md": "c58aafcc772bb6ae0cf78de9139a9a9935212d24e6278d3f5943963b98ca62b0"
}
const allowed = [...Object.keys(pins), receiptPath, verifyPath].sort()
const canonical = x => JSON.stringify(x, null, 2) + '\n'
const sha = x => crypto.createHash('sha256').update(x).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
const lines = x => x.trim().split('\n').filter(Boolean)
const fence = String.fromCharCode(96).repeat(3)
const basePaths = lines(git('ls-tree', '-r', '--name-only', B))
const adrs = basePaths.filter(p => /^docs\/decisions\/ADR-\d{4}-.+\.md$/.test(p))
const status = text => text?.match(/^- \*\*Status:\*\* (.+)$/m)?.[1] ?? 'ABSENT'
const id = p => p.match(/ADR-\d{4}/)[0]
const subjects = adrs.filter(p => ['ADR-0023', 'ADR-0024'].includes(id(p))).sort()
const BFile = p => basePaths.includes(p) ? git('show', B + ':' + p) : null
const targetFile = p => {
  if (revision) return lines(git('ls-tree', '-r', '--name-only', revision, '--', p)).includes(p) ? git('show', revision + ':' + p) : null
  return fs.existsSync(path.join(root, p)) ? fs.readFileSync(path.join(root, p), 'utf8') : null
}
function requireFact(ok, code) { if (!ok) throw new Error(code) }
function keys(x, expected, code) {
  requireFact(x !== null && typeof x === 'object' && !Array.isArray(x), code)
  requireFact(JSON.stringify(Object.keys(x)) === JSON.stringify(expected.split(',')), code)
}
function exactInstant(text) {
  const m = text?.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/)
  requireFact(m && Number.isFinite(Date.parse(m[1] + 'Z')), 'TIME_SHAPE')
  return BigInt(Date.parse(m[1] + 'Z')) * 1000000n + BigInt((m[2] ?? '').padEnd(9, '0'))
}
function chronologyGuard(reviewAt, ownerAt) {
  requireFact(exactInstant(reviewAt) < exactInstant(ownerAt), 'REVIEW_NOT_BEFORE_OWNER')
}
function reviewGuard(text, ownerAt) {
  const raw = text.split('<!-- durable-review-source:start -->\n' + fence + 'json\n')[1]?.split(fence + '\n<!-- durable-review-source:end -->')[0]
  requireFact(raw, 'DURABLE_REVIEW_MISSING')
  const r = JSON.parse(raw)
  chronologyGuard(r.created_at, ownerAt)
  requireFact(r.id === 5740741488 &&
    r.html_url === 'https://github.com/pulse-ops-ai/secure-home-agent-platform/issues/106#issuecomment-5740741488' &&
    r.issue_url === 'https://api.github.com/repos/pulse-ops-ai/secure-home-agent-platform/issues/106', 'REVIEW_IDENTITY')
  requireFact(r.body.includes('Reviewed candidate:\n\n' + String.fromCharCode(96) + P + String.fromCharCode(96)), 'REVIEW_HEAD')
  requireFact(r.body.includes('**APPROVE — no P1/P2 findings.**'), 'REVIEW_DISPOSITION')
  requireFact(r.body.includes('The bootstrap-legality argument in Proposed ADR-0024 is accepted.'), 'REVIEW_LEGALITY')
  requireFact(r.created_at === '2026-09-19T09:23:12Z', 'REVIEW_TIME_SOURCE')
  digestGuard(sha(raw), REVIEW_SOURCE)
  return r.created_at
}
function historyGuard(history) {
  requireFact(!history.registryEver, 'REGISTRY_EVER')
  requireFact(!history.consumed, 'CONSUMED')
  requireFact(history.sequence.every(pair => pair[0] === pair[1]), 'SEQUENTIAL_PAIR')
}
function pairGuard(before, after) {
  requireFact(subjects.every(p => status(before[p]) === 'Proposed' && status(after[p]) === 'Accepted'), 'PAIR')
  for (const p of adrs.filter(p => !subjects.includes(p))) requireFact(after[p] === before[p], 'OTHER_ADR')
}
function identityGuard(value, expected, code) {
  keys(value, 'class,value', code)
  requireFact(value.class === 'local-git-commit' && value.value === expected, code)
}
function digestGuard(actual, expected) { requireFact(actual === expected, 'DIGEST') }
function protectedHeadGuard(observed) {
  requireFact(observed.pr124.head === 'dcd32f073c4ca6f8da6efd7e38e0f1b327f70e8e' &&
    observed.pr124.state === 'open' && observed.pr124.draft === true, 'PR124_REMOTE')
  requireFact(observed.pr101.head === '559d78cc32cc40f8eaa7aba15a961554f3033b43' &&
    observed.pr101.state === 'open' && observed.pr101.draft === true, 'PR101_REMOTE')
}
function literalDeltas(before, after, verification) {
  for (const p of subjects) {
    const section = verification.split('### ' + id(p) + ' literal allowed delta\n\n')[1]
    const diff = section?.split(fence + 'diff\n')[1]?.split('\n' + fence)[0] + '\n'
    requireFact(diff && diff.includes('diff --git a/' + p), 'DELTA_REPORT')
    const body = diff.split('\n'), output = [], original = before[p].split('\n')
    let cursor = 0, i = 0
    while (i < body.length && !body[i].startsWith('@@ ')) i++
    while (i < body.length && body[i].startsWith('@@ ')) {
      const m = body[i++].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      requireFact(m, 'DELTA_HUNK')
      const start = Number(m[1]) - 1
      requireFact(start >= cursor, 'DELTA_ORDER')
      output.push(...original.slice(cursor, start)); cursor = start
      while (i < body.length && !body[i].startsWith('@@ ')) {
        const line = body[i++]
        if (!line) break
        const prefix = line[0], text = line.slice(1)
        if (prefix === ' ' || prefix === '-') {
          requireFact(original[cursor++] === text, 'DELTA_PREIMAGE')
          if (prefix === ' ') output.push(text)
        } else if (prefix === '+') output.push(text)
        else throw new Error('DELTA_ENCODING')
      }
    }
    output.push(...original.slice(cursor))
    requireFact(output.join('\n') === after[p], 'DELTA_TARGET')
  }
}
function recordSections(text) {
  return new Map(text.split(/(?=^#{2,3} .+$)/m)
    .filter(s => /^#{2,3} (?:ADR-\d{4} acceptance record|Acceptance record)\n/.test(s))
    .map(s => [s.split('\n')[0], s]))
}
function mirrors(view) {
  for (const p of Object.keys(pins).filter(p => !p.startsWith('openspec/') && !p.startsWith('docs/decisions/'))) {
    requireFact(view.files[p].includes('ADR-0021 through ADR-0024') || view.files[p].includes('ADR-0021 … ADR-0024'), 'MIRROR_SET')
    requireFact(view.files[p].includes('ADR-0020'), 'MIRROR_EXCLUSION')
  }
  const index = view.files['docs/decisions/INDEX.md']
  for (const s of view.receipt.preimage.subjects) requireFact(index.includes('### ' + s.id + ' acceptance record') && index.includes(s.contentDigest), 'INDEX_RECORD')
  const rows = index.split('\n').filter(s => s.startsWith('| [ADR-'))
  for (const p of adrs) {
    const row = rows.find(s => s.startsWith('| [' + id(p) + ']'))
    requireFact(row && row.split('|')[3].includes(id(p) === 'ADR-0020' ? 'Proposed' : 'Accepted'), 'INDEX_LIFECYCLE')
  }
  const now = recordSections(index)
  for (const [heading, content] of recordSections(view.before['docs/decisions/INDEX.md'])) requireFact(now.get(heading) === content, 'HISTORICAL_RECORD')
  const task = dir + 'tasks.md', checks = t => t.split('\n').filter(s => /^- \[[ x]\]/.test(s))
  requireFact(JSON.stringify(checks(view.before[task])) === JSON.stringify(checks(view.files[task])), 'TASK_EXECUTION')
}
function check(view) {
  requireFact(view.base === B && view.observedMain === B, 'BASE')
  historyGuard(view.history)
  requireFact(view.files['governance/state.json'] == null && view.before['governance/state.json'] == null, 'CANONICAL_STATE')
  pairGuard(view.before, view.files)
  requireFact(JSON.stringify(view.changed.sort()) === JSON.stringify(allowed), 'PATH_SCOPE')
  const r = view.receipt
  requireFact(view.raw === canonical(r), 'NONCANONICAL_JSON')
  keys(r, 'preimage,bridgeDigest,acceptances', 'RECEIPT_SHAPE')
  const pre = r.preimage
  keys(pre, 'contract,base,temporalProposalLineage,subjects', 'PREIMAGE_SHAPE')
  requireFact(pre.contract === 'pre-registry-adr-pair-v1', 'CONTRACT')
  identityGuard(pre.base, B, 'BASE_IDENTITY')
  keys(pre.temporalProposalLineage, 'reviewedHead,mergedMain', 'LINEAGE_SHAPE')
  identityGuard(pre.temporalProposalLineage.reviewedHead, 'a443e192ee02e66c9fbaefefbadfbb877650ea32', 'LINEAGE')
  identityGuard(pre.temporalProposalLineage.mergedMain, '5815094efcc85164bf9bf95fd0cda03192ebb7dc', 'LINEAGE')
  requireFact(Array.isArray(pre.subjects) && pre.subjects.length === 2, 'SUBJECT_COUNT')
  requireFact(Array.isArray(r.acceptances) && r.acceptances.length === 2, 'ENVELOPE_COUNT')
  const source = view.files[verifyPath].split('<!-- joint-owner-source:start -->\n' + fence + 'json\n')[1]?.split(fence + '\n<!-- joint-owner-source:end -->')[0]
  requireFact(source && sha(source) === SOURCE, 'OWNER_SOURCE')
  const event = JSON.parse(source)
  requireFact(event.type === 'response_item' && event.payload.role === 'user' &&
    event.timestamp === '2026-09-19T09:59:46.792Z', 'OWNER_EVENT')
  const encoded = source.match(/"create_time":([0-9]+)\.([0-9]+)/)
  requireFact(encoded, 'OWNER_TIME_SOURCE')
  const exactAt = new Date(Number(encoded[1]) * 1000).toISOString().replace('.000Z', '.' + encoded[2] + 'Z')
  requireFact(exactAt === AT, 'OWNER_TIME_PRECISION')
  requireFact(event.payload.content.map(c => c.text ?? '').join('').startsWith('OWNER CORRECTION — PR #130 JOINT ACCEPTANCE EVIDENCE ONLY'), 'JOINT_ACT')
  reviewGuard(view.files[verifyPath], exactAt)
  digestGuard(r.bridgeDigest, sha(canonical(pre)))
  const proposalPins = ['86c118c26a1632f6448bf2ce54d262c67ff1d25f7768df0fc90177ee2c38a7fb', 'ac69103cd41c5c023c3a72a432e92b5bf96a7c7d094e9720d9d6d0186018db5a']
  for (let i = 0; i < 2; i++) {
    const s = pre.subjects[i], a = r.acceptances[i]
    keys(s, 'id,path,proposalIdentity,proposalContentDigest,from,to,contentDigest', 'SUBJECT_SHAPE')
    requireFact(s.id === id(subjects[i]) && s.path === subjects[i] && s.from === 'Proposed' && s.to === 'Accepted', 'SUBJECT_BINDING')
    identityGuard(s.proposalIdentity, P, 'PROPOSAL_IDENTITY')
    digestGuard(s.proposalContentDigest, proposalPins[i])
    digestGuard(sha(view.before[s.path]), proposalPins[i])
    digestGuard(s.contentDigest, sha(view.files[s.path]))
    requireFact(view.files[s.path].includes('- **Accepted:** 2026-09-19'), 'DECISION_DATE')
    keys(a, 'subject,transitionDigest,contentDigest,outcome,actor,at,authority,evidenceIdentity', 'ENVELOPE_SHAPE')
    requireFact(a.subject === s.id && a.contentDigest === s.contentDigest && a.outcome === 'accepted' && a.actor === '@mikegtech' && a.at === AT, 'ENVELOPE_BINDING')
    keys(a.authority, 'type,repository,id', 'AUTHORITY_SHAPE')
    requireFact(a.authority.type === 'task-contract' && a.authority.repository === 'pulse-ops-ai/secure-home-agent-platform' && a.authority.id === verifyPath + '#joint-owner-instruction', 'AUTHORITY_SOURCE')
    keys(a.evidenceIdentity, 'class,value', 'SOURCE_SHAPE')
    requireFact(a.evidenceIdentity.class === 'content-sha256' && a.evidenceIdentity.value === SOURCE, 'EVIDENCE_IDENTITY')
    digestGuard(a.transitionDigest, sha(canonical({ contract: 'pre-registry-adr-pair-subject-v1', bridgeDigest: r.bridgeDigest, subject: s.id, from: 'Proposed', to: 'Accepted', contentDigest: s.contentDigest })))
  }
  literalDeltas(view.before, view.files, view.files[verifyPath])
  mirrors(view)
  requireFact(view.files[dir + 'design.md'].includes(M) && view.files[verifyPath].includes('S does not yet\nexist'), 'SOURCE_HANDOFF')
  for (const [p, expected] of Object.entries(pins)) digestGuard(sha(view.files[p]), expected)
  return 'MECHANICAL_PASS_MANUAL_REVIEW_REQUIRED'
}
requireFact(git('rev-parse', '--is-shallow-repository').trim() === 'false', 'SHALLOW_HISTORY')
const observedMain = git('rev-parse', 'origin/main').trim() // fetched observation, not live network proof
const registryEver = Boolean(git('log', '--full-history', '--format=%H', B, '--', 'governance/state.json').trim())
const past = lines(git('log', '--full-history', '--format=%H', B, '--', 'docs/decisions/ADR-0023*', 'docs/decisions/ADR-0024*'))
let consumed = false
for (const rev of past) for (const p of lines(git('ls-tree', '-r', '--name-only', rev, 'docs/decisions')).filter(p => /ADR-002[34]-/.test(p))) {
  if (status(git('show', rev + ':' + p)) === 'Accepted') consumed = true
}
const files = {}, before = {}
for (const p of new Set([...allowed, ...adrs, 'governance/state.json'])) { before[p] = BFile(p); files[p] = targetFile(p) }
const changed = revision ? lines(git('diff', '--name-only', B, revision)) :
  [...lines(git('diff', '--name-only', B)), ...lines(git('ls-files', '--others', '--exclude-standard'))]
const raw = files[receiptPath]
const initial = { base: B, observedMain, files, before, raw, receipt: JSON.parse(raw), changed,
  history: { registryEver, consumed, sequence: [['Proposed', 'Proposed'], ['Accepted', 'Accepted']] } }
const old23 = 'docs/decisions/ADR-0023-separate-governance-decision-dates-from-recording-instants.md'
for (const rev of ['a443e192ee02e66c9fbaefefbadfbb877650ea32', '5815094efcc85164bf9bf95fd0cda03192ebb7dc']) digestGuard(sha(git('show', rev + ':' + old23)), initial.receipt.preimage.subjects[0].proposalContentDigest)
for (const s of initial.receipt.preimage.subjects) digestGuard(sha(git('show', P + ':' + s.path)), s.proposalContentDigest)
console.log('EX-G36 real candidate:', check(initial))
console.log('Historical INDEX acceptance sections preserved:', recordSections(before['docs/decisions/INDEX.md']).size)
console.log('Previously Accepted ADR bytes preserved:', adrs.filter(p => status(before[p]) === 'Accepted').length)
const metadataControl = structuredClone(initial.receipt)
metadataControl.acceptances[0].at = '2026-09-19T00:00:00Z'
digestGuard(sha(canonical(metadataControl.preimage)), initial.receipt.bridgeDigest)
console.log('Envelope metadata excluded from causal bridge preimage: PASS; source mismatch still refuses')
const results = []
function rebind(view) {
  const r = view.receipt
  r.bridgeDigest = sha(canonical(r.preimage))
  for (const a of r.acceptances) {
    const s = r.preimage.subjects.find(s => s.id === a.subject)
    a.contentDigest = s.contentDigest
    a.transitionDigest = sha(canonical({ contract: 'pre-registry-adr-pair-subject-v1',
      bridgeDigest: r.bridgeDigest, subject: s.id, from: 'Proposed', to: 'Accepted',
      contentDigest: s.contentDigest }))
  }
}
function hostile(name, change, keepRaw = false) {
  const view = structuredClone(initial)
  change(view)
  if (!keepRaw) view.raw = canonical(view.receipt)
  let refusal
  try { check(view) } catch (error) { refusal = error.message }
  assert.ok(refusal, name + ' escaped')
  results.push({ name, outcome: 'REFUSE', reason: refusal })
}
hostile('ADV-G114 singleton ADR-0023', v => { v.files[subjects[1]] = v.before[subjects[1]] })
hostile('ADV-G115 singleton ADR-0024', v => { v.files[subjects[0]] = v.before[subjects[0]] })
const adr20 = adrs.find(p => id(p) === 'ADR-0020')
hostile('ADV-G116 ADR-0020 included', v => { v.files[adr20] = v.before[adr20].replace('**Status:** Proposed', '**Status:** Accepted') })
hostile('ADV-G117 third ADR relationship', v => { v.files[adrs[0]] += '\nresolves: U4\n' })
hostile('ADV-G117 third ADR lifecycle', v => { v.files[adrs[0]] = v.files[adrs[0]].replace('**Status:** Accepted', '**Status:** Rejected') })
for (const [p, value] of [['docs/architecture/unresolved-decisions.md', 'U4 RESOLVED'], ['scripts/governance/model/gates.mjs', 'GATE-U4 satisfied'], ['new-landing.json', 'Complete']])
  hostile('ADV-G118 ' + value, v => { v.files[p] = value; v.changed.push(p) })
hostile('ADV-G119 canonical state target', v => { v.files['governance/state.json'] = '{}' })
hostile('ADV-G119 canonical state base', v => { v.before['governance/state.json'] = '{}' })
hostile('ADV-G119 deleted prior registry', v => { v.history.registryEver = true })
hostile('ADV-G120 moved main observation', v => { v.observedMain = P })
hostile('ADV-G120 alternate base identity', v => { v.receipt.preimage.base.value = P })
hostile('ADV-G121 altered ADR-0023 proposal', v => { v.before[subjects[0]] += '\nchanged\n' })
hostile('ADV-G121 substituted lineage', v => { v.receipt.preimage.temporalProposalLineage.reviewedHead.value = B })
hostile('ADV-G122 altered ADR-0024 proposal identity', v => { v.receipt.preimage.subjects[1].proposalIdentity.value = B; rebind(v) })
hostile('ADV-G122 rehashed accepted body widening', v => {
  v.files[subjects[1]] += '\nAny proposed ADR may be manually accepted.\n'
  v.receipt.preimage.subjects[1].contentDigest = sha(v.files[subjects[1]])
  rebind(v)
})
for (let i = 0; i < 2; i++) hostile('ADV-G123 missing envelope ' + i, v => { v.receipt.acceptances.splice(i, 1) })
hostile('ADV-G123 missing source', v => { v.files[verifyPath] = v.files[verifyPath].replace('<!-- joint-owner-source:start -->', '<!-- missing -->') })
hostile('ADV-G124 sequential history', v => { v.history.sequence.splice(1, 0, ['Accepted', 'Proposed']) })
hostile('ADV-G125 reused after rollback', v => { v.history.consumed = true })
hostile('ADV-G125 alternate bridge version', v => { v.receipt.preimage.contract = 'pre-registry-adr-pair-v2' })
hostile('ADV-G126 ADR-0022 as authority', v => { v.receipt.acceptances[0].authority.id = 'docs/decisions/INDEX.md#adr-0022-acceptance-record' })
hostile('ADV-G127 mirror disagreement', v => { v.files['AGENTS.md'] = v.files['AGENTS.md'].replaceAll('ADR-0021 through ADR-0024', 'ADR-0001 through ADR-0024') })
for (const p of ['tests/fixtures/governance/candidate/state.json', 'scripts/governance/model/history.mjs', '.github/workflows/checks.yml', 'pnpm-lock.yaml'])
  hostile('ADV-G128 hidden ' + p, v => { v.files[p] = 'changed'; v.changed.push(p) })
for (const at of ['2026-09-19T07:07:39.7871783Z', '2026-09-19T00:00:00Z', '2026-09-19T12:00:00Z', '2026-09-02T08:03:21Z', '2026-09-19'])
  hostile('ADV-G129 substituted at ' + at, v => { v.receipt.acceptances[0].at = at })
hostile('ADV-G129 date-only envelope', v => { delete v.receipt.acceptances[0].at; v.receipt.acceptances[0].decisionDate = '2026-09-19' })
hostile('ADV-G130 old latency field', v => { v.receipt.acceptances[0].recordedAt = AT })
hostile('ADV-G130 old recording-date difference field', v => { v.receipt.acceptances[0].recordingDateDiffers = true })
hostile('ADV-G130 duplicate subject', v => { v.receipt.acceptances[1] = structuredClone(v.receipt.acceptances[0]) })
hostile('ADV-G130 wrong transition digest', v => { v.receipt.acceptances[0].transitionDigest = '0'.repeat(64) })
hostile('ADV-G130 duplicate JSON key', v => { v.raw = v.raw.replace('"bridgeDigest":', '"bridgeDigest": "duplicate",\n  "bridgeDigest":') }, true)
hostile('ADV-G130 genesis alias', v => { v.receipt.preimage.priorStateDigest = null })
hostile('ADV-G131 future self commit', v => { v.receipt.commit = '0'.repeat(40) })
hostile('ADV-G131 future self tree', v => { v.receipt.tree = '0'.repeat(40) })
hostile('ADV-G131 receipt self digest', v => { v.receipt.receiptDigest = '0'.repeat(64) })
hostile('ADV-G132 invented S', v => { v.receipt.preimage.S = B })
hostile('ADV-G132 archive rebinding', v => { v.files[dir + 'design.md'] = v.files[dir + 'design.md'].replaceAll(M, B) })
hostile('ADV-G133 review/failed-attempt as owner source', v => { v.files[verifyPath] = v.files[verifyPath].replace('OWNER CORRECTION — PR #130 JOINT ACCEPTANCE EVIDENCE ONLY', 'PROPOSAL APPROVED; RETRY PERMITTED') })
hostile('ADV-G134 edit Accepted ADR-0021', v => { v.files[adrs.find(p => id(p) === 'ADR-0021')] += '\nchange\n' })
hostile('ADV-G134 fully rehashed temporal widening', v => {
  v.files[subjects[0]] += '\nDates may use Git time.\n'
  v.receipt.preimage.subjects[0].contentDigest = sha(v.files[subjects[0]])
  rebind(v)
})
function editReview(view, edit) {
  const text = view.files[verifyPath]
  const raw = text.split('<!-- durable-review-source:start -->\n' + fence + 'json\n')[1].split(fence + '\n<!-- durable-review-source:end -->')[0]
  const review = JSON.parse(raw)
  edit(review)
  view.files[verifyPath] = text.replace(raw, JSON.stringify(review) + '\n')
}
hostile('chronology review equals owner', v => editReview(v, r => { r.created_at = AT }))
hostile('chronology review after owner', v => editReview(v, r => { r.created_at = '2026-09-19T09:59:46.7922479Z' }))
hostile('superseded evidenceIdentity', v => { v.receipt.acceptances[0].evidenceIdentity.value = 'e5871b1dfdbe33214d7517bf59a893b0bd0a1cf5d8e69ddfd3a91efac94528c5' })
hostile('superseded owner instruction', v => {
  const oldDoc = git('show', REJECTED + ':' + verifyPath)
  const marker = '<!-- joint-owner-source:start -->\n' + fence + 'json\n'
  const close = fence + '\n<!-- joint-owner-source:end -->'
  const oldSource = oldDoc.split(marker)[1].split(close)[0]
  const current = v.files[verifyPath].split(marker)[1].split(close)[0]
  v.files[verifyPath] = v.files[verifyPath].replace(current, oldSource)
})
hostile('missing durable review', v => { v.files[verifyPath] = v.files[verifyPath].replace('<!-- durable-review-source:start -->', '<!-- missing-review -->') })
hostile('altered review head', v => editReview(v, r => { r.body = r.body.replace(P, B) }))
hostile('altered review disposition', v => editReview(v, r => { r.body = r.body.replace('**APPROVE — no P1/P2 findings.**', '**REQUEST CHANGES**') }))
hostile('altered review comment identity', v => editReview(v, r => { r.id = 5740741489 }))
hostile('missing bootstrap-legality finding', v => editReview(v, r => { r.body = r.body.replace('The bootstrap-legality argument in Proposed ADR-0024 is accepted.', 'No legality finding.') }))
for (const r of results) console.log(r.name + ': REFUSE (' + r.reason + ')')
requireFact(results.find(r => r.name === 'chronology review equals owner').reason === 'REVIEW_NOT_BEFORE_OWNER', 'CHRONOLOGY_CONTROL')
requireFact(results.find(r => r.name === 'chronology review after owner').reason === 'REVIEW_NOT_BEFORE_OWNER', 'CHRONOLOGY_CONTROL')
console.log('Chronology: ' + reviewGuard(files[verifyPath], AT) + ' < ' + AT + ': PASS (full precision)')
const correctionPaths = ['docs/decisions/INDEX.md', dir + 'tasks.md', receiptPath, verifyPath].sort()
const correctionDiff = revision ? lines(git('diff', '--name-only', REJECTED, revision)) : lines(git('diff', '--name-only', REJECTED))
requireFact(JSON.stringify(correctionDiff.sort()) === JSON.stringify(correctionPaths), 'CORRECTION_SCOPE')
const oldReceipt = JSON.parse(git('show', REJECTED + ':' + receiptPath))
requireFact(canonical(oldReceipt.preimage) === canonical(initial.receipt.preimage), 'CAUSAL_PREIMAGE_CHANGED')
for (let i = 0; i < 2; i++) {
  const original = { ...oldReceipt.acceptances[i], at: AT,
    evidenceIdentity: { class: 'content-sha256', value: SOURCE } }
  requireFact(canonical(original) === canonical(initial.receipt.acceptances[i]), 'EXTRA_ENVELOPE_CHANGE')
}
console.log('Correction: exactly four evidence/reference paths; both ADRs and causal preimages unchanged')
// Recorded live API observations, not a new API read; re-fetch independently before merge.
const recordedHeads = {
  pr124: { head: 'dcd32f073c4ca6f8da6efd7e38e0f1b327f70e8e', state: 'open', draft: true },
  pr101: { head: '559d78cc32cc40f8eaa7aba15a961554f3033b43', state: 'open', draft: true }
}
protectedHeadGuard(recordedHeads)
for (const key of ['pr124', 'pr101']) {
  const changed = structuredClone(recordedHeads); changed[key].head = B
  assert.throws(() => protectedHeadGuard(changed))
  changed[key] = { ...recordedHeads[key], state: 'closed' }
  assert.throws(() => protectedHeadGuard(changed))
}
console.log('ADV-G128 protected remote observations: changed head/state REFUSE for PR #124 and #101 (4 controls)')
// Mutate the actual isolated comparator source by dropping its refusal calls.
// Independent redundant guards can still reject the same fixture in the full process.
const voidCheck = () => {}
// Supply the no-op only in the mutated function's lexical environment.
function dropComparisons(fn) {
  return Function('voidCheck', 'subjects', 'status', 'adrs', 'return (' +
    fn.toString().replaceAll('requireFact(', 'voidCheck(') + ')')(
    voidCheck, subjects, status, adrs)
}
const badPair = structuredClone(initial.files); badPair[subjects[0]] = initial.before[subjects[0]]
assert.throws(() => pairGuard(initial.before, badPair))
assert.doesNotThrow(() => dropComparisons(pairGuard)(initial.before, badPair))
const badHistory = { registryEver: true, consumed: true, sequence: [] }
assert.throws(() => historyGuard(badHistory))
assert.doesNotThrow(() => dropComparisons(historyGuard)(badHistory))
assert.throws(() => digestGuard('0'.repeat(64), initial.receipt.bridgeDigest))
assert.doesNotThrow(() => dropComparisons(digestGuard)('0'.repeat(64), initial.receipt.bridgeDigest))
console.log('MUT-G22/G23/G24: 3/3 isolated comparator mutations detected; not production-checker mutants')
if (revision) {
  const commits = lines(git('rev-list', B + '..' + revision))
  requireFact(commits.length === 1, 'ONE_PAIR_COMMIT')
  requireFact(git('show', '-s', '--format=%P', revision).trim() === B, 'DIRECT_B_PARENT')
  for (const rev of commits) requireFact(subjects.every(p => status(git('show', rev + ':' + p)) === 'Accepted'), 'REACHABLE_SINGLETON')
  console.log('One pair-changing commit; sole parent exact B: PASS. Durable S does not yet exist.')
} else console.log('Working-tree proof; repeat against HEAD after the one atomic commit')
if (fs.existsSync(protectedPr2)) {
  const pg = (...args) => execFileSync('git', ['-C', protectedPr2, ...args])
  requireFact(pg('rev-parse', 'HEAD').toString().trim() === 'bffc11c6c1f93b57ada459b04cfcbdad1301ef19', 'PR124_HEAD')
  digestGuard(sha(pg('diff', 'HEAD', '--binary')), '9d27321e18a12bf9707eecc0ece739a8024362eb217018d5bd6aded61e432d94')
  for (const [name, expected] of Object.entries({
    state: '671bd1460142cc47a77b7766476aea0bc9278cfa6d0e4ff2b532a98d714a2770',
    'source-manifest': 'edb37bf4d5bcb38a1b71a4c5ee3acc64c97b50b1fe1ac4e429a5193c58473867',
    consumers: '7e15758e2815f003f0ea31e5a0465e904635303acf19443cbed9fe629eba7da0'
  })) digestGuard(sha(fs.readFileSync(path.join(protectedPr2, 'tests/fixtures/governance/candidate', name + '.json'))), expected)
  console.log('PR #124 local HEAD, full diff and three candidate members unchanged')
} else console.log('PR #124 local comparison UNAVAILABLE, external verification required, not a pass')
console.log('SUMMARY', JSON.stringify({ positive: 1, hostileRefusals: results.length, comparatorMutations: 3,
  changedPaths: allowed.length, receiptSha256: sha(raw), result: 'MECHANICAL_PASS_MANUAL_REVIEW_REQUIRED' }))
console.log('Manual review remains: human authorship/reviewer independence, semantic hunks, live PR states, future merge/S/expiry.')
```

### Validation record

This correction requires a fresh full aggregate on the rewritten single commit.
Old-head CI and gate results are not current candidate evidence. Final results
and skipped checks will be recorded externally in PR #130 after the amended
commit exists, avoiding a self-containing identity or validation claim.

## Review and post-merge obligations

This record does not grant merge permission. Independent final review binds the
exact single pair-changing commit/tree and receipt/source bytes externally.
Before a separately authorized merge, require live main == B and the reviewed
candidate unchanged. Use a merge commit preserving the original pair commit;
the resulting main tree must exactly match the reviewed target.

Only after merge record actual main S externally and prove the pair transition
is an ancestor, prior main is B, no singleton occurs, and the bridge is expired.
A revert, erased receipt, Proposed-looking tree or alias/version cannot reset
durable consumption; prior canonical-state history likewise closes the path.
A failed attempt/review, stale identity or proposal approval provides no retry
authority. ADR-0020 inherits nothing; ADR-0022 supplies no precedent.

Then—and only under a NEW owner implementation authorization against exact S—
resume PR #124 T.1–T.7, retain archive M, regenerate/freeze and independently
review PR-2. PR-3's real genesis ceremony/activation needs its own later authority.

## Related

- [ADR-0024](../../../docs/decisions/ADR-0024-permit-one-atomic-pre-registry-governance-acceptance-bridge.md)
- [ADR-0023](../../../docs/decisions/ADR-0023-separate-governance-decision-dates-from-git-commit-timestamps.md)
- [Design D13](design.md#d13-contingent-one-shot-bootstrap-bridge-adr-0024)
- [Assurance](assurance.md#contingent-bootstrap-bridge-proof-obligations-adr-0024)
- [Tasks and current authority](tasks.md#current-joint-acceptance-authority--no-implementation-authority)
