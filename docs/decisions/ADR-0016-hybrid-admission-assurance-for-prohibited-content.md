# ADR-0016: Hybrid admission assurance for prohibited content

- **Status:** Proposed
- **Date:** 2026-08-15
- **Deciders:** @mikegtech (repository owner)
- **Refines / supersedes in part:** [ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) §5 and its dependent machine-check claims; [ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) §8 and the prohibited-content clause of §12. **Neither ADR is edited.** Every other clause of both stands unchanged.
- **Preserves:** the prohibited-content list itself; knowledge is context and never authority; no direct bundle reads; OKF v0.2 as source representation; catalog metadata authority; package and digest semantics; the `Attested Computation` refusal; trust/provenance separation
- **Closes:** no unresolved decision

---

## Context

### The falsification

[ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) §5 states: *"The
prohibited-content list is machine-checked before a bundle is publishable. A
bundle that fails is not published — it is not a warning."* Its Consequences add
that *"the secrets-and-live-state failure mode is prevented by an **enforced
rule** rather than by discipline."*
[ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) §8 carries
the claim forward — the list *"is enforced by our validator, machine-checked"* —
and §12 requires *"a negative case per class proven to fail without the check"*
before authoring may open.

Implementing that obligation established that **the claim cannot be satisfied
for the semantic classes**, over free-form OKF Markdown, without either a
classifier in the admission trust path or a lexical proxy that is simultaneously
evadable and false-positive-heavy.

The contract's own teaching material is the proof.
[`knowledge/README.md`](../../knowledge/README.md) draws the boundary with:

| Knowledge | Not knowledge |
|---|---|
| "The upstairs zone is served by a 3-ton heat pump rated to 15 °F" | "The upstairs is currently 71 °F" |
| "Peak pricing runs 16:00–21:00 on weekdays" | "The current rate is $0.34/kWh" |

Both sides are prose carrying a number and a unit. What separates them is
whether the number is a **specification or an observation** — a question about
meaning, not about form. And the obvious detector fails in both directions:
deleting the word "currently" evades it, while the *permitted* row *"peak
pricing **currently** runs 16:00–21:00"* trips it. A rule whose false positive is
the contract's own example of compliant knowledge is not an enforcement
mechanism.

Two remedies were rejected before this one. **An LLM classifier in admission**
would place a model in the trust path of the mechanism whose purpose is to keep
model-visible content safe, and would make admission non-deterministic and
unreviewable. **A lexical proxy presented as class coverage** would report
success while proving one keyword — the defect this repository has spent an
entire landing learning to refuse.

### What is actually being corrected

Not the policy. The **assurance claim about the policy**. Nothing becomes
permitted; a false statement about how the prohibition is established becomes a
true one.

## Decision

### 1. The prohibited-content list does not change

Secrets, tokens, keys and credentials; live device state and current readings;
current presence and occupancy; authorization tuples, grants and relationship
authority; mutable automation state; camera media and recordings; raw personal
telemetry — all remain prohibited from portable knowledge, exactly as
[ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) §1 states.

This ADR removes no prohibition and narrows no class.

### 2. Coverage is stated by class, and subsets are never described as complete

Three kinds of evidence, and the difference between them is load-bearing:

| | Evidence kind | Meaning |
|---|---|---|
| **A** | deterministic, structurally complete | the property is decided by form; a violating bundle **cannot** pass. Requires a **closed authoring grammar** in which every representation of the prohibited thing is structurally visible |
| **B** | deterministic indicator, bounded coverage | recognized shapes are refused; the class is **not** fully covered, and the blind spot is named |
| **C** | semantically undecidable from arbitrary prose | no honest deterministic mechanism exists |

| Class | Kind | What the machine establishes | What it does **not** |
|---|---|---|---|
| camera media, recordings | **B** | non-`.md` bundle members; Markdown and HTML media references; media-typed `data:` URIs; known media-extension references; other exact structural encodings we enumerate | media bytes base64- or hex-encoded inside a Markdown file; media behind an opaque URL with no extension or content hint |
| secrets, tokens, keys, credentials | **B** | recognized shapes: PEM blocks, JWT triples, known provider prefixes, high-entropy values in value position | a credential in prose — *"the admin password is the dog's name"* |
| authorization tuples, grants | **B** | structured tuple shapes and grant-shaped frontmatter keys | prose authority — `knowledge/README.md`'s own prohibited example, *"Alice is a household administrator"* |
| live device state, current readings | **C** | nothing | the specification/observation distinction |
| current presence, occupancy | **C** | nothing | — |
| mutable automation state | **C** | nothing | — |
| raw personal telemetry | **C** | nothing | prose telemetry; structured tables are at best a **B** indicator |

**There are no class-A detectors today, and that is the honest result.**

Camera media was drafted as **A** and is corrected here. The reasoning that
demoted it: a bundle member is a Markdown file, and arbitrary bytes can live
*inside* Markdown as base64 or hex, or behind an opaque URL carrying no
extension and no content hint. Refusing non-`.md` members and recognizable media
references is genuinely useful and genuinely deterministic — it is simply not
**complete**, and completeness is what **A** asserts.

**A** would require a closed authoring grammar in which every representation of
the prohibited thing is structurally visible. This repository does not have one.
`A` is a **capability of a mechanism, not a quota to fill**: a category with no
members is a true statement about what has been built, and inventing an A claim
to populate the taxonomy would reproduce, in miniature, the exact overclaim this
ADR exists to correct.

**No test, document, or report may describe a B detector as covering its class.**
A proof named for a class that establishes one indicator is a false proof, and
this repository has already paid for that mistake once.

### 3. The gate stays fail-closed, by two mechanisms rather than one

- **Deterministic finding → REFUSE.** Any A or B finding refuses admission. This
  is unchanged from ADR-0010 §5's posture: a failure, never a warning.
- **Semantic remainder → REQUIRES A HUMAN CONTENT-REVIEW ATTESTATION.** Absent a
  valid attestation, admission **REFUSES**.

Nothing becomes unchecked. The undecidable part stops being *pretended* and
starts being *recorded*, with a named accountable human.

### 4. The attestation is a repository admission artifact, NOT an OKF trust tier

[ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) §10 stands
unchanged: OKF trust and provenance signals are descriptive and confer no
authority.

**`verified: human-reviewed` is not, and must never be read as, a content-review
attestation.** They answer different questions — OKF's `verified` records that
*someone looked at the concept*, for a purpose OKF leaves open; this attestation
records that *a named human applied this repository's prohibited-content policy,
at a stated version, to exact bytes.* Overloading the OKF field would import a
producer-controlled, semantically open signal into an admission decision, and
would make an upstream vocabulary change an admission change.

The attestation is also **not** an authority: it is admission evidence. It grants
no capability, no tool, and no permission, and it never reaches an execution
profile, a capability grant, an authorization envelope, a safety-policy input, or
a launch assertion.

### 5. The attestation binds to exact content identity

A review event unbound to the bytes reviewed attests nothing. Minimum v1
semantics:

```text
contentReview:
  policy:       portable-knowledge-prohibited-content-v1
  by:           human:<id>
  at:           <ISO-8601 timestamp>
  sourceDigest: sha256:<digest>
```

Four properties, each with a reason:

1. **It lives in `knowledge/catalog.json`, outside the bytes it attests.** The
   catalog is already the metadata authority (ADR-0015 §5a), and putting the
   attestation inside the module would make its digest self-referential —
   writing the attestation would change the bytes it certifies.
2. **`sourceDigest` reuses ADR-0015 §6's identity mechanism** — the
   `okf-package-v1` raw-byte, NUL-delimited, NFC-path-ordered manifest, computed
   over the module's own files. A second identity algorithm would be a second
   thing to keep correct, and the two would diverge.
3. **Any byte change invalidates the attestation.** Recompute, compare, refuse on
   mismatch. Editing reviewed content silently re-uses the review otherwise.
4. **`policy` is versioned.** Changing the review criteria must not silently
   preserve attestations made under the old ones.

#### 5a. Two proofs, and they are not the same proof

The attestation is checked by two independent mechanisms, and conflating them
would let a producer satisfy human review by typing a colleague's identifier
into `catalog.json`.

**Proof A — TOOLCHAIN.** Offline, deterministic, no network and no model. It
establishes:

- an attestation record exists;
- its shape is valid;
- its `policy` identifier is one this repository recognizes;
- `sourceDigest` matches the exact current module bytes;
- any byte change invalidates it.

**Proof B — REPOSITORY GOVERNANCE.** The repository's governed human-review
mechanism establishes that an **eligible human actually performed or approved**
the content review.

> **`by: human:<id>` is never, by itself, evidence that the human acted.** It is
> a string a producer writes. The toolchain validates the artifact and its
> binding; it does not and cannot validate that the named person reviewed
> anything.

**Publication eligibility requires BOTH.** Proof A is necessary and not
sufficient. Where the repository's governed workflow supplies independent review
evidence — an approving review on the change that introduced the attestation,
or another explicitly governed signal — that evidence is Proof B.

**Where this repository stands today, stated plainly.** There is **no
mechanically checkable reviewer-authenticity signal** available to an offline
validator. Until one exists, or is supplied at the governed workflow boundary
and recorded, **publication remains blocked** — the toolchain may confirm
Proof A and must not report the module publishable on that basis alone.

This does not add a network or model dependency to content admission. Proof A
stays offline and deterministic; Proof B is established outside it, by the
review process, at the workflow boundary.

#### 5b. `portable-knowledge-prohibited-content-v1` is anchored to an immutable definition

A policy identifier that names nothing can silently change meaning, which would
let a reviewer's attestation survive a change to what they were attesting to.

**The canonical definition of `portable-knowledge-prohibited-content-v1` is
§1 and §2 of this ADR as accepted.** Those sections are immutable once this ADR
is accepted, which is exactly the property the identifier needs. The prohibited
list (§1) and the coverage classification (§2) together *are* the policy.

A change in review meaning — a class reclassified, a blind spot closed, a new
prohibition — requires a **new policy version** in a new ADR. Attestations
naming the old version do not satisfy admission under the new one, and are not
migrated silently.

**What the machine proves, restated exactly.** That an attestation exists, names
a recognized policy version and an actor, and is bound to the exact current
bytes. It does **not** prove the human interpreted the prose correctly, and it
does **not** prove who reviewed. Reviewer eligibility and authenticity belong to
repository review governance.

### 6. Deterministic evidence dominates attestation

| Deterministic finding | Attestation | Outcome |
|---|---|---|
| present | valid | **REFUSE** |
| present | missing | **REFUSE** |
| absent | missing | **REFUSE** |
| absent | stale or wrong digest | **REFUSE** |
| absent | valid and bound | eligible to continue |

The first row is the one that matters: **a human attestation never overrides a
deterministic finding.** An attestation is not a waiver, and no reviewer may
sign past a detected secret.

"Eligible to continue" means the remaining admission rules still apply — this is
one gate among several, and it grants nothing on its own.

### 7. Toolchain readiness and rollout eligibility are TWO independent facts

The obvious shortcut — keep `blockedByToolchain: true` on household modules after
the toolchain is proven — would make one state variable mean two things again.
That is the defect the U7 migration was carried out to remove, and it must not
be reintroduced one landing later.

```text
blockedByToolchain    = have compile/validate/package/query and their
                        conformance proofs been accepted?
                        ONE fact, repository-wide.

blockedByRollout      = is THIS module class permitted to author under the
                        current rollout and content-model policy?
                        PER MODULE and PER SET.
```

They vary independently. After the toolchain gate is discharged,
`blockedByToolchain` becomes `false` **everywhere at once**, because it describes
the toolchain and not the module. `blockedByRollout` stays `true` on household
modules — not because the toolchain is missing, but because the rollout policy
has not admitted that class.

**The mechanism.** `blockedByRollout` is a required boolean on every module and
set in `knowledge/catalog.json`, validated exactly as `blockedByToolchain` is:
machine-readable, independently reviewable, and asserted rather than merely
present. **A module is authorable only when both gates are `false` and its
attestation requirements are satisfied.**

This is not added to the catalog by this ADR — doing so would make a `Proposed`
decision operative. It is an acceptance obligation (§10).

#### 7a. Initial rollout eligibility, stated exactly

"Coding-oriented runbooks" is not a criterion — a future household-oriented
runbook would qualify by living under `runbooks/`, which is an accident of path,
not a decision. So eligibility is defined as:

| Scope | Initial `blockedByRollout` | Rule |
|---|---|---|
| `platform/**` | `false` on gate discharge | portable platform and engineering knowledge; eligible subject to both gates and attestation |
| `runbooks/**` | `true` **by default** | eligible **only** by explicit per-module allowlist entry |
| `household/**` | `true` | blocked by rollout policy, not by toolchain readiness |

**Runbooks are allowlisted individually, never by directory.** A new runbook is
ineligible on creation and becomes eligible only when a reviewed change adds it
to the allowlist — so a household-oriented runbook cannot become eligible
because of where it was filed.

The allowlist is empty in this ADR. Populating it is a separate reviewed change.

#### 7b. What the scope limit is not

**Risk reduction, not a decidability claim.** Platform prose is not more
machine-decidable than household prose, and the attestation requirement applies
to platform modules exactly as it would to household ones. The limit reduces
blast radius while the mechanism is new, and reflects that live state, presence,
automation state and personal telemetry are largely inapplicable to engineering
prose in the first place — a fact about the *content*, not about the detector.

Future household knowledge **SHOULD** prefer typed, closed-vocabulary fact models
where doing so makes the state-versus-semantics and telemetry boundaries
structurally decidable — the one route by which a **C** class could become an
**A** class, by constraining the authoring surface rather than by guessing at
prose. Designing those schemas is explicitly **not** part of this ADR.

### 8. What this supersedes, and what it leaves standing

**Superseded in part — ADR-0010:** §5's claim that the prohibited-content list is
machine-checked in full, and the dependent Consequences and follow-up wording
resting on it. §1's list, §2's ownership and freshness requirement, §3's
knowledge-is-never-authority rule, and §4's format isolation are **unchanged**.

**Superseded in part — ADR-0015:** §8's characterization of prohibited-content
enforcement as machine-checked in full, and the prohibited-content clause of §12
requiring a negative case per class. Replaced by §9 below.

**Explicitly preserved, in both:** the prohibited list · knowledge is context and
never authority · no direct bundle reads · OKF v0.2 as source representation,
pinned · the admission/consumption split · catalog metadata authority · raw-byte
package and digest semantics · the `Attested Computation` and execution-bearing
refusal · trust/provenance separation · reference integrity · envelope rules ·
every other ADR-0015 requirement.

Neither ADR is edited. Both are accepted and immutable.

### 9. The corrected implementation obligation

Replacing the prohibited-content clause of ADR-0015 §12, the conformance suite
must include:

1. a deterministic negative test for **every B indicator**, failing for its named
   reason, and **named for the indicator rather than the class**;
2. a **coverage table** in the package, naming per class what each detector does
   and does not establish — the table in §2, kept with the code;
3. **no A claim without a completeness proof.** A detector may be registered as
   class **A** only with an argument that every representation is structurally
   visible under a closed authoring grammar. There are none today;
4. **attestation tests**: missing attestation refuses; wrong policy version
   refuses; malformed actor refuses;
5. **binding tests**: a single byte changed after review refuses on digest
   mismatch;
6. **the two proofs are independent**: a syntactically valid attestation with a
   correct `sourceDigest` and a self-asserted `by: human:<id>` is **not**
   sufficient evidence of human action, and the suite proves the toolchain does
   not treat it as such;
7. **policy versioning**: an attestation naming an older policy version does not
   satisfy admission under a newer one;
8. **dominance**: a deterministic finding refuses despite both a valid content
   binding **and** valid human-review evidence;
9. **gate independence**: `blockedByToolchain` and `blockedByRollout` vary
   independently — a household module remains refused when toolchain readiness
   is `true`, and an eligible platform module proceeds only when **both** gates
   and the attestation requirements are satisfied;
10. a structural proof that **no classifier or model participates in admission**.

**Naming rule, enforced in review:** a test may not be named or registered as
proof of a class when it establishes one indicator. B-class tests are named for
the indicator they detect.

### 10. Acceptance obligations

Listed so the acceptance commit is mechanical and checkable. **None of it is done
here**; doing it now would make a `Proposed` decision operative.

- [ ] Add `blockedByRollout` as a required boolean on every module and set in
      `knowledge/catalog.json`, initialised per §7a — `true` on `household/**`
      and `runbooks/**`, `true` on `platform/**` until the toolchain gate is
      discharged.
- [ ] Require and assert it in `scripts/check-knowledge.mjs`, alongside
      `blockedByToolchain`, with deterministic tests for both values.
- [ ] Record the runbook allowlist mechanism; the allowlist itself starts empty.
- [ ] Do **not** change `blockedByToolchain` — this ADR does not discharge the
      toolchain gate.

## Consequences

**Positive.** The assurance claim becomes true. The undecidable part gains a
named accountable human and an identity binding rather than a pretence. The
detectors that do work keep working and stay fail-closed. Blind spots are written
down where a reviewer can see them, instead of being discovered by whatever gets
through.

**Negative.** Authoring gains a human step, and a re-review on every byte change
— deliberate friction on exactly the operation that could smuggle content past a
prior review. The coverage table must be maintained honestly; a detector improved
without updating it re-creates the overclaim in miniature.

**Neutral.** No runtime behaviour changes. `knowledge/` remains
specification-only, `blockedByToolchain` remains `true`, and no module is
authored.

**Risk accepted, and named.** The semantic classes now rest on human review, and
human review is fallible. That is a true statement about the system, where the
previous arrangement was a false one — and a known-fallible control that is
recorded, versioned, and byte-bound is manageable in a way that an imaginary
automatic control is not.

## Alternatives considered

**Keep the claim and build a lexical proxy.** Rejected. Evadable by deleting a
word, and its false positives include the contract's own example of permitted
knowledge. It would report success while proving a keyword.

**An LLM classifier in admission.** Rejected. It puts a model in the trust path
of the mechanism that exists to keep model-visible content safe, and makes
admission non-deterministic and unreviewable.

**Narrow the prohibited list to what machines can decide.** Rejected outright.
The policy is correct; the assurance claim was wrong. Weakening the policy to fit
the mechanism inverts the relationship.

**Reuse OKF `verified: human-reviewed`.** Rejected — §4. Different question,
producer-controlled, and it would couple admission to an upstream vocabulary.

**Typed, closed-vocabulary facts everywhere, now.** Rejected as sequencing, not
as direction — §7 keeps it for household knowledge. Applying it to platform prose
would mean schematising architectural narrative, which is not what that content
is.

## Security implications

**The security posture improves**, because a control believed automatic and
absent is more dangerous than a control known to be human and recorded.

The three properties that carry it: **deterministic findings dominate** — no
attestation waives a detected secret; **binding to exact bytes** — a post-review
edit invalidates the attestation rather than inheriting it; and **versioned
policy** — tightening the criteria does not silently bless content reviewed under
looser ones.

**The attestation is not an authority.** It is admission evidence, confined to
the knowledge plane, and ADR-0015 §10's prohibition applies to it unchanged: it
never reaches execution authority, capability, authorization, safety policy, or
live-state interpretation.

**Named residual risk.** A reviewer may miss a prohibited fact in prose. The
mitigation is scope limitation (§7), the recorded accountable actor, and the fact
that the deterministic detectors still run beneath the attestation and cannot be
signed past.

## Availability implications

None. Nothing here is on a runtime path.

## Validation and follow-up obligations

1. `bash scripts/validate-scaffold.sh`, `node scripts/check-knowledge.mjs`,
   `bash scripts/check.sh`.
2. **No production code lands with this ADR.** The obligation in §9 is
   discharged by the toolchain landing, not here.
3. **`blockedByToolchain` remains `true`** on every registered module and set. This
   ADR corrects an assurance model; it does not open authoring.
4. On acceptance, the toolchain implementation may proceed against §9's corrected
   obligation.
5. This ADR proposes **no** status change to any existing ADR and resolves **no**
   item in `unresolved-decisions.md`.

## Links

- [ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) — the prohibited
  list and the machine-check claim this refines
- [ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) — §6 identity
  reused for `sourceDigest`; §10 trust separation preserved; §8 and §12 refined
- [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
  — knowledge as a subordinate projection
- [`knowledge/README.md`](../../knowledge/README.md) — the boundary table whose
  own examples demonstrate the undecidability
