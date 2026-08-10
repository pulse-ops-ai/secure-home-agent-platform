# Assurance Plan: runner-core

## Purpose

This artifact defines how the accepted specification and design will be proven
before the change is considered complete.

It does not create new product requirements.

It answers:

> Have we modeled enough of the behavior, state space, and failure surface to
> implement and review this change safely?

Identifier convention: inherited identifiers keep their canonical names
(`INV-001`, `EX-001`, `ADV-002`, `PROP-003`, `MUT-001`). Identifiers minted by
this change are prefixed `RC-`.

---

## Risk Classification

**Risk:** `trust-critical`

### Rationale

- **Authorization.** `decideEligibility` gates model and provider spend from
  captured authority. A permissive default here is an authorization bypass, and
  every later landing inherits the decision.
- **Runner and review machinery.** This *is* the trusted core of that
  machinery. Every run's evidence derives from its construction and
  verification logic.
- **Proposed-change-set binding and materialization.** Observation-versus-claim
  reconciliation and materialization eligibility are decided here; a wrong
  answer lets a run's own output define what the run changed.
- **Reconciliation and readiness authority.** Seal eligibility is decided here.
- **Public cross-package contract.** The exported surface is what L4 consumes;
  a weak signature (accepting a path instead of a snapshot) would let the
  orchestrator re-read authority and defeat INV-007 from outside.

Not merely `high`: the failure modes are silent-permission failures, not
correctness bugs. A defect here does not break a build — it grants something.

Per the ratified review plan, a trust-critical child change carries an
**Authority Chain** table and a **before × after transition matrix**. Both are
below.

## Critical Invariants

### Inherited from the ratified `runner-adoption` contract

| ID | What L3 specifically must hold |
|---|---|
| INV-001 | `packages/runner-core` imports nothing from `services/*` or `apps/*`, and the direction is mechanically enforced |
| INV-003 | Contract refusal and operational failure are distinct outcomes; a refusal carries enough to write refusal evidence |
| INV-006 | The authoritative change set derives from host observation; claims are recorded and cross-checked, never substituted |
| INV-007 | *(split with L4, honestly)* L3: captured authority is an immutable digest-bound snapshot and every decision derives from it, snapshot-only by construction. L4: each source physically acquired exactly once, snapshot retained, verification inputs independently re-acquired — an acquisition count a pure package cannot prove |
| INV-008 | *(data/path side only)* A run cannot alter the material that governs or judges it |
| INV-010 | Security-relevant bounds refuse, never truncate |
| INV-011 | Evidence is independently re-derivable and fail-closed; failure to establish evidence never registers as success |
| INV-015 | Trust in an intermediate representation never transfers to a later mutable artifact |

### Minted by this change

| ID | Invariant | Class |
|---|---|---|
| RC-INV-01 | The permitted-dependency allowlist is exact: only `@secure-home/contracts` and `@secure-home/events` at runtime | trust / compatibility |
| RC-INV-02 | No trusted-decision signature accepts a path, handle, reader, or port from which it could obtain authority bytes | trust |
| RC-INV-03 | `src/verification/**` and `src/evidence/**` share no import edge in either direction | trust |
| RC-INV-04 | The core performs no I/O: no `node:fs`, `node:child_process`, or network import anywhere in `src/` | trust |
| RC-INV-05 | No public interface expresses a truncated, sampled, or partial result for a security-relevant bound | trust |
| RC-INV-06 | Every trusted operation returns a `Decision`; no contract-reason path throws | behavior |
| RC-INV-07 | The package is inert: no module-load side effect, and no importer in the repository | behavior |
| RC-INV-08 | A prohibited rule the core cannot interpret — policy bytes failing contract validation, or a rule kind outside the implemented vocabulary — refuses the whole policy at capture, never being skipped | trust |

## State-Space Model

Independent dimensions that materially affect L3 behavior:

| Dimension | Values |
|---|---|
| Authority snapshot | absent / present-valid / present-malformed / present-contract-mismatch |
| Source mutability after capture | unchanged / mutated |
| Requested gate identity | declared / undeclared / duplicated |
| Observed path | under a root / outside every root / protected / normalization-undecidable / alias-escaping |
| Bound | under / exactly at / over |
| Observed vs claimed sets | equal / claimed-extra / observed-extra / same-path-divergent-kind / claims-absent / claims-malformed |
| Artifact surface | matches bundle / one mutated / extra present / one missing / unreadable |
| Evidence bundle | valid / absent / malformed / self-contradictory |
| Seal prerequisites | all decided / one undecided / one inconsistent |

Not a Cartesian product. The interactions that require proof:

- **protected path × allowed write root** — protection must outrank the root,
  or a policy that widens a root silently unprotects the judge material.
- **protected path × agreement** — an observed change that agrees exactly with
  the claim is still refused; agreement must not launder ineligibility.
- **disagreement × otherwise-eligible change set** — disagreement alone must
  not block materialization, or a lying adapter becomes a denial-of-service.
- **bound exactly at limit × repeated evaluation** — the boundary must be
  stable, or the security boundary is nondeterministic.
- **source mutated after capture × downstream decision** — every decision must
  still derive from the snapshot (INV-007 against a live attacker).
- **artifact mutated after verification × consumption** — the earlier
  verification must not authorize the later artifact (INV-015).
- **extra artifact × valid bundle** — an unaccounted artifact must fail closed,
  not be ignored as immaterial.
- **claims absent × authoritative derivation** — an absent claim set must
  record as empty, never as agreement.
- **workspace unreadable × empty change set** — "we could not look" must not
  become "nothing changed".

## Decision Tables

The three normative tables — eligibility, materialization, and verification —
are in `design.md` § Decision Tables and are the tables this plan proves. They
are not duplicated here; duplication is how two tables start disagreeing.

Every row of each has a named proof in § Proof Obligations, and no row of any
maps an undecidable state to success.

## Cross-Requirement Interactions

Mandatory at this risk class.

| Interaction | Risk | Required proof |
|---|---|---|
| INV-007 × INV-008 | mid-run source mutation and sandbox judge-writes are different attacks; a design that handles one may miss the other | ADV-003 and ADV-005 kept as distinct fixtures, both required |
| INV-006 × INV-008 | a claimed change set naming a protected path could be read as authoritative and then refused for the wrong reason | RC-ADV-01: claims naming a protected path never enter the authoritative set; the refusal cites the *observed* violation |
| INV-010 × INV-011 | an over-bound change set could be refused after evidence has been partially constructed, leaving a bundle that half-describes a refused run | RC-ADV-02: bound refusal precedes construction; no partial bundle is returned |
| INV-011 × INV-015 | a sealed, verified bundle taken as trust in a later mutated artifact | ADV-014 / PROP-006 at the consumption boundary |
| INV-003 × INV-011 | an operational read failure could be recorded as a contract refusal in evidence, inventing a decision | RC-ADV-03: a reported acquisition or observation failure yields `OperationalFailure`, and no refusal code appears |
| RC-INV-03 × D6 | a later refactor extracts a "shared" membership helper, collapsing verifier independence | RC-EX-03 import-graph guard plus MUT-003 |
| RC-INV-02 × L4 consumption | L4 could pass a reader through a generic parameter, re-opening re-reads | RC-EX-02 signature guard over the exported surface |

## Proof Obligations

### Inherited proofs — restated for L3

Each row states what L3 must prove, from which authoritative input, the
candidate failure, the independent observable evidence, and whether L3 can
actually prove it. Where an obligation is partly a later landing's, it is
split rather than overclaimed.

| ID | What L3 must prove | Authoritative input | Candidate failure | Independent observable evidence | Can L3 prove it? |
|---|---|---|---|---|---|
| EX-001 | `packages/runner-core` has no `services/*` or `apps/*` import, and the check fails when one is added | the workspace layer model and the package's real import graph | someone adds a service import and the gate stays green | merge-gate run of `check:workspace` and `check:imports`, plus a negative fixture proving the added import fails | **Yes, fully** |
| EX-003 | A contract refusal carries enough to write refusal evidence, and an operational failure claims no contract decision | the `Decision` result values | a reported environmental failure is recorded as a refusal, inventing a decision that was never made | deterministic tests over both variants asserting the presence/absence of a refusal code | **Yes, fully** |
| EX-006 | An independent verifier re-derives expected state from authoritative inputs and artifacts, agreeing or naming the divergence | captured snapshots + observed artifact surface | verifier calls the producer and confirms its opinion | re-derivation tests plus the import-graph guard (RC-EX-03) | **Yes, fully** |
| ADV-002 | A claim naming a file absent from the observation loses; disagreement is recorded | host observation + claimed set | claim merged into the authoritative set | fixture asserting authoritative-set membership and the recorded disagreement | **Yes, fully** |
| ADV-003 | A source mutated after capture does not change any decision | captured snapshot | a decision re-reads the source | fixture supplying one byte value at capture and a different value afterwards; decisions unchanged; digest identifies the captured bytes | **Yes, for the snapshot side** — value-based inputs make the mutation expressible in-test; that no re-acquisition physically occurred is L4's acquire-once proof |
| ADV-004 | *Split.* L3 proves that a base-identity **mismatch input** yields refusal | captured base identity + observed identity | mismatch treated as acceptable | fixture over the comparison decision | **Partly.** L3 owns the comparison; **L4 owns asserting it at workspace creation**, because "before any model invocation" is an ordering property |
| ADV-005 | A sandbox write to a protected governing path refuses materialization entirely, violation recorded | captured policy + observed change set | the offending change is dropped and the rest proceeds | fixture with one protected and several eligible changes; whole set refused | **Yes, for the data/path side.** The code side (modified orchestration never judges its run) is L4/ADV-018 |
| ADV-009 | An input over its declared byte bound is refused with bound and observed size, never truncated | captured policy bounds + observation | truncate-to-fit | fixture at over-bound; plus the API-shape guard that no truncating mode exists | **Yes, fully** |
| ADV-011 | Evidence-establishment failure classifies as failure, never success | evidence input set | a refused construction still classified `COMPLETED` | fixture asserting the terminal state and `TERMINAL_SUCCESS` mapping | **Yes, for classification.** Proving the *seal happened last* is L4 |
| PROP-003 | For any generated over-bound input, the result is refusal with the bound named — never a truncated variant | generated change sets and bound values | an off-by-one or a partial-result path | property test across generated sizes including exactly-at-bound | **Yes, fully** |
| PROP-005 | For any generated artifact set, verification agrees with the bundle, and any single mutation is flagged | generated artifact surfaces | verifier insensitive to a single-byte change | property test with single-artifact mutation | **Yes, fully** |
| PROP-006 | Mutation after verification and before consumption refuses unless independently reverified | verified artifact + mutated artifact | earlier verification authorizes the later artifact | property test over verify → mutate → consume | **Yes, at the core's consumption boundary.** Re-proof at L5/L7/L9 for their own consumers |
| MUT-001 | Removing or weakening protected-path refusal is killed by a named test | — | guard weakened to a warning | ADV-005 fixture must fail under the mutant | **Yes, fully** |
| MUT-002 | Removing snapshot digest verification is killed | — | digest check dropped | ADV-003 fixture must fail under the mutant | **Yes, fully** |
| MUT-003 | Removing the verifier's independent hash comparison is killed | — | verifier trusts the bundle's digests | PROP-005 / EX-006 must fail under the mutant | **Yes, fully** |
| MUT-006 | Weakening refuse-not-truncate is killed | — | bound clamps instead of refusing | PROP-003 / ADV-009 must fail under the mutant | **Yes, fully** |
| MUT-008 | Removing or bypassing final-consumer verification is killed | — | consumption skips reverification | ADV-014 / PROP-006 must fail under the mutant | **Yes, fully** |

**Explicitly not claimed by L3**, and named here so no reader assumes coverage:
the **acquire-once half of INV-007** — that each authority source was
physically read exactly once, the snapshot retained, and verification inputs
independently re-acquired (L4; a pure package cannot prove an acquisition
count); EX-004 and PROP-002 (lifecycle state machine, L4); EX-005A/B, ADV-006,
ADV-007 execution, MUT-004, MUT-007 (gate *execution*, L4/L9 — L3 proves only
that an undeclared gate identity refuses at eligibility); ADV-018 and MUT-010
(orchestration provenance, L4); ADV-013, EX-008 (cancellation and teardown,
L9); the ordering half of the sealed-last rule (L4).

### Proofs minted by this change

| ID | Proves | Proof class | Evidence |
|---|---|---|---|
| RC-EX-01 | RC-INV-01 | schema/contract validation | manifest allowlist test: runtime deps are exactly the two workspace packages; adding one fails |
| RC-EX-02 | RC-INV-02 | architecture guard | signature scan of the exported surface: no parameter type is a path, handle, reader, or port |
| RC-EX-03 | RC-INV-03 | architecture guard | import-graph guard: zero edges between `src/evidence/**` and `src/verification/**` |
| RC-EX-04 | RC-INV-04 | architecture guard | no `node:fs`, `node:child_process`, `node:net`, `node:http(s)`, or `node:dgram` import in `src/**` |
| RC-EX-05 | RC-INV-07 | deterministic example | importing the package index executes no side effect; the repository has zero importers |
| RC-EX-06 | RC-INV-08 | deterministic example | policy bytes with an unknown rule kind or non-normalized prefix fail capture validation; a kind outside the implemented vocabulary refuses the whole policy |
| RC-PROP-01 | RC-INV-06 | property test | for any generated input, every trusted operation returns a `Decision` and throws for no contract reason |
| RC-PROP-02 | INV-006 | property test | for any generated observed/claimed pair, the authoritative set equals the observed set exactly, independent of presentation order |
| RC-MUT-01 | RC-INV-08 | mutation test | ignoring an unrecognized rule instead of refusing is killed by RC-EX-06 |
| RC-MUT-02 | INV-006 | mutation test | merging claims into the authoritative set is killed by ADV-002 / RC-PROP-02 |
| RC-MUT-03 | RC-INV-05 | mutation test | reintroducing a truncating path is killed by PROP-003 and the API-shape guard |

## Property Tests

| ID | Property |
|---|---|
| PROP-003 | For any input exceeding its declared bound, the result is refusal naming the bound — never a truncated variant; exactly-at-bound proceeds |
| PROP-005 | For any generated artifact set, independent verification agrees with the bundle, and any single-artifact mutation is flagged |
| PROP-006 | For any security-relevant artifact, mutation after an earlier successful verification and before consumption causes refusal unless independently reverified |
| RC-PROP-01 | For any generated input, every exported trusted operation returns a `Decision` and throws for no contract reason |
| RC-PROP-02 | For any generated observed/claimed pair, the authoritative set equals the observed set exactly, and reconciliation is order-independent |

## Hostile Corpus

| ID | Case | Expected behavior |
|---|---|---|
| ADV-002 | Model claims a touched file absent from the observation | observation wins; disagreement recorded |
| ADV-003 | Authority source mutated after capture | captured snapshot governs; digest identifies it |
| ADV-004 | Observed base identity does not match the pinned identity | comparison refuses (L4 asserts it at creation) |
| ADV-005 | Change set writes a protected governing path | whole set refused; violation recorded; nothing dropped |
| ADV-009 | Change set over a declared bound | refused with bound and observed value; never truncated |
| ADV-011 | Evidence construction refused | outcome classifies as failure, never success |
| ADV-014 | Verify → mutate the artifact → consume | refusal; the earlier verification authorizes nothing |
| RC-ADV-01 | Claimed set names a protected path absent from the observation | claim never enters the authoritative set; no protected-path refusal is invented from a claim |
| RC-ADV-02 | Over-bound change set presented with otherwise complete evidence inputs | bound refusal precedes construction; no partial bundle |
| RC-ADV-03 | Supplied observation value reports the workspace unreadable | operational failure; no refusal code; no authoritative set |
| RC-ADV-04 | Policy bytes carry an unknown rule kind, or a prefix with a wildcard, traversal segment, absolute prefix, or scheme | policy refused at capture validation; never best-effort matched, never partially applied |
| RC-ADV-05 | Path reaches its target through a link resolving outside its root | refused with path and reported target named |
| RC-ADV-06 | Change set exactly at every declared bound | proceeds; repeated evaluation is identical |
| RC-ADV-07 | Artifact surface contains an artifact absent from the bundle | verification fails naming the unaccounted artifact |
| RC-ADV-08 | Bundle carries two irreconcilable statements about one fact | verification fails naming the ambiguity |
| RC-ADV-09 | Claims absent entirely | recorded as an empty claim set, never as agreement |
| RC-ADV-10 | Duplicate gate identity in the requested set | eligibility refuses with the duplication named |
| RC-ADV-11 | Captured bytes valid against a *different* declared contract | capture refuses naming declared and observed identities |
| RC-ADV-12 | Empty observation from a readable workspace | authoritative set is empty and valid — distinct from RC-ADV-03 |

## Mutation Targets

| ID | Guard | Killing test |
|---|---|---|
| MUT-001 | Protected-path refusal on judge-material writes | ADV-005 |
| MUT-002 | Snapshot digest verification of authority inputs | ADV-003 |
| MUT-003 | Independent verifier hash comparison | PROP-005 / EX-006 |
| MUT-006 | Refuse-not-truncate at declared bounds | PROP-003 / ADV-009 |
| MUT-008 | Final-consumer verification (removal or bypass) | ADV-014 / PROP-006 |
| RC-MUT-01 | Refuse-on-unrecognized-rule | RC-EX-06 / RC-ADV-04 |
| RC-MUT-02 | Observed-over-claimed precedence | ADV-002 / RC-PROP-02 |
| RC-MUT-03 | Absence of any truncating mode | PROP-003 + API-shape guard |
| RC-MUT-04 | Refuse-on-missing-authority (any eligibility branch defaulting to eligible) | eligibility table fixtures |
| RC-MUT-05 | Captured-snapshot usage (a decision re-reading a source) | ADV-003 + RC-EX-02 |
| RC-MUT-06 | Evidence completeness (accepting an extra or missing artifact) | RC-ADV-07 / PROP-005 |
| RC-MUT-07 | Fail-closed seal eligibility (an undecided prerequisite reported eligible) | seal-eligibility fixtures |
| RC-MUT-08 | Verifier independence (an import edge to the producer) | RC-EX-03 |

Every mutant above must be killed by the named test. A mutant that survives is
a missing proof, not an acceptable residue.

## Authority Chain

Required for a trust-critical change. Every object that carries or influences
authority, from its source to its final consumer.

| Object | Authoritative source | Capture boundary | Digest / identity | Mutable after capture? | Sandbox write reach | Transformation | Final consumer / verifier |
|---|---|---|---|---|---|---|---|
| Execution profile | repository-declared profile bytes | `captureAuthority` at run start | `Digest` over captured bytes; `ProfileIdentity` | source yes, snapshot no | **none** — protected material | parse → `ExecutionProfile` | eligibility; recorded in `EvidenceIdentities.profile` |
| Path policy | repository-declared policy bytes | `captureAuthority` | `Digest` over captured bytes | source yes, snapshot no | **none** — protected | parse → `PathPolicy` v2 (typed rules); component-prefix matching (D8) | materialization decisions; recorded as `identities.path_policy` (`AuthorityIdentity`, per the `runner-contract-corrections` amendment); verifier compares against its own capture |
| Gate registry | repository-declared registry bytes | `captureAuthority` | `Digest` over captured bytes | source yes, snapshot no | **none** — protected | parse → `GateRegistry` | eligibility (declared-identity check); recorded as `identities.gate_registry` (`AuthorityIdentity`, per the amendment); verifier compares against its own capture |
| Pinned base / source identity | supplied to the core as captured identity | passed in as data | `Digest` | n/a to the core | none | compared against observed identity | L3 comparison; **asserted at creation by L4** |
| Writable workspace | host, observed by **L4** | L4 observation, supplied as a `WorkspaceObservation` value | observed change set | yes — it is the sandbox's workspace | **full** (that is the point) | derive authoritative change set | materialization decisions; evidence `change_sets.observed` |
| Observed change set | the supplied `WorkspaceObservation` value | at derivation | set of `FileChange` | no — a value | none | normalization; bound measurement | path decisions; reconciliation; evidence |
| Model-claimed change set | adapter/provider output | passed in as **untrusted data** | none — claims carry no identity | no — a value | n/a | compared only | `change_sets.claimed`; never the authoritative set |
| Gate results | supplied as `GateResults` | passed in as data | keyed by `GateId`; one disposition per identity, structurally | no | none | none | evidence `gate_results`; verifier revalidates |
| Artifact surface | host, observed by **L4** | L4 observation, supplied as an `ArtifactObservation` value | recomputed `Digest` per artifact | yes — files on disk | depends on the path decisions | digest recomputation; membership derivation | evidence `artifacts`; verifier recomputes from its own supplied observation |
| Evidence bundle | constructed by `evidence/` | construction | `EvidenceBundle` contract validation | yes, as a file, once written by L4 | **none** — protected | contract validation | `verification/`, using its **own** observations |
| Sealed representation | L4 | **out of L3 scope** | — | — | none | — | L4; L3 supplies the eligibility predicate only |
| Verifier inputs | the same authoritative sources, **independently re-acquired by L4** | supplied to the verifier as values distinct from the producer's | independently recomputed | — | none | independent re-derivation | the verification result, naming the artifacts consumed; acquisition independence is L4's obligation |

Two rows deserve emphasis. The **model-claimed change set** is the only object
with no identity and no authority — by design; it is compared and recorded, and
it reaches no decision. The **path policy** and **gate registry** rows carried
Q2 in the original seam: their digests had nowhere to go in the L2 bundle. The
delta review directed option B, and the `runner-contract-corrections` change
adds both as required `AuthorityIdentity` fields — so the chain now terminates
in the bundle for every governing authority input, and a reader of the bundle
alone can tell which policy and registry governed the run.

## Before × After Transition Analysis

Required for a trust-critical change. Each row is a state pair the
implementation must handle as a *transition*, not merely as two states.

| # | Before | After | Required behavior | Proof |
|---|---|---|---|---|
| 1 | authority captured, digest recorded | source file changed | every decision still derives from the snapshot; digest identifies the captured bytes | ADV-003, MUT-002 |
| 2 | pristine base identity matches | base dirty / non-matching | comparison refuses; L4 asserts before model invocation | ADV-004 |
| 3 | path under an allowed root | same path via traversal or an alias escaping the root | refuse, both forms recorded | RC-ADV-05, ADV-005 |
| 4 | path eligible | same path now protected by policy | protection outranks the root; whole set refused | ADV-005, MUT-001 |
| 5 | change set under bound | change set over bound | refuse with bound and observed value; no truncation | ADV-009, PROP-003, MUT-006 |
| 6 | change set exactly at bound | one unit over | proceed → refuse, deterministically at the declared edge | RC-ADV-06, PROP-003 |
| 7 | observed set equals claimed set | claim diverges | authoritative set unchanged; disagreement recorded | ADV-002, RC-PROP-02 |
| 8 | claims present | claims absent | recorded as empty, never as agreement | RC-ADV-09 |
| 9 | evidence complete | one artifact removed | verification fails naming the missing artifact | PROP-005 |
| 10 | evidence complete | one extra unaccounted artifact appears | verification fails naming the extra | RC-ADV-07 |
| 11 | producer output verified | verifier recomputes and disagrees | verification fails naming the divergence; the producer's claim does not win | EX-006, MUT-003 |
| 12 | artifact verified | artifact mutated, then consumed | consumption refuses unless independently reverified | ADV-014, PROP-006, MUT-008 |
| 13 | evidence inputs complete | one prerequisite becomes undecided | seal eligibility refuses naming it | RC-MUT-07 |
| 14 | gate set all declared | one identity undeclared, or duplicated | eligibility refuses naming it | RC-ADV-10, eligibility fixtures |
| 15 | workspace readable, empty change set | workspace unreadable | empty-and-valid → operational failure; the two never collapse | RC-ADV-12 vs RC-ADV-03 |
| 16 | policy validates with implemented rule kinds | bytes carry an unknown kind or non-normalized prefix | policy refused at capture; not partially applied | RC-ADV-04, RC-MUT-01 |

No transition in this table may end in a success classification.

## Traceability Plan

| Requirement / invariant | Landing | Proving task | Proof |
|---|---|---|---|
| Extraction-ready core (INV-001) | L3 | 1.2 | EX-001 |
| Dependency allowlist (RC-INV-01) | L3 | 1.3 | RC-EX-01 |
| Snapshot construction and snapshot-only decisions (INV-007, L3 half) | L3 | 2.1, 2.2 | ADV-003, MUT-002, RC-EX-02 |
| Acquire-once, retention, independent re-acquisition (INV-007, L4 half) | **L4** | — | **deferred, named** |
| Eligibility refuses (runner-authority) | L3 | 2.3 | eligibility table fixtures, RC-MUT-04 |
| Refusal is a value (INV-003) | L3 | 2.4 | EX-003, RC-PROP-01, RC-ADV-03 |
| Path decisions (runner-path-decisions) | L3 | 3.1, 3.2 | ADV-005, RC-ADV-04/05, MUT-001 |
| Judge protection — data/paths (INV-008) | L3 | 3.2 | ADV-005, MUT-001 |
| Judge protection — orchestration provenance (INV-008) | **L4** | — | ADV-018, MUT-010 — **deferred, named** |
| Bounds refuse (INV-010) | L3 | 3.3 | ADV-009, PROP-003, MUT-006, RC-ADV-06 |
| Evidence outranks claims (INV-006) | L3 | 4.1, 4.2 | ADV-002, RC-PROP-02, RC-MUT-02 |
| Evidence construction (runner-evidence-derivation) | L3 | 5.1 | RC-ADV-02, ADV-011 |
| Independent verification (INV-011) | L3 | 6.1, 6.2 | EX-006, PROP-005, RC-EX-03, MUT-003 |
| Final-consumer trust (INV-015) | L3 | 6.3 | ADV-014, PROP-006, MUT-008 |
| Seal eligibility predicate | L3 | 5.2 | RC-MUT-07 |
| Seal **ordering** | **L4** | — | **deferred, named** |
| Base-identity assertion at creation | **L4** | — | ADV-004 assertion half — **deferred, named** |
| Lifecycle state machine (INV-004) | **L4** | — | EX-004, PROP-002 — **deferred, named** |
| Gate execution (INV-009) | **L4/L9** | — | EX-005A/B, MUT-004/007 — **deferred, named** |

Every deferred item names its landing. There is no generic "later" bucket.

## Landing Plan

- **One PR.** L3 is a single atomic seam. A trusted core landing without its
  proof net is a core whose guarantees are unproven, and the ratified landing
  plan puts the proof net with the mechanism.
- **Verification lands with each component.** Task groups 2–6 each carry their
  own fixtures and properties; group 7 adds only the cross-cutting net that
  requires every part to exist (mutation sweep, full property run,
  architecture guards over the finished tree).
- **Inert on landing.** Nothing imports the package; module load has no side
  effect (RC-EX-05). Its rollback is non-reference.
- **Authority posture: additive.** No authority flips. L9 remains the single
  enforcement flip in the program.
- **Safe for L4 to build on**, because L4 can only consume the exported
  decisions — RC-INV-02 means it cannot hand the core a reader, and the
  decisions it receives are already proven against this net.

## Review Plan

Per the ratified standing model:

- **During construction:** deterministic tests and targeted design/module
  review only. No repeated full reviews at known-incomplete checkpoints.
- **At the complete seam:** repository-aware semantic and evidence review,
  then one fresh falsification-oriented independent review against the frozen
  final head.
- **Contract-conformance obligation:** L3 is the **first consumer** of the L2
  contracts. Per the ratified cross-requirement note ("inert contract × first
  consumer arrives"), the consuming landing re-runs the neutrality and
  coherence proofs rather than assuming them — L3's suite must validate every
  contract it consumes rather than trusting L2's passing suite.
- **Deterministic gates, continuous:** scaffold validation, secret scan,
  Prettier, workspace dependency direction, source-import direction.
- **Decision-bearing shell is a refusal finding**, not a style note.
- **Mechanical boundaries only:** a comment, a type name, or a directory
  convention is not a trust boundary unless something enforces it. RC-INV-03
  and RC-INV-04 are guards for exactly this reason.
- **Planning-review gate:** Q1–Q4 were closed by the delta review
  (2026-08-10) — Q1/Q2 by direction into the `runner-contract-corrections`
  L2 change, Q3 confirmed, Q4 by removing L3-owned ports. Task 0.1
  additionally gates on that correction **landing** and this seam passing
  its focused delta review against the reconciled artifacts.

## Rollout and Rollback

`not_applicable` with reason: the package is inert on landing. It changes no
runtime behavior, no authority, no security posture, and no shared
infrastructure, because nothing imports it until L4. There is no shadow phase
to run and no activation condition to measure. Rollback is removal or
non-reference.

The forward obligation is unchanged: L9 remains the single enforcement flip,
and its own landing defines the shadow period, activation, and rollback.

## Assurance Completeness

**Unresolved state-model questions:** none. Q1's rule language is fixed by
the L2 typed contract (`runner-contract-corrections`); the state model's
RC-ADV-04 and RC-MUT-01 operate at capture validation and at the
implemented-kind boundary.

**Requirements lacking proof:** none within L3's scope. Every requirement in
the four capability specs has a named proof obligation above.

**Scenarios intentionally deferred, each with a named landing:** the
acquire-once half of INV-007 (L4), the assertion half of ADV-004, seal
ordering, orchestration provenance (ADV-018, MUT-010), lifecycle transitions
(EX-004, PROP-002), gate execution (EX-005A/B, ADV-006, ADV-007 execution,
MUT-004, MUT-007), cancellation and teardown (EX-008, ADV-013), and PROP-006
re-proof at each later landing that adds a final consumer.

**Design assumptions requiring human confirmation:**

- **Q1–Q4** — resolved by the delta review (2026-08-10): Q1 typed rules in
  L2, Q2 option B in L2 (both via `runner-contract-corrections`), Q3
  confirmed, Q4 ports removed. Recorded in `design.md` § Open Questions.
- **D1** — layer 3 placement, **accepted** by the same review, with the
  `CONTRACT_LAYER_MAX` naming consequence recorded as non-blocking technical
  debt, not widened into #52.

`tasks.md` must not begin implementation merely because this artifact
exists. Task 0.1 gates on the `runner-contract-corrections` change landing
and on this reconciled seam passing its focused delta review.
