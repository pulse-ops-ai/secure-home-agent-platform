# openspec/AGENTS.md — OpenSpec artifact governance

Scoped rules for everything under `openspec/`. The root
[`AGENTS.md`](../AGENTS.md) governs everything this file does not say;
if they conflict, the root file and the accepted ADRs win.

## Where OpenSpec sits in the instruction hierarchy

When sources disagree, the higher one wins:

1. **Accepted ADRs and governed repository contracts** —
   [`docs/decisions/INDEX.md`](../docs/decisions/INDEX.md), root
   [`AGENTS.md`](../AGENTS.md)
2. **The external authorizing task contract** — a GitHub issue, an explicit
   user task, or another repository-approved task contract
3. **OpenSpec normative change artifacts** — proposal, spec deltas, design,
   assurance, tasks
4. **Implementation task detail** — the individual task descriptions and
   checkboxes inside `tasks.md`

An OpenSpec artifact can therefore never override an ADR, and an
implementation detail can never override the artifact it belongs to.

## What OpenSpec artifacts can never do

- **Authorize implementation.** The `Implementation Authorization` section of
  `tasks.md` *records* external authority; it cannot create it. A change whose
  artifacts are all complete but whose external provenance is missing,
  ambiguous, or narrower than the landing plan is `NOT_AUTHORIZED`.
- **Resolve an unresolved decision.** U1–U11 leave
  [`unresolved-decisions.md`](../docs/architecture/unresolved-decisions.md)
  only via a new ADR — never via a change artifact.
- **Redefine accepted architecture.** A change that requires crossing an
  accepted ADR proposes a superseding ADR and stops.
- **Prove completion.** Task checkbox state is progress tracking. Proof comes
  from the verification evidence the assurance artifact names.

## Canonical state

- `openspec/specs/` becomes behavioral source-of-truth **only** through
  validated archive/sync of a reviewed change — never by direct edit.
- The workflow definition is `schemas/governed-spec-driven-v1/schema.yaml`
  plus its templates. The generated provider adapters (`.claude/`) are
  regenerable projections, not the canonical definition — do not hand-edit
  them, and do not treat them as authoritative when they drift.

## Two workflows during staged adoption

Two workflow schemas are supported. Which one applies is a property of the
change, never an assumption.

| | Selected by | Status |
|---|---|---|
| **`governed-spec-driven-v1`** | `openspec/config.yaml` | the **project default**. A change with no `.openspec.yaml` is v1. |
| **`governed-spec-driven-v2`** | a change's own `.openspec.yaml` | **explicitly selectable**, staged. It is not the global default, and that is deliberate. |

There is no separate v2 configuration file. `openspec/config.yaml` holds the
shared project context for both workflows; the v2 workflow and its apply
instructions live in `schemas/governed-spec-driven-v2/schema.yaml`; and this
file holds the stable process guidance. Current, mutable governance status is
not authored into any of them.

v2 adds one thing v1 has no equivalent for: a **deterministic review gate**,
repeated once per independently released scope.

```text
complete planning package
  -> review epoch 1 -> verify -> implementation scope 1
  -> review epoch 2 -> verify -> implementation scope 2
  -> ...
```

`tasks.md` owns scope. It declares one `<!-- review-scope: <id> -->` marker per
independently releasable scope, and the review block refers to a scope only by
id — never by restating its paths, tasks, or authorization.

**Immediately before the first implementation or canonical-authority mutation of
each scope**, and not at any later point within that scope:

```sh
pnpm exec openspec validate <change-name> --strict
pnpm run review:verify -- --change <change-name> \
    --base origin/main --remote origin/main
```

Stop on any refusal.

Each epoch runs **once, at its own pre-apply boundary**. It is deliberately not
a continuous check: the gate refuses repository changes made after the reviewed
planning commit, so re-running it during implementation will and should fail —
that refusal is what tells you the next scope needs its own epoch.

**The governed boundary runs in CI, not on a laptop.** `--base-sha` is only an
argument: nothing in the script proves where the value came from. The trusted
one-time run is `.github/workflows/review-boundary.yml`, dispatched manually for
a pull request — it takes the head and base SHAs from the GitHub API, runs the
gate against them, and refuses if either moved while it ran. A local run should
use `--remote`, which actually contacts the remote.

**The base is bound, and its freshness is proved.** A review is accepted
against one exact base commit, recorded as `reviewed_base_commit`. A local
`origin/main` can be arbitrarily stale, so the gate additionally requires either
`--base-sha` (an authoritative SHA — in CI, the pull request's base) or
`--remote` to consult the live ref; it never assumes the local ref is current.
If the base moved, verify refuses with `REVIEW_BASE_DRIFT` and a fresh epoch is
required.

**An epoch is a review attempt, not a scope ordinal.** `review_epoch` counts
review boundaries across the whole change; `scope_id` says which scope a
boundary reviewed. A scope may need several epochs — a base advance before
implementation is the ordinary case. That epoch is
**not automatically another unrestricted architecture audit**: when the planning
bytes are unchanged and the base movement does not touch their assumptions, it
may be a focused base-freshness review.
What CI runs continuously is `pnpm run check:review-history`, which enforces
that admitted review rounds are append-only, plus the governance test suite that
proves the gate itself still behaves.

**Neither workflow creates authorization.** A green gate says the reviewed
planning bytes are unchanged and the review satisfies its contract. It does not
authenticate the reviewer, prove the review was independent, or authorize the
work — external authorization recorded in `tasks.md` remains a separate,
non-negotiable check, and OpenSpec artifacts still cannot change an ADR's
status, resolve an unresolved decision, or permit deployment, secrets, or
device access.

## Validation

`bash scripts/validate-scaffold.sh` enforces the structural invariants
(schema selection, artifact DAG order, template coherence, governance
wording). It is **not** equivalent to OpenSpec validation — run
`openspec validate <change> --strict` for artifact-level checks.
