# Unattested governance candidate

## Retained semantic content witness — current review freeze

The PR #135 P2 correction carries D7.2c byte adjudication through activation
freshness. The frozen inventory selects the three retained knowledge paths;
the manifest's existing common source S witnesses their adjudicated bytes.
The reviewed correction is the semantic adjudication event, not S. No reviewer,
review time, policy, lifecycle or knowledge-review authority is inferred from S.
`knowledge/catalog.json` remains the independent ADR-0016 review authority.

Exact correction base: `64371d9d97d5d62c749025f8d31e2c70b9bdc94d`.
New five-artifact planning checkpoint: `2beff9ce5ede1f5433a24af78376341654e330c0`.
It supersedes `24cd5bc0a901ecf0cdac7273b253cbaa03c348d7` for the five preparation
bindings. Preserve both in ancestry: **merge commit only**, no squash/rebase.

| Member | Prior PR #135 SHA-256 | Refreshed SHA-256 |
| --- | --- | --- |
| `state.json` | `d39b932ec88763963536a4ec9137da4ff71a68e561b42c642ad7c1ad2a13d076` | `d39b932ec88763963536a4ec9137da4ff71a68e561b42c642ad7c1ad2a13d076` |
| `consumers.json` | `465de5f1b40ff54998f53049f8b13b8d89f322bdd2c774a914918d2e833a7014` | `465de5f1b40ff54998f53049f8b13b8d89f322bdd2c774a914918d2e833a7014` |
| `source-manifest.json` | `ce652efe7c12d7a2fc83e2b4469cbdef89da63db3b51a14a73ceda8146004342` | `83f6fa867fb26b6ba5279eebba3c7c95160d7da22dde3847ce33305e024be536` |

Bundle changes from
`b19744d28acc7943726fe48882c8e53da18fa3c4a865341f7adb6214d88667ee` to
`9493c85c44e67baa94f55b258888a7990c06782c4e1ebe2b5b01f0e7700d5627`.
Exactly five preparation rows change; no other manifest field changes. State,
inventory and empty genesis attestations remain byte-identical. Primitive
`9ee9dd25177a81af89f199ba3b7b368488763361e7ad0d6227b7d57783d35bf9` and relationship
`80089e507b92330f04971aced8f1abc2ce1fd0e4be62cb19a6a2c3a86ac5464d` remain unchanged.
S remains `c82fda72927464d813ec769aee53f4079ebe3b20`; archive-stage M remains
`83e6cd8fa7d2d05ab246a39de039129b4056966d`. Counts remain 72 pointer, 10 retained,
2 generated, 66 historical, 32 non-consumer: 182 total and an exact 87-path seam.

Git-object comparison proves S:path equals the reviewed bytes for all three:

| Path under `knowledge/platform/` | SHA-256 at S and reviewed head `10a83a7` |
| --- | --- |
| `governance/decisions.md` | `1c56fdffe802c701a558d328cc4cbab0308516759a2dca908b6e7fea99a8191e` |
| `governance/precedence.md` | `e9196782a14c77c69fcec378e11f9e0bb5b9dea6b073b838ba4896b667d29b4e` |
| `worker-conventions/placement.md` | `6ea4436479b5c58e5a5d62e80d4f48a23446cacb5240246be644602bb72e4c47` |

These are observed receipt values, not another production pin authority.
The shared path/explanation definition lives in
[`consumers.mjs`](../../../../scripts/governance/model/consumers.mjs).
Extraction compares inventory-source bytes with S before retention. Both
freshness invocations include derived S/base path hashes in the existing local
evidence comparison and final digest. A same-fact-class byte change cannot
inherit retention or return equivalent freshness. Knowledge admission separately
retains its existing `attestation.digest.binding` refusal.

Reproduce the three candidate members through the existing read-only extractor:

```sh
node scripts/governance/genesis/extract.mjs --root . \
  --source c82fda72927464d813ec769aee53f4079ebe3b20 \
  --inventory-source WORKTREE \
  --planning-source 2beff9ce5ede1f5433a24af78376341654e330c0
```

PR metadata records exact-head freshness and validation as correction-review
evidence only, not a future PR #131 activation-base selection. PR #131 and its
diagnostic worktree remain paused and untouched. No activation or attestation is
performed. Promotion determination: this is the existing D7.2c implementation
contract's content witness, not a new ADR or portable-knowledge authority.

## Retained semantic knowledge — superseded initial review freeze

The owner-authorized [D7.2c correction](../../../../openspec/changes/governance-state-substrate/design.md#d7-consumer-inventory-projections-and-migration)
retains three exact-byte-reviewed knowledge sources rather than rewriting them
during PR-3. The semantic adjudication is recorded in D7.2c; these files explain
decision governance, precedence and placement conventions without independently
asserting mutable governance state. Source bytes and `knowledge/catalog.json`
are unchanged. They remain subordinate to canonical state/query after activation.

Exact correction base: `64371d9d97d5d62c749025f8d31e2c70b9bdc94d`.
Five-artifact planning checkpoint: `24cd5bc0a901ecf0cdac7273b253cbaa03c348d7`.
Preserve that checkpoint with **merge commit only**, not squash or rebase-merge.

| Member | Prior PR #134 SHA-256 | Refreshed SHA-256 |
| --- | --- | --- |
| `state.json` | `d39b932ec88763963536a4ec9137da4ff71a68e561b42c642ad7c1ad2a13d076` | `d39b932ec88763963536a4ec9137da4ff71a68e561b42c642ad7c1ad2a13d076` |
| `source-manifest.json` | `fc031fce6fa534128c622c57f70af6cad9bae31c04cd635cd2c8d9ece606647d` | `ce652efe7c12d7a2fc83e2b4469cbdef89da63db3b51a14a73ceda8146004342` |
| `consumers.json` | `77b3cd02991ff45693f32488afadfae64a2f6c5b979660142b96dce5bb5a4bcd` | `465de5f1b40ff54998f53049f8b13b8d89f322bdd2c774a914918d2e833a7014` |

Bundle SHA-256 changes from
`cdcda07102d75e361317428c0777635e599486504c611b9eaf33c4a5431f3a4c` to
`b19744d28acc7943726fe48882c8e53da18fa3c4a865341f7adb6214d88667ee`.
Only the three reviewed dispositions/reasons and the five preparation bindings
change. Every other inventory field and manifest value is preserved. The state
is byte-identical, including `attestations.genesis = {}`. Primitive digest
`9ee9dd25177a81af89f199ba3b7b368488763361e7ad0d6227b7d57783d35bf9` and relationship
digest `80089e507b92330f04971aced8f1abc2ce1fd0e4be62cb19a6a2c3a86ac5464d` are unchanged.
Common source S remains `c82fda72927464d813ec769aee53f4079ebe3b20`; L4/L5/L7
archive-stage M remains `83e6cd8fa7d2d05ab246a39de039129b4056966d` at its exact roots.

The real inventory/task regression derives 72 pointer paths and an 87-path
activation union. Retained semantic rows become 10; generated regions remain 2,
historical records 66 and non-consumers 32 (182 total). No other disposition
changes. Existing PR-101 protections remain in force.

Replay with the existing extraction mechanism:

```sh
node scripts/governance/genesis/extract.mjs --root . \
  --source c82fda72927464d813ec769aee53f4079ebe3b20 \
  --inventory-source WORKTREE \
  --planning-source 24cd5bc0a901ecf0cdac7273b253cbaa03c348d7
```

The extraction recipe refuses changed adjudicated knowledge bytes. Tests pin
the semantic review's source identities and unchanged catalog reviews, exercise
production admission and independently mutate each source to prove refusal.
This is not a general text-scanning proof or a new knowledge attestation.
The correction PR records exact head/tree, freshness comparison identities and
validation externally. Freshness against its head is review evidence only,
not PR #131's later activation-base selection. No canonical state, activation,
owner envelope or changes to PR #131, its diagnostic worktree, PR #101 or the
issue #19 handoff are part of this correction.

Promotion determination: existing ADR-0016/ADR-0021 contracts own the distinction;
no new architectural decision or portable-knowledge authority is needed.

## Historical projection preparation — superseded review freeze

The owner-authorized [D7.3a correction](../../../../openspec/changes/governance-state-substrate/design.md#d7-consumer-inventory-projections-and-migration)
binds pre-attestation rendering to the complete candidate/freshness proof. This
receipt refreshes planning provenance only. Preparation checkpoint:
`4fca30700dc590f844b1fb866b2459110911a233`. Preserve it by **merge commit only**;
do not squash or rebase-merge the correction.

| Member | Prior PR #133 SHA-256 | Current SHA-256 |
| --- | --- | --- |
| `state.json` | `d39b932ec88763963536a4ec9137da4ff71a68e561b42c642ad7c1ad2a13d076` | `d39b932ec88763963536a4ec9137da4ff71a68e561b42c642ad7c1ad2a13d076` |
| `source-manifest.json` | `cac428acaa5ec18fa4c9246fe5a8abd3bda5cae0f69310239af107e971bf573b` | `fc031fce6fa534128c622c57f70af6cad9bae31c04cd635cd2c8d9ece606647d` |
| `consumers.json` | `77b3cd02991ff45693f32488afadfae64a2f6c5b979660142b96dce5bb5a4bcd` | `77b3cd02991ff45693f32488afadfae64a2f6c5b979660142b96dce5bb5a4bcd` |

Bundle SHA-256 changes from
`1b9f2117826ab50ed94f3ebaf14838e8941f984b159b413e326bbb4ea8482738` to
`cdcda07102d75e361317428c0777635e599486504c611b9eaf33c4a5431f3a4c`.
Exactly five preparation rows change revision/blob/content identities and their
canonical order. All other manifest content is identical. State and inventory
remain byte-identical, including the empty genesis placeholder. Primitive and
relationship digests remain those recorded below, as do common S and archive M.
The 182-row inventory, 75-pointer scope and 90-path activation seam are unchanged.

Reproduce with the existing read-only extractor:

```sh
node scripts/governance/genesis/extract.mjs --root . \
  --source c82fda72927464d813ec769aee53f4079ebe3b20 \
  --inventory-source WORKTREE \
  --planning-source 4fca30700dc590f844b1fb866b2459110911a233
```

The correction PR records validation, parity, exact head/tree and independent
review externally. No canonical registry, owner envelope or activation output
is created here. PR #131 and its handoff remain untouched and paused. This
freeze does not select a later activation base or authorize its ceremony.
Promotion determination: the existing implementation contract owns this
sequencing correction; no new architecture or knowledge authority is introduced.

## Historical consumer / seam reconciliation — superseded freeze

The owner-authorized [D7.2b reconciliation](../../../../openspec/changes/governance-state-substrate/design.md#d7-consumer-inventory-projections-and-migration)
changes four exact inventory dispositions and the matching execution scope,
not governance facts. Planning preparation checkpoint:
`bb39f34b1036af0c912375f31f6673f8cbe99d0b`. It must remain reachable after a **merge commit**;
do not squash or rebase-merge this correction.

The four `runner-adapter-conformance-seed` rows are retained source-era
semantic prose, not historical exemptions or live authority. Their file bytes
are untouched. All other row fields/dispositions remain unchanged. The checked
inventory has 75 pointer rows, 7 retained semantic rows, 2 generated regions,
66 historical records and 32 non-consumers (182 total). Task 8.4 equals exactly
the pointer rows; the concrete activation union is 90 paths. The runner-core
README is absent from both task 8.4 and the inventory. The permanent regression
reads the real inventory and task metadata, not this receipt as authority.

| Member | Previous D7.6 SHA-256 | Current SHA-256 |
| --- | --- | --- |
| `state.json` | `d39b932ec88763963536a4ec9137da4ff71a68e561b42c642ad7c1ad2a13d076` | `d39b932ec88763963536a4ec9137da4ff71a68e561b42c642ad7c1ad2a13d076` |
| `source-manifest.json` | `9108e4460fbbfa1fb49e636c52666d2e14f17cbbab1b47553d12ea085eba87a8` | `cac428acaa5ec18fa4c9246fe5a8abd3bda5cae0f69310239af107e971bf573b` |
| `consumers.json` | `a827e5e4ab941c66a801cac16ce29ca76e5a75cbcafd24c253ca236741ecde20` | `77b3cd02991ff45693f32488afadfae64a2f6c5b979660142b96dce5bb5a4bcd` |

Bundle changes from
`4ba911796fc037a36ce26c6285cc149f085e5f41459126ab2b6d0c1e20b57c38` to
`1b9f2117826ab50ed94f3ebaf14838e8941f984b159b413e326bbb4ea8482738`.
The full state remains byte-identical. Primitive digest remains
`9ee9dd25177a81af89f199ba3b7b368488763361e7ad0d6227b7d57783d35bf9`;
relationship digest remains
`80089e507b92330f04971aced8f1abc2ce1fd0e4be62cb19a6a2c3a86ac5464d`.
Common S and archive-stage M below are unchanged. The only manifest changes
are the five preparation bindings; no source identity or historical record is
rebound. The empty `attestations.genesis` remains empty; no activation handoff
or owner envelope is added.

Replay using the existing extraction machinery and the exact checkpoint:

```sh
node scripts/governance/genesis/extract.mjs --root . \
  --source c82fda72927464d813ec769aee53f4079ebe3b20 \
  --inventory-source WORKTREE \
  --planning-source bb39f34b1036af0c912375f31f6673f8cbe99d0b
```

The correction PR records exact head/tree, scope lists, old/new hashes and
validation externally. This freeze grants no activation authority and does not
change PR #131, PR #101 or the external owner handoff. Independent review and
merge are still required before a fresh PR #131 activation-base check.

Promotion determination: existing ADR-0021/D7/D8 completeness and scope
obligations are reconciled, with no new architecture, primitive or authority.
The historical receipts below are retained provenance, not the current freeze.

## Historical D7.6 receipt — superseded freeze, retained provenance

The owner-authorized [D7.6 carrier correction](../../../../openspec/changes/governance-state-substrate/design.md#d7-consumer-inventory-projections-and-migration)
requires new planning provenance, not new governance facts. The preparation
checkpoint is `4fa2c6b19516eeda18ee7fac9decdf81451c3630`. The existing extractor
re-audits common source S and mechanically reproduces state and consumers
byte-for-byte; only the source manifest's preparation bindings change.

| Member | Previous PR-2 SHA-256 | Current SHA-256 |
| --- | --- | --- |
| `state.json` | `d39b932ec88763963536a4ec9137da4ff71a68e561b42c642ad7c1ad2a13d076` | `d39b932ec88763963536a4ec9137da4ff71a68e561b42c642ad7c1ad2a13d076` |
| `source-manifest.json` | `2055e83e8868dd03ac841dc15988020c34d6b64126c6c6c0c7eda04a9c26dac0` | `9108e4460fbbfa1fb49e636c52666d2e14f17cbbab1b47553d12ea085eba87a8` |
| `consumers.json` | `a827e5e4ab941c66a801cac16ce29ca76e5a75cbcafd24c253ca236741ecde20` | `a827e5e4ab941c66a801cac16ce29ca76e5a75cbcafd24c253ca236741ecde20` |

Bundle SHA-256 changes from
`63612330004b76b8033ac2970f999fe47a4212c3f7848dff2966ef5d4b6b7419` to
`4ba911796fc037a36ce26c6285cc149f085e5f41459126ab2b6d0c1e20b57c38`.
Primitive digest remains
`9ee9dd25177a81af89f199ba3b7b368488763361e7ad0d6227b7d57783d35bf9`;
relationship digest remains
`80089e507b92330f04971aced8f1abc2ce1fd0e4be62cb19a6a2c3a86ac5464d`.
S and archive-stage M below are unchanged. The candidate remains unattested:
`attestations.genesis = {}`. It contains no `externalIndexHandoff`; that field
belongs only to the later owner-authored populated genesis envelope. This
correction does not resume activation PR #131 or perform its owner ceremony.

Replay with the existing read-only machinery:

```sh
node scripts/governance/genesis/extract.mjs --root . \
  --source c82fda72927464d813ec769aee53f4079ebe3b20 \
  --inventory-source WORKTREE \
  --planning-source 4fa2c6b19516eeda18ee7fac9decdf81451c3630
```

The correction PR records its exact containing head, proof and independent
review disposition externally. This receipt does not authenticate a human or
authorize activation. Promotion determination: a missing implementation carrier
for existing Accepted ADR-0021/D7.6 is corrected; no new architecture or portable
knowledge contract is introduced.

## Historical PR-2 receipt — superseded freeze, retained provenance

The record below describes the earlier PR-2 review stage. Its pending-review
statements and bundle identity are historical; the current freeze is above.

Review material only. The common genesis source is exact post-bridge **S**:
`c82fda72927464d813ec769aee53f4079ebe3b20`. L4/L5/L7 retain archive-stage **M**:
`83e6cd8fa7d2d05ab246a39de039129b4056966d` at their original archive roots.
This directory is not canonical governance authority.

The [complete temporal audit](../genesis/acceptance-audit.json) observes 23
Accepted ADRs, 23 exact transition objects, zero Rejected ADRs and zero missing
transitions. Twenty-two encoded committer UTC dates match the governed decision
dates. ADR-0022's decision date is `2026-09-01`; its exact transition
`4334a7b040b14911b7b0894aeb14717b0418ee84` encodes committer timestamp
`2026-09-02T08:03:21Z`. Accepted ADR-0023 permits this honest date-precision
representation. No timestamp was invented and no historical decision was edited.
The Git value proves neither actual recording time nor human identity.

ADR-0015 retains decision date `2026-08-15` and original transition
`a5cc2a739bd9602e30376400a46ebf7b5bab10f1`, whose encoded committer timestamp is
`2026-08-15T16:55:25Z`. U7 still resolves on August 15, not its later main delivery.
ADR-0023/ADR-0024 bind the original atomic pair commit
`fc7d44ff48de015afd14faa7836fe11c58c457aa`. Their immutable bridge receipt and
original pre-transition human envelopes remain historical evidence; the bridge
is expired and grants no future manual acceptance. ADR-0022's post-ADR-0021
manual-process inconsistency remains explicitly disclosed, never precedent.

The three freeze members are `state.json`, `source-manifest.json`, and
`consumers.json`. They are regenerated only after the full S audit and isolated
temporal proof. Their new byte identities replace, rather than reinterpret,
the old provisional hashes. Final identities and validation results are recorded
in draft PR #124; independent review is still required.

The final review bundle below supersedes the intermediate freeze at
`70f609576f3b5f92c58e4fb7d795423bede5af77`. Its complete five-file planning
preparation checkpoint is `d2763e66253599b35a3d1bf4c8d71252d54845d7`;
this binds implementation/status bytes without replacing source S or archive M.
The final containing head is recorded externally in PR #124, not inside its
own preimage. Later proof/status commits must preserve these members or
explicitly refresh every affected binding:

| Member | SHA-256 |
| --- | --- |
| `state.json` | `d39b932ec88763963536a4ec9137da4ff71a68e561b42c642ad7c1ad2a13d076` |
| `source-manifest.json` | `2055e83e8868dd03ac841dc15988020c34d6b64126c6c6c0c7eda04a9c26dac0` |
| `consumers.json` | `a827e5e4ab941c66a801cac16ce29ca76e5a75cbcafd24c253ca236741ecde20` |

The closed three-member bundle SHA-256 is
`63612330004b76b8033ac2970f999fe47a4212c3f7848dff2966ef5d4b6b7419`.
Re-extraction at exact S and the explicit preparation checkpoint reproduces
all three members byte-for-byte, including after a later proof commit:

```sh
node scripts/governance/genesis/extract.mjs --root . \
  --source c82fda72927464d813ec769aee53f4079ebe3b20 \
  --inventory-source WORKTREE \
  --planning-source d2763e66253599b35a3d1bf4c8d71252d54845d7
```

This prints JSON and writes nothing. It is a content freeze for review, not
independent approval or an owner attestation. The complete governance state/audit
suite passed 433 tests from zero before this final refresh; exact-final-head
aggregate and hosted CI evidence is recorded in PR #124. T.7 independent review
remains a separate, unperformed act.

The state deliberately has `attestations: {genesis: {}}` and no human completion
envelope. **Full state validation must refuse this raw candidate.** Production
entry points are proven with [isolated test envelopes](../genesis/README.md),
which are never owner attestation. No canonical `governance/state.json` is
created and no projection is activated here. The real owner ceremony and final
activation-base equality gate remain separately authorized PR-3 work.

## Reconciliation receipt

The frozen remote PR-2 head was
`dcd32f073c4ca6f8da6efd7e38e0f1b327f70e8e`. Its original conflict-free ordinary
merge of M produced `bffc11c6c1f93b57ada459b04cfcbdad1301ef19`; delivered 4.x/5.x
implementation bytes survived unchanged. The 219-test original suite passed
before and after that earlier reconciliation.

Before this resumption, the complete tracked provisional diff matched
`9d27321e18a12bf9707eecc0ece739a8024362eb217018d5bd6aded61e432d94` and all three
owner-supplied provisional file hashes matched. Checkpoint
`48a62642f90673d1efd284b66e791e477e81b500` preserved those bytes without claiming
they were valid or frozen. Ordinary merge commit
`20c10d12c012c1f0ac34e7b16b1c05b374a4ef91` then reconciled exact S, with the
checkpoint and S as parents, without conflicts or implementation-byte changes.
No rebase, restart, discarded provisional work or force-push was used.

Promotion determination: this implements accepted ADR-0021 as partially refined
by ADR-0023 and the consumed ADR-0024 bridge, through the merged planning
contract. It establishes no new architecture or portable-knowledge authority.
The documentation updates distinguish source S, archive M, candidate proof and
the still-unperformed owner activation ceremony.
