# Unattested governance candidate

## D7.6 correction — current review freeze

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
