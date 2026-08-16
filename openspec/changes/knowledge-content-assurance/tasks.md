# Implementation Tasks: knowledge-content-assurance

## Contract

Correct the prohibited-content assurance model in a narrowly scoped `Proposed`
ADR. Decision material only. No production code, no knowledge, no gate change.

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

OpenSpec artifacts are planning documents. The implementation authority is a
GitHub issue, an explicit user task, or another repository-approved task
contract — never this file, and never the assurance artifact.

### External authority

| Field | Value |
|---|---|
| Source type | `user_task` |
| Source id / link | Repository owner, 2026-08-15: "The 2B falsification is accepted as a real architectural finding … authorizes a narrowly scoped superseding ADR correcting the prohibited-content assurance model" |
| Authorized scope | Author the next available `Proposed` ADR establishing hybrid admission assurance; refine ADR-0010 §5 and ADR-0015 §8 + the prohibited clause of §12; create OpenSpec decision/evidence material; validate; commit and push |
| Constraints | Do NOT implement production toolchain code. Do NOT author knowledge. Do NOT change `blockedByToolchain`. Do NOT edit either accepted ADR. Do NOT narrow the prohibited list. Do NOT reuse OKF `verified`. Do NOT open household authoring. |
| Owner | repository owner (@mikegtech) |
| Recorded at | 2026-08-15 |

### Status

**`AUTHORIZED`**

Constraints honoured: no code, no module, gate untouched at `true`, neither
accepted ADR edited, the list unchanged, `verified` explicitly not reused, and
household authoring explicitly not opened.

---

## Landing Plan

| Landing | Ships | Authority posture | Completion condition |
|---|---|---|---|
| PR-1 | ADR-0016, the decisions index, this change | `AUTHORIZED` | checks pass; gate still `true`; no accepted ADR edited |
| later | the corrected toolchain, against ADR-0016 §9 | not authorized here | still does not open authoring |

---

# PR-1 — The corrected assurance model

## Completion Definition

The claim is true, coverage is honest by class, the gate is fail-closed by two
mechanisms, and nothing is built or authored.

## 1. The finding

- [x] **1.1 Establish the falsification by class** — four of seven classes are
      not decidable over free-form Markdown; two more only as bounded subsets.
      Grounded in `knowledge/README.md`'s own boundary table, whose permitted
      example *"peak pricing **currently** runs 16:00–21:00"* is a false positive
      for the obvious detector, and whose prohibited example evades it by
      deleting one word.
- [x] **1.2 Reject the two wrong remedies, on the record** — a classifier puts a
      model in the trust path of the mechanism that exists to keep model-visible
      content safe; a lexical proxy reports success while proving a keyword.

## 2. The correction

- [x] **2.1 Author ADR-0016, status `Proposed`** — next free number confirmed
      against `docs/decisions/` (ADR-0015 is the highest).
- [x] **2.2 Preserve the policy, correct the claim** — the list is restated
      unchanged; only the assurance statement about it moves.
- [x] **2.3 State coverage as A / B / C**, with each B detector's blind spot
      named, and a rule that a B test may not be registered as class proof.
- [x] **2.4 Keep the gate fail-closed by two mechanisms**, with the dominance
      table making *finding + valid attestation → REFUSE* explicit.
- [x] **2.5 Bind the attestation to exact bytes** — ADR-0015 §6's identity
      reused rather than a second algorithm; stored in the catalog so the digest
      is not self-referential; policy versioned.
- [x] **2.6 Keep it out of the authority plane** — not OKF `verified`, not an
      authority, ADR-0015 §10 unchanged.
- [x] **2.7 Record the platform-only rollout posture**, and state that it is risk
      reduction rather than a decidability claim.
- [x] **2.8 Name the supersession precisely** — ADR-0010 §5 and dependents;
      ADR-0015 §8 and the prohibited clause of §12. Everything else preserved,
      listed explicitly. Neither ADR edited.

## 3. Verification Net for PR-1

- [x] **3.1 `bash scripts/validate-scaffold.sh`** — index coherence for the new ADR.
- [x] **3.2 `node scripts/check-knowledge.mjs`** — registry untouched.
- [x] **3.3 `bash scripts/check.sh`** — the aggregate gate.
- [x] **3.4 Confirm by diff** — no accepted ADR edited, no `knowledge/` change,
      no code, `blockedByToolchain` still `true` everywhere.

## 4. Pre-acceptance correction

- [x] **4.1 Media reclassified A → B** — arbitrary bytes fit inside Markdown as
      base64 or hex, and an opaque URL carries no content hint. The detector is
      useful without being complete. **There are no A classes today**, stated as
      the honest result: A is a capability of a mechanism, not a quota to fill.
- [x] **4.2 Two proofs separated** — the toolchain validates the artifact and its
      binding; repository governance establishes that an eligible human acted.
      `by: human:<id>` is a string a producer writes, so it is never evidence of
      action. This repository has no machine-checkable reviewer signal today, so
      publication stays blocked; admission gains no network or model dependency.
- [x] **4.3 Policy v1 anchored** — `portable-knowledge-prohibited-content-v1`
      denotes ADR-0016 §1 and §2 as accepted, which become immutable on
      acceptance. Changing review meaning requires a new version, and old
      attestations do not satisfy it.
- [x] **4.4 Two gates defined** — `blockedByToolchain` (toolchain readiness,
      repository-wide) and `blockedByRollout` (per-entry rollout eligibility).
      Representing the household block by leaving `blockedByToolchain` true would
      repeat the U7 defect one landing after removing it.
- [x] **4.5 Eligibility made exact** — `platform/**` eligible on gate discharge;
      `household/**` blocked by rollout; `runbooks/**` blocked by default and
      allowlisted **per module**, so a household runbook cannot become eligible
      by living under `runbooks/`. The allowlist starts empty.
- [x] **4.6 Proof obligations added** — indicator naming, no-A-without-
      completeness, proof independence, policy versioning, dominance over both
      binding and review, and gate independence.

**Not added to `catalog.json` or the checker.** `blockedByRollout` is defined
here and recorded as an acceptance obligation (ADR-0016 §10). Adding it now would
make a `Proposed` decision operative.

## 5. Second pre-acceptance correction

- [x] **5.1 Proof B bound to the exact attestation** — actor correspondence with
      `contentReview.by`, exact policy, exact `sourceDigest`, exact record or
      revision. Proof A binds the content; Proof B binds the review event to the
      attestation; neither substitutes for the other. Stated provider-neutrally,
      with no forge-specific representation mandated.
- [x] **5.2 Set rollout semantics defined** — every set starts
      `blockedByRollout: true`; a set's gate means the composition is released
      for profile use; and an unblocked set NEVER resolves a blocked module, so
      set release cannot become a back door around per-module policy.
- [x] **5.3 Exact initial value for every catalog entry** — §7a, §10, spec,
      design and assurance now cover modules **and** sets.
- [x] **5.4 Prose criterion removed from the normative requirement** — the spec
      states scope-based eligibility; "coding-oriented" confers nothing.
- [x] **5.5 Executable obligations added** — Proof B identity mismatch; Proof B
      replay against a changed attestation; unblocked set cannot bypass a blocked
      module; every set initially blocked.

## PR-1 Completion Gate

- [x] ADR-0016 exists, is `Proposed`, carries every section `docs/AGENTS.md` requires.
- [x] No accepted ADR edited; no status line changed.
- [x] The prohibited list is unchanged.
- [x] No production code; no compile/validate/package/query.
- [x] No knowledge module authored; `knowledge/` untouched.
- [x] `blockedByToolchain` remains `true` on all 23 entries.
- [x] Validation run, with real output reported.

**Deliberately NOT satisfied.** Every executable obligation in `assurance.md` —
dominance, binding, byte mutation, no-classifier — remains open and belongs to
the toolchain landing. Registering them as satisfied here would be the same
confusion that produced the overclaim this change corrects.

## Promotion determination

Required by ADR-0014, and answered.

| Truth | Kind | Canonical home | Projection outcome |
|---|---|---|---|
| Some prohibited classes are semantically undecidable from prose | architecture | ADR-0016 §2 | **project when the toolchain gate opens** — an agent authoring knowledge must know which classes rest on human review |
| A deterministic finding dominates an attestation | architecture | ADR-0016 §6 | **project when the toolchain gate opens** |
| The attestation's byte-binding algorithm | architecture | ADR-0016 §5 | probably **not** — a mechanism the authoring agent does not reason from |
