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
| ET-INV-03 | The record's outcome is the shared `RunOutcome` instance — no second terminal vocabulary exists | trust |
| ET-INV-04 | The superseded corpus is untouched: every existing artifact regenerates byte-identically and every existing ledger row is unchanged | compatibility |

## Proof Obligations

| ID | Proves | Proof class | Evidence |
|---|---|---|---|
| ET-EX-01 | ET-INV-01 | deterministic example | fixtures: a record smuggling `identities`, `granted_capabilities`, `gate_results`, `change_sets`, or `artifacts` fails strict validation; a minimal valid record validates |
| ET-EX-02 | ET-INV-02 | deterministic example | null-requested and stated-reference fixtures both validate; a digest-bearing reference refuses |
| ET-EX-03 | ET-INV-03 | architecture guard | instance-identity check: `EarlyTerminationRecord.shape.outcome === RunOutcome`, `.shape.timing === EvidenceTiming`, `.shape.requested_profile` derives from the contracts `ProfileRef` instance |
| ET-EX-04 | ET-INV-04 | deterministic example | corpus set-equality over 11 identities; drift suite proves every prior artifact byte-identical |
| ET-ADV-01 | C-INV-10 | adversarial | the git-seam guard: this append passes; any rewrite alongside it fails (existing fixture family covers the shape) |
| ET-ADV-02 | ET-INV-03 | adversarial | a record whose outcome is `COMPLETED` validates the SHAPE (the union admits it) but the requirement's L4 half forbids assigning it — recorded here as a behavioral obligation on L4's lifecycle, not a shape claim, so no overclaim occurs |
| ET-MUT-01 | ET-INV-01 | mutation | loosening the record to passthrough or adding an authority field is killed by ET-EX-01 |

## Authority Chain (delta)

| Object | Authoritative source | Digest / identity | Change |
|---|---|---|---|
| Early-termination record | L4 lifecycle at a `REQUESTED` terminal | contract validation; no authority digests BY DESIGN | new — the refusal-evidence terminus for pre-authority runs |
| Identity ledger | authored, append-only | per-identity digests | one appended row; the historical guard proves no rewrite |

## Before × After Transition Analysis

| # | Before | After | Required behavior | Proof |
|---|---|---|---|---|
| 1 | corpus of 10 identities | 11 | set-equality holds; every prior artifact byte-identical; one ledger append | ET-EX-04, ET-ADV-01 |
| 2 | no early-terminal representation | record exists | minimal fields validate; authority fields unrepresentable | ET-EX-01/02 |
| 3 | shared vocabularies authored once | record consumes them | outcome/timing/reference are the existing instances | ET-EX-03 |

## Traceability Plan

| Requirement / invariant | Proving task | Proof |
|---|---|---|
| Early-termination record (ADDED, `runner-evidence`) | 1.1 | ET-EX-01/02/03, ET-MUT-01 |
| Corpus and ledger discipline | 1.2 | ET-EX-04, ET-ADV-01 |
| Exclusivity with `run-record` (behavioral half) | **L4** (#27) | lifecycle fixtures there — **deferred, named** |

## Review Plan

Per the standing model: planning review closing EQ1/EQ2 before task 0.1
flips; the L2 conformance nets re-run wholesale in the merge gate;
complete-seam and falsification reviews at the frozen head before merge.

## Rollout and Rollback

`not_applicable`: the contract is inert until L4 writes it. Rollback
before merge is branch deletion; after merge, a further append.

## Assurance Completeness

**Unresolved state-model questions:** none beyond EQ1/EQ2, which gate 0.1.
**Requirements lacking proof:** none. **Deferred, named:** the exclusivity
behavior and every writer/reader obligation (L4/#27 and later).
**Design assumptions requiring human confirmation:** EQ1 (minimal
enumeration), EQ2 (events placement).
