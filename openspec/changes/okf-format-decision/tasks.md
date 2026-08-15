# Implementation Tasks: okf-format-decision

## Contract

Decide the knowledge source format against ADR-0010's already-fixed
requirements, from the current upstream specification. Decision and evidence
only. No toolchain, no module, no U7 closure.

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

OpenSpec artifacts are planning documents. The implementation authority is a
GitHub issue, an explicit user task, or another repository-approved task
contract — never this file, and never the assurance artifact.

### External authority

| Field | Value |
|---|---|
| Source type | `user_task` |
| Source id / link | Repository owner's task, 2026-08-15: "PROMPT 2A — Decide U7; do not implement the production knowledge toolchain" |
| Authorized scope | Read the governing material and the current upstream OKF specification; evaluate against the twelve stated requirements; answer questions A–H; create the smallest disposable spike if evidence is missing; author the next available `Proposed` ADR answering U7; create OpenSpec/evidence artifacts; validate; one commit |
| Constraints | Do NOT author real knowledge. Do NOT make knowledge runtime-authoritative. Do NOT implement production compile/validate/package/query. Do NOT close U7 by implementation. Do NOT set a new ADR to Accepted. A spike must not become production infrastructure. |
| Owner | repository owner (@mikegtech) |
| Recorded at | 2026-08-15 |

### Status

**`AUTHORIZED`**

The authority names this landing exactly. Constraints honoured: ADR-0015 is
`Proposed`, no toolchain code exists, U7 stays open, the spike lives outside the
repository and is not committed.

**One discrepancy, recorded rather than assumed away.** The task describes
ADR-0014 as "accepted". It is `Proposed`, and PR #83 is open and unmerged.
ADR-0015 therefore depends on nothing that requires ADR-0014's acceptance: the
one reference (§5's `governs` field) is a repository-profile requirement of
ADR-0015's own, and the citation is marked `Proposed`.

---

## Landing Plan

| Landing | Ships | Authority posture | Completion condition |
|---|---|---|---|
| PR-1 | ADR-0015, the U7 pointer, the decisions index, this change | `AUTHORIZED` | checks pass; U7 still open; no ADR status changed; no toolchain |
| later | the toolchain and its conformance suite | not authorized here | the thing that actually opens authoring |

---

# PR-1 — The format decision

## Completion Definition

The format question is answered with cited evidence, the trust/authority
boundary is a prohibition, and authoring is visibly still blocked.

## 1. Evidence

- [x] **1.1 Read the governing material** — root `AGENTS.md`, `knowledge/AGENTS.md`,
      `docs/AGENTS.md`, `openspec/AGENTS.md`, ADR-0010, ADR-0014 (`Proposed`),
      `knowledge-selection-model.md`, U7, `knowledge/README.md`, `INDEX.md`,
      `catalog.json`, `scripts/check-knowledge.mjs`.

- [x] **1.2 Read the CURRENT upstream specification, not recollection**

      `GoogleCloudPlatform/knowledge-catalog`, `okf/SPEC.md` — OKF **v0.2**.
      Recorded: the single required field; the `sources`, `generated`,
      `verified`, `status`, `stale_after` families; the actor convention; and
      the two rules that shaped the decision — consumers MUST NOT reject for
      missing optional fields, unknown keys, or broken links, and consumption is
      the direct file read.

- [x] **1.3 Establish what upstream does NOT provide, by listing rather than assuming**

      `okf/src/` contains only `reference_agent`. `okf/tests/` tests that agent,
      not the format. `okf/samples/crypto_bitcoin` holds `README.md` and
      `seeds.txt` — generator seeds, not an authored bundle. No JSON Schema, no
      grammar, no validator.

- [x] **1.4 Spike — disposable, outside the repository, not committed**

      Question: is a digest over parsed-and-re-serialized frontmatter stable?
      Method: parse one OKF frontmatter block, re-emit it three defensible ways
      (sorted block, unsorted block, sorted flow), digest each.
      Result: **three different digests, none matching the original bytes.**
      Conclusion: digest raw bytes; ADR-0015 §6.
      Disposal: written to the session scratchpad, never under version control,
      not runtime-authoritative, nothing depends on it.

## 2. Decide

- [x] **2.1 Author ADR-0015 at the next free number, status `Proposed`**

      Next free confirmed: ADR-0014 is the highest, on this branch and on `main`.

- [x] **2.2 Answer every question the task posed** — A–H, resolved in ADR-0015
      §1–§12 and summarised in the change report.

- [x] **2.3 State the trust/authority boundary as a PROHIBITION**

      §10. A mapping table invites a reader to find the row where a tier means
      something; there is none.

## 3. Keep the gate shut

- [x] **3.1 Add a NON-RESOLVING pointer to U7**

      Governance is explicit — an item leaves `unresolved-decisions.md` only via
      an **accepted** ADR; ADR-0013 closed U6 *on acceptance*. U7 keeps a note
      saying a proposed answer exists, that it closes **on acceptance**, and
      that closing it is not permission to author.

- [x] **3.2 Make "accepted" unable to mean "authoring open"**

      ADR-0015 §12 states the implementation gate and says acceptance alone is
      not permission. The assurance state-space table shows authoring permitted
      in exactly one of four cells.

## 4. Verification Net for PR-1

- [x] **4.1 `bash scripts/validate-scaffold.sh`** — index coherence for the new ADR.
- [x] **4.2 `node scripts/check-knowledge.mjs`** — the knowledge specification is untouched.
- [x] **4.3 `bash scripts/check.sh`** — the aggregate gate.
- [x] **4.4 Confirm by diff** — U7 not resolved, no ADR status line changed,
      nothing under `knowledge/` touched, no toolchain code added.

## 5. Correction round (post-review)

- [x] **5.1 U7 state stops standing for two facts** — U7 closes on acceptance,
      because that is when the architectural question has an answer. The §12
      implementation obligation is recorded separately; using U7's open state to
      mean "the toolchain has not landed" would make the implementation the
      closing event, which governance forbids.
- [x] **5.2 `as_of` separated from `generated.at`** — upstream defines
      `generated.at` as the content's last meaningful change. The repository
      already has `asOf` in `catalog.json`, in run evidence, and as what
      `maxFreshnessDays` measures. Mapping one onto the other would let
      regeneration silently assert stale facts are current.
- [x] **5.3 `Attested Computation` refused** — upstream says what sits behind an
      `executor` resource may be "a Skill, a script, a container". Refused by
      field as well as by type, conservatively, pending its own decision.
- [x] **5.4 Manifest byte format made normative** — versioned prefix, NUL
      delimiter, LF terminator, byte-order sort over NFC paths, and an explicit
      statement of what the final digest hashes.
- [x] **5.5 Internal vs external reference lifetimes distinguished** — an
      internal target is frozen with the immutable package and cannot later
      break; external and `governs` references can; tolerant reading is still
      required for foreign OKF input.

## PR-1 Completion Gate

- [x] ADR-0015 exists, is `Proposed`, carries every section `docs/AGENTS.md` requires.
- [x] No accepted ADR edited; no status line changed.
- [x] U7 remains OPEN; the pointer says so explicitly.
- [x] No knowledge module, set, or catalog entry added.
- [x] No compile/validate/package/query implementation added.
- [x] The spike is outside the repository and uncommitted.
- [x] Validation run, with real output reported.

## Promotion determination

Recorded voluntarily; the rule requiring it is not operative while ADR-0014 is
`Proposed`.

| Truth | Kind | Canonical home | Projection outcome |
|---|---|---|---|
| OKF trust signals confer no authority | architecture | ADR-0015 §10 | **project when the gate opens** — an agent reasoning from a module must know its trust tier grants nothing |
| Admission rejects, consumption tolerates | architecture | ADR-0015 §4 | **project when the gate opens** — an authoring agent needs it |
| Digest identity is over raw bytes | architecture | ADR-0015 §6 | probably **not** projected — a packaging property no agent reasons from |

The third row is a deliberate "no". Recording it is what the determination
obligation would require; promoting everything would inflate every set against
the least-context control.
