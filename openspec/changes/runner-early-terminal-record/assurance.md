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
| ET-INV-05 | The requesting principal is **mandatory** — a record cannot omit who was refused — and its shape admits no authority: no digest, no grant, no capability field | trust |
| ET-INV-06 | The success terminal state is ABSENT from the record's outcome union — an authority-less record cannot claim success | trust |
| ET-INV-04 | The superseded corpus is untouched: every existing artifact regenerates byte-identically and every existing ledger row is unchanged | compatibility |

## State-Space Model

Independent dimensions that materially affect this contract:

| Dimension | Values |
|---|---|
| `requested_profile` | explicit null (nothing named) / stated `ProfileRef` |
| `requester.acting` | actor / autonomous |
| Terminal outcome | `REFUSED` / `OPERATIONAL_FAILURE` / `CANCELLED` / `TIMED_OUT` / `INDETERMINATE`; the success state is **absent from the union** |
| Extra keys presented | none / an authority-bearing name (`identities`, `granted_capabilities`, `gate_results`, `change_sets`, `artifacts`) / any other unknown key |
| Corpus position | the new identity alone / alongside the ten existing artifacts |

Not a Cartesian product. The interactions that require proof:

- **requester × authority absence** — the requester is identity-shaped
  yet must never read as authority: it carries no digest, no grant, and
  no profile-derived agent identity.
- **narrowed union × shared vocabulary** — narrowing must not fork
  `TerminalState`/`TERMINAL_SUCCESS` or produce a second terminal
  vocabulary; every option must remain an instance the full union also
  composes.
- **option extraction × existing artifacts** — naming `run-record.ts`'s
  options must leave `run-record@1.0.0`, `evidence-bundle@2.0.0`, and
  `run-event@1.0.0` byte-identical.
- **structural constraint × free-text detail** — the no-authority
  guarantee is a *shape* guarantee; the failure detail's content is not
  scanned, and no proof here claims it is.

## Decision Tables

Validation of a candidate early-termination record:

| `requester` | `requested_profile` | Outcome presented | Extra keys | Result |
|---|---|---|---|---|
| present (actor or autonomous) | null | any non-success state | none | validates |
| present | stated `ProfileRef` | any non-success state | none | validates |
| **absent** | any | any | none | refuses — the requester is mandatory |
| present | reference carrying a digest | any | none | refuses — `ProfileRef` has no digest field |
| present | any | **success state** | none | refuses — the option is absent from the union |
| present | any | any non-success state | **any** | refuses — strict posture |

No row admits a record that lacks a requester, claims success, or carries
an authority-shaped field.

## Cross-Requirement Interactions

Mandatory at this risk class.

| Interaction | Risk | Required proof |
|---|---|---|
| ET-INV-05 × ET-INV-01 | the requester is an identity, and an identity field is exactly what an authority-laundering path would want | ET-EX-05 plus ET-EX-01/ET-PROP-02: the requester carries no digest or grant, and no evidence-only key is admissible beside it. **Provenance — that the value came from the request and not from a profile — is NOT structurally decidable** (`Principal` validates shape, not origin) and is assigned to L4 |
| ET-INV-06 × the shared success mapping | narrowing could fork the terminal vocabulary, producing two disagreeing notions of success | ET-EX-03 (option instances shared) and ET-EX-06 (every admitted option maps to failure under the untouched `TERMINAL_SUCCESS`) |
| ET-INV-06 × ET-INV-04 | the extraction that enables narrowing could silently change existing generated bytes | ET-ADV-03: all three existing artifacts regenerate byte-identically |
| ET-INV-01 × the free-text detail | claiming content guarantees the shape cannot enforce would be an inadmissible overclaim | the requirement is narrowed to structural fields; no proof asserts detail content, and the limitation is recorded in § Assurance Completeness |
| ET-INV-05 × provenance | a caller could pass an agent principal as the requester and no contract could tell — the shapes are identical | **not claimed structurally**, and **not vacuous**: L4's production epoch acquires profile, policy, and registry, so a `REQUESTED` terminal caused by a *later* acquisition fault can occur with the profile already captured — a profile-derived principal may therefore exist at exactly the moment this record is written. The obligation is load-bearing and assigned to L4 (#27); see § Traceability for what L4 must prove |
| ET-INV-02 × D11's prohibition | a "requested" reference could drift toward being read as established authority | ET-EX-02: the reference is data, digest-free, and never populates an identity field |

## Proof Obligations

| ID | Proves | Proof class | Evidence |
|---|---|---|---|
| ET-EX-01 | ET-INV-01 | deterministic example | fixtures: a record smuggling `identities`, `granted_capabilities`, `gate_results`, `change_sets`, or `artifacts` fails strict validation; a minimal valid record validates |
| ET-EX-02 | ET-INV-02 | deterministic example | null-requested and stated-reference fixtures both validate; a digest-bearing reference refuses |
| ET-EX-03 | ET-INV-03 | architecture guard | instance-identity check: `.shape.timing === EvidenceTiming`, `.shape.requester === Principal`, `.shape.requested_profile` derives from the contracts `ProfileRef` instance, and the outcome union's options are the same instances `RunOutcome` composes |
| ET-EX-04 | ET-INV-04 | deterministic example | corpus set-equality over 11 identities; drift suite proves every prior artifact byte-identical |
| ET-EX-05 | ET-INV-05 | deterministic example | a record omitting `requester` refuses; actor and autonomous variants both validate; the requester shape has no digest, grant, or capability field |
| ET-EX-06 | ET-INV-06 | deterministic example | an outcome claiming the success state refuses; all five non-success states validate and every one maps to failure under `TERMINAL_SUCCESS` |
| ET-ADV-01 | C-INV-10 | adversarial | the git-seam guard: this append passes; any rewrite alongside it fails (existing fixture family covers the shape) |
| ET-ADV-02 | ET-INV-06 | adversarial | a record claiming success refuses at the contract, not by convention — the option is absent from the union (design D1b) |
| ET-ADV-03 | ET-INV-04 | adversarial | the D1b refactor is byte-neutral: `run-record@1.0.0`, `evidence-bundle@2.0.0`, and `run-event@1.0.0` regenerate byte-identically, proven by the existing drift suite |
| ET-MUT-01 | ET-INV-01 | mutation | loosening the record to passthrough or adding an authority field is killed by ET-EX-01 |
| ET-MUT-02 | ET-INV-06 | mutation | reusing the full `RunOutcome` (readmitting success) is killed by ET-EX-06 / ET-ADV-02 |
| ET-MUT-03 | ET-INV-05 | mutation | making `requester` optional is killed by ET-EX-05 |

## Property Tests

| ID | Property |
|---|---|
| ET-PROP-01 | For any generated combination of requester marker (actor / autonomous) × requested reference (null / stated) × non-success terminal state, the record validates, and its outcome maps to failure under the shared `TERMINAL_SUCCESS` map |
| ET-PROP-02 | For any key drawn from the **evidence-only** set — `identities`, `principal`, `granted_capabilities`, `operations`, `gate_results`, `artifacts`, `change_sets` — presenting it on an otherwise valid record refuses. The set deliberately excludes the bundle keys this record legitimately shares (`contract_id`, `contract_version`, `outcome`, `timing`). `principal` is included precisely because this record names its identity field `requester`: the evidence bundle's principal has no place here |

## Hostile Corpus

| ID | Case | Expected behavior |
|---|---|---|
| ET-ADV-01 | Ledger rewrite attempted alongside this change's append | the historical guard fails closed, naming the rewritten identity |
| ET-ADV-02 | Record claims the success terminal state | refuses at the contract — the option is absent from the union |
| ET-ADV-03 | The D1b option extraction is applied | every existing artifact regenerates byte-identically; any drift fails naming the file |
| ET-ADV-04 | Record omits `requester` | refuses — a refusal that cannot say who was refused is not admissible evidence |
| ET-ADV-05 | Record carries `identities`, `granted_capabilities`, `gate_results`, `change_sets`, or `artifacts` | refuses — the fields do not exist and strict posture rejects them |
| ET-ADV-06 | `requested_profile` carries a digest, or the requester carries a digest, grant, or capability field | refuses — neither shape has such a field |

## Mutation Targets

| ID | Guard | Killing test |
|---|---|---|
| ET-MUT-01 | The record's strict posture and absent authority fields | ET-EX-01 / ET-ADV-05 / ET-PROP-02 |
| ET-MUT-02 | The narrowed outcome union (readmitting the success option) | ET-EX-06 / ET-ADV-02 |
| ET-MUT-03 | The mandatory requester (making it optional) | ET-EX-05 / ET-ADV-04 |
| ET-MUT-04 | Byte-neutrality of the option extraction (reordering or re-authoring an option) | ET-ADV-03 / the existing drift suite |

Every mutant above must be killed by its named test. A mutant that
survives is a missing proof, not an acceptable residue.

## Authority Chain (delta)

| Object | Authoritative source | Digest / identity | Change |
|---|---|---|---|
| Early-termination record | L4 lifecycle at a `REQUESTED` terminal | contract validation; no authority digests BY DESIGN | new — the refusal-evidence terminus for pre-authority runs |
| Requesting principal | the run request itself | recorded verbatim; carries no digest and grants nothing | new field — states WHO was refused. That it is the *requester* and not a profile-derived agent principal is an L4 population obligation, **not** a contract guarantee: the shapes are identical, and a partially-completed production epoch can leave a captured profile in hand |
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
| Requester mandatory and authority-free (structural) | 1.1 | ET-EX-05, ET-PROP-02, ET-ADV-04/06 |
| Success unrepresentable (contract level) | 1.1 | ET-EX-06, ET-ADV-02, ET-PROP-01, ET-MUT-02 |
| Mutation net | 1.1, 1.2 | ET-MUT-01…04, each with its named killing test |
| Exclusivity with `run-record` (behavioral half) | **L4** (#27) | lifecycle fixtures there — **deferred, named** |
| Requester **provenance** (populated from the request, never from a captured profile) | **L4** (#27) | **deferred, named — and load-bearing.** `Principal` validates shape, not origin, so no contract-level proof can exist. L4 must prove that the requester is populated from the run request on **every** `REQUESTED` terminal — including a terminal caused by an acquisition fault that follows a *successful* profile capture, where a profile-derived principal genuinely exists and is the value a defect would most plausibly reach for |

## Landing Plan

- **One PR.** The contract, its generated artifact, the ledger append, and
  the proof net land together; a contract without its proofs is a shape
  nobody has checked.
- **Inert on landing.** Nothing writes or reads the record until L4
  consumes it; CI builds and proves it. Rollback is non-reference.
- **Authority posture: additive.** No authority flips; the record grants
  nothing and represents runs that obtained nothing.

## Review Plan

Per the standing model. EQ1 and EQ2 are **already closed** by the owner
(2026-08-11); the closing planning review **confirms those closures**
rather than re-deciding them — and must close **EQ3** (the
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
lacking proof:** none. **Recorded limitations, not gaps.** (1) Requester **provenance** is not
structurally decidable: `Principal` validates an identity's shape, not
where the value came from, so no contract-level proof can distinguish a
requester from an agent principal. The claim is narrowed to what the
shape enforces (mandatory, digest-free, grant-free) and the provenance
obligation is assigned to L4. An earlier draft called that assignment
vacuously safe on the grounds that no profile exists for these runs;
**that was wrong and is withdrawn** — L4's production epoch acquires
three sources, so a `REQUESTED` terminal caused by a later acquisition
fault can occur with the profile already captured. The obligation is
therefore real, and § Traceability states precisely what L4 must prove.
(2) The
no-authority guarantee is structural — it binds the record's fields, not
the content of the free-text failure detail inherited from the terminal
vocabulary. A shape contract cannot enforce what a human-readable string
does not contain; the requirement was narrowed to say so rather than
claim it, and arbitrary string-content scanning stays an L4/L9 concern
exactly as the parent `runner-evidence` requirement already states for
credential values. **Deferred, named:** the exclusivity behavior and
every writer/reader obligation (L4/#27 and later). **Design assumptions
requiring human confirmation:** EQ3 (mandatory requester), EQ4 (narrowed
outcome union), and the owner's explicit authorization to mint a new
contract identity under #51.
