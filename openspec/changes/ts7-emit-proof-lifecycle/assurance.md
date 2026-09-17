# Assurance: TS7 emit proof lifecycle

## Risk classification

High: an unconditional repository gate changes subject. Incorrect lifecycle
handling could erase migration evidence or appear to authorize compiler updates.
The trusted maintenance boundary itself is unchanged.

## Invariants

| ID | Property | Kind |
|---|---|---|
| INV-EL-01 | Raw baseline and both projections retain exact bytes, seals, and TS6 capture binding | integrity |
| INV-EL-02 | Ordinary source edits do not require changing historical evidence | behavior |
| INV-EL-03 | Replay accepts only the bound historical source/compiler and keeps all existing differential semantics | compatibility |
| INV-EL-04 | Historical success cannot substitute for predecessor-bound compiler maintenance | trust |
| INV-EL-05 | Only the false-freeze invocation changes; protected PRs/paths and unrelated gates remain untouched | governance |

## State-space model and decision tables

| State | Evidence | Outcome | Failure class |
|---|---|---|---|
| Current source edited, historical bytes intact | exact blobs/seals/history | integrity passes; ordinary source gates apply | none |
| Artifact altered, including recomputed seal | differs from pinned blob | refuse | change |
| History missing | cannot prove capture | refuse | operational |
| Exact clean cutover checkout, exact compiler | bound source and original evidence | replay unchanged differential | none |
| Wrong/dirty checkout or compiler | historical subject does not match | refuse before build | change |
| Future compiler plus protected drift/self-verifier | predecessor policy | maintenance refused regardless of historical integrity | change |

## Cross-requirement interactions

`REQ-TC-002` continues to own surface comparisons; `REQ-TC-006` owns their
lifecycle. `REQ-SC-006/007` remains the independent maintenance obligation.
Authenticity without source equality is sufficient only for integrity checking;
replay additionally requires historical subject equality. A self-consistent seal
alone is insufficient authenticity evidence.

## Proof obligations and traceability

| Proof | Invariants | Required execution |
|---|---|---|
| EX-EL-01 | 01,03 | verify all three unchanged artifacts and replay the recorded TS7 cutover |
| ADV-EL-01 | 01,02,03 | change an ordinary emitted source in a disposable fixture, prove emitted JS changes and integrity still passes without any TS6 rewrite; replay refuses that subject |
| MUT-EL-01 | 01 | corrupt/delete/reseal each artifact; all refused |
| ADV-EL-02 | 03 | missing history, dirty historical source, wrong compiler, wrong revision; all refused |
| MUT-EL-02 | 04 | future compiler bump plus protected drift/candidate bypass is refused by the predecessor classifier; existing boundary hostile suite stays green |
| PROP-EL-01 | 05 | actual workflow/aggregate wiring preserves unrelated steps; exact diff excludes protected paths and evidence |
| EX-TS-002 / MUT-TS-EMIT-* | 03 | existing differential, declaration, map, and provenance corpus remains green |

## Property tests

Artifact mutation cases range over all three identities and unsealed/resealed
changes. Invocation checks inspect the real workflow and aggregate script.

## Hostile corpus and mutation targets

Drive altered evidence rather than testing only the happy-path checksum. Drive a
real emitted source change, and keep comparator defect mutations intact. Remove
or bypass replay revision/cleanliness/compiler guards only in disposable tests;
their corresponding refusal assertions must detect the bypass. Exercise the
existing two-revision classifier on a real candidate diff.

## Landing plan

One atomic correction PR: tooling, invocations, hostile proof, and documentation.
No alternate compiler-update authority; no historical artifact migration.

## Review plan

Stop at a draft PR for independent review of lifecycle versus semantics,
historical authenticity/replay, maintenance separation, and exact scope diff.
Author validation is not independent acceptance. Do not merge or mark ready.

## Rollout and rollback

Merge would activate the corrected ordinary gate. No deployment is involved.
A reviewed revert restores previous invocation behavior without touching evidence.

## Assurance completeness

No unresolved design question or implementation prerequisite depends on U1–U11.
All current-scope proofs ship in this PR. Independent review and any later
validated canonical spec sync/archive remain pending; they are not self-certified.

## Related

- [Design](design.md)
- [Tasks](tasks.md)
- [Executed verification](verification.md)
