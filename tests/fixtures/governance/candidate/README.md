# Unattested PR-2 candidate

Review material only, extracted from durable PR-2A merge
`83e6cd8fa7d2d05ab246a39de039129b4056966d` under the exact-base PR-2 resumption
authorization. This directory is not canonical governance authority.

**WORK IN PROGRESS — NOT FROZEN OR REVIEW-READY.** The
[historical acceptance audit](../genesis/acceptance-audit.json) checks all 21
Accepted ADRs (there are no Rejected ADRs at M). Exact transition objects exist
for all 21. ADR-0015 is **not** a date-only case: transition
`a5cc2a739bd9602e30376400a46ebf7b5bab10f1` records
`2026-08-15T16:55:25Z` as its committer instant, consistent with its acceptance
date and U7's August 15 resolution. The August 18 main delivery is not that
transition.

The complete exception set is **ADR-0022**: its header and structured INDEX
record declare `2026-09-01`, but exact transition
`4334a7b040b14911b7b0894aeb14717b0418ee84` records
`2026-09-02T08:03:21Z`. This is a UTC-date disagreement, not an absent transition
object. It needs governed adjudication; no timestamp, accepted ADR, or authority
record has been rewritten. Git metadata is recording-time evidence, not proof
of human identity.

The audit is now a fail-closed prerequisite to extraction. These three
provisional JSON files have **not** been regenerated and still contain the old
extraction. Transition-based source-manifest integration, affected digest
recomputation, candidate regeneration/freeze, and the from-zero interrupted
targeted suite remain blocked pending a clean audit. No full-validation claim
is made.

The three freeze members are `state.json`, `source-manifest.json`, and
`consumers.json`. The state has `attestations: {genesis: {}}` and no human
completion envelope: full validation must refuse it. The source manifest records
historical evidence and proposed dispositions for independent review, including
the L1 materialization event and the issue/repository source disagreement.

Extraction and freshness are read-only mechanisms in
[`scripts/governance/genesis/`](../../../../scripts/governance/genesis/README.md).
The real owner ceremony, activation identity and final-base equality gate belong
to PR-3, not this candidate. Tests use only
[isolated fixture attestations](../genesis/README.md).

## Reconciliation receipt

The pre-resumption head was
`dcd32f073c4ca6f8da6efd7e38e0f1b327f70e8e`. A conflict-free `--no-ff` merge of
exact M produced local reconciliation commit
`bffc11c6c1f93b57ada459b04cfcbdad1301ef19`, with those two commits as its
parents. No rebase or cherry-pick was used. Delivered PR-2 model, entry-point,
and test bytes were unchanged by that reconciliation; the original 219
governance tests passed both before and after it. Subsequent genesis work is
uncommitted and has not been pushed. There is no final candidate head or freeze
identity to approve yet.

Promotion determination: no new architectural truth is being established by
this implementation. The proof protocol remains the merged contract's; the
acceptance-time ambiguity requires human adjudication, not a provider-local
exception or a new mutable authority.
