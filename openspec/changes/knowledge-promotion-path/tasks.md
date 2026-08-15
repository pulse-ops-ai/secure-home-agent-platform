# Implementation Tasks: knowledge-promotion-path

## Contract

Establish where a durable architectural truth lives and how it reaches an agent.
Documentation and governance only. No knowledge module, no toolchain, no
provider artifact, no runtime surface.

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

OpenSpec artifacts are planning documents. The implementation authority is a
GitHub issue, an explicit user task, or another repository-approved task
contract — never this file, and never the assurance artifact.

### External authority

| Field | Value |
|---|---|
| Source type | `user_task` |
| Source id / link | Repository owner's task, 2026-08-15: "formalize how durable architectural lessons become portable agent knowledge" |
| Authorized scope | Establish the promotion rule; determine whether it needs an ADR and author one at the next free number if so; create the smallest coherent OpenSpec/design/architecture change; add one repository rule for future work; validate; one commit |
| Constraints | Do NOT create provider-native skills. Do NOT author real knowledge content. Preserve accepted-ADR immutability. Do not silently resolve any unresolved decision. Do not implement the OKF toolchain. Do not author the L4 knowledge modules. |
| Owner | repository owner (@mikegtech) |
| Recorded at | 2026-08-15 |

### Status

**`AUTHORIZED`**

The authority names the landing exactly and is not narrower than it. The
constraints are honoured: ADR-0014 is `Proposed` and no existing status line
changes; no module, set, or catalog entry is added; U7 is untouched and is cited
as the block.

---

## Landing Plan

| Landing | Ships | Authority posture | Completion condition |
|---|---|---|---|
| PR-1 | ADR-0014, the architecture document, both indexes, the root `AGENTS.md` rule, this change | `AUTHORIZED` | scaffold and aggregate checks pass; U7 untouched; no ADR status changed |

---

# PR-1 — The promotion rule

## Completion Definition

The rule is canonically stated, both indexes resolve, the obligation is in the
contract every agent reads, and nothing is authored under it.

## 1. Decide and record

- [x] **1.1 Determine whether an ADR is required**

  **Outcome** — Required. Rules 1–4 and 7 confirm existing practice, but three
  do not: a provider artifact's canonical *scope* (extending an existing
  `AGENTS.md` routing rule to content), the knowledge consequence of ADR-0011,
  and a standing obligation on every future change. Root `AGENTS.md` states that
  the correct output for a rule of that kind is a proposed ADR.

- [x] **1.2 Author ADR-0014 at the next free number, status `Proposed`**

  `docs/decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md`.
  Next free number confirmed against `docs/decisions/` — ADR-0013 is the highest
  on `main` and on the in-flight L4 branch.

- [x] **1.3 Record what follows, without duplicating the ADR**

  `docs/architecture/knowledge-promotion-model.md` — the path, the four-layer
  table, why not provider skills, and what is blocked.

- [x] **1.4 Update both indexes**

  `docs/decisions/INDEX.md` — the ADR table plus two rows in the "which ADRs
  apply" mapping. `docs/architecture/INDEX.md` — the document table.

## 2. The standing obligation

- [x] **2.1 Add the repository rule to root `AGENTS.md`**

  "When a change or falsification review discovers a durable architectural
  truth, determine whether it must be promoted into canonical architecture and
  portable knowledge rather than leaving it only in the change archive, tests,
  PR discussion, or provider instructions."

  Placed with the knowledge-selection rules it extends, cross-referencing the
  architecture document rather than restating it, and carrying the two
  consequences that bind now: provider artifacts are never canonical, and
  authoring is blocked by U7.

## 3. Verification Net for PR-1

- [x] **3.1 `bash scripts/validate-scaffold.sh`** — index coherence for the new
      ADR and document, and OpenSpec governance structure.
- [x] **3.2 `node scripts/check-knowledge.mjs`** — confirms the knowledge
      specification is untouched: no module, no set, no catalog entry.
- [x] **3.3 `bash scripts/check.sh`** — the aggregate gate.
- [x] **3.4 Confirm U7 is unmodified and no ADR status line changed** — by diff.

## PR-1 Completion Gate

- [x] ADR-0014 exists, is `Proposed`, and carries every section `docs/AGENTS.md`
      requires.
- [x] No accepted ADR is edited; no status line changes.
- [x] `unresolved-decisions.md` is unmodified; U7 remains open and is cited as
      the block on authoring.
- [x] No knowledge module, set, or catalog entry is added.
- [x] No `skills/` directory and no provider-native skill is created.
- [x] Validation above run, with real output reported.

## Promotion determination for this change

Required by the rule this change introduces, and answered for it:

| Truth | Durable? | Must an agent reason from it? | Outcome |
|---|---|---|---|
| Canonical homes and the promotion path | yes | yes — an agent deciding where a finding goes needs it | **promote when U7 opens**, as a `knowledge/platform/` module projecting ADR-0014 |
| The four-layer image/profile/knowledge/task split | yes | yes | **promote when U7 opens**, likely into the existing `runner-model` module rather than a new one |
| The determination obligation itself | yes | yes | **promote when U7 opens**, as a `knowledge/runbooks/` procedure |

All three are blocked by U7 and none is authored here. Recording the
determination is what the rule requires; acting on it is what U7 gates.
