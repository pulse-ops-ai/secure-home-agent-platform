# Assurance Plan: runner-early-terminal-record

## Purpose

This artifact defines how the accepted specification and design will be
proven before the change is considered complete. It does not create new
product requirements.

Identifier convention: inherited identifiers keep their canonical names;
identifiers minted by this change are prefixed `ET-`.

---

## Risk Classification

**Risk:** `trust-critical`

### Rationale

- The record is refusal EVIDENCE for the earliest failure class; a shape
  defect here either loses the refusal trail or — worse — opens the
  fabricated-authority path D11 prohibited.
- The change exercises the append-only identity ledger again (one row).

## Critical Invariants

### Inherited (re-proven over the enlarged corpus)

| ID | What this change must keep true |
|---|---|
| C-INV-01 | strict posture everywhere, surviving generation |
| C-INV-02 | provider/framework/runtime names never structural |
| C-INV-06 | no designated credential-value slot anywhere |
| C-INV-07 | generation deterministic; drift detected |
| C-INV-09 | one schema identity, one byte set; `$id` embeds exact version |
| C-INV-10 (ledger) | accepted rows never change or disappear; this change appends exactly one |

### Minted by this change

| ID | Invariant | Class |
|---|---|---|
| ET-INV-01 | The record cannot carry authority identities, grants, gate results, change sets, or artifacts — the fields do not exist, and strict posture refuses smuggled ones | trust |
| ET-INV-02 | `requested_profile` distinguishes an explicit null (nothing requested) from a stated reference; neither carries a digest | trust |
| ET-INV-03 | The record's outcome union is composed from `run-record.ts`'s existing terminal options — no second terminal vocabulary exists | trust |
| ET-INV-05 | The requesting principal is mandatory: a record cannot omit who was refused, and it is never the profile-derived agent principal | trust |
| ET-INV-06 | The success terminal state is ABSENT from the record's outcome union — an authority-less record cannot claim success | trust |
| ET-INV-04 | The superseded corpus is untouched: every existing artifact regenerates byte-identically and every existing ledger row is unchanged | compatibility |

## Proof Obligations

| ID | Proves | Proof class | Evidence |
|---|---|---|---|
| ET-EX-01 | ET-INV-01 | deterministic example | fixtures: a record smuggling `identities`, `granted_capabilities`, `gate_results`, `change_sets`, or `artifacts` fails strict validation; a minimal valid record validates |
| ET-EX-02 | ET-INV-02 | deterministic example | null-requested and stated-reference fixtures both validate; a digest-bearing reference refuses |
| ET-EX-03 | ET-INV-03 | architecture guard | instance-identity check: `.shape.timing === EvidenceTiming`, `.shape.requester === Principal`, `.shape.requested_profile` derives from the contracts `ProfileRef` instance, and the outcome union's options are the same instances `RunOutcome` composes |
| ET-EX-04 | ET-INV-04 | deterministic example | corpus set-equality over 11 identities; drift suite proves every prior artifact byte-identical |
| ET-EX-05 | ET-INV-05 | deterministic example | a record omitting `requester` refuses; actor and autonomous variants both validate; the refusal names who was refused without any authority present |
| ET-EX-06 | ET-INV-06 | deterministic example | an outcome claiming the success state refuses; all five non-success states validate and every one maps to failure under `TERMINAL_SUCCESS` |
| ET-ADV-01 | C-INV-10 | adversarial | the git-seam guard: this append passes; any rewrite alongside it fails (existing fixture family covers the shape) |
| ET-ADV-02 | ET-INV-06 | adversarial | a record claiming success refuses at the contract, not by convention — the option is absent from the union (design D1b) |
| ET-ADV-03 | ET-INV-04 | adversarial | the D1b refactor is byte-neutral: `run-record@1.0.0`, `evidence-bundle@2.0.0`, and `run-event@1.0.0` regenerate byte-identically, proven by the existing drift suite |
| ET-MUT-01 | ET-INV-01 | mutation | loosening the record to passthrough or adding an authority field is killed by ET-EX-01 |
| ET-MUT-02 | ET-INV-06 | mutation | reusing the full `RunOutcome` (readmitting success) is killed by ET-EX-06 / ET-ADV-02 |
| ET-MUT-03 | ET-INV-05 | mutation | making `requester` optional is killed by ET-EX-05 |

## Authority Chain (delta)

| Object | Authoritative source | Digest / identity | Change |
|---|---|---|---|
| Early-termination record | L4 lifecycle at a `REQUESTED` terminal | contract validation; no authority digests BY DESIGN | new — the refusal-evidence terminus for pre-authority runs |
| Requesting principal | the run request itself | recorded verbatim; carries no digest and grants nothing | new field — states WHO was refused; never the profile-derived agent principal, which does not exist for these runs |
| Identity ledger | authored, append-only | per-identity digests | one appended row; the historical guard proves no rewrite |

## Before × After Transition Analysis

| # | Before | After | Required behavior | Proof |
|---|---|---|---|---|
| 1 | corpus of 10 identities | 11 | set-equality holds; every prior artifact byte-identical; one ledger append | ET-EX-04, ET-ADV-01 |
| 2 | no early-terminal representation | record exists | minimal fields validate; authority fields unrepresentable | ET-EX-01/02 |
| 3 | shared vocabularies authored once | record consumes them | requester/timing/reference and the outcome options are the existing instances | ET-EX-03 |
| 4 | success representable in the shared union | record's union | the success option is absent; a success claim refuses | ET-EX-06, ET-ADV-02, ET-MUT-02 |
| 5 | requester known at request time | record written | the requester is mandatory and present, with actor or autonomous marker | ET-EX-05, ET-MUT-03 |
| 6 | terminal options inline in `run-record.ts` | options named and shared | every existing artifact regenerates byte-identically | ET-ADV-03 |

## Traceability Plan

| Requirement / invariant | Proving task | Proof |
|---|---|---|
| Early-termination record (ADDED, `runner-evidence`) | 1.1 | ET-EX-01/02/03/05/06, ET-ADV-02, ET-MUT-01/02/03 |
| Byte-neutral option extraction (D1b) | 1.1 | ET-ADV-03 |
| Corpus and ledger discipline | 1.2 | ET-EX-04, ET-ADV-01 |
| Exclusivity with `run-record` (behavioral half) | **L4** (#27) | lifecycle fixtures there — **deferred, named** |

## Review Plan

Per the standing model. EQ1 and EQ2 are **already closed** by the owner
(2026-08-11); the closing planning review must close **EQ3** (the
requesting principal) and **EQ4** (narrowing the outcome union), and the
owner must explicitly authorize **minting a new contract identity** under
#51 — task 0.1 flips on those, plus a successful
`openspec validate runner-early-terminal-record --strict` on the reviewed
head. The L2 conformance nets re-run wholesale in the merge gate;
complete-seam and falsification reviews at the frozen head before merge.

## Rollout and Rollback

`not_applicable`: the contract is inert until L4 writes it. Rollback
before merge is branch deletion; after merge, a further append.

## Assurance Completeness

**Unresolved state-model questions:** none. EQ1 (minimal enumeration) and
EQ2 (events placement) were closed by the owner on 2026-08-11 without
changing the proof net; EQ3 and EQ4 are answered with positions taken and
fully proven above, so either confirmation leaves the net coherent —
directing omission of the requester would drop ET-EX-05/ET-MUT-03, and
directing the full `RunOutcome` would drop ET-EX-06/ET-ADV-02/ET-MUT-02
and reinstate the behavioral-only prohibition at L4. **Requirements
lacking proof:** none. **Deferred, named:** the exclusivity behavior and
every writer/reader obligation (L4/#27 and later). **Design assumptions
requiring human confirmation:** EQ3 (mandatory requester), EQ4 (narrowed
outcome union), and the owner's explicit authorization to mint a new
contract identity under #51.
